# Project Wizard & Source Upload — Playwright Test Plan

**Scope:** End-to-end verification of the 4-step project creation wizard (including a known reset regression), source document upload flow (including 403 permission investigation), and post-creation data verification.

**Environment:** Staging sandbox (`https://web.{ORG_SLUG}-eden-sandbox.eh1.incept5.dev`)

**Auth:** `eve_token` injected into `localStorage` before each test, plus `eve_active_org_id` for org-scoped API calls (matches existing `phase3.spec.ts` pattern).

---

## Known Bugs Under Test

### BUG-1: Wizard resets to Step 1 during generation

**Reported by:** PM (manual testing)
**Symptom:** After clicking "Generate Story Map", the wizard returns to the Basics step instead of showing the generation spinner and eventual review step.

**Root cause (identified):** In `ProjectWizard.tsx:84`, `startGeneration()` calls `onProjectCreated()` immediately after creating the project but *before* setting up the polling interval. `onProjectCreated` is `refetch` from `useProjects`, which triggers `ProjectsPage` to re-render. This unmounts and remounts `ProjectWizard` with fresh state (`step = 'basics'`), losing all wizard progress.

**Code path:**
1. User clicks "Generate Story Map" → `setStep('generate')` + `startGeneration()`
2. `startGeneration()` calls `api.post('/projects', ...)` → project created
3. `onProjectCreated()` fires → triggers `useProjects.refetch()` → `ProjectsPage` re-renders
4. Re-render recreates `<ProjectWizard>` → `useState('basics')` resets step to beginning
5. Old polling interval orphaned; new component instance never receives generation result

**Fix applied:** `apps/web/src/components/projects/ProjectWizard.tsx` — replaced immediate `onProjectCreated()` call with a `projectCreatedRef` flag. The parent is notified via the unmount cleanup effect, which fires when the wizard closes (Escape, X, backdrop click, or navigation). This prevents the parent re-render from resetting wizard state mid-generation.

### BUG-2: Source upload returns 403 for non-owner users

**Reported by:** PM (manual testing)
**Symptom:** `POST /projects/:projectId/sources` returns 403 Forbidden.

**Root cause (identified):** The sources endpoints use `EditorGuard`, which requires the user to have `editor` or `owner` role on the project. The `ProjectRoleMiddleware` resolves roles via: (1) agent tokens bypass, (2) org-level owner/admin → `'owner'`, (3) `project_members` table lookup, (4) **fallback → `'viewer'`**. If the PM is not an org-level admin and has no row in `project_members`, they default to `'viewer'` and get rejected by `EditorGuard`.

**Code path:**
1. `ProjectRoleMiddleware` (`common/project-role.middleware.ts`) resolves `req.projectRole`
2. No `project_members` row for user → fallback `'viewer'`
3. `EditorGuard` (`common/editor.guard.ts`) checks: `if (request.projectRole === 'viewer') throw ForbiddenException`
4. 403 returned with `"Editor or owner role required"`

**Fix applied:** `apps/api/src/projects/projects.service.ts` — `create()` now auto-inserts the creator as `owner` in `project_members` within the same transaction. Uses `ON CONFLICT DO NOTHING` for idempotency. Verified: source upload returns 201 (not 403) for the project creator.

---

## Prerequisites

```bash
# Environment variables
export ORG_SLUG=incept5
export TOKEN=<owner-token>
export EDITOR_TOKEN=<editor-token>     # User with editor role on test project
export VIEWER_TOKEN=<viewer-token>     # User with NO project membership (triggers 403)
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api"

# Eden deployed with wizard + map-generator agent synced
eve env deploy sandbox --ref HEAD --repo-dir .
eve agents sync --local --allow-dirty
```

---

## Test Structure

Tests are organized in dependency order: the happy path must pass before edge/negative cases run. Use `test.describe.serial` for each group so failures short-circuit correctly.

### Selectors Reference

