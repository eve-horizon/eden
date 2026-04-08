# Wizard: Orphan Recovery & Binary Document Extraction

**Status:** Plan
**Date:** 2026-04-08
**Scope:** Two related follow-ups to `wizard-auto-accept-and-document-upload.md`
**Supersedes bead:** `eden-bvwi` (WS2 absorbs the binary-doc follow-up)
**Priority:** P1 (WS1 is user-visible data loss), P2 (WS2 is feature completeness)

---

## Context

On 2026-03-27 we shipped wizard auto-accept + document upload (`64394cc`). On 2026-03-30 we patched zombie-job recovery (`0428479`) after Ade's Estm8 test surfaced a partial failure. This plan addresses two remaining gaps from that same test, both confirmed against staging data:

1. **Auto-accept is still polling-coupled** — the Mar 30 fix only runs during active browser polling, so any tab close or 10-minute timeout still orphans the changeset.
2. **PDF/DOCX attachments are uploaded but silently ignored** — `fetchSourceExcerpt()` only reads text-like files, so Ade's 380KB strategic brief never influenced the prompt.

### The Estm8 evidence (from staging)

```
Mar 27 17:54:37  Project created + generate_map audit (source_id=625b63a2…)
Mar 27 17:54:37  Eve job eden-3e5253d3 enqueued for map-generator
Mar 27 17:57:44  Changeset 1ba0b772 written by agent (3 min in, 45 items)
         …       Frontend poll loop hit 10-min MAX_POLL_DURATION_MS cap
         …       Eve job transitioned to phase='cancelled' (watchdog)
                  → no one polling → no auto-accept → orphaned draft
Mar 30 15:02:53  Manually accepted by Adam (approval='preview', 45 items)
Mar 30 15:23 UTC fix(0428479): wizard polling timeout + zombie recovery
Mar 30 17:36     Sandbox redeployed with fix
```

Ade's uploaded `Estm8_Strategic_Brief.pdf` (380KB, `application/pdf`) is still sitting in `ingestion_sources` with `status='uploaded'`. The job description the agent actually received was:

```
Generate a story map for "Estm8".
Eden project UUID: b3db32f2-4d81-42fc-80b0-7406a810dc3e
Create a changeset with: 3-5 personas, 4-6 activities, ...
```

No description, no audience, no capabilities, no PDF excerpt. The PDF content was never read.

---

## Problem Statement

### Problem 1 — Orphaned drafts when polling stops

`WizardService.getGenerateStatus()` (`apps/api/src/wizard/wizard.service.ts:125-287`) is the *only* call site that calls `ChangesetsService.accept()` for wizard-generated changesets. That method is the backing handler for `GET /projects/:id/generate-map/status`, and that endpoint is called *only* by the wizard's browser polling loop (`ProjectWizard.tsx:188-226`).

The polling loop has a hard 10-minute cap (`MAX_POLL_DURATION_MS`) and also dies whenever the user navigates away, closes the tab, or loses their session. If the Eve job terminates **after** polling has stopped — whether in `done`, `cancelled`, or `failed` — the changeset is written by the agent to `draft` status and never accepted. Nothing on the server side ever fires the recovery code path.

The Mar 30 fix (`0428479`) added a `phase === 'cancelled'` recovery branch, but it still runs only inside `getGenerateStatus()`, so it has the same polling dependency. The fix helps only when the tab happens to still be polling at the exact moment Eve flips the phase — which is the uncommon case. Every background-completion scenario still orphans.

**Symptoms users see:**
- "Generation is taking longer than expected" error, then an empty map when they navigate to the project
- Or: they close the tab, come back later, find an empty map with no indication a changeset exists
- Or: they eventually stumble across the draft on the Changes page and have to know to click Accept

### Problem 2 — Binary documents silently ignored

`WizardService.fetchSourceExcerpt()` (`apps/api/src/wizard/wizard.service.ts:293-329`) gates text extraction on:

```typescript
const textTypes = ['text/plain', 'text/markdown', 'text/x-markdown'];
const textExtensions = ['.md', '.txt', '.markdown'];
const isTextLike = textTypes.includes(source.content_type ?? '')
  || textExtensions.some((ext) => source.filename.toLowerCase().endsWith(ext));
if (!isTextLike || !source.download_url) return undefined;
```

