# Wizard: Large Document Support (50 MB PDF / DOCX)

**Status:** Plan
**Date:** 2026-04-08
**Scope:** Raise the wizard's effective document ceiling from ~10 MB to **50 MB** for PDF and DOCX, without regressing API container memory, generate-map latency, or the prompt budget.
**Builds on:** [`wizard-orphan-recovery-and-binary-docs.md`](wizard-orphan-recovery-and-binary-docs.md) (binary extraction shipped 2026-04-08)
**Priority:** P2 (feature gap, not a data-loss bug)

---

## Context

On 2026-04-08 we shipped binary PDF/DOCX text extraction in the wizard via `DocumentExtractorService` (commits `8c96d94` + `efe237c`). That fix unblocked the dominant real-world file type for Ade's tests, but it inherited two limits from the existing implementation:

1. The wizard frontend caps uploads at **10 MB** (`ProjectWizard.tsx:27`).
2. Extraction runs **synchronously inside the `POST /generate-map` request handler**, downloads the entire file into a Node `Buffer` via `arrayBuffer()`, and parses the whole document with `pdf-parse` / `mammoth` before slicing the result to 8 KB.

For a few-MB strategic brief this is fine — extraction completes in under a second and the user never notices. For a 50 MB requirements PDF the same code path would:

- Pull a 50 MB Buffer into the API container's heap (default Eve container memory is ~512 MB, so a single concurrent extraction is workable but a second one races OOM)
- Spend 5–15 seconds inside `pdf-parse` decoding pages we're going to throw away
- Block the wizard's `POST /generate-map` request for that entire window
- Re-extract on every regenerate, since nothing is cached

It's also wasteful: even today we discard everything past the first 8 KB of extracted text.

### What the platform actually allows

I probed Eve's ingest endpoint directly on sandbox:

```bash
$ curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -d '{"file_name":"probe.pdf","mime_type":"application/pdf","size_bytes":1024,"source_channel":"upload"}' \
    https://api.eh1.incept5.dev/projects/proj_01kkh30080e00rw62jqhkchwbk/ingest \
  | jq '{max_bytes, upload_method}'
{
  "max_bytes": 524288000,
  "upload_method": "PUT"
}
```

**Eve allows uploads up to 500 MB.** The platform is not the bottleneck. Every binding limit is in Eden code we wrote, and the fix lives entirely in the API + the wizard frontend.

---

## Problem Statement

Three things constrain large-document support today:

### Problem 1 — Frontend cap is 10 MB

`apps/web/src/components/projects/ProjectWizard.tsx:27`:

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
```

The wizard refuses anything larger before the upload even starts. Users with a real PRD or RFP (10–50 MB is common for image-heavy briefs) hit a hard wall on the Context step.

### Problem 2 — Extraction is whole-file, whole-doc, synchronous, in-request

`apps/api/src/sources/document-extractor.service.ts`:

```typescript
private async fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers, redirect: 'follow' });
  // ...
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);                       // ← entire file
}