| Element | Selector |
|---------|----------|
| "New Project" button | `button:has-text("New Project")` |
| Wizard modal | `.fixed.inset-0.z-50` (modal overlay) |
| Project name input | `#wiz-name` |
| Slug input | `#wiz-slug` |
| Description textarea | `#wiz-desc` |
| "Next: Add Context" button | `button:has-text("Next: Add Context")` |
| "Skip — create empty project" button | `button:has-text("Skip")` |
| Close button (X) | `button[aria-label="Close"]` |
| Audience textarea | `#wiz-audience` |
| Capabilities textarea | `#wiz-caps` |
| Constraints textarea | `#wiz-constraints` |
| "Back" button | `button:has-text("Back")` |
| "Generate Story Map" button | `button:has-text("Generate Story Map")` |
| Spinner | `.animate-spin` |
| "Generating your story map" heading | `h3:has-text("Generating your story map")` |
| "Generation failed" heading | `h3:has-text("Generation failed")` |
| "Try Again" button | `button:has-text("Try Again")` |
| "Story map generated!" heading | `h3:has-text("Story map generated")` |
| "View Story Map" button | `button:has-text("View Story Map")` |
| "Review Changeset" link | `a:has-text("Review Changeset")` |
| "Regenerate" button | `button:has-text("Regenerate")` |
| Step indicator | `.flex.items-center.gap-1.mt-1\\.5` (contains Basics / Context / Generate / Review) |
| Project card | `.eden-card` within projects grid |
| Empty state "Create Project" | EmptyState's `button:has-text("Create Project")` |

---

## Group 1: Happy Path (Serial)

These tests are the foundation. Every subsequent group depends on them.

### 1.1 Wizard opens from "New Project" button

```
Navigate to EDEN_URL (projects page)
Inject auth token
Click "New Project" button
Assert: Modal overlay visible (fixed inset-0 z-50)
Assert: "Create Project" heading visible
Assert: Step indicator shows "Basics" highlighted
Assert: #wiz-name input is visible and focused (autoFocus)
Assert: #wiz-slug input is visible
Assert: #wiz-desc textarea is visible
Assert: "Next: Add Context" button is disabled (no name/slug yet)
Assert: "Skip — create empty project" button is disabled
```

### 1.2 Name → slug auto-derivation

```
Type "My Test Project" into #wiz-name
Assert: #wiz-slug auto-populated with "my-test-project"
Clear #wiz-name, type "Hello World 123!"
Assert: #wiz-slug becomes "hello-world-123"
Assert: "Next: Add Context" button is now enabled
Assert: "Skip" button is now enabled
```

### 1.3 Slug manual override stops auto-derivation

```
Clear #wiz-name, type "Project Alpha"
Assert: #wiz-slug = "project-alpha"
Click into #wiz-slug, clear it, type "custom-slug"
Change #wiz-name to "Project Beta"
Assert: #wiz-slug remains "custom-slug" (manual override sticks)
```

### 1.4 Navigate to Context step and back

```
Fill #wiz-name with "Playwright E2E Wizard"
Assert: slug auto-derives
Click "Next: Add Context"
Assert: Step indicator shows "Context" highlighted
Assert: #wiz-audience textarea visible
Assert: #wiz-caps textarea visible
Assert: #wiz-constraints textarea visible
Assert: "Generate Story Map" button visible
Assert: "Back" button visible
Click "Back"
Assert: Step indicator back to "Basics"
Assert: #wiz-name still contains "Playwright E2E Wizard"
Assert: Slug value preserved
```

### 1.5 Skip — create empty project

```
Fill #wiz-name with unique name (e.g. "PW Empty ${Date.now()}")
Wait for slug derivation
Click "Skip — create empty project"
Assert: Navigation to /projects/{projectId}/map
Assert: Map page loads with 0 activities, 0 personas (empty state)

API verification:
  GET /api/projects → find project by slug
  Assert: project exists with correct name
  GET /api/projects/{id}/map → assert activities: [], personas: []

Cleanup: DELETE /api/projects/{id}
```

### 1.6 Full generation flow (happy path)

This is the critical end-to-end test. Timeout: 4 minutes.

