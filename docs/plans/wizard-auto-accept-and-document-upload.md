# Wizard: Auto-Accept Changesets & Document Upload

**Status:** Plan
**Date:** 2026-03-27
**Scope:** Two related improvements to the Project Wizard flow

---

## Problem Statement

### Problem 1: "Nothing generated"

When a user runs the wizard, the map-generator agent creates a comprehensive changeset (personas, activities, steps, tasks, questions) — but it lands in `draft` status. The user sees "Story map generated!" and clicks "View Story Map", only to find an empty map. The changeset sits in the Changes page awaiting manual acceptance that the user doesn't know to do.

**Ade's Estm8 project:** Agent created changeset `96254ab2` with 41 items (5 personas, 5 activities, 11 steps, 18 tasks, 7 questions). Changeset is `draft`. Map shows 0 everything.

**Root cause:** The wizard was designed with a review step, but the UX doesn't communicate that the changeset needs explicit acceptance. For user-triggered map generation, a review gate adds friction with no safety benefit — the user already expressed intent by filling the form and clicking "Generate".

### Problem 2: No document upload in wizard

Users can only provide context via three text fields (audience, capabilities, constraints). There's no way to attach a requirements document, PRD, scope doc, or brief during project creation. The Sources page supports file upload, but it's disconnected from the wizard flow and requires the user to navigate to a different page after project creation.

---

## Design

### WS1: Auto-Accept Generate-Map Changesets

**Principle:** User-triggered generation implies intent. Accept immediately.

#### Approach: Server-side auto-accept in status polling

When `WizardService.getGenerateStatus()` detects the job is `done` and finds the resulting changeset, it **auto-accepts** the changeset before returning the status response. By the time the client receives `{ status: "complete" }`, the map is already populated.

Two implementation details matter here:
- Preserve the caller's resolved `projectRole` when accepting. Do **not** hardcode `'owner'`, or editors will silently bypass the existing two-stage approval model.
- Correlate the accepted changeset to the triggering `job_id`, not just `source = 'map-generator'`, or a re-poll/regenerate can attach the wrong changeset.

**Why server-side, not client-side:**
- No extra round trip from the browser
- Map is populated before the user sees the review step
- No race condition if user closes wizard early
- The "View Story Map" button works immediately

#### Changes

**`apps/api/src/wizard/wizard.controller.ts`**
- Pass `(req as any).projectRole` into `WizardService.generateMap()` and `getGenerateStatus()`
- Extend the generate-map body type with optional `source_id`

**`apps/api/src/wizard/wizard.service.ts`**

In `generateMap()`:
- Include `source_id` in the audit log details alongside `job_id`
- Treat `source_id` as valid input for the "at least one input" validation

In `getGenerateStatus()`, after finding the changeset for a completed job:

```typescript
// Auto-accept generate-map changesets — user already expressed intent
if (changeset) {
  const detail = await this.changesetsService.findById(ctx, changeset.id);
  if (detail.status === 'draft') {
    await this.changesetsService.accept(
      ctx,
      changeset.id,
      projectRole,   // preserve owner vs editor semantics
      false,         // callerIsAgent = false (this is system acting on user's behalf)
    );
  }
}
```

Changeset lookup should use the wizard's audit log as the lower bound even when `source = 'map-generator'` exists, for example:

```sql
SELECT c.id
FROM changesets c
WHERE c.project_id = $1
  AND c.source = 'map-generator'
  AND c.created_at >= (
    SELECT created_at
    FROM audit_log
    WHERE project_id = $1
      AND action = 'generate_map'
      AND details->>'job_id' = $2
    LIMIT 1
  )
ORDER BY c.created_at DESC
LIMIT 1
```

**`apps/api/src/wizard/wizard.module.ts`**
- Import `ChangesetsModule` so `WizardService` can inject `ChangesetsService`

**`apps/web/src/components/projects/ProjectWizard.tsx`**
- Remove the "Review Changeset" link from the ReviewStep (changeset is already accepted)
- Change ReviewStep copy: "Your story map is ready!" instead of "created as a changeset"
- Keep "Regenerate" button, but do not describe it as replacing the first run unless we add explicit replace semantics. Current behavior is additive.

#### Edge cases

| Case | Behavior |
|------|----------|
| Changeset already accepted (re-poll) | `findById` returns `accepted` status, skip re-accept |
| Changeset apply fails | Return `status: "failed"` with a user-visible error; do not claim success while leaving the map empty |
| Multiple changesets from same source | Filter by the triggering `job_id` audit entry, not just the most recent source match |
| Regenerate after first generation | New changeset is auto-accepted on completion. Until replace semantics exist, treat regenerate as additive |
| Editor-triggered generation | Auto-accept still runs, but the audit `approval` should remain `preview` for editors and `approved` for owners |

