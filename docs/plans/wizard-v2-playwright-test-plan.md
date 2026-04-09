# Wizard V2 — Playwright Test Plan

**Scope:** End-to-end verification of two new wizard features: (1) auto-accept of generate-map changesets, and (2) optional document upload during project creation.

**Prerequisite:** Existing wizard tests in `project-wizard-playwright-test-plan.md` pass. This plan covers only the delta.

**Environment:** Staging sandbox. Reuse the same base URL/auth helper as the existing wizard suite so this delta plan stays aligned with the deployed ingress alias.

---

## Auth & Environment

```bash
export ORG_SLUG=incept5
export TOKEN=<owner-token>           # eve auth token
export EDITOR_TOKEN=<editor-token>   # optional: for preview-vs-approved assertions
export ORG_ID=org_Incept5
export EDEN_URL="https://eden-app.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
```

> **Note:** `EDEN_URL` uses the `eden-app.` subdomain to match the existing `phase3.spec.ts` base URL. The `web.` subdomain is also valid but would require updating phase3 for consistency.

```typescript
// Auth setup (extends tests/e2e/phase3.spec.ts with org scoping)
const EDEN_URL = process.env.EDEN_URL
  ?? `https://eden-app.${process.env.ORG_SLUG}-eden-sandbox.eh1.incept5.dev`;
const EDEN_API = process.env.EDEN_API
  ?? `https://api.${process.env.ORG_SLUG}-eden-sandbox.eh1.incept5.dev`;
const TOKEN = process.env.TOKEN!;
const ORG_ID = process.env.ORG_ID ?? 'org_Incept5';

test.beforeEach(async ({ page }) => {
  await page.goto(EDEN_URL);
  await page.evaluate(({ token, orgId }) => {
    sessionStorage.setItem('eve_access_token', token);
    localStorage.setItem('eve_active_org_id', orgId);
  }, { token: TOKEN, orgId: ORG_ID });
  await page.reload();
  await page.waitForLoadState('networkidle');
});
```

---

## New Selectors

| Element | Selector |
|---------|----------|
| File drop zone | `[data-testid="wizard-file-dropzone"]` |
| File input (hidden) | `[data-testid="wizard-file-input"]` |
| Selected file name | `[data-testid="wizard-file-name"]` |
| Remove file button | `[data-testid="wizard-file-remove"]` |
| File validation message | `[data-testid="wizard-file-error"]` |
| Upload progress text | Status text during generation showing "Uploading document..." |
| Story map root | `[data-testid="story-map"]` |
| Activity column | `[data-testid^="activity-ACT-"]` |
| Task card | `[data-testid^="task-card-"]` |

---

## Group A: Auto-Accept (Serial)

These tests verify that the wizard produces a populated map — not a draft changeset.

### A.1 Generated map is immediately populated (core fix)

This is the test for Ade's "nothing generated" bug. Timeout: 4 minutes.

```
Navigate to EDEN_URL
Click "New Project"
Fill #wiz-name with "PW AutoAccept ${Date.now()}"
Click "Next: Add Context"

Fill context:
  #wiz-audience: "Project managers, developers"
  #wiz-caps: "Task tracking, sprint planning, burndown charts"

Click "Generate Story Map"

Wait for review step (timeout 600s):
  Assert: "Story map generated!" heading visible
  Assert: "View Story Map" button visible
  Assert: "Review Changeset" link is NOT visible (changeset already accepted)

Click "View Story Map"
Assert: URL matches /projects/{id}/map
Assert: [data-testid="story-map"] is visible
Assert: at least 1 `[data-testid^="activity-ACT-"]` is visible
Assert: at least 1 `[data-testid^="task-card-"]` is visible

API verification:
  GET /projects/{id}/map
  Assert: activities.length >= 3
  Assert: personas.length >= 2
  Assert: stats.task_count >= 5

  GET /projects/{id}/changesets
  Assert: latest changeset status === "accepted" (NOT "draft")