```
Navigate to EDEN_URL
Click "New Project"
Fill #wiz-name with "PW Food Delivery ${Date.now()}"
Click "Next: Add Context"

Fill context:
  #wiz-audience: "Hungry consumers aged 18-45, restaurant owners, delivery drivers"
  #wiz-caps: "Browse restaurants, place orders, real-time delivery tracking, menu management"
  #wiz-constraints: "Mobile-first, Stripe payments, food safety compliance"

Click "Generate Story Map"

Assert: Step indicator shows "Generate"
Assert: Spinner (.animate-spin) visible
Assert: "Generating your story map" heading visible
Assert: Status text updates (at least "Creating project..." then "Generating story map...")
Assert: "Most runs take 5-10 minutes..." subtitle visible

Wait for review step (timeout 600s):
  Assert: "Story map generated!" heading visible
  Assert: Green checkmark icon visible
  Assert: "View Story Map" button visible
  Assert: "Review Changeset" link visible (changeset was created)
  Assert: "Regenerate" button visible

Record the project URL from the "View Story Map" button href
```

### 1.7 Verify generated project data via API

Depends on 1.6 completing. Uses the project created above.

```
Extract projectId from navigation target

GET /api/projects/{projectId}/map
Assert: personas array length >= 3
Assert: activities array length >= 3
Assert: total steps (sum across activities) >= 6
Assert: total tasks (sum across all steps) >= 10
Assert: stats.persona_counts has >= 3 entries
Assert: stats.question_count >= 0

Spot-check content quality:
  Assert: at least one persona name contains food-related term
    (e.g., "Customer", "Restaurant", "Driver", "Diner", "Chef")
  Assert: activities have non-empty names
  Assert: tasks have non-empty titles

Cleanup: DELETE /api/projects/{projectId}
```

### 1.8 View Story Map button navigates correctly

```
(Continuing from 1.6 review step)
Click "View Story Map"
Assert: URL matches /projects/{id}/map
Assert: Map page renders with activity rows
Assert: At least one task card visible
Assert: Persona tabs visible with >= 3 personas
```

---

## Group 2: Changeset Review Path (Serial)

Run against a fresh wizard-generated project.

### 2.1 Review Changeset link navigates to Changes page

```
Complete wizard flow (reuse helper from 1.6)
On review step, click "Review Changeset" link
Assert: URL matches /projects/{id}/changes
Assert: At least one changeset row visible
Assert: Changeset title contains project name or "map"
```

### 2.2 Accept changeset and verify map population

```
(Continuing from 2.1)
Find the draft changeset for this project
Click to expand/review it
Accept the changeset (click accept button)
Navigate to /projects/{id}/map
Assert: Map has activities, steps, tasks (not empty)

API verification:
  GET /api/projects/{id}/map
  Assert: activities.length >= 3
  Assert: nested tasks exist with user_story fields

Cleanup: DELETE /api/projects/{id}
```

### 2.3 Regenerate returns to context step

```
Complete wizard through to review step
Click "Regenerate"
Assert: Step indicator shows "Context"
Assert: Previous context field values are preserved
Assert: "Generate Story Map" button visible
```

---

## Group 2B: Wizard Reset Regression (Serial) — BUG-1

These tests specifically verify the wizard does NOT reset to Step 1 during generation. This is the PM-reported bug.

### 2B.1 Wizard stays on Generate step after project creation

This is the core regression test. It verifies the exact sequence that triggers the bug.

```
Navigate to EDEN_URL
Click "New Project"
Fill #wiz-name with unique name
Click "Next: Add Context"
Fill at least one context field (#wiz-audience)
Click "Generate Story Map"

CRITICAL ASSERTIONS (must all pass within 5 seconds of clicking Generate):
  Assert: Step indicator shows "Generate" (NOT "Basics")
  Assert: #wiz-name is NOT visible (we should be past the basics step)
  Assert: Spinner (.animate-spin) is visible
  Assert: "Generating your story map" heading visible

Wait 10 seconds (enough time for parent refetch to complete):
  Assert: Step indicator STILL shows "Generate" (not reset to "Basics")
  Assert: Spinner STILL visible (or review step reached)
  Assert: #wiz-name is STILL NOT visible

Wait for generation to complete (timeout 600s):
  Assert: "Story map generated!" heading visible
  Assert: Step indicator shows "Review"
  Assert: Wizard NEVER showed "Basics" step after the initial progression

Cleanup: DELETE project
```

