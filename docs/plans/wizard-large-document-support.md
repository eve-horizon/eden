# Wizard: Large PDF Support via Eve Resource Refs

**Status:** Plan
**Date:** 2026-04-08
**Scope:** Raise the wizard's effective ceiling for **PDF attachments** from ~10 MB to ~32 MB via Eve `resource_refs`, while keeping the current text / markdown / DOCX fallback path until native non-PDF support is proven.
**Supersedes:** An earlier draft of this plan that proposed an `extracted_text` cache column, a `POST /sources/:id/extract` endpoint, and bounded `pdf-parse`/`mammoth` orchestration. That draft was wrong — it reimplemented primitives that already exist in the Eve platform.
**Builds on:** [`wizard-orphan-recovery-and-binary-docs.md`](wizard-orphan-recovery-and-binary-docs.md) (WS2: binary extraction via `pdf-parse`/`mammoth`, shipped 2026-04-08). This plan **replaces the PDF path** from that implementation, but deliberately keeps the non-PDF fallback for now.
**Priority:** P2 (feature gap + targeted simplification)

---

## Context

On 2026-04-08 we shipped server-side PDF/DOCX extraction in Eden via a new `DocumentExtractorService` that uses `pdf-parse` + `mammoth` to pull text out of uploaded files, then inlines an 8 KB excerpt into the map-generator prompt. That change worked end-to-end (verified on sandbox) but inherited a 10 MB frontend cap and ran entire-file, whole-doc, synchronously inside the `POST /generate-map` request handler.

When the question of supporting 50 MB documents came up, the first draft of this plan proposed bounding that in-process extraction: file-size guards, `AbortController` fetch timeouts, `pdf-parse({ max: 20 })` page caps, `Promise.race` parse timeouts, a new `extracted_text` column on `ingestion_sources`, a new `POST /sources/:sourceId/extract` endpoint, a `Reading document...` wizard status step, and a JSON `ExtractResult` discriminated union.

That draft was the wrong architecture. Reading the Eve platform source revealed that **every primitive we were about to build already exists**, exposed on the Eve job create API, wired into the runner, and proven in production by Eden's own `ingestion-pipeline` workflow.

---

## What the platform already provides

Three facts, all verified against `~/dev/incept5/eve-horizon`:

### 1. `CreateJobRequest` already accepts `resource_refs`

`packages/shared/src/schemas/job.ts:71-104`:

```typescript
export const ResourceRefSchema = z.object({
  uri: z.string().min(1),
  label: z.string().optional(),
  required: z.boolean().optional(),
  mount_path: z.string().optional(),
  mime_type: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateJobRequestSchema = z.object({
  description: z.string().min(1),
  title: z.string().max(500).optional(),
  // ... other fields ...
  target: JobTargetSchema.optional(),
  resource_refs: z.array(ResourceRefSchema).optional(),
});
```

Any call to `POST /projects/:id/jobs` can include an array of resource refs. The schema has been stable and supports three URI schemes: `org_docs:/...`, `job_attachments:/...`, and **`ingest:/<ingest_id>/<file_name>`**.

### 2. The ingest URI scheme is stable

`packages/shared/src/lib/resource-uris.ts:83-86`:

```typescript
export function buildIngestUri(ingestId: string, fileName: string): string {
  const encoded = encodeURIComponent(fileName);
  return `ingest:/${ingestId}/${encoded}`;
}
```

Eden can reproduce this one-liner without depending on `@eve/shared` directly.

### 3. The agent runner already hydrates `ingest:/...` refs into the agent workspace

`apps/agent-runtime/src/invoke/invoke.service.ts:588-619`:

```typescript
if (parsed.scheme === 'ingest') {
  const storageClient = this.getStorageClient();
  const org = await this.orgs.findById(orgId);
  const bucketName = this.getOrgBucketName(org.slug);
  const safeFileName = path.basename(parsed.fileName);
  const storageKey = `ingest/${parsed.ingestId}/${safeFileName}`;

  const result = await storageClient.getObject(bucketName, storageKey);
  const bodyBytes = result.body;
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, bodyBytes);                  // original bytes on disk
  // ... writes .eve/resources/index.json summarising all resolved refs
}
```

The runner pulls the original file from the org's S3 bucket and writes it to `.eve/resources/ingest/<ingest_id>/<file_name>` before the agent starts. It also writes `.eve/resources/index.json` listing every resolved ref with `local_path`, `content_hash`, `label`, `mime_type`, and `metadata`.