Anything else — PDF, DOC, DOCX — returns `undefined` and the prompt receives no excerpt. The source record is still created, `source_id` is still audited, but the *content* is dropped on the floor. Users see a successful upload UX and a green "Attached" chip, then wonder why the generated map has no relationship to their 40-page requirements brief.

This is the `eden-bvwi` bead ("Wizard binary document handling and source dedupe follow-up") from the Mar 27 follow-up list. We're picking it up now because (a) it's the dominant real-world file type for Ade's tests, and (b) the WS1 fix alone would still leave the prompt empty for most uploads.

---

## Design

### WS1: Server-side orphan recovery on map load

**Principle:** Auto-accept must not depend on the browser tab being alive. The server already has everything it needs — the audit trail, the job ID, and the draft changeset. On next map access, reconcile.

#### Approach

Add a `WizardService.reconcileOrphans(ctx, projectId)` method. Call it inline from `MapService.getMap()` at the start of its transaction, before any map assembly. The method:

1. Queries for wizard-orphaned drafts on this project via an audit-bounded lookup
2. For each candidate, probes the Eve job for its current phase
3. Auto-accepts any whose job is in a terminal phase (`done`, `cancelled`, `failed`) with items present
4. Logs success/failure per changeset but never throws — map load must not regress

```sql
-- Find wizard-generated drafts on this project with their triggering job ID
SELECT c.id            AS changeset_id,
       a.details->>'job_id' AS job_id,
       a.created_at    AS triggered_at
FROM changesets c
JOIN audit_log a
  ON a.project_id = c.project_id
 AND a.action = 'generate_map'
 AND a.details->>'job_id' IS NOT NULL
 -- Match the audit entry immediately preceding this changeset
 AND a.created_at <= c.created_at
 AND a.created_at >= c.created_at - interval '15 minutes'
WHERE c.project_id = $1
  AND c.source = 'map-generator'
  AND c.status = 'draft'
  AND EXISTS (SELECT 1 FROM changeset_items WHERE changeset_id = c.id)
  -- Safety: only consider drafts older than 30 seconds so we don't race
  -- an in-flight polling loop that's about to accept this itself
  AND c.created_at < now() - interval '30 seconds'
ORDER BY c.created_at DESC
LIMIT 5;
```

For each candidate, fetch `GET /jobs/{job_id}` via the existing `proxy()` helper. If the job phase is `done` / `cancelled` / `failed`, call `changesetsService.accept(ctx, changesetId, projectRole, false)`. Wrap the whole thing in a per-changeset try/catch; a stuck or weirdly-shaped changeset must not break map load.

#### Where to call it

Two options, each with tradeoffs.

| Option | Pros | Cons |
|---|---|---|
| **A. Inline in `MapService.getMap()`** | Fires on every map visit — covers the "user reopens the project" case. Zero new surface area. | `MapModule` must import `WizardModule` (or split the reconciliation into a thin standalone service) |
| **B. New `GET /projects/:id/reconcile` called by `MapPage.tsx` on mount** | Clearer seam, explicit UX story ("recovered N changesets"), can return diagnostics | Extra round-trip; browsers that never open the map don't reconcile |

**Recommendation: Option A, with the reconcile logic in a new `apps/api/src/wizard/wizard-reconcile.service.ts`** that depends only on `DatabaseService`, `ChangesetsService`, and a fetch helper. `MapModule` imports that service directly without depending on the full `WizardModule`. Zero new endpoints, no client changes, self-healing on the very next visit.

The reconciliation runs **before** the map assembly transaction body. If it accepts a changeset, the subsequent `SELECT` in `getMap()` sees the freshly-applied rows and the user gets a populated map in a single request.

#### Concurrency & idempotency