private async toText(buffer: Buffer, kind: Kind): Promise<string> {
  switch (kind) {
    case 'pdf': {
      const result = await pdf(buffer);                  // ← all pages
      return result.text ?? '';
    }
    // ...
  }
}
```

`WizardService.generateMap()` calls `extractor.extract(...)` *inline* before kicking off the Eve job, so the user is staring at a "Generating story map..." spinner while we spin a 50 MB PDF through `pdf-parse`. There is no timeout wrapping the call, no memory ceiling beyond what Node will allow, and no way to interrupt a hostile or scanned PDF.

### Problem 3 — Re-extraction on regenerate

The wizard caches `uploadedSourceId` and reuses it on regenerate (`ProjectWizard.tsx:147-148`), but the *server side* re-runs extraction every time `WizardService.generateMap()` is called. A user iterating on prompt wording pays the full extraction cost on each regeneration, even though the source bytes haven't changed.

### Cumulative impact

Even if a user successfully gets a 50 MB PDF past every limit, the agent still only sees the first ~8 KB of extracted text. So the *wasted work* on the unhappy path is enormous compared to the value delivered: 49.99 MB of bytes downloaded, hundreds of pages parsed, ~8 KB consumed.

---

## Goals

- Wizard accepts and processes **PDF/DOCX up to 50 MB** end-to-end.
- Generate-map latency **does not regress** for the common (small file) case.
- Extraction work is done **once per source**, not once per regenerate.
- API container memory usage stays bounded — a single oversized file cannot OOM the process.
- Hostile, scanned, or otherwise un-parseable documents **fail fast** instead of hanging the wizard.
- The agent prompt gets a **larger, more useful excerpt** — moving from 8 KB to ~16 KB so a real exec summary fits.

---

## Design

The fix splits cleanly into three workstreams. WS1 is the structural change; WS2 is the safety net; WS3 is the user-visible bump.

### WS1: Cache extracted text on `ingestion_sources` and extract on upload

**Principle:** Extraction is a property of the *source*, not of the *generate-map call*. Do it once, store it, reuse it.

#### Schema change

New migration: `db/migrations/20260408000000_source_extracted_text.sql`

```sql
ALTER TABLE ingestion_sources
  ADD COLUMN extracted_text       TEXT,
  ADD COLUMN extracted_at         TIMESTAMPTZ,
  ADD COLUMN extraction_bytes     INTEGER,
  ADD COLUMN extraction_status    TEXT
    CHECK (extraction_status IN ('pending','completed','failed','unsupported')),
  ADD COLUMN extraction_error     TEXT;