This is the same mechanism Eden's existing `ingestion-pipeline` workflow uses — `skills/extraction/SKILL.md:14-21` literally says *"Read `.eve/resources/index.json` … Read the file at the `local_path` specified"*. That proves the `ingest:/...` hydration pattern is already production-tested in Eden. It does **not** by itself prove that every file type is equally well handled by the underlying model/harness.

### 4. Claude reads PDFs natively; DOCX is a different story

Anthropic's current docs are clear on two points:

- **PDF** is supported as a `document` block with a **32 MB** request ceiling and a page cap that depends on model context window.
- **`.docx`, `.md`, `.txt`, `.csv`, `.xlsx` are not supported as document blocks**; Anthropic recommends converting them to plain text first.

For PDFs specifically, Claude analyzes both extracted text and page images, which is exactly the capability the current Eden-side `pdf-parse` path lacks: charts, visual layouts, scanned pages, and dense formatting survive the trip.

**Conclusion:** Eve `resource_refs` are the right architecture for **PDFs**. They are not enough, on their own, to justify deleting the current DOCX/text fallback.

---

## Problem Statement

Given the primitives above, Eden today:

1. **Caps uploads at 10 MB** in the wizard frontend (`ProjectWizard.tsx:27`)
2. **Downloads the whole file** into a Node Buffer inside the API container
3. **Runs `pdf-parse` / `mammoth`** on that buffer, blocking the `POST /generate-map` request
4. **Truncates to 8 KB** and inlines the excerpt into the job description
5. **Re-extracts on every regenerate**, because nothing is cached
6. **Silently drops scanned PDFs**, because `pdf-parse` only reads the text layer
7. **Flattens successful PDF extraction into plain text**, losing layout, chart, and image semantics that Claude can otherwise use

Most of these are a consequence of putting PDF extraction in the API request path. Resource refs remove the PDF bottleneck entirely. They do **not** automatically solve DOCX, markdown, or plain-text handling, so the plan should stay hybrid for now.

---

## Design

Four targeted edits. The important non-goal: do **not** remove the current non-PDF fallback until the platform docs and sandbox behavior prove a better replacement.

### Edit 1 — `WizardService.generateMap()` attaches the source as a job resource

`apps/api/src/wizard/wizard.service.ts`

When `data.source_id` is present, choose one of two strategies:

- **PDF + `eve_ingest_id` present**: attach a single `ResourceRef` and let the agent read the original PDF from `.eve/resources/`
- **Everything else**: keep the current excerpt path (`text/*`, markdown, DOCX) so we don't regress non-PDF attachments while Anthropic's native file support remains PDF-only

That means we drop inline excerpt plumbing for **PDFs**, not for every file type.