- The 30-second-old filter prevents racing an in-flight wizard poll that's about to do exactly this.
- `ChangesetsService.accept()` is already idempotent on `status='accepted'` — if two reconciliations race, the second just sees `accepted` status and returns without reapplying.
- RLS ensures we only reconcile changesets in the caller's org. An editor triggering reconciliation still gets `approval='preview'` via the resolved `projectRole`.
- Map load is read-path-critical: the reconciliation must be fast. Cap to LIMIT 5 and bail if the audit lookup misses. No external fan-out beyond one Eve job probe per candidate.

#### Audit trail

Every accept goes through the existing `ChangesetsService.accept()` which already writes `audit_log`. The actor is the user who loaded the map, `details.approval` reflects their role, and we add `details.recovered_from = 'wizard-orphan'` so we can distinguish recovered accepts from in-poll auto-accepts in analytics.

#### Edge cases

| Case | Behavior |
|---|---|
| Job still running when user loads map | Job phase is `active`/`backlog`/`ready` — skip, will recover next visit |
| Changeset already accepted (race) | `accept()` sees non-draft status, returns without changes |
| Eve job probe fails (network) | Log warning, skip that changeset, continue with others |
| Map loaded by a viewer (no edit role) | `ChangesetsService.accept()` will reject — catch and log, no recovery for viewers (intentional: reconciliation needs at least editor) |
| Multiple orphans on same project | Process up to 5, oldest last-first (so the most recent wizard run wins if everything else is equal) |
| Agent wrote the changeset but Eve never reported `done` | `cancelled` or `failed` still trigger recovery; if `active` we skip |
| Agent never wrote the changeset | No draft to recover — the query finds nothing, reconciliation is a no-op |

#### What we're deliberately NOT doing

- **Not adding an Eve workflow on `job.done`.** That would be cleaner long-term but requires platform buy-in, a new internal Eden endpoint, and cross-service auth. Reconcile-on-map-load solves the same user-visible problem with zero infrastructure.
- **Not running a cron sweeper.** Same reason — more moving parts. Once every visitor reconciles, orphans that matter (ones the user cares about) get healed on first visit.
- **Not extending the frontend polling loop indefinitely.** It still has a 10-minute cap. The point of this fix is to stop relying on polling entirely.

---

### WS2: Binary document text extraction

**Principle:** If the user attached a document to the wizard, the prompt should reflect its content — regardless of file type.

#### Approach

Introduce a new `DocumentExtractorService` (in `apps/api/src/sources/document-extractor.service.ts`) that takes a source descriptor and returns up to ~8KB of plain text. It handles:

| Type | Extraction method |
|---|---|
| `.md` / `.txt` / `.markdown` / `text/*` | Existing `fetch().text()` path (moved out of `WizardService`) |
| `.pdf` / `application/pdf` | `pdf-parse` library — `pdf(buffer).text` returns raw text |
| `.docx` / `application/vnd.openxmlformats…` | `mammoth.extractRawText({ buffer })` returns `.value` |
| `.doc` / `application/msword` | **Unsupported for v1** — log warning, return `undefined`. DOC parsing requires Apache POI or antiword, out of scope. |

`WizardService.fetchSourceExcerpt()` becomes a thin wrapper that calls `DocumentExtractorService.extract(source, { maxBytes: 8 * 1024 })`.

#### Library choice

Two lightweight options:

- **`pdf-parse`** (~8MB with deps) + **`mammoth`** (~1MB) — battle-tested, simple buffer APIs, no native deps
- **`officeparser`** — single library covering PDF/DOCX/PPTX/XLSX, but larger and less battle-tested

**Recommendation: `pdf-parse` + `mammoth`.** Both are pure JS, maintained, widely used. Each has a narrow single-purpose API that's easy to isolate behind our extractor service. No native module compilation issues in Docker.

Install into `apps/api`:

```json
"pdf-parse": "^1.1.1",
"mammoth": "^1.8.0",
"@types/pdf-parse": "^1.1.4"
```

#### Extraction flow