#### Audit trail

The auto-accept uses the existing `accept()` method which already writes to `audit_log`. The actor will be the wizard user's ID (from `ctx`), not an agent. The details JSON will include `{ items_accepted: N, approval: 'approved' | 'preview' }` depending on the caller's resolved role.

---

### WS2: Document Upload in Wizard

**Principle:** Meet the user where they are. If they have a doc, let them attach it right in the wizard.

#### UX Design

Add an optional file upload zone to the **Context step** (Step 2). The three text fields remain — the document is additive context, not a replacement.

```
┌─────────────────────────────────────────────────┐
│ Step 2: Context                                  │
│                                                  │
│ Help the AI understand your project better.      │
│ All fields are optional but improve quality.     │
│                                                  │
│ ┌─────────────────────────────────────────────┐  │
│ │  📄  Attach a document (optional)           │  │
│ │                                             │  │
│ │  Drop a file here or click to browse        │  │
│ │  PDF, Markdown, Word, text — up to 10MB     │  │
│ │                                             │  │
│ │  [requirements-v2.pdf  ✕]                   │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ Target Audience / Personas                       │
│ ┌─────────────────────────────────────────────┐  │
│ │                                             │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ Key Capabilities / Goals                         │
│ ┌─────────────────────────────────────────────┐  │
│ │                                             │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ Constraints or Requirements                      │
│ ┌─────────────────────────────────────────────┐  │
│ │                                             │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ [Back]                     [✨ Generate Story Map]│
└─────────────────────────────────────────────────┘
```

**Interaction:**
- Click zone or drag-and-drop to select file
- Shows filename + remove button once selected
- Single file only (keeps it simple; they can upload more on the Sources page later)
- Accepted types: `.pdf`, `.md`, `.txt`, `.docx`, `.doc`
- Max size: 10MB (enforced client-side)
- File is uploaded during the "Generate" step, not during selection (no wasted uploads if user cancels)
- The wizard should surface inline validation for unsupported types / oversized files instead of silently ignoring them

#### Upload Flow (3-phase, reuses existing infrastructure)

```
Step 2: User selects file → stored in local state (File object)
                ↓
Step 3: Generation starts
  1. POST /projects → create project
  2. POST /projects/{id}/sources → create source record, get presigned URL
  3. PUT presigned_url → upload file to S3
  4. POST /projects/{id}/generate-map → trigger agent (with source_id)
  5. Poll for completion (existing flow)
                ↓
Step 4: Review → map already populated (WS1 auto-accept)
```

**Key:** The file upload happens inline during step 3 (generation), NOT on the Context step. This avoids wasted S3 uploads if the user goes Back or cancels.

#### API Changes

**`POST /projects/:projectId/generate-map`**

Add optional `source_id` to request body:

```typescript
body: {
  description?: string;
  audience?: string;
  capabilities?: string;
  constraints?: string;
  source_id?: string;  // NEW: reference to uploaded source
}
```

**`WizardService.generateMap()`**

When `source_id` is provided:
1. Look up the source record and verify it belongs to the same project
2. Persist `source_id` in the wizard audit log so the completion poll can find the same source later if needed
3. For text-like files (`text/plain`, `text/markdown`), fetch the uploaded file server-side and inline a bounded excerpt in the prompt
4. For binary files (`.pdf`, `.doc`, `.docx`), upload the source but do **not** assume the initial wizard run can parse it without a separate extraction capability

Updated prompt:

```
Generate a story map for "Estm8".

Eden project UUID: 83c7310a-...

Audience: ...
Capabilities: ...

Attached document: requirements-v2.pdf
Document excerpt:
"""
...first N KB of extracted text for supported text-like files...
"""

Create a changeset with: 3-5 personas, 4-6 activities, ...
```

**`WizardService`**

Add `EveIngestService` and `SourcesService` as dependencies:
- `EveIngestService` — to build/fetch the uploaded document where supported
- `SourcesService` — to look up source by ID and get `eve_ingest_id`

**`apps/api/src/wizard/wizard.module.ts`**

Import `SourcesModule` alongside `ChangesetsModule`.

#### Agent handling

Do **not** change `skills/map-generator/SKILL.md` in this slice.

Reasons:
- The current skill is intentionally constrained to `eden changeset create` and explicitly forbids extra fetch steps
- Eden agent workflow policy says API-shaped operations should go through the `eden` CLI, not ad hoc `curl`
- Downloading and parsing binary docs in the agent is a larger capability change than this wizard fix