### 2B.2 Wizard does not flash/flicker during generation

Uses console + DOM observation to catch transient re-renders.

```
Open wizard, fill basics + context

Set up mutation observer BEFORE clicking Generate:
  page.evaluate(() => {
    window.__wizardResets = 0;
    const observer = new MutationObserver(() => {
      if (document.querySelector('#wiz-name')) {
        window.__wizardResets++;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

Click "Generate Story Map"
Wait 15 seconds

Check: page.evaluate(() => window.__wizardResets)
Assert: __wizardResets === 0 (the basics step #wiz-name never reappeared)

Cleanup: close wizard, DELETE project
```

### 2B.3 Projects list updates after wizard completes (not during)

Verifies the fix doesn't break the project list refresh.

```
Note current project count on projects page
Open wizard, complete full generation flow through to review step
Click "View Story Map" (navigates to map page)
Navigate back to EDEN_URL (projects page)
Assert: Project count is now previous count + 1
Assert: New project card visible with correct name

Cleanup: DELETE project
```

---

## Group 2C: Source Upload Flow (Serial)

Tests the document upload pipeline: create source → presigned URL → upload to S3 → confirm → ingestion.

### Selectors Reference (Sources Page)

| Element | Selector |
|---------|----------|
| Sources page | URL: `/projects/{id}/sources` |
| Upload drop zone | Drag-and-drop area or file input |
| Source list rows | Source table rows |
| Source status badge | Status indicator per source |
| Source detail panel | Slide-over or panel showing source details |

### 2C.1 Navigate to Sources page for a project

```
Create project via API (or use existing)
Navigate to EDEN_URL/projects/{projectId}/sources
Assert: Sources page loads
Assert: Source list is empty (or shows existing sources)
Assert: Upload area/button visible
```

### 2C.2 Upload a document (happy path, owner token)

```
Using OWNER token (org-level admin):

Navigate to sources page for test project

Upload a test file (e.g., small .txt or .md file):
  Option A — File input:
    Set input[type=file] to test fixture file
  Option B — API-level:
    POST /api/projects/{projectId}/sources { filename: "test.txt", content_type: "text/plain", file_size: 42 }
    Assert: 201 response
    Assert: response.upload_url is non-empty string (presigned S3 URL)
    Assert: response.id is UUID

    PUT to upload_url with file content
    Assert: 200 response from S3

    POST /api/sources/{id}/confirm
    Assert: 200 response

Assert: Source appears in list with status "processing" or "uploaded"

Poll source status (or wait for UI auto-refresh):
  Assert: Status eventually reaches "extracted" or "done" (timeout 120s)

Cleanup: (source persists with project, cleaned up with project delete)
```

### 2C.3 Source upload 403 for viewer role — BUG-2

This reproduces the PM's 403 error.

```
Create project via API with OWNER token

Switch to VIEWER_TOKEN (user with no project_members row):

API test:
  POST /api/projects/{projectId}/sources
    Headers: Authorization: Bearer $VIEWER_TOKEN
    Body: { filename: "test.txt", content_type: "text/plain", file_size: 42 }
  Assert: 403 response
  Assert: response body contains "Editor or owner role required"

UI test (if applicable):
  Login with viewer token
  Navigate to /projects/{projectId}/sources
  Attempt file upload
  Assert: Error message visible indicating insufficient permissions

Cleanup: DELETE project with OWNER token
```

### 2C.4 Source upload succeeds for editor role