-- Most lookups are by id; no new index needed. extraction_status is a
-- low-cardinality column we may filter on for diagnostics later.
```

Leave `extraction_status` nullable for both old rows and newly-created rows. `NULL` means "no extraction has been requested yet"; we only set `'pending'` once `POST /sources/:id/extract` actually starts work. That avoids a misleading default state on sources that have been uploaded but never extracted.

Per `CLAUDE.md` immutable-migrations rule, this is a new file with a fresh timestamp. No existing migration is touched.

#### New endpoint

`POST /api/sources/:id/extract`

- Auth: AuthGuard + EditorGuard (same pattern as `POST /api/sources/:id/confirm`)
- Body: empty (the source row already has filename, content_type, eve_ingest_id)
- Behavior:
  - 400 if `file_size` is present and > 50 MB
  - 200 if `extraction_status='completed'` already (idempotent — returns the cached extraction)
  - Otherwise atomically flips the row to `extraction_status='pending'`, runs `DocumentExtractorService.extract()`, persists the result + status, returns `{status, bytes, completed_at, error?}`
  - Wrapped in a per-source try/catch — never throws to the caller; status moves to `failed` with `extraction_error` populated on any error

This is a separate endpoint (not folded into `POST /sources` create or `POST /sources/:id/confirm`) because:

- `create` runs *before* the file is uploaded — there's nothing to extract
- `confirm` triggers the full Eve ingestion-pipeline workflow which v1 deliberately avoided to dodge the dedupe trap (`wizard-auto-accept-and-document-upload.md` Option B). We don't want to re-open that decision.
- A dedicated endpoint keeps extraction a *side-channel* operation that doesn't change source `status` away from `uploaded`.

#### Wizard flow change

The wizard currently does, on `startGeneration()`:

```
1. POST /projects             → create project
2. POST /sources              → create source row, get presigned URL
3. PUT  presigned_url         → upload to S3
4. POST /generate-map         → trigger Eve job
5. Poll status                → existing
```

The new flow is:

```
1. POST /projects             → create project
2. POST /sources              → create source row, get presigned URL
3. PUT  presigned_url         → upload to S3
4. POST /sources/:id/extract  ← NEW: triggers extraction, blocks on it
5. POST /generate-map         → trigger Eve job (server reads cached excerpt from source row)
6. Poll status                → existing
```

Step 4 is a normal request whose latency *replaces* the extraction latency that previously hid inside step 5. Net wall-clock time is the same on the first run; on regenerate it's gone entirely (cache hit).

#### Server-side change in `WizardService.generateMap()`

```typescript
if (data.source_id) {
  const source = await this.sourcesService.findByIdForWizard(
    ctx,
    data.source_id,
  );
  if (source.project_id !== projectId) {
    throw new NotFoundException(`Source ${data.source_id} not found`);
  }

  sourceContentType = source.content_type;
  sourceFilename = source.filename;

  // Prefer the cached excerpt — the wizard should have called
  // POST /sources/:id/extract before reaching here. Fall back to
  // inline extraction so older clients (and the Sources page) keep
  // working without surprises.
  if (source.extraction_status === 'completed' && source.extracted_text) {
    sourceExcerpt = this.clipExcerpt(source.extracted_text, PROMPT_EXCERPT_BYTES);
  } else {
    sourceExcerpt = await this.extractor.extract(source, {
      maxBytes: PROMPT_EXCERPT_BYTES,
    });
  }
}
```

`PROMPT_EXCERPT_BYTES` lives at the top of the file as `16 * 1024` (see WS2 for the bump rationale).

The cached `extracted_text` is stored at the source-side budget (~64 KB, set in WS2) but the *prompt* slice stays bounded — we re-clip on read so we can adjust the prompt budget without re-extracting.

Implementation note: keep `extracted_text` server-only. `GET /projects/:id/sources` and `GET /sources/:id` are viewer-readable today, so we should not bloat those responses with 64 KB document excerpts or leak full document bodies to the SPA just because the wizard wants an internal cache. The cleanest shape is a split between the public `SourceResponse` DTO and an internal source-row type or dedicated `findByIdForWizard()` query that includes the extraction columns.

#### What the client sees

The wizard surfaces the extraction step in the existing status string:

```
"Creating project..."             → step 1
"Uploading document..."           → step 3
"Reading document..."             → step 4 (NEW)
"Generating story map..."         → step 5
"Still working — taking longer..." → poll soft threshold (existing)
```

If extraction returns `failed` or `unsupported`, the wizard surfaces a non-blocking warning ("We couldn't read the document — generation will continue without it") but does **not** abort. The user still gets a map generated from their text fields.

---

### WS2: Bound the extraction work — page caps, timeouts, file-size guards

**Principle:** A single hostile or oversized document must not break the API container. Use the budget once and refuse anything outside it.

#### File-size precheck

In `DocumentExtractorService.extract()`, before any download:

```typescript
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;          // 50 MB
const MAX_EXCERPT_BYTES  = 64 * 1024;                 // cached
const MAX_PDF_PAGES      = 20;                        // page-bounded parse
const FETCH_TIMEOUT_MS   = 15_000;                    // download
const PARSE_TIMEOUT_MS   = 15_000;                    // pdf-parse / mammoth