```typescript
// apps/api/src/sources/document-extractor.service.ts
import pdf from 'pdf-parse';
import * as mammoth from 'mammoth';

@Injectable()
export class DocumentExtractorService {
  private readonly logger = new Logger(DocumentExtractorService.name);

  async extract(
    source: { filename: string; content_type: string | null; download_url: string | null },
    opts: { maxBytes?: number } = {},
  ): Promise<string | undefined> {
    if (!source.download_url) return undefined;

    const maxBytes = opts.maxBytes ?? 8 * 1024;
    const kind = this.classify(source);
    if (kind === 'unsupported') return undefined;

    try {
      const buffer = await this.fetchBuffer(source.download_url);
      const text = await this.toText(buffer, kind);
      if (!text) return undefined;

      return text.length > maxBytes
        ? text.slice(0, maxBytes) + '\n\n[...truncated]'
        : text;
    } catch (err) {
      this.logger.warn(`Extraction failed for ${source.filename}: ${err}`);
      return undefined;
    }
  }

  private classify(s: { filename: string; content_type: string | null }): Kind {
    const name = s.filename.toLowerCase();
    const ct = s.content_type ?? '';
    if (ct.startsWith('text/') || /\.(md|txt|markdown)$/.test(name)) return 'text';
    if (ct === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (ct.includes('wordprocessingml') || name.endsWith('.docx')) return 'docx';
    return 'unsupported';
  }

  private async fetchBuffer(url: string): Promise<Buffer> {
    const headers: Record<string, string> = {};
    const token = process.env.EVE_SERVICE_TOKEN;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { headers, redirect: 'follow' });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private async toText(buffer: Buffer, kind: Kind): Promise<string> {
    switch (kind) {
      case 'text': return buffer.toString('utf8');
      case 'pdf': return (await pdf(buffer)).text;
      case 'docx': return (await mammoth.extractRawText({ buffer })).value;
      default: return '';
    }
  }
}

type Kind = 'text' | 'pdf' | 'docx' | 'unsupported';
```

The 8KB cap stays — it's a guard for prompt size, not for upload size. For larger documents, the first 8KB usually carries the framing (exec summary, goals, scope) which is what the wizard needs anyway.

#### Module wiring

- New `DocumentExtractorService` lives in `apps/api/src/sources/`
- Exported from `SourcesModule`
- `WizardModule` already imports `SourcesModule` after the Mar 27 plan, so nothing changes there
- `WizardService.fetchSourceExcerpt()` shrinks to a one-liner that delegates to the new service

#### What we're deliberately NOT doing

- **Not running the full ingestion-pipeline workflow for wizard uploads.** That would create a second parallel changeset from the same document — exactly the dedupe trap the Mar 27 plan flagged. Wizard extraction stays a read-only prompt-enrichment step.
- **Not auto-confirming the source after wizard use.** The source record stays in `uploaded` status. Users can confirm it manually later from the Sources page if they want the full ingestion pipeline treatment. This preserves the Mar 27 Option B decision.
- **Not supporting `.doc` (legacy Word).** Binary format, no reasonable pure-JS parser, <1% of expected uploads.
- **Not OCR for scanned PDFs.** `pdf-parse` extracts the text layer only. Scanned/image PDFs return empty text, and we'll log it as an unsupported-content case rather than silently ship a bad prompt.
- **Not changing `skills/map-generator/SKILL.md`.** The skill stays agnostic to document handling; it only sees the final enriched prompt.

---

## Implementation Order

### Phase 1 — WS1 (user-visible data loss, ship first)

1. **Create `wizard-reconcile.service.ts`**
   - `reconcileOrphans(ctx, projectId, projectRole?)` method with the audit-bounded query
   - Eve job probe via a locally-scoped fetch helper (copy the `proxy()` shape from `WizardService`)
   - Returns `{ accepted: string[]; skipped: string[] }` for logging; never throws
2. **Register in `WizardModule`** and export it
3. **Import into `MapModule`**
   - Add `WizardReconcileService` to providers via a focused re-export, *or* move the service to `apps/api/src/wizard/` and have `MapModule` import `WizardModule` (leaner — do this)
4. **Wire into `MapService.getMap()`**
   - Call `reconcileOrphans(ctx, projectId, (ctx as any).projectRole)` at the top of the method, before `db.withClient`
   - Wrap in try/catch; log but continue on any failure
   - Pass `projectRole` through — `DbContext` already carries org/user, role comes from the request