```
Create project via API with OWNER token
Add user as editor: POST /api/projects/{projectId}/members { user_id: ..., role: "editor" }
  (or insert into project_members table)

Switch to EDITOR_TOKEN:

POST /api/projects/{projectId}/sources
  Headers: Authorization: Bearer $EDITOR_TOKEN
  Body: { filename: "editor-test.txt", content_type: "text/plain", file_size: 42 }
Assert: 201 response (NOT 403)
Assert: upload_url present

POST /api/sources/{id}/confirm
  Headers: Authorization: Bearer $EDITOR_TOKEN
Assert: 200 response (NOT 403)

Cleanup: DELETE project
```

### 2C.5 Source upload with no auth returns 401

```
POST /api/projects/{projectId}/sources
  (No Authorization header)
  Body: { filename: "unauth.txt", content_type: "text/plain", file_size: 42 }
Assert: 401 Unauthorized
```

### 2C.6 Upload triggers ingestion pipeline

```
Upload and confirm a source (using owner token)
Wait for status to reach "extracted" or "done" (timeout 120s)

Verify pipeline ran:
  GET /api/projects/{projectId}/audit
  Assert: audit entries include source create + confirm actions
  Assert: audit entries include changeset creation (from synthesis agent)

Check for resulting changeset:
  GET /api/changesets?project_id={projectId}
  Assert: At least one changeset with source = source_id or related to ingestion

Cleanup: DELETE project
```

### 2C.7 Accepted file types render correctly

```
For each type in [".pdf", ".txt", ".md", ".docx"]:
  POST /api/projects/{projectId}/sources
    Body: { filename: "test{ext}", content_type: "{mime}", file_size: 100 }
  Assert: 201 (all accepted)

Cleanup: DELETE project
```

### 2C.8 Source detail panel shows metadata

```
Create and confirm a source
Navigate to sources page
Click on the source row
Assert: Detail panel opens
Assert: Shows filename
Assert: Shows status
Assert: Shows upload timestamp
```

---

## Group 3: UI Mechanics (Parallel-safe, independent)

These tests don't trigger generation — they're fast and can run in parallel.

### 3.1 Escape key closes wizard

```
Open wizard
Press Escape
Assert: Modal overlay removed from DOM
Assert: Projects page visible behind
```

### 3.2 Backdrop click closes wizard

```
Open wizard
Click the backdrop (outside the modal content area)
Assert: Modal closes
```

### 3.3 Close button (X) closes wizard

```
Open wizard
Click button[aria-label="Close"]
Assert: Modal closes
```

### 3.4 Step indicator reflects current step

```
Open wizard → assert "Basics" text has accent color class
Fill name → click "Next: Add Context" → assert "Basics" and "Context" both have accent color
```

### 3.5 Empty state "Create Project" button opens wizard

```
(Requires org with no projects, or use API to delete all)
Navigate to EDEN_URL
If empty state is visible:
  Click "Create Project" button in empty state
  Assert: Wizard modal opens
Else:
  Skip (cannot guarantee empty state in shared sandbox)
```

### 3.6 Buttons disabled states

```
Open wizard
Assert: "Next: Add Context" disabled
Assert: "Skip" disabled
Type name only (clear slug if auto-derived somehow)
— Actually both are derived together so:
Type " " (whitespace only) into name
Assert: slug derives to "" (empty after trim)
Assert: Both buttons still disabled
Type valid name
Assert: Both buttons enabled
```

---

## Group 4: Negative / Edge Cases (Serial)

Run after Groups 1–3 pass.

### 4.1 Duplicate slug rejected

```
Create a project via API: POST /api/projects { name: "Dupe Test", slug: "dupe-slug-test" }

Open wizard
Fill #wiz-name with "Another Project"
Manually set #wiz-slug to "dupe-slug-test"
Click "Skip — create empty project"

Assert: Error banner visible with red background
Assert: Error text mentions conflict/duplicate/already exists (409 response)
Assert: Wizard stays on basics step (does not navigate away)
Assert: User can correct the slug and retry

Cleanup: DELETE the original project
```

### 4.2 Generation failure shows error state