async extract(
  source: ExtractableSource,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  if (!source.download_url) return { kind: 'unsupported' };

  const fileSize = source.file_size ?? 0;
  if (fileSize > MAX_DOCUMENT_BYTES) {
    return { kind: 'failed', reason: `file too large (${fileSize} bytes)` };
  }
  // ...
}
```

The `file_size` value is already on the source row from `POST /sources` create, so we don't need a HEAD request — we trust the precheck the wizard did client-side.

#### Bounded download with timeout

Replace the current `arrayBuffer()` call:

```typescript
private async fetchBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    if (this.eveServiceToken) {
      headers['Authorization'] = `Bearer ${this.eveServiceToken}`;
    }
    const response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`fetch ${url} returned ${response.status}`);
    }
    // Sanity check the actual response size, not just the source row's
    // file_size — defends against a stale source row vs. a re-upload.
    const contentLength = parseInt(
      response.headers.get('content-length') ?? '0',
      10,
    );
    if (contentLength > MAX_DOCUMENT_BYTES) {
      throw new Error(`content-length ${contentLength} exceeds cap`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
```

`AbortController` lets us tear down a stuck download cleanly. The 15-second budget is generous — a 50 MB file at 10 MB/s (typical S3 → API container in the same region) takes 5 seconds.

This is still a full-buffer read. The safety story here is "explicit size cap + timeout + page cap", not streaming. If measurement shows 50 MB PDFs still push RSS too high, the real follow-up is off-process extraction, not more `fetch()` tricks inside the API request path.

#### Bounded parse with timeout

`pdf-parse` accepts a `max` option that limits **page count**:

```typescript
private async toText(buffer: Buffer, kind: Kind): Promise<string> {
  switch (kind) {
    case 'text':
      return buffer.toString('utf8');
    case 'pdf': {
      const result = await this.withTimeout(
        pdf(buffer, { max: MAX_PDF_PAGES }),
        PARSE_TIMEOUT_MS,
        'pdf-parse',
      );
      return result.text ?? '';
    }
    case 'docx': {
      const result = await this.withTimeout(
        mammoth.extractRawText({ buffer }),
        PARSE_TIMEOUT_MS,
        'mammoth',
      );
      return result.value ?? '';
    }
    default:
      return '';
  }
}

private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}
```

`MAX_PDF_PAGES = 20` covers virtually every scenario where the prompt benefits — exec summaries, scope statements, persona definitions, and goal lists almost always live in the first 20 pages of any structured document. For the rare doc whose value is on page 47, the user can paste a snippet into the description field as a workaround.

`mammoth` has no built-in page concept (DOCX flows continuously), but it's much faster than `pdf-parse` per byte and the 15-second timeout is enough for any reasonable doc up to 50 MB.

#### Excerpt budget

The cached `extracted_text` on the source row is bounded at **64 KB** (`MAX_EXCERPT_BYTES`). The prompt slice we hand to the agent is **16 KB** (`PROMPT_EXCERPT_BYTES`, doubled from today's 8 KB).

Why double the prompt budget? Real-world data: my sandbox test extracted a small markdown brief into 1817 bytes of useful content. Most strategic briefs and PRDs have ~3–10 KB of "framing" content (vision, audience, capabilities, constraints) and bumping to 16 KB lets the agent see ~4000 tokens of structured input — still trivial against Sonnet's 200K context window. The cache budget being 4× the prompt budget gives us headroom to bump the prompt later without re-extracting.

#### Updated `ExtractResult` type

The current return type is `string | undefined`. Replace with a discriminated union so the caller can distinguish "no excerpt because we don't support this" from "no excerpt because something went wrong":

```typescript
export type ExtractResult =
  | { kind: 'completed'; text: string; bytes: number }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'failed'; reason: string };
```

The new endpoint maps these directly onto `extraction_status` values on the source row.

---

### WS3: Frontend cap bump and large-file UX

**Principle:** Large files are okay. Make the user understand they'll wait a bit longer, and surface the extraction step so the wizard doesn't feel frozen.

#### Cap change

`apps/web/src/components/projects/ProjectWizard.tsx`:

```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024;     // 50 MB
const LARGE_FILE_WARN_THRESHOLD = 10 * 1024 * 1024;  // 10 MB
```

Update the `isAcceptedFile()` error message to "Maximum is 50MB."

#### Large-file warning on selection

When the user picks a file >10 MB, show a non-blocking note in the FileDropZone:

> "This is a large file (24.3 MB). Reading it during generation will add a few extra seconds."

Just an informational nudge. The user can still proceed.

#### New status step

Add a `Reading document...` status string between "Uploading document..." and "Generating story map..." so the wizard doesn't sit silently while extraction runs server-side.

```typescript
const upload = await fetch(source.upload_url, {
  method: 'PUT',
  headers: { 'Content-Type': file.type || 'application/octet-stream' },
  body: file,
});
if (!upload.ok) {
  throw new Error(`Document upload failed (${upload.status})`);
}