Cleanup: DELETE /projects/{id}
```

### A.2 Auto-accept is idempotent on re-poll

Verifies that polling the status endpoint multiple times after completion doesn't error.

```
Create project via API
POST /projects/{id}/generate-map { description: "Idempotent test" }
Wait for job to complete (poll status endpoint)

Once status === "complete":
  Record changeset_id from response
  Poll status endpoint 3 more times (simulating browser re-polls)
  Assert: all 3 return { status: "complete", changeset_id: same_id }
  Assert: no 500 errors

  GET /changesets/{changeset_id}
  Assert: status === "accepted" (not double-accepted or errored)

Cleanup: DELETE project
```

### A.3 Changeset audit trail shows auto-accept

```
Complete wizard flow (name: "PW Audit ${Date.now()}")
Wait for map to be populated

GET /projects/{id}/audit
Assert: entries include action === "generate_map"
Assert: entries include action === "accept" with entity_type === "changeset"
Assert: accept entry actor is the user's ID (not null / not agent)
Assert: accept entry details.items_accepted >= 10
Assert: accept entry details.approval === "approved" when using owner token
Assert: accept entry created_at > generate_map entry created_at

Cleanup: DELETE project
```

### A.4 Regenerate creates new changeset and auto-accepts it

**Prerequisite:** Depends on the WS1 regenerate project-reuse fix. Without it, `startGeneration()` creates a new project on regenerate instead of reusing the existing one, and the assertions below about 2 changesets on the same project would fail.

```
Complete wizard through to review step
Record project ID from the URL

Click "Regenerate"
Assert: Step indicator shows "Context"
Assert: Previous context field values preserved

Modify one field (add text to #wiz-caps)
Click "Generate Story Map"

Assert: Status does NOT show "Creating project..." (project already exists)
Wait for review step again (timeout 600s):
  Assert: "Story map generated!" heading visible

Click "View Story Map"
Assert: URL contains the SAME project ID as the first run
Assert: Map has activities and tasks (populated, not empty)

API verification:
  GET /projects/{id}/changesets
  Assert: 2 changesets (both with source = "map-generator")
  Assert: both have status === "accepted"
  Assert: second changeset created_at > first changeset created_at
  Note: this verifies today's additive regenerate behavior. If replace semantics are introduced later, this expectation should change.

Cleanup: DELETE project
```

### A.5 Editor-triggered auto-accept preserves preview semantics

This is the regression guard for the server-side accept call. It should preserve the caller role instead of hardcoding owner privileges.

```
Authenticate with EDITOR_TOKEN
Create project + generate map through the wizard
Wait for completion

GET /projects/{id}/changesets
Assert: latest changeset status === "accepted"

GET /projects/{id}/audit
Assert: latest "accept" entry exists
Assert: accept entry details.approval === "preview"

GET /projects/{id}/pending-approvals
Assert: pending approval items are present

Cleanup: DELETE project using owner token if needed
```

Server-side apply-failure simulation itself belongs in a Nest integration test, not Playwright E2E. Playwright cannot reliably induce a database-side accept failure from the browser.

---

## Group B: Document Upload UI (Parallel-safe, no generation)

Fast tests that verify the file upload UX without triggering generation.

### B.1 File drop zone renders on Context step

```
Open wizard
Fill #wiz-name with "Drop Zone Test"
Click "Next: Add Context"

Assert: [data-testid="wizard-file-dropzone"] is visible
Assert: Drop zone contains text "Drop a file here" or "click to browse"
Assert: Drop zone shows accepted types ("PDF, Markdown, Word, text")
Assert: No file name shown initially
Assert: [data-testid="wizard-file-remove"] is NOT visible
```

### B.2 File selection via click

```
Open wizard, navigate to Context step

Create test file fixture:
  const buffer = Buffer.from('# Test Document\n\nThis is a test.');

Trigger file selection:
  const fileInput = page.locator('[data-testid="wizard-file-input"]');
  await fileInput.setInputFiles({
    name: 'requirements.md',
    mimeType: 'text/markdown',
    buffer: buffer,
  });

Assert: [data-testid="wizard-file-name"] contains "requirements.md"
Assert: [data-testid="wizard-file-remove"] is visible
Assert: Drop zone visual state changes (shows file, not empty state)
```

### B.3 File removal

```
Open wizard, navigate to Context step
Select a file (per B.2)
Assert: file name visible

Click [data-testid="wizard-file-remove"]
Assert: file name NOT visible
Assert: Drop zone returns to empty state
Assert: [data-testid="wizard-file-remove"] is NOT visible
```

### B.4 Drag-and-drop file selection

```
Open wizard, navigate to Context step

Create DataTransfer with test file:
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    const file = new File(['test content'], 'scope.pdf', { type: 'application/pdf' });
    dt.items.add(file);
    return dt;
  });