```typescript
async generateMap(
  ctx: DbContext,
  projectId: string,
  data: GenerateMapInput,
): Promise<{ job_id: string }> {
  const project = await this.db.queryOne<{ id: string; name: string }>(
    ctx,
    'SELECT id, name FROM projects WHERE id = $1',
    [projectId],
  );
  if (!project) throw new NotFoundException('Project not found');

  // At least one substantive input is required (unchanged).
  if (
    !data.description?.trim() &&
    !data.audience?.trim() &&
    !data.capabilities?.trim() &&
    !data.source_id
  ) {
    throw new BadRequestException(
      'At least one of description, audience, capabilities, or source_id is required',
    );
  }

  // Choose a document strategy if the wizard attached a file.
  let resourceRefs: Array<{
    uri: string;
    label: string;
    required: boolean;
    mime_type?: string;
    metadata?: Record<string, unknown>;
  }> = [];
  let sourceExcerpt: string | undefined;
  let sourceContentType: string | null = null;
  let documentStrategy: 'none' | 'resource_ref' | 'excerpt' = 'none';

  if (data.source_id) {
    const source = await this.sourcesService.findById(ctx, data.source_id);
    if (source.project_id !== projectId) {
      throw new NotFoundException(`Source ${data.source_id} not found`);
    }
    const isPdf =
      source.content_type === 'application/pdf' ||
      source.filename.toLowerCase().endsWith('.pdf');

    if (isPdf && source.eve_ingest_id) {
      sourceContentType = source.content_type;
      resourceRefs = [
        {
          uri: `ingest:/${source.eve_ingest_id}/${encodeURIComponent(source.filename)}`,
          label: source.filename,
          required: false,
          mime_type: source.content_type ?? undefined,
          metadata: { source_id: source.id },
        },
      ];
      documentStrategy = 'resource_ref';
    } else if (!isPdf) {
      sourceContentType = source.content_type;
      sourceExcerpt = await this.extractor.extract(source, {
        maxBytes: 8 * 1024,
      });
      documentStrategy = sourceExcerpt ? 'excerpt' : 'none';
    } else {
      // PDF with no Eve ingest — source only exists locally. Nothing to attach.
      this.logger.warn(
        `Source ${source.id} has no eve_ingest_id; skipping PDF resource attachment`,
      );
    }
  }

  this.assertAvailable();

  const prompt = this.buildPrompt(
    project.name,
    projectId,
    data,
    sourceExcerpt,
    resourceRefs.length > 0,
  );

  const result = await this.proxy<{ id: string }>(
    'POST',
    `/projects/${this.eveProjectId}/jobs`,
    {
      assignee: 'map-generator',
      title: `Generate map: ${project.name}`,
      description: prompt,
      ...(resourceRefs.length > 0 && { resource_refs: resourceRefs }),
    },
  );

  await this.db.withClient(ctx, async (client) => {
    await client.query(
      `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
            VALUES ($1, $2, 'project', $3, 'generate_map', $4, $5)`,
      [
        ctx.org_id,
        projectId,
        projectId,
        ctx.user_id ?? null,
        JSON.stringify({
          job_id: result.id,
          ...(data.source_id && {
            source_id: data.source_id,
            source_content_type: sourceContentType,
            document_strategy: documentStrategy,
            resource_attached: resourceRefs.length > 0,
            source_excerpt_bytes: sourceExcerpt?.length ?? 0,
          }),
        }),
      ],
    );
  });

  return { job_id: result.id };
}
```

`buildPrompt()` should keep the current excerpt parameters for the non-PDF fallback, but add one short line when a resource ref is attached:

> "If a document has been attached in `.eve/resources/index.json`, inspect it before drafting the changeset."

That keeps the job description small while still reinforcing the new skill behavior.

### Edit 2 — `skills/map-generator/SKILL.md` teaches the agent to read `.eve/resources/`

Add a section near the top, before the "Exact Steps" list, but also update the execution rules so they remain internally consistent. The current skill mandates a 3-tool-call flow; that cannot coexist with "read `.eve/resources/index.json` and read the PDF first".

```markdown
## Attached Documents (optional)

If the user attached a document to the wizard, the platform will have
materialized it into your workspace. Before you write the changeset:

1. **Read `.eve/resources/index.json`**. If it has any entries with
   `status: "resolved"`, each one points at a local file via `local_path`.
2. **Read each resolved PDF** at `local_path` using the Read tool. Do not
   run external parsers.
3. **Use the content** to inform personas, activities, capabilities,
   constraints, and questions alongside the user's text fields in the
   job description. Do not summarize the document back to the user —
   just let it influence the changeset you produce.

If `.eve/resources/index.json` is absent, empty, or all entries have
`status: "missing"`, proceed using only the job description. This is
normal — not every wizard run has a document attached.

If Read fails because the PDF is too large or unsupported by the harness,
log that in your final result and continue using only the job description.

**Do NOT:**
- Make HTTP calls to fetch the document yourself
- Ignore an attached document just because the job description already
  looks complete — the document often has the real scope
```

Also change the tool-call guidance:

- **No attachment / no resolved resource**: keep the current 3-call fast path
- **Resolved PDF attachment present**: allow the extra Read calls needed for `.eve/resources/index.json` and the PDF itself, but keep the scope tight and do not explore unrelated files or commands

### Edit 3 — `ProjectWizard.tsx` raises the PDF cap to 32 MB and keeps non-PDF files at 10 MB

`apps/web/src/components/projects/ProjectWizard.tsx:27`

```typescript
const MAX_PDF_FILE_SIZE = 32 * 1024 * 1024;          // 32 MB — Anthropic PDF ceiling
const MAX_STANDARD_FILE_SIZE = 10 * 1024 * 1024;     // existing fallback path
const LARGE_FILE_WARN_THRESHOLD = 10 * 1024 * 1024;  // warn on big PDFs
```

Update `isAcceptedFile()` so the max size depends on file type:

- PDF: 32 MB
- Markdown / text / DOCX / DOC: 10 MB for now