setGenStatus('Reading document...');
try {
  await api.post(`/sources/${sourceId}/extract`, {});
} catch (err) {
  // Non-blocking — log and continue. The wizard will fall back to
  // inline extraction (or no excerpt) inside generate-map.
  console.warn('Source extraction failed, continuing without excerpt:', err);
}
```

If the extract endpoint returns `extraction_status='failed'` or `'unsupported'`, the wizard adds a one-line note to the GenerateStep ("Couldn't read the document — generating from your description") but doesn't block the rest of the flow.

#### Reuse on regenerate

The wizard already caches `uploadedSourceId` for regenerate. The new flow inherits that for free — regenerate skips both upload and extract, jumping straight to generate-map.

---

## Implementation Order

Phase 1 — schema + service plumbing (all backend):

1. **Migration** `20260408000000_source_extracted_text.sql` — five new columns on `ingestion_sources`
2. **Constants & types** in `DocumentExtractorService` — `MAX_DOCUMENT_BYTES`, `MAX_EXCERPT_BYTES`, `MAX_PDF_PAGES`, `FETCH_TIMEOUT_MS`, `PARSE_TIMEOUT_MS`, `ExtractResult` discriminated union
3. **Bounded extraction** — file_size guard, AbortController fetch timeout, page-bounded `pdf(buffer, { max })`, `withTimeout` wrapper around mammoth
4. **`SourcesService.extract(ctx, sourceId)`** — orchestration: status='pending', delegate to extractor, persist result, status='completed'/'failed'/'unsupported'
5. **`SourcesController` extract route** `POST /sources/:id/extract`
6. **Source DTO split** — keep `extracted_text` off the public source/list responses; add an internal row type or focused query for wizard reads

Phase 2 — wire it through the wizard:

7. **`WizardService.generateMap()`** — read cached `extracted_text` first, fall back to inline extract, re-clip to `PROMPT_EXCERPT_BYTES` on read
8. **Bump `PROMPT_EXCERPT_BYTES`** to 16 KB

Phase 3 — frontend:

9. **`ProjectWizard.tsx`** — `MAX_FILE_SIZE = 50 * 1024 * 1024`, add `LARGE_FILE_WARN_THRESHOLD`, update error copy
10. **`FileDropZone`** — large-file warning text below the filename when over 10 MB
11. **`startGeneration()`** — new "Reading document..." status step calling `POST /sources/:id/extract`
12. **GenerateStep** — surface the warning when extraction returns `failed` or `unsupported`

Phase 4 — verification on sandbox:

13. **Smoke test small file** — current 20 KB test PDF still works end-to-end (regression check)
14. **Smoke test 25 MB PDF** — typical "real" requirements doc; verify extract latency, prompt content, agent output references PDF concepts
15. **Smoke test 50 MB PDF** — boundary case; verify no OOM, no timeout, agent still gets useful content
16. **Smoke test scanned PDF** — text-layer-empty doc; verify graceful failure with `extraction_status='failed'` and the wizard continues without an excerpt
17. **Smoke test regenerate** — rerun generation on a project that already has a cached extraction; verify the second run is noticeably faster and doesn't re-extract

---

## Edge cases

| Case | Behavior |
|---|---|
| User uploads 60 MB file | Frontend rejects pre-upload with "Maximum is 50 MB" |
| Source `file_size` says 5 MB but actual download is 60 MB | `fetchBuffer` content-length check rejects, `extraction_status='failed'`, wizard continues without excerpt |
| Source has no `download_url` (Eve unavailable) | `extraction_status='unsupported'`, no error, wizard prompt simply lacks the excerpt |
| Scanned PDF (no text layer) | Treat whitespace-only output as `kind='failed'` with a reason like `no text extracted`; this gives the user an honest warning instead of a silent "success" with zero bytes |
| Corrupted PDF | `pdf-parse` throws, caught, `status='failed'`, `extraction_error` populated |
| `pdf-parse` hangs on a hostile PDF | 15-second `withTimeout` fires, `status='failed'`, no zombie request handler |
| Regenerate after first extraction | Wizard skips upload (cached `uploadedSourceId`); server reads cached excerpt; no re-extraction work |
| Regenerate after re-uploading the same file | New source row, new extraction. Acceptable — explicit user action |
| User closes wizard tab between upload and extract | Source row exists with `extraction_status=NULL`. Next visit doesn't auto-extract. Acceptable — extraction is wizard-driven, not background. (Could add a "retry extraction" button on the Sources page later.) |
| Two wizard runs against the same source in parallel | The `pending` transition should be compare-and-set / row-locked so only one request performs extraction. A concurrent caller either waits on the row lock or sees `pending`/`completed` and returns without duplicate work |
| Very small PDF (a few KB) | Same path. Page cap is irrelevant, parse is instant, cached excerpt is the whole doc |
| `.doc` (legacy Word) | Still unsupported — `kind='unsupported'`, `status='unsupported'`, wizard surfaces the warning |

---

## Schema migration details

```sql
-- 20260408000000_source_extracted_text.sql
--
-- Cache extracted text on ingestion_sources so the wizard doesn't
-- re-parse large PDFs/DOCXs on every generate-map call. See
-- docs/plans/wizard-large-document-support.md.