Dispatch drop event on drop zone:
  await page.locator('[data-testid="wizard-file-dropzone"]').dispatchEvent('drop', {
    dataTransfer,
  });

Assert: [data-testid="wizard-file-name"] contains "scope.pdf"
```

### B.5 Rejected file types

```
Open wizard, navigate to Context step

Attempt to select an invalid file type:
  await fileInput.setInputFiles({
    name: 'image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake png'),
  });

Assert: File is NOT accepted
Assert: [data-testid="wizard-file-error"] is visible
Assert: Drop zone remains in empty state
```

### B.6 File size limit (10MB)

```
Open wizard, navigate to Context step

Create oversized file:
  const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

  await fileInput.setInputFiles({
    name: 'massive.pdf',
    mimeType: 'application/pdf',
    buffer: largeBuffer,
  });

Assert: File is NOT accepted
Assert: [data-testid="wizard-file-error"] mentions the size limit
```

### B.7 File persists through Back/Next navigation

```
Open wizard, navigate to Context step
Select a file
Fill #wiz-audience with "Engineers"

Click "Back" (return to Basics step)
Assert: Basics step visible

Click "Next: Add Context"
Assert: [data-testid="wizard-file-name"] still shows the selected file
Assert: #wiz-audience still contains "Engineers"
```

### B.8 Accepted file types (positive cases)

```
For each type in [
  { name: 'doc.pdf', mime: 'application/pdf' },
  { name: 'doc.md', mime: 'text/markdown' },
  { name: 'doc.txt', mime: 'text/plain' },
  { name: 'doc.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
]:
  Open wizard, navigate to Context step
  Select file with given name + mime
  Assert: [data-testid="wizard-file-name"] contains the filename
  Remove file (cleanup for next iteration)
```

---

## Group C: Document Upload with Generation (Serial)

These tests trigger real generation with an attached document. Timeout: 4 minutes each.

Important scope note:
- For v1, the strongest content assertions should use `.md` / `.txt` fixtures because those are the file types we can realistically inline into the generation prompt without adding a new extraction capability.
- PDF / DOC / DOCX can still be covered at the upload UX/API level, but should not be used for deterministic "document influenced the map" assertions yet.

### C.1 Generation with document attachment (happy path)

Core end-to-end test. Verifies the full flow: select file → upload → generate → auto-accept → map populated with document-informed content.

```
Navigate to EDEN_URL
Click "New Project"
Fill #wiz-name with "PW DocUpload ${Date.now()}"
Click "Next: Add Context"

Select test document:
  Create a requirements document with known content:
    """
    # CoffeeShop POS System

    ## Personas
    - Barista: Takes orders, makes drinks
    - Manager: Inventory, staff scheduling
    - Customer: Mobile ordering

    ## Key Features
    - Menu management with seasonal specials
    - Mobile order-ahead with estimated pickup time
    - Inventory tracking with low-stock alerts
    - Staff shift scheduling
    - Sales reporting dashboard
    """

  Set file input to this document (as .md)

Assert: File name "coffeeshop-pos.md" shown in drop zone

Optionally fill text fields (to test combined context):
  #wiz-caps: "Focus on the mobile ordering experience"

Click "Generate Story Map"

Assert: Step shows "Generate"
Assert: Status text updates through:
  "Creating project..."
  "Uploading document..."     ← NEW: shows during file upload
  "Generating story map..."

Wait for review step (timeout 600s):
  Assert: "Story map generated!" heading visible

Click "View Story Map"
Assert: Map has activities and tasks

API verification:
  GET /projects/{id}/map
  Assert: personas.length >= 2
  Assert: activities.length >= 3

  Content quality (document-informed):
  Assert: at least one persona name matches document content
    (e.g., "Barista", "Manager", or "Customer")
  Assert: at least one activity relates to coffee/ordering/inventory

  Source verification:
  GET /projects/{id}/sources
  Assert: at least 1 source with filename "coffeeshop-pos.md"
  Assert: source status is "uploaded"

Cleanup: DELETE project
```

### C.2 Generation without document (unchanged behavior)

Verifies that the document upload is truly optional and doesn't break the existing flow.

```
Open wizard
Fill #wiz-name with "PW NoDocs ${Date.now()}"
Click "Next: Add Context"

Assert: Drop zone visible but empty
Do NOT select any file

Fill #wiz-audience: "Students and teachers"
Fill #wiz-caps: "Online courses, quizzes, grade tracking"

Click "Generate Story Map"

Assert: Status text shows "Creating project..." then "Generating story map..."
Assert: Status text does NOT show "Uploading document..." (no file to upload)

Wait for completion (timeout 600s):
  Assert: "Story map generated!" heading visible

Click "View Story Map"
Assert: Map has content (not empty)

Cleanup: DELETE project
```

### C.3 Generation with document only (no text fields)

Verifies the validation logic: providing a document should satisfy the "at least one input" requirement even if all text fields are empty.

```
Open wizard
Fill #wiz-name with "PW DocOnly ${Date.now()}"
Click "Next: Add Context"

Select a test document (any .md with content)
Leave all text fields EMPTY

Click "Generate Story Map"

Assert: Generation starts (no validation error blocking it)
Assert: Spinner visible

Wait for completion (timeout 600s):
  Assert: "Story map generated!" heading visible
  Verify map has content informed by the document

Cleanup: DELETE project
```

### C.4 Upload failure during generation

Simulates upload failure by intercepting the exact `upload_url` returned from source creation. Avoid hardcoding an S3 hostname because the presigned host can vary by environment.

```
Open wizard, fill basics, navigate to Context
Select a test document

Intercept the create-source response or captured upload_url:
  - let the app call POST /projects/{id}/sources
  - capture `upload_url` from the response
  - route that exact URL and fulfill the PUT with 500

Click "Generate Story Map"

Assert: Status shows "Uploading document..."
Assert: Eventually shows error state
Assert: "Generation failed" heading visible
Assert: Error message mentions upload failure
Assert: "Try Again" button visible

Click "Try Again"
Assert: Returns to Context step
Assert: File is still selected (not lost)

Unroute S3 intercept
Cleanup: close wizard, DELETE project if created
```

### C.5 Large document upload with progress

Tests UX during upload of a larger (but valid) file without relying on wall-clock timing.

```
Open wizard, fill basics, navigate to Context

Create a 2MB test document:
  const content = 'Requirements line\n'.repeat(100_000); // ~1.8MB
  Set file input with this content as requirements.txt

Click "Generate Story Map"

Delay the upload route by ~2s in the test so the intermediate state is deterministic
Assert: Status shows "Uploading document..."
Assert: Status eventually transitions to "Generating story map..."

Wait for completion (timeout 240s — larger doc may mean longer agent run):
  Assert: completion or error state reached

Cleanup: DELETE project
```

---

## Group D: API-Level Tests (Parallel-safe)

Tests hit the API directly using Playwright's `request` context. No browser UI.

All request-context calls must send:
- `Authorization: Bearer ${TOKEN}`
- `X-Eve-Org-Id: ${ORG_ID}`

### D.1 POST /generate-map accepts source_id

```
Create project via API
Create source: POST /projects/{id}/sources { filename: "test.md", content_type: "text/markdown", file_size: 100 }
Record source_id

POST /projects/{id}/generate-map {
  description: "Test with source",
  source_id: source_id
}
Assert: 202 response
Assert: response.job_id is non-empty string

Cleanup: DELETE project
```

### D.2 POST /generate-map without source_id still works

```
Create project via API
POST /projects/{id}/generate-map { description: "No source" }
Assert: 202 response
Assert: response.job_id present

Cleanup: DELETE project
```

### D.3 POST /generate-map with invalid source_id returns 404

```
Create project via API
POST /projects/{id}/generate-map {
  description: "Bad source",
  source_id: "00000000-0000-0000-0000-000000000000"
}
Assert: 404 response

Cleanup: DELETE project
```

### D.4 Status endpoint returns accepted changeset (not draft)

```
Create project
Trigger generation: POST /projects/{id}/generate-map { description: "Auto accept API test" }
Record job_id

Poll status until complete (timeout 600s):
  GET /projects/{id}/generate-map/status?job_id={job_id}
  When status === "complete":
    Record changeset_id

Verify changeset is accepted:
  GET /projects/{id}/changesets
  Find changeset by changeset_id
  Assert: status === "accepted"

Verify map is populated:
  GET /projects/{id}/map
  Assert: activities.length >= 3
  Assert: personas.length >= 2

Cleanup: DELETE project
```

### D.5 Source created during wizard has correct metadata

```
Create project via API
Create source: POST /projects/{id}/sources {
  filename: "brief.pdf",
  content_type: "application/pdf",
  file_size: 50000
}
Assert: 201 response
Assert: response.id is UUID
Assert: response.upload_url is non-empty (presigned S3 URL)
Assert: response.filename === "brief.pdf"
Assert: response.content_type === "application/pdf"
Assert: response.status === "uploaded"

Cleanup: DELETE project
```

### D.6 Validation: no inputs returns 400

```
Create project via API
POST /projects/{id}/generate-map {}
Assert: 400 response
Assert: body.message mentions required inputs (currently: "at least one of description, audience, or capabilities"; after WS2: also accepts source_id)

Cleanup: DELETE project
```

### D.7 Validation: document alone satisfies input requirement

Once WS2 is implemented, providing only `source_id` (no text fields) should be accepted.

```
Create project via API
Create + upload a source

POST /projects/{id}/generate-map { source_id: source_id }
Assert: 202 response (NOT 400)

Cleanup: DELETE project
```

### D.8 Validation: foreign-project source_id is rejected

```
Create project A via API
Create project B via API
Create source under project A

POST /projects/{projectB}/generate-map {
  description: "Wrong source project",
  source_id: source_from_project_A
}
Assert: 404 response

Cleanup: DELETE both projects
```

---

## Group E: Regression — Existing Wizard Behavior Preserved (Serial)

Verify that WS1 and WS2 don't break existing wizard functionality.

### E.1 "Skip — create empty project" still works

```
Open wizard
Fill #wiz-name with "PW Skip ${Date.now()}"
Click "Skip — create empty project"
Assert: Navigation to /projects/{id}/map
Assert: Map is empty (0 activities, 0 tasks)

Cleanup: DELETE project
```

### E.2 Wizard stays on Generate step during generation (BUG-1 regression)

Same as existing test 2B.1 — verify the wizard reset fix still holds with auto-accept changes.

```
Open wizard, fill basics + context
Click "Generate Story Map"

Within 5 seconds:
  Assert: Step indicator shows "Generate" (NOT "Basics")
  Assert: Spinner visible

Wait 10 seconds:
  Assert: Still on "Generate" step

Wait for completion:
  Assert: "Story map generated!" heading visible

Cleanup: DELETE project
```

### E.3 Escape closes wizard during generation (no orphaned state)

```
Open wizard, fill basics + context, click "Generate Story Map"
Wait for spinner
Press Escape
Assert: Modal closes

Navigate to projects page
Assert: Project was created (card visible)
Poll `/projects/{id}/generate-map/status` or refresh `/projects/{id}/map`
Assert: project eventually becomes populated once the background job completes
Assert: no UI errors during the eventual navigation

Cleanup: DELETE project
```

### E.4 Context fields preserved on Back navigation (with file)

```
Open wizard
Fill basics
Click "Next: Add Context"
Fill #wiz-audience: "Test audience"
Select a test document
Click "Back"
Click "Next: Add Context"

Assert: #wiz-audience === "Test audience"
Assert: File still selected (name visible in drop zone)
```

---

## Test Fixtures

### Test Documents

Store in `tests/fixtures/`:

**`coffeeshop-pos.md`** (used in C.1):
```markdown
# CoffeeShop POS System

## Personas
- Barista: Takes orders, makes drinks
- Manager: Inventory, staff scheduling, reporting
- Customer: Mobile ordering, loyalty rewards

## Key Features
- Menu management with seasonal specials
- Mobile order-ahead with estimated pickup time
- Inventory tracking with low-stock alerts
- Staff shift scheduling
- Sales reporting dashboard
- Customer loyalty program

## Constraints
- Must integrate with Square for payments
- Offline mode for network outages
- GDPR compliance for customer data
```

**`minimal.txt`** (used in C.3, B.2):
```
Simple project requirements: build a task tracker with tags and deadlines.
```

---

## Test Helpers

### File Upload Helper

```typescript
async function selectWizardFile(
  page: Page,
  filename: string,
  content: string,
  mimeType = 'text/markdown',
) {
  const fileInput = page.locator('[data-testid="wizard-file-input"]');
  await fileInput.setInputFiles({
    name: filename,
    mimeType,
    buffer: Buffer.from(content),
  });
  await expect(page.locator('[data-testid="wizard-file-name"]')).toContainText(filename);
  await expect(page.locator('[data-testid="wizard-file-error"]')).toHaveCount(0);
}
```

### Full Wizard Flow Helper

```typescript
async function runWizardWithDocument(
  page: Page,
  options: {
    name: string;
    audience?: string;
    capabilities?: string;
    file?: { name: string; content: string; mimeType?: string };
  },
) {
  await page.click('button:has-text("New Project")');
  await page.fill('#wiz-name', options.name);
  await page.click('button:has-text("Next: Add Context")');

  if (options.audience) await page.fill('#wiz-audience', options.audience);
  if (options.capabilities) await page.fill('#wiz-caps', options.capabilities);
  if (options.file) {
    await selectWizardFile(page, options.file.name, options.file.content, options.file.mimeType);
  }

  await page.click('button:has-text("Generate Story Map")');

  // Wait for generation to complete
  await expect(page.locator('h3:has-text("Story map generated")')).toBeVisible({
    timeout: 600_000,
  });
}
```

### Unique Name Generator

```typescript
function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
}
```

---

## Execution Notes

- **Timeouts:** Group A and C tests need `test.setTimeout(240_000)`. Group B and D use default timeouts.
- **Parallelism:** Groups B and D are parallel-safe. Groups A, C, and E must run serial within their group.
- **Serial dependency:** Run Group A before Group C (auto-accept must work for document upload tests to validate map content).
- **Cleanup:** Every test that creates a project deletes it in `afterEach` / `afterAll`.
- **Fixtures:** Test documents in `tests/fixtures/` — checked into repo.
- **Agent dependency:** Groups A.1, A.4, C.1, C.2, C.3 depend on the map-generator agent being available. If the agent is down, these will fail. Groups B and D (except D.4) are agent-independent.
- **Code dependency:** Test A.4 requires the WS1 regenerate project-reuse fix (see design plan). Without it, regeneration creates a new project and the "2 changesets on same project" assertion fails.
- **Upload dependency:** Group C.4/C.5 should intercept the concrete presigned URL returned by the API rather than assume an S3 hostname.
- **Non-E2E gap:** True accept-failure handling should be covered in an API/Nest integration test because Playwright cannot force a DB-side apply error reliably.
- **Recommended execution order:** B (fast UI) → D (fast API) → A (auto-accept) → C (doc upload + generation) → E (regression)