When a user picks a **PDF** over 10 MB, the wizard can still show the existing non-blocking note: *"This is a large document — reading it will add a few extra seconds to generation."*

This distinction matters. The resource-ref path removes Eden's PDF parsing bottleneck, but it does nothing to make a 32 MB DOCX safe or supported.

No new wizard status step. The "Uploading document..." and "Generating story map..." phases stay as they are — there's no server-side extraction round-trip to surface anymore. The runner's hydration happens transparently between the job create call and the agent's first tool use, so the user sees *exactly* the same progress they see today for a run without an attachment.

### Edit 4 — Delete only the PDF-specific extraction path

Remove the PDF-specific part of the server-side extraction path, but keep the non-PDF fallback:

- `apps/api/src/sources/document-extractor.service.ts` — keep the service, but remove the `pdf-parse` path; retain text / markdown / DOCX extraction
- `apps/api/src/sources/pdf-parse-inner.d.ts` — file deleted
- `apps/api/src/wizard/wizard.service.ts` — keep `DocumentExtractorService`, but use it only for the non-PDF fallback
- `apps/api/package.json` — remove `pdf-parse` and `@types/pdf-parse`; keep `mammoth`
- `apps/api/pnpm-lock.yaml` — regenerated by `pnpm install`

No migration is needed. The `ingestion_sources` table already has `eve_ingest_id` and `filename`, which is everything this plan needs.

---

## Implementation Order

One PR. No phases.

1. Edit `WizardService.generateMap()` — build and pass `resource_refs` for PDFs, keep excerpt fallback for non-PDF files
2. Edit `buildPrompt()` — keep the excerpt block for fallback formats, but stop inlining PDF excerpts and add a short attached-resource hint
3. Keep `DocumentExtractorService`, but simplify it to text / markdown / DOCX only
4. Edit `skills/map-generator/SKILL.md` — add the Attached Documents section and relax the 3-call rule when a resolved resource exists
5. Edit `apps/web/src/components/projects/ProjectWizard.tsx` — add type-specific max sizes, update the error copy, keep the large-PDF note
6. Delete `pdf-parse-inner.d.ts` and the `pdf-parse` npm deps
7. `pnpm install` to regenerate the lockfile
8. Build, commit, push, deploy
9. `eve agents sync --local --allow-dirty` to push the skill change to the platform
10. Verify on sandbox (see next section)

---

## Testing strategy

### Local sanity

- `cd apps/api && npm run build` — confirms no dangling references after the hybrid refactor
- `cd apps/web && npm run build` — confirms the frontend compiles with the new constant
- `grep -r 'pdf-parse\|pdf-parse-inner' apps/api/src` — should return zero results

### Sandbox smoke

Three scenarios, mirroring the three sizes from the failed draft plan plus a scanned-PDF case we couldn't previously support.

**Scenario A — 20 KB markdown (regression check)**

Create a fresh project, upload the same `test-brief.md` we used for the orphan-recovery verification, trigger the wizard without polling, wait for the job, load `/api/projects/:id/map`.

- Job description should still contain the existing excerpt block for markdown fallback
- Agent logs should look like today's no-resource path, because markdown is not moved onto `resource_refs` in this plan
- Generated map should reference concepts from the brief
- The orphan-recovery path from the previous plan should still fire if polling stops

**Scenario B — 15 MB PDF (real-world requirements doc)**

Generate or grab a ~15 MB PDF (repeat-concat a small one with `pdftk small.pdf small.pdf ... cat output big.pdf`). Same flow.

- Frontend accepts the upload and shows the large-file note
- Job description is still small (no excerpt)
- Agent reads the PDF via `.eve/resources/` and references its content in the map
- Wall-clock time from "Generate" click to populated map should be comparable to Scenario A — the runner's S3→container download is fast

**Scenario C — 30 MB PDF (near-ceiling)**

Same flow with a 30 MB PDF. Verify:

- Frontend accepts (under 32 MB cap)
- Agent successfully reads the file (watch for any Claude API errors about document size)
- Generation completes within the existing 10-minute poll cap

**Scenario D — Scanned / image-only PDF**

Take a PDF whose pages are all images (no text layer). Previously, `pdf-parse` would return an empty string and the wizard would silently generate a map from only the text fields. Now:

- Agent reads the PDF via Claude's vision layer
- Map should reference content visible in the image pages
- This is a strictly new capability vs. today