ALTER TABLE ingestion_sources
  ADD COLUMN extracted_text    TEXT,
  ADD COLUMN extracted_at      TIMESTAMPTZ,
  ADD COLUMN extraction_bytes  INTEGER,
  ADD COLUMN extraction_status TEXT
    CHECK (extraction_status IN
      ('pending','completed','failed','unsupported')),
  ADD COLUMN extraction_error  TEXT;
```

No backfill is required. Existing rows stay `NULL`, and `generateMap()` treats only `extraction_status='completed'` as a cache hit. Everything else, including `NULL`, falls back to inline extraction.

---

## API surface changes

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/sources/:id/extract` | AuthGuard + EditorGuard | New endpoint. Empty body. Returns `{status, bytes, completed_at, error?}`. Idempotent. |

Public source responses should gain only the metadata we might eventually want to surface in the Sources UI (`extracted_at`, `extraction_bytes`, `extraction_status`, `extraction_error`). Keep `extracted_text` out of the standard list/detail DTOs and available only through a server-internal row/query used by the wizard path.

---

## Testing strategy

### Unit / e2e follow-up

The repo already has Playwright coverage (`tests/e2e/phase3.spec.ts`), but there are no API unit specs around extraction yet. This change is a good point to add them.

If we add `*.spec.ts` files for the first time, candidate tests for `DocumentExtractorService`:

- Text file → passthrough
- Small PDF → completed, expected character count, status='completed'
- Page-bounded PDF — generate a 100-page test PDF, verify only first 20 pages parsed
- Empty/scanned PDF → failed with a stable `no text extracted` reason
- Corrupted PDF → failed with `extraction_error` populated
- File over 50 MB → rejected pre-fetch
- Hostile timeout-out parse → failed within 15s, no leaked timer

These are easy to write because the service has a single public method and a small surface. We just need a fixtures directory with 5 small PDFs.

### Integration (against local Docker)

- Insert a synthetic source row + audit entry, hit `POST /sources/:id/extract`, assert the row's `extraction_status='completed'` and `extracted_text` is non-empty
- Hit the same endpoint twice, assert second call returns instantly (idempotent)
- Hit it for a `file_size > 50 MB` row, assert `status='failed'`
- Hit `GET /projects/:id/sources` and `GET /sources/:id`, assert `extracted_text` is not present in the JSON payload