```
This requires either:
  a) A project where Eve is unavailable (503), or
  b) Network interception to mock a failure

Option A (if Eve is down or token invalid):
  Open wizard, fill basics + context, click Generate
  Wait for error state
  Assert: "Generation failed" heading visible
  Assert: Red X icon visible
  Assert: Error message text visible
  Assert: "Try Again" button visible
  Click "Try Again"
  Assert: Returns to context step with values preserved

Option B (route interception):
  page.route('**/generate-map', route => route.fulfill({ status: 503, body: '{}' }))
  Open wizard, fill basics + context, click Generate
  Assert: Error state appears
  Assert: "Try Again" works
  Unroute after test
```

### 4.3 Special characters in project name

```
Open wizard
Type name: 'Café & Résumé — "Test" (v2.0)'
Assert: Slug derives to "caf-rsum-test-v2-0" (non-ascii stripped, special chars to dashes)
Click "Skip — create empty project"
Assert: Project created successfully
Assert: Navigation to map page works

Cleanup: DELETE project
```

### 4.4 Very long project name

```
Open wizard
Type name: "A".repeat(200)  (200 character name)
Assert: Slug derives (long but valid)
Click "Next: Add Context"
Assert: Context step renders normally
Click "Back"
Assert: Name and slug preserved at full length
```

### 4.5 Context fields are truly optional

```
Open wizard
Fill basics (name + slug)
Click "Next: Add Context"
Leave ALL context fields empty
Click "Generate Story Map"
Assert: Generation starts (no client-side validation blocks it)
Assert: Spinner visible, generation proceeds
(Can cancel/close at this point — the project was still created)

Cleanup: DELETE project via API
```

### 4.6 Closing wizard during generation

```
Open wizard, fill basics + context, click Generate
Wait for spinner to appear
Press Escape (or click X)
Assert: Modal closes

Verify side effects:
  The project WAS created (POST /projects fires before generation)
  GET /api/projects → find the project by slug
  Assert: Project exists
  The Eve job may still be running — that's fine

Cleanup: DELETE project
```

### 4.7 Multiple rapid wizard open/close cycles

```
Repeat 3 times:
  Click "New Project"
  Assert: Modal visible
  Press Escape
  Assert: Modal gone

Assert: No console errors
Assert: No stale modals in DOM
```

---

## Group 5: API-Level Verification (Parallel-safe)

These tests hit the API directly (no browser UI) to verify backend behavior independently. Use `request` context from Playwright.

### 5.1 POST /projects creates project with correct fields

```
POST /api/projects { name: "API Test", slug: "api-test-pw" }
  Headers: Authorization: Bearer $TOKEN, X-Eve-Org-Id: $ORG_ID

Assert: 201 response
Assert: response.id is UUID
Assert: response.name === "API Test"
Assert: response.slug === "api-test-pw"
Assert: response.created_at is ISO timestamp

Cleanup: DELETE /api/projects/{id}
```

### 5.2 POST /projects with duplicate slug returns 409

```
POST /api/projects { name: "First", slug: "dup-test" }
Assert: 201

POST /api/projects { name: "Second", slug: "dup-test" }
Assert: 409 or 500 (unique constraint violation)

Cleanup: DELETE first project
```

### 5.3 POST /generate-map returns 202 with job_id

```
Create project via API
POST /api/projects/{id}/generate-map { description: "Test project" }
Assert: 202 response
Assert: response.job_id is non-empty string

Cleanup: DELETE project
```

### 5.4 GET /generate-map/status returns valid status

```
Create project, trigger generation (get job_id)
GET /api/projects/{id}/generate-map/status?job_id={jobId}
Assert: response.status is one of: "running", "complete", "failed"

If complete:
  Assert: response.changeset_id is UUID string

Cleanup: DELETE project
```

### 5.5 Empty map for new project

```
Create project via API
GET /api/projects/{id}/map
Assert: response.personas is []
Assert: response.activities is []
Assert: response.stats.activity_count === 0
Assert: response.stats.task_count === 0

Cleanup: DELETE project
```

### 5.6 Audit trail records project creation and generation