**Scenario E — 40 MB PDF (over the cap)**

- Frontend rejects pre-upload with "Maximum is 32 MB"
- No API call is made

**Scenario F — DOCX regression check**

Use the existing wizard DOCX fixture.

- Frontend still accepts up to the existing 10 MB ceiling
- `WizardService` still falls back to `mammoth` excerpt enrichment
- No regression in current DOCX-informed map generation

### Cost sanity check

Capture the `total_cost_usd` from the agent's job result for Scenarios A, B, C. Compare against the 20 KB baseline ($0.526 from the earlier orphan-recovery run). Claude bills for input tokens including PDF bytes, so the 30 MB case will be noticeably more expensive — somewhere in the $2–5 range depending on token count. Document the delta in the PR description so future regressions in cost-per-generation are visible.

If the cost turns out to be unacceptable, **revisit the wizard's generator profile** before widening rollout. The current repo config in `eve/x-eve.yaml` already points `generator` at Sonnet, so the real question is whether that quality/cost tradeoff is still the one we want once large PDFs are in scope.

---

## Edge cases

| Case | Behavior |
|---|---|
| Wizard with no document | `resource_refs` is empty or omitted. Job runs exactly as before. |
| Document > 32 MB | Frontend rejects. No API call. |
| Document ≤ 32 MB but still too dense / too many pages for the harness | The harness may surface a read/model error. The skill should catch that and proceed with the job description alone, and we should verify the actual failure mode on sandbox rather than guessing it from raw Anthropic API behavior |
| Source has no `eve_ingest_id` (local dev, Eve unavailable) | `WizardService` logs a warning, skips the resource attachment, job runs from text fields only. |
| Source exists but the file is missing from the org bucket (orphan) | The runner's ref resolution marks it `status: "missing"` in `index.json`. Since we pass `required: false`, the job still runs. The skill instructs the agent to handle missing/absent entries gracefully. |
| Two concurrent wizard runs on the same source | Both jobs get their own materialization — the runner writes to the job's workspace independently. No race. |
| Regenerate on a project that already has a source | Second generate-map call passes the same `resource_refs`. Runner re-hydrates into the new job's workspace. Fast enough that we don't need caching. |
| Scanned PDF | Claude's vision handles it. Strictly new capability vs. today. |
| DOCX with tables | Still limited by `mammoth.extractRawText()` in the fallback path. This plan does not fix DOCX structure loss |
| `.doc` (legacy Word) | Still unsupported — Claude doesn't accept legacy binary Word. The skill instructs the agent to handle read-errors gracefully. |
| Non-document file extensions (e.g. `.xlsx`, `.pptx`) | Out of scope. Anthropic does not support these as `document` blocks, so do not widen the wizard accept list in this plan |

---

## What we lose vs. today

- **The 8 KB PDF excerpt audit diagnostic** (`source_excerpt_bytes` for PDFs). Replaced with `resource_attached: boolean` plus `document_strategy`, which is less precise for PDF content volume but more honest about the path being used.
- **The Eden-side PDF extraction path.** That is intentional — PDFs should stop going through `pdf-parse` entirely.
- **Some API-local PDF debugging convenience.** Instead of inspecting an inline excerpt, debug via the job's `resource_refs`, runner logs, and agent reads against `.eve/resources/index.json`.

---

## Out of scope

- **OCR tuning for scanned PDFs.** Whatever Claude's vision does is what we get. If the quality is inadequate we revisit, but it will be strictly better than `pdf-parse`'s nothing-at-all.
- **Unifying with the Sources-page ingestion pipeline.** The `ingestion-pipeline` workflow (Sources page → `extraction` + `synthesis` agents) is a separate code path with its own semantic-extraction logic. It uses the same `resource_refs` mechanism under the hood but produces a different artifact (structured requirements entities → changeset). We deliberately do NOT unify these — the wizard wants a prompt-enrichment signal, the ingestion pipeline wants a structured changeset.
- **Raising the 32 MB PDF cap.** Bound by Anthropic's current PDF support limit. Revisit if Anthropic raises it.
- **Supporting `.doc` (legacy binary Word).** Same conclusion as the previous plan — pure-JS parsers for the binary format don't exist that we'd trust, and Claude doesn't accept it either.
- **Removing the DOCX / text fallback.** Defer until we have a platform-supported native path for non-PDF documents.
- **Attaching multiple documents.** The wizard UI today supports a single file per generation. Trivially extensible to multiple files (just build multiple `ResourceRef` entries) if users ask, but not part of this plan.