### Sandbox smoke (the real verification)

The plan I ran for the binary-doc work used a 20 KB PDF generated by `cupsfilter`. For this plan, we need fixtures at three sizes:

- **~25 KB** — sanity (regression check from current shipped behavior)
- **~25 MB** — typical "real" PRD; the case Ade actually has
- **~50 MB** — boundary; verify no OOM and that extraction completes within budget

Use checked-in fixtures or generate the larger PDFs once outside the test loop. Don't make verification depend on `pdftk` or `convert` being installed in the sandbox environment.

Run each through the wizard end-to-end, capture:

- Wall-clock time of `POST /sources/:id/extract`
- API container memory before/after via `eve env logs sandbox` or container metrics
- The Eve job description's "Attached document excerpt" content
- The agent's generated map's reference to PDF concepts

Then **regenerate** each and confirm the second run skips extraction (status check on the source row, plus latency comparison).

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `pdf-parse` allocates >container limit on a 50 MB file | File-size precheck refuses anything over 50 MB. Single-extraction memory budget is ~150 MB worst case for a 50 MB PDF; we recommend bumping the API container request to 768 MB or 1 GB in the manifest if we see pressure. |
| Concurrent extractions race OOM | Same precheck. If we ever see this in practice, add a simple in-memory semaphore (`Promise`-based, max 2 concurrent extractions per process). Not in v1 — wait for evidence. |
| Page-bounded parse misses content | Agreed tradeoff. 20 pages covers all realistic framing content. Document users can paste a specific snippet into the description field as a workaround. |
| 16 KB excerpt blows up Sonnet token budget | 16 KB ≈ 4 K tokens. Sonnet's context is 200 K. Trivial. |
| Cached extracted text contains sensitive content | Same DB security model as the rest of `ingestion_sources` — org-scoped and RLS-protected — and the plan now keeps `extracted_text` out of the normal source/list API payloads entirely. |
| Extraction endpoint becomes a DoS vector | EditorGuard limits to authenticated editors+ on the project. Combined with the file-size cap and timeouts, the worst a malicious editor can do is consume their own org's compute briefly. |
| Migration breaks existing rows | New columns default to NULL. No backfill, no data movement, and only `completed` counts as a cache hit. |
| Wizard regenerate hits stale cache after the user re-edited the source | Out of scope — sources are append-only via the wizard. If we ever support source replacement, invalidate cache on update. |
| Eve `max_bytes` changes downward in a future env | Surface Eve's `max_bytes` from `EveIngestService.createIngest()` and use the smaller of `(eve_max_bytes, MAX_DOCUMENT_BYTES)` in the precheck. Optional — defer until it bites. |
| Big DOCX hangs `mammoth` | 15-second `withTimeout` fires, status='failed' |
| Network instability between API container and Eve download URL | 15-second fetch timeout + AbortController. Failure surfaces as `extraction_status='failed'`, wizard continues without excerpt |

---

## Out of scope

- **OCR for scanned PDFs.** Requires Tesseract or an Eve OCR agent. Logged as a follow-up if real users hit it.
- **Streaming PDF parse.** Neither `pdf-parse` nor `pdfjs-dist` streams in the way that would actually help — both eventually need the trailer at the end of the file. Skip.
- **`.doc` (legacy binary Word).** Pure-JS parsers don't exist that we'd trust. Same conclusion as the binary-docs plan.
- **Background extraction via Eve workflow.** A `doc.extract` event with a `document-extractor` agent would be cleaner but requires platform agent config + a new internal Eden endpoint. Inline-on-upload is enough for v1.
- **Surfacing extraction status in the Sources page UI.** Worth doing eventually so users can see why a PDF didn't influence the map. Defer to a UX follow-up.
- **Extracting text from sources uploaded outside the wizard.** The Sources page upload still triggers the full ingestion pipeline (WS2 path), which is a separate code path with its own extraction. We are deliberately NOT unifying these in this plan.