```
Create project, trigger generation
GET /api/projects/{id}/audit
Assert: entries include action === "create" with entity_type === "project"
Assert: entries include action === "generate_map"
Assert: generate_map entry details contain job_id

Cleanup: DELETE project
```

---

## Test Helpers

### Auth Setup (beforeEach)

**Important:** The `@eve-horizon/auth-react` library stores the JWT in `sessionStorage`
with key `eve_access_token` (not `localStorage` / `eve_token`). The org override goes
in `localStorage` as `eve_active_org_id`. The token must be a valid JWT (3-part
base64) — the client-side lib validates the format before calling the API.

```typescript
const BASE = `https://web.${process.env.ORG_SLUG}-eden-sandbox.eh1.incept5.dev`;
const API = `https://api.${process.env.ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api`;
const TOKEN = process.env.TOKEN!;  // Must be a real Eve JWT (`eve auth token`)

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(({ token, orgId }) => {
    sessionStorage.setItem('eve_access_token', token);
    localStorage.setItem('eve_active_org_id', orgId);
  }, { token: TOKEN, orgId: process.env.ORG_ID ?? '' });
  await page.reload();
  await page.waitForLoadState('networkidle');
});
```

### Project Cleanup

```typescript
async function deleteProject(request: APIRequestContext, projectId: string) {
  await request.delete(`${API}/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
}
```

### Unique Slug Generator

```typescript
function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
```

### Wait for Generation Complete

```typescript
async function waitForGeneration(page: Page, timeoutMs = 600_000) {
  await expect(page.locator('h3:has-text("Story map generated")')).toBeVisible({
    timeout: timeoutMs,
  });
}
```

### Source Upload Helper

```typescript
async function uploadSource(
  request: APIRequestContext,
  projectId: string,
  filename = 'test.txt',
  content = 'Sample document content for testing.',
) {
  // Create source record + get presigned URL
  const source = await request.post(`${API}/projects/${projectId}/sources`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    data: {
      filename,
      content_type: 'text/plain',
      file_size: content.length,
    },
  });
  expect(source.status()).toBe(201);
  const { id, upload_url } = await source.json();

  // Upload to S3 via presigned URL
  if (upload_url) {
    const upload = await request.put(upload_url, {
      data: content,
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(upload.status()).toBe(200);
  }

  // Confirm to trigger ingestion pipeline
  const confirm = await request.post(`${API}/sources/${id}/confirm`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  expect(confirm.status()).toBe(200);

  return { id, upload_url };
}
```

### Wait for Source Processing

```typescript
async function waitForSourceDone(
  request: APIRequestContext,
  sourceId: string,
  timeoutMs = 120_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`${API}/sources/${sourceId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const { status } = await res.json();
    if (status === 'done' || status === 'synthesized') return status;
    if (status === 'failed') throw new Error('Source processing failed');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Source processing timed out');
}
```

---

## Execution Notes

- **Timeouts:** Generation tests need 10-minute timeouts. Set `test.setTimeout(600_000)` for Group 1.6, 1.7, 2.x, 2B.x. Source upload tests need 2-minute timeouts for pipeline completion (2C.2, 2C.6).
- **Parallelism:** Groups 3 and 5 are parallel-safe. Groups 1, 2, 2B, 2C, and 4 must run serial within their group.
- **Cleanup:** Every test that creates a project must delete it in `test.afterEach` or `test.afterAll` to avoid slug collisions in re-runs.
- **Shared sandbox:** Tests use unique slugs with timestamps to avoid conflicts with other users.
- **Flakiness:** Generation depends on Eve agent availability. If the agent is down, Group 1.6+ and Group 4.2 will fail. Group 3 and 5 (except 5.3/5.4) are agent-independent.
- **Multiple tokens:** Groups 2C.3 and 2C.4 require `VIEWER_TOKEN` and `EDITOR_TOKEN` environment variables for testing role-based access. If unavailable, those tests should be skipped with a clear message.
- **Regression priority:** Group 2B (wizard reset) and Group 2C.3 (source 403) are the highest-priority tests — they verify known bugs. Run these before edge cases.