5. **Test locally**
   - Create a project, manually insert a draft `map-generator` changeset and matching audit entry, load the map, verify it auto-accepts
   - Verify that a draft < 30s old is left alone
   - Verify a draft whose job is still `active` is left alone
6. **Deploy to sandbox and retry Ade's Estm8 scenario**

**Files changed (Phase 1):**

| File | Change |
|---|---|
| `apps/api/src/wizard/wizard-reconcile.service.ts` | New file — reconciliation service |
| `apps/api/src/wizard/wizard.module.ts` | Export `WizardReconcileService` |
| `apps/api/src/map/map.module.ts` | Import `WizardModule` (or the re-export) |
| `apps/api/src/map/map.service.ts` | Call reconcile at the top of `getMap()` |
| `apps/api/src/common/request.util.ts` | Optional: add `projectRole` to `dbContext()` output so we don't need the `(ctx as any)` cast |

### Phase 2 — WS2 (feature completeness, ship after WS1 proves stable)

1. **Add dependencies** — `pdf-parse`, `mammoth`, `@types/pdf-parse` to `apps/api/package.json`
2. **Create `document-extractor.service.ts`** in `apps/api/src/sources/`
3. **Unit-test it** on a small fixture PDF + DOCX committed to `apps/api/test/fixtures/`
4. **Refactor `WizardService.fetchSourceExcerpt()`** to delegate
5. **Update audit-log entry** in `WizardService.generateMap()` to include `content_type` alongside `source_id` for easier diagnostics
6. **E2E sanity check** — upload the Estm8 PDF, verify the prompt now contains an excerpt (check the Eve job description)
7. **Close bead `eden-bvwi`** with a link to this plan

**Files changed (Phase 2):**

| File | Change |
|---|---|
| `apps/api/package.json` | Add `pdf-parse`, `mammoth`, `@types/pdf-parse` |
| `apps/api/src/sources/document-extractor.service.ts` | New file — extractor |
| `apps/api/src/sources/sources.module.ts` | Provide + export `DocumentExtractorService` |
| `apps/api/src/wizard/wizard.service.ts` | `fetchSourceExcerpt()` → delegates to extractor; enrich audit details |
| `apps/api/test/fixtures/` | Small sample PDF and DOCX for unit tests |

---

## Testing Strategy

### Unit — Phase 1