---

## Open questions

1. **Should `POST /sources/:id/extract` be folded into the existing `POST /sources` create to halve the round trips?** No — at create time the file isn't uploaded yet. Keep them separate.
2. **Should we surface Eve's `max_bytes` instead of hard-coding 50 MB?** Defer. Eve's value is currently 500 MB and we don't want to honor that — we want our own ceiling based on what the API container can handle. Hard-coding the value with a comment pointing at this plan is fine.
3. **Is 20 pages the right page cap for `pdf-parse`?** Probably yes. Worth measuring on a sample of real briefs (e.g. Ade's `Estm8_Strategic_Brief.pdf`) to confirm the framing content is in the first 20 pages.
4. **Should regenerate-with-different-source-id invalidate the old extraction?** No — different source_id is a different row. Cache lives per-source.
5. **Do we want a manual "re-extract" button on the Sources page for sources that failed?** Useful diagnostic but not required for v1. Add only if real users hit transient failures.

---

## Success criteria

- [ ] Wizard accepts a 50 MB PDF without frontend rejection
- [ ] `POST /sources/:id/extract` completes in under 20 seconds for a 50 MB PDF on sandbox
- [ ] API container stays under 600 MB resident memory during extraction (single concurrent file)
- [ ] Generate-map latency for the *common (small file)* case is unchanged (regression check)
- [ ] Regenerate on a project with a cached extraction skips extraction work entirely (status check on source row + latency comparison)
- [ ] Eve job description for a 50 MB PDF run contains a real `Attached document excerpt:` block with content from the doc
- [ ] Generated story map references concepts that only appear in the document body (not in the user's text fields)
- [ ] Scanned/corrupted PDFs fail fast (under 16 seconds) with a clear `extraction_status='failed'` and `extraction_error` populated, and the wizard continues to a successful map generation without the excerpt
- [ ] Standard source/list API responses do **not** include `extracted_text`
- [ ] No regression in the existing 8 KB-prompt → small file path

---

## Files touched

| File | Phase | Change |
|---|---|---|
| `db/migrations/20260408000000_source_extracted_text.sql` | 1 | New file — five columns on `ingestion_sources` |
| `apps/api/src/sources/document-extractor.service.ts` | 1 | File-size guard, AbortController fetch timeout, page-bounded `pdf(buffer, {max})`, `withTimeout` wrapper, `ExtractResult` union |
| `apps/api/src/sources/sources.service.ts` | 1 | New `extract(ctx, sourceId)` method; split internal extraction row from public response DTO |
| `apps/api/src/sources/sources.controller.ts` | 1 | New `POST /sources/:id/extract` route |
| `apps/api/src/wizard/wizard.service.ts` | 2 | Read cached `extracted_text` first, fall back to inline; `PROMPT_EXCERPT_BYTES = 16 * 1024` |
| `apps/web/src/components/projects/ProjectWizard.tsx` | 3 | `MAX_FILE_SIZE = 50 * 1024 * 1024`; large-file warning; upload failure check; "Reading document..." status; failure-warning UX |

---

## References

- Predecessor plan (binary-doc extraction shipped 2026-04-08): [`wizard-orphan-recovery-and-binary-docs.md`](wizard-orphan-recovery-and-binary-docs.md)
- Original v1 wizard plan: [`wizard-auto-accept-and-document-upload.md`](wizard-auto-accept-and-document-upload.md)
- `DocumentExtractorService` (current implementation): `apps/api/src/sources/document-extractor.service.ts`
- Eve sandbox `max_bytes` probe: `curl POST https://api.eh1.incept5.dev/projects/proj_01kkh30080e00rw62jqhkchwbk/ingest` → `max_bytes: 524288000`
- `pdf-parse` page-cap docs: https://www.npmjs.com/package/pdf-parse (the `max` option)