---

## Open questions

1. **Should `buildPrompt()` explicitly mention attached resources, or is the skill change enough by itself?** My bias is yes: a one-line reminder in the prompt makes the new path more robust and easier to debug.
2. **Does the Eve harness path impose a lower practical limit than Anthropic's raw PDF API limit?** Anthropic's current docs say 32 MB and 100 pages for 200k-context models. The remaining uncertainty is whether the `resource_refs` -> workspace -> Read-tool path fails earlier in practice.
3. **Should `required` be `true` or `false` on the resource ref?** The existing `ingestion-pipeline` workflow uses `required: true` because there is always a doc when it fires. The wizard runs both with and without docs, so `false` avoids hard-failing generation on a broken attachment. Confirm the UX tradeoff we want.
4. **Do we later replace the DOCX fallback with a conversion path?** Anthropic explicitly recommends converting `.docx` to plain text or PDF. If DOCX uploads are important, that is the likely follow-up.
5. **Should we update the predecessor plans to say "PDFs use resource refs, non-PDF files still use excerpt fallback" once this ships?** Yes — otherwise the historical docs will overstate what moved.

---

## Success criteria

- [ ] Wizard accepts a 30 MB **PDF** without frontend rejection
- [ ] `pdf-parse` and `pdf-parse-inner.d.ts` are deleted from `apps/api`
- [ ] `grep -r 'pdf-parse\|pdf-parse-inner' apps/api/src` returns zero matches
- [ ] Job description for a wizard run with an attached **PDF** is *shorter* than before (no inline PDF excerpt)
- [ ] The job record shows attached `resource_refs`, and the agent logs show reads against `.eve/resources/index.json` / the hydrated PDF
- [ ] Generated map references concepts from the attached document's body (not just the user's text fields)
- [ ] Scanned PDF produces a generated map that references the image-page content (new capability)
- [ ] Existing markdown / text / DOCX wizard attachments still work through the fallback excerpt path
- [ ] No regression in the existing no-attachment flow
- [ ] No regression in the orphan-recovery path shipped in `efe237c`

---

## Files touched

| File | Change |
|---|---|
| `apps/api/src/wizard/wizard.service.ts` | Attach `resource_refs` for PDFs when `source_id` is present; keep excerpt fallback for non-PDF files; thread `document_strategy` into audit; add a prompt hint for attached resources |
| `apps/api/src/sources/document-extractor.service.ts` | Keep service, but remove the `pdf-parse` branch and retain only text / markdown / DOCX fallback extraction |
| `apps/api/src/sources/pdf-parse-inner.d.ts` | **Deleted** |
| `apps/api/package.json` | Remove `pdf-parse` and `@types/pdf-parse`; keep `mammoth` |
| `apps/api/pnpm-lock.yaml` | Regenerated |
| `skills/map-generator/SKILL.md` | New "Attached Documents" section plus a conditional tool-call rule for resolved resource refs |
| `apps/web/src/components/projects/ProjectWizard.tsx` | Type-specific file-size caps; updated error copy; optional large-PDF note |

Net line change should still be negative, but much less dramatic than the earlier "delete everything" draft because the non-PDF fallback stays in place.

---

## References

- Eve platform source: `~/dev/incept5/eve-horizon`
- `CreateJobRequestSchema` with `resource_refs`: `packages/shared/src/schemas/job.ts:71-104`
- `buildIngestUri()` helper: `packages/shared/src/lib/resource-uris.ts:83-86`
- Runner hydration of `ingest:/...` refs: `apps/agent-runtime/src/invoke/invoke.service.ts:588-619`
- Workflow-based precedent (Sources page ingestion): `apps/api/src/workflows/workflows.service.ts:252-286`
- Eden's extraction agent skill (proves the pattern already works in Eden): `skills/extraction/SKILL.md`
- Eden's binary-extraction shipped implementation (PDF path superseded, non-PDF fallback retained): commits `8c96d94` + `efe237c`
- Predecessor plan: [`wizard-orphan-recovery-and-binary-docs.md`](wizard-orphan-recovery-and-binary-docs.md)
- Anthropic PDF support: https://platform.claude.com/docs/en/build-with-claude/pdf-support
- Anthropic file format support: https://platform.claude.com/docs/en/build-with-claude/files