- `wizard-reconcile.service.spec.ts`
  - Draft changeset + done job → accepted, returned in `accepted[]`
  - Draft changeset + cancelled job → accepted (job phase doesn't matter as long as terminal)
  - Draft changeset + active job → skipped
  - Draft changeset < 30s old → skipped (race protection)
  - Already-accepted changeset → no-op, no error
  - Eve probe throws → skipped, no crash
  - Viewer role (`ChangesetsService.accept` rejects) → skipped, logged

### Unit — Phase 2

- `document-extractor.service.spec.ts`
  - Text file → passthrough
  - PDF fixture → extracts first N chars
  - DOCX fixture → extracts text
  - DOC file → returns undefined (unsupported)
  - 404 from download URL → returns undefined, no throw
  - Corrupted PDF → returns undefined, logs warning
  - Extraction > maxBytes → truncated with marker

### Integration

- Local docker-compose: reproduce Estm8 scenario end-to-end
  - Insert a project, source (PDF), and draft changeset with audit trail
  - Hit `GET /api/map/:projectId`
  - Assert: changeset moved to `accepted`, map is populated in the same response

### Staging smoke

- Delete the stale `Estm8` project
- Create a fresh `Estm8` project via the wizard with the same `Estm8_Strategic_Brief.pdf`
- **After WS1:** close the wizard tab mid-generation; reopen the project later from the project list; verify map is populated
- **After WS2:** inspect the Eve job description; verify a `Document excerpt:` block appears with PDF content; verify the generated map references concepts from the brief

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Reconciliation slows down map load | Audit-bounded query is index-hittable on `audit_log(project_id, action, created_at)`; LIMIT 5; Eve probe parallelised across candidates with `Promise.all` |
| Reconciliation races an in-flight wizard poll and both call `accept()` | The 30-second-old filter excludes fresh drafts; `accept()` is idempotent on non-draft status anyway |
| Map load fails because reconciliation throws | All reconciliation is wrapped in try/catch at the outer boundary — failures log and continue |
| `pdf-parse` fails on exotic PDFs | Wrapped in try/catch — falls back to no-excerpt, same as today |
| `mammoth` payload inflates API image size | ~1MB gzipped is fine; we already ship NestJS, pg driver, and Eve SDK |
| PDF text extraction returns garbage (scanned PDF, table-heavy doc) | Acceptable — the prompt gets *something*, the agent is resilient, and the 8KB cap prevents prompt blowout. Worst case is no improvement over today. |
| `pdf-parse` has known CVE history | Pin to latest patched version; review before merging; audit in CI |
| Reconciliation triggers audit-log noise | Add `recovered_from: 'wizard-orphan'` to the accept audit entry so we can filter; only fires once per orphan |
| Editor loads map; reconciliation auto-accepts with their role | Intentional — preserves the two-stage approval model; editors get `approval='preview'`, owners get `'approved'` |
| Viewer loads an orphaned project | Reconciliation skips because `accept()` will 403; the changeset stays orphaned until an editor/owner visits. Acceptable (same as today for any viewer-first scenario). |
| A draft that was *manually* left in draft by a user is auto-accepted | Out of scope — `source = 'map-generator'` plus the audit-bounded job ID filter ensures we only touch wizard drafts. User-created drafts have `source = 'user'` or similar. |

---

## Open Questions

1. **Should the reconcile result be surfaced in the map response?** E.g. `stats.recovered_changesets = 1` so the UI can flash a toast. Nice-to-have, not required for the fix. Defer to a UX follow-up.
2. **Where does `projectRole` belong on `DbContext`?** Right now it's on `req` via the `EditorGuard` and read as `(req as any).projectRole`. Cleaner: extend `dbContext()` to carry it through. Do this as a preliminary refactor in Phase 1 to avoid spreading the cast.
3. **Do we want a manual "retry generation" button** in the UI for orphans that never got rescued (e.g. agent crashed before writing anything)? Out of scope here — if there's no draft changeset, reconciliation has nothing to recover. Track separately if users hit it.
4. **Should extraction happen asynchronously to avoid slowing `POST /generate-map`?** Probably not — current `fetchSourceExcerpt` is already synchronous in the request path, and a few hundred ms on a 380KB PDF is acceptable for a wizard flow that the user is already waiting 30-60s on. If it becomes a problem we can move to a pre-warm path.
5. **`.doc` support in WS2?** Declared out of scope above. Revisit only if real users actually upload legacy Word docs and complain.

---

## Success Criteria

- [ ] **WS1**: Ade can start the wizard with a PDF attached, close the browser tab, reopen the project from the projects list 30+ minutes later, and see a populated map — no manual Accept required.
- [ ] **WS1**: Staging Estm8 retry with tab-close behaviour produces a populated map on next visit, logged in audit as `recovered_from: 'wizard-orphan'`.
- [ ] **WS1**: Map load latency P95 does not regress by more than +50ms on projects with no orphaned drafts (the common case).
- [ ] **WS2**: Uploading `Estm8_Strategic_Brief.pdf` via the wizard produces a generated map that references concepts actually contained in the PDF (personas, terminology, goals).
- [ ] **WS2**: The Eve job description (visible via `GET /jobs/:id`) contains a `Document excerpt:` block with PDF content.
- [ ] **WS2**: Bead `eden-bvwi` is closed with a link to the merged PR.
- [ ] No regression in the existing wizard polling flow for fast/happy-path generation (<60s).

---

## References

- Original plan: `docs/plans/wizard-auto-accept-and-document-upload.md`
- Mar 27 backend implementation: memory observation #36099
- Mar 27 discovery: memory observation #36049
- Mar 30 zombie-recovery fix: commit `0428479`
- Existing bead absorbed: `eden-bvwi`
- Staging project: `b3db32f2-4d81-42fc-80b0-7406a810dc3e` (Estm8)
- Eve job: `eden-3e5253d3` (phase: cancelled)
- Orphaned changeset (now applied): `1ba0b772-cebe-433b-8e22-569f68367d65`