For WS2 v1, keep the agent contract stable and enrich the prompt server-side only for file types we can reliably read now. If we later need agent-side document retrieval, add an `eden` CLI command for source download first, then update the skill in a separate plan.

#### Source lifecycle

After map generation, the source sits in `uploaded` status (not confirmed). Two options:

**Option A: Auto-confirm after generation**
Triggers the ingestion pipeline immediately. This is attractive, but today it is likely to create a *second* changeset from the same document and duplicate content the wizard already used.

**Option B (recommended): Leave unconfirmed**
The source stays in `uploaded` status. The user can confirm it from the Sources page later, or we can add a dedicated follow-up once we have a dedupe/source-attribution strategy.

Going with **Option B** for this change. It keeps the wizard predictable and avoids a second, surprising AI pass immediately after creation.

#### Client-side changes

**`ProjectWizard.tsx`**

State additions:
```typescript
const [file, setFile] = useState<File | null>(null);
const [fileError, setFileError] = useState<string | null>(null);
const [uploadedSourceId, setUploadedSourceId] = useState<string | null>(null);
```

ContextStep additions:
- `FileDropZone` component (accepts file, shows selected filename, remove button)
- `file`, `fileError`, and `onFileChange` props

startGeneration() additions:
```typescript
// After project creation, before triggering generation:
let sourceId: string | undefined;

if (uploadedSourceId) {
  sourceId = uploadedSourceId;
} else if (file) {
  setGenStatus('Uploading document...');

  // Create source record
  const source = await api.post<{ id: string; upload_url: string }>(
    `/projects/${project.id}/sources`,
    {
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      file_size: file.size,
    },
  );

  // Upload to S3
  if (source.upload_url) {
    await fetch(source.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
  }

  sourceId = source.id;
  setUploadedSourceId(source.id);
}

// Trigger generation (with optional source_id)
const body = { ...contextFields, ...(sourceId && { source_id: sourceId }) };
const result = await api.post(`/projects/${project.id}/generate-map`, body);
```

GenerateStep status messages update:
```
"Creating project..."        → project POST
"Uploading document..."      → source upload (if file attached)
"Generating story map..."    → agent working
```

---

## Implementation Order

1. **WS1: Auto-accept** (small, high-impact)
   - `wizard.controller.ts` — pass `projectRole` through to the service
   - `wizard.service.ts` — add auto-accept logic in `getGenerateStatus()` and tighten changeset/job correlation
   - `wizard.module.ts` — import `ChangesetsModule`
   - `ProjectWizard.tsx` — update ReviewStep copy, remove "Review Changeset" link
   - Test: verify Estm8-like flow results in populated map

2. **WS2: Document upload** (medium, builds on WS1)
   - `ProjectWizard.tsx` — add FileDropZone to ContextStep, upload logic in startGeneration
   - `wizard.controller.ts` — add `source_id` to body type
   - `wizard.service.ts` — inject SourcesService + EveIngestService, validate `source_id`, persist it in audit, and inline supported text content into the prompt
   - `wizard.module.ts` — import `SourcesModule`
   - Test: upload markdown/text document → verify prompt-enriched generation path works
   - Follow-up (separate issue): binary doc extraction and/or auto-confirm with dedupe

---

## Files Changed

| File | WS | Change |
|------|----|--------|
| `apps/api/src/wizard/wizard.service.ts` | 1+2 | Auto-accept logic, source validation, audit enrichment, prompt enrichment |
| `apps/api/src/wizard/wizard.module.ts` | 1+2 | Import ChangesetsModule, SourcesModule |
| `apps/api/src/wizard/wizard.controller.ts` | 1+2 | Add `source_id` to generate-map body and pass `projectRole` |
| `apps/web/src/components/projects/ProjectWizard.tsx` | 1+2 | Update ReviewStep, add FileDropZone, upload validation, upload reuse on regenerate |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Auto-accept fails (DB error during apply) | Return `failed` from the status endpoint and keep the wizard on an error state instead of falsely reporting success |
| Large file upload slow on mobile | Client-side 10MB limit; upload happens during "Generating" step with progress message |
| Wrong changeset matched on poll | Filter lookup by the triggering `job_id` audit entry, not just `source = 'map-generator'` |
| Binary docs are uploaded but not usable in the first wizard run | Limit v1 prompt enrichment to text-like files and document that PDF/DOCX support needs follow-up extraction work |
| Document contains sensitive data | Same security model as Sources page — org-scoped, RLS-protected |
| Auto-confirm creates duplicate second-pass changesets | Leave sources unconfirmed in this slice; revisit only with dedupe/source-attribution rules |
| Regenerate after file upload | Cache and reuse `source_id` after the first successful upload instead of re-uploading the same file |
