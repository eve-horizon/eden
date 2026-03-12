# Eden Manual Test Scenarios

**Phase Coverage:** Phases 1–4 (Foundation → Changesets → Intelligence → Polish)
**Approach:** Progressive scenarios that build on each other — a new project goes from empty to fully populated via API, UI, and AI workflows.
**Dogfooding:** Uses Eden's own PRD documents (`docs/prd/`) as test input to exercise the expert panel and ingestion pipeline.

---

## Prerequisites (All Scenarios)

```bash
# Optional strict mode for copy/paste execution
set -euo pipefail

# Authenticate
eve auth login  # or: export EVE_TOKEN=$(eve auth token --raw)

# Target environment
export EVE_API_URL=https://api.eh1.incept5.dev
export ORG_SLUG=incept5
export EDEN_URL=https://eden.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev
export PROJECT_SLUG=manual-test
export LC_PROJECT_SLUG=lifecycle-test
export EVE_CLI_PROJECT=eden
export EVE_CLI_ENV=sandbox

# Helper functions
TOKEN="${EVE_TOKEN:-$(eve auth token --raw)}"
api() { curl -sf -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"; }
api_code() { curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$@"; }

# Playwright (for UI scenarios)
cd apps/web && npx playwright install chromium
```

---

## Scenario 01: API Smoke & Project Setup

**Time:** ~2 minutes
**Parallel Safe:** Yes
**LLM Required:** No
**Type:** API (curl)

Verifies the API is alive, auth works, and we can create the test project that all subsequent scenarios use.

### Prerequisites

- Staging deployment is up (`eve deploy status --project "$EVE_CLI_PROJECT" --env "$EVE_CLI_ENV"`)

### Steps

#### 1. Health Check

```bash
CODE=$(api_code "$EDEN_URL/api/health")
echo "Health: $CODE"
```

**Expected:** HTTP 200

#### 2. Create Test Project

```bash
PROJECT=$(api -X POST "$EDEN_URL/api/projects" \
  -d "{\"name\": \"Manual Test — Eden Scenarios\", \"slug\": \"$PROJECT_SLUG\"}")
export PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
echo "Project: $PROJECT_ID"
```

**Expected:**
- HTTP 201
- Returns JSON with `id`, `name`, `slug`
- `slug` is `$PROJECT_SLUG`

> If project already exists (409), fetch it:
> ```bash
> PROJECT_ID=$(api "$EDEN_URL/api/projects" | jq -r --arg slug "$PROJECT_SLUG" '.[] | select(.slug==$slug) | .id')
> ```

#### 3. Verify Project Appears in List

```bash
api "$EDEN_URL/api/projects" | jq '.[].slug'
```

**Expected:** `"$PROJECT_SLUG"` appears in the list

#### 4. Verify Empty Map

```bash
MAP=$(api "$EDEN_URL/api/projects/$PROJECT_ID/map")
echo "$MAP" | jq '{activities: (.activities | length), personas: (.personas | length)}'
```

**Expected:** Both counts are 0 — clean slate.

### Success Criteria

- [ ] API health returns 200
- [ ] Project created with correct slug
- [ ] Project listed in projects endpoint
- [ ] Empty map returned for new project

---

## Scenario 02: Story Map CRUD — Personas, Activities, Steps, Tasks

**Time:** ~5 minutes
**Parallel Safe:** No (depends on Scenario 01)
**LLM Required:** No
**Type:** API (curl)

Populates the test project with a realistic story map structure via the API. Establishes the data that Scenario 03+ will verify in the UI.

### Prerequisites

- Scenario 01 passed — `$PROJECT_ID` is set

### Steps

#### 1. Create Personas

```bash
for p in '{"code":"PM","name":"Product Manager","color":"#4A90D9"}' \
         '{"code":"BA","name":"Business Analyst","color":"#7B68EE"}' \
         '{"code":"EL","name":"Engineering Lead","color":"#2ECC71"}' \
         '{"code":"SH","name":"Stakeholder","color":"#E67E22"}'; do
  api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/personas" -d "$p" | jq '{id, code}'
done
```

**Expected:** 4 personas created, each returns `id` and `code`.

#### 2. Create Activities

```bash
ACT1=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/activities" \
  -d '{"name": "Document Ingestion", "display_id": "ACT-1", "sort_order": 1}')
ACT1_ID=$(echo "$ACT1" | jq -r '.id')

ACT2=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/activities" \
  -d '{"name": "Expert Review", "display_id": "ACT-2", "sort_order": 2}')
ACT2_ID=$(echo "$ACT2" | jq -r '.id')

ACT3=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/activities" \
  -d '{"name": "Map Editing", "display_id": "ACT-3", "sort_order": 3}')
ACT3_ID=$(echo "$ACT3" | jq -r '.id')
```

**Expected:** 3 activities created with sequential `display_id` values.

#### 3. Create Steps Under Activities

```bash
# Activity 1 steps
S1=$(api -X POST "$EDEN_URL/api/activities/$ACT1_ID/steps" \
  -d '{"name": "Upload Document", "display_id": "STP-1.1", "sort_order": 1}')
S1_ID=$(echo "$S1" | jq -r '.id')

S2=$(api -X POST "$EDEN_URL/api/activities/$ACT1_ID/steps" \
  -d '{"name": "Extract Content", "display_id": "STP-1.2", "sort_order": 2}')
S2_ID=$(echo "$S2" | jq -r '.id')

# Activity 2 steps
S3=$(api -X POST "$EDEN_URL/api/activities/$ACT2_ID/steps" \
  -d '{"name": "Triage Request", "display_id": "STP-2.1", "sort_order": 1}')
S3_ID=$(echo "$S3" | jq -r '.id')

S4=$(api -X POST "$EDEN_URL/api/activities/$ACT2_ID/steps" \
  -d '{"name": "Panel Analysis", "display_id": "STP-2.2", "sort_order": 2}')
S4_ID=$(echo "$S4" | jq -r '.id')

# Activity 3 steps
S5=$(api -X POST "$EDEN_URL/api/activities/$ACT3_ID/steps" \
  -d '{"name": "Chat Interaction", "display_id": "STP-3.1", "sort_order": 1}')
S5_ID=$(echo "$S5" | jq -r '.id')
```

**Expected:** 5 steps created across 3 activities.

#### 4. Create Tasks

```bash
# Grab persona IDs
PM_ID=$(api "$EDEN_URL/api/projects/$PROJECT_ID/personas" | jq -r '.[] | select(.code=="PM") | .id')
BA_ID=$(api "$EDEN_URL/api/projects/$PROJECT_ID/personas" | jq -r '.[] | select(.code=="BA") | .id')

T1=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/tasks" \
  -d '{
    "title": "Upload requirements document",
    "display_id": "TSK-1.1.1",
    "user_story": "As a PM, I want to upload a requirements document so that the AI can extract structured requirements",
    "acceptance_criteria": "- Accepts PDF, DOCX, MD formats\n- Shows upload progress\n- Confirms successful upload",
    "priority": "high",
    "status": "current"
  }')
T1_ID=$(echo "$T1" | jq -r '.id')

T2=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/tasks" \
  -d '{
    "title": "Review expert panel synthesis",
    "display_id": "TSK-2.2.1",
    "user_story": "As a PM, I want to review the expert panel synthesis so that I can make informed decisions about requirements",
    "acceptance_criteria": "- Shows consensus and dissent\n- Highlights critical risks\n- Lists recommended actions",
    "priority": "high",
    "status": "current"
  }')
T2_ID=$(echo "$T2" | jq -r '.id')

T3=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/tasks" \
  -d '{
    "title": "Ask a question about a requirement",
    "display_id": "TSK-3.1.1",
    "user_story": "As a BA, I want to ask questions about requirements so that ambiguities are resolved",
    "acceptance_criteria": "- Question linked to relevant entities\n- Status tracks resolution\n- AI can evolve based on answer",
    "priority": "medium",
    "status": "current"
  }')
T3_ID=$(echo "$T3" | jq -r '.id')
```

**Expected:** 3 tasks created with user stories and acceptance criteria.

#### 5. Place Tasks on Steps with Personas

```bash
# Task 1 → Step 1.1, owned by PM
api -X POST "$EDEN_URL/api/tasks/$T1_ID/place" \
  -d "{\"step_id\": \"$S1_ID\", \"persona_id\": \"$PM_ID\", \"role\": \"owner\"}" | jq '{id, role}'

# Task 2 → Step 2.2, owned by PM
api -X POST "$EDEN_URL/api/tasks/$T2_ID/place" \
  -d "{\"step_id\": \"$S4_ID\", \"persona_id\": \"$PM_ID\", \"role\": \"owner\"}" | jq '{id, role}'

# Task 3 → Step 3.1, owned by BA
api -X POST "$EDEN_URL/api/tasks/$T3_ID/place" \
  -d "{\"step_id\": \"$S5_ID\", \"persona_id\": \"$BA_ID\", \"role\": \"owner\"}" | jq '{id, role}'

# Task 3 also placed as handoff on Step 1.2 (BA reviews extracted content)
api -X POST "$EDEN_URL/api/tasks/$T3_ID/place" \
  -d "{\"step_id\": \"$S2_ID\", \"persona_id\": \"$BA_ID\", \"role\": \"handoff\"}" | jq '{id, role}'
```

**Expected:**
- 4 step_task placements created
- Task 3 appears under two different steps (deduplication test for UI)

#### 6. Verify Full Map Structure

```bash
MAP=$(api "$EDEN_URL/api/projects/$PROJECT_ID/map")
echo "$MAP" | jq '{
  personas: (.personas | length),
  activities: (.activities | length),
  total_steps: [.activities[].steps | length] | add,
  total_tasks: [.activities[].steps[].tasks | length] | add
}'
```

**Expected:** `{ personas: 4, activities: 3, total_steps: 5, total_tasks: 4 }` (task 3 appears under 2 steps)

### Success Criteria

- [ ] 4 personas created with correct codes
- [ ] 3 activities with display_ids ACT-1 through ACT-3
- [ ] 5 steps distributed across activities
- [ ] 3 tasks with user stories and acceptance criteria
- [ ] Task placements include owner and handoff roles
- [ ] Map endpoint returns correct hierarchy with all entities
- [ ] Task 3 appears under two steps (multi-placement)

---

## Scenario 03: Releases, Questions & Search

**Time:** ~3 minutes
**Parallel Safe:** No (depends on Scenario 02)
**LLM Required:** No
**Type:** API (curl)

Exercises the remaining CRUD entities: releases, questions, and full-text search.

### Prerequisites

- Scenario 02 passed — project populated with personas, activities, steps, tasks

### Steps

#### 1. Create a Release

```bash
RELEASE=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/releases" \
  -d '{"name": "MVP Release", "target_date": "2026-04-15", "status": "planning"}')
RELEASE_ID=$(echo "$RELEASE" | jq -r '.id')
```

**Expected:** Release created with status `planning`.

#### 2. Assign Tasks to Release

```bash
api -X POST "$EDEN_URL/api/releases/$RELEASE_ID/tasks" \
  -d "{\"task_id\": \"$T1_ID\"}" | jq '.id'

api -X POST "$EDEN_URL/api/releases/$RELEASE_ID/tasks" \
  -d "{\"task_id\": \"$T2_ID\"}" | jq '.id'
```

**Expected:** 2 tasks assigned to MVP Release.

#### 3. Create Questions

```bash
Q1=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/questions" \
  -d '{
    "question": "What file size limit should we enforce for document uploads?",
    "category": "technical",
    "priority": "high",
    "status": "open"
  }')
Q1_ID=$(echo "$Q1" | jq -r '.id')

Q2=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/questions" \
  -d '{
    "question": "Should the expert panel run for every document or only on explicit request?",
    "category": "product",
    "priority": "medium",
    "status": "open",
    "is_cross_cutting": true
  }')
Q2_ID=$(echo "$Q2" | jq -r '.id')
```

**Expected:** 2 questions created. Q2 is cross-cutting.

#### 4. Answer a Question

```bash
api -X PATCH "$EDEN_URL/api/projects/$PROJECT_ID/questions/$Q1_ID" \
  -d '{"answer": "50MB limit for documents, 500MB for audio/video files", "status": "answered"}' | jq '{status, answer}'
```

**Expected:** Question updated to `answered` with answer text.

#### 5. Full-Text Search

```bash
# Search tasks
api "$EDEN_URL/api/projects/$PROJECT_ID/search?q=expert+panel" | jq '.[].title'

# Search questions
api "$EDEN_URL/api/projects/$PROJECT_ID/search?q=file+size" | jq '.[].question'
```

**Expected:** Search returns matching tasks and questions by keyword.

#### 6. Verify Map Filters

```bash
# Filter by persona
api "$EDEN_URL/api/projects/$PROJECT_ID/map?persona=$PM_ID" | jq '[.activities[].steps[].tasks[]] | length'

# Filter by release
api "$EDEN_URL/api/projects/$PROJECT_ID/map?release=$RELEASE_ID" | jq '[.activities[].steps[].tasks[]] | length'
```

**Expected:**
- Persona filter returns only PM-owned/handoff tasks
- Release filter returns 2 tasks (those assigned to MVP Release)

### Success Criteria

- [ ] Release created and tasks assigned
- [ ] Questions created with open/answered statuses
- [ ] Cross-cutting question flagged correctly
- [ ] Full-text search returns matching results
- [ ] Map persona filter narrows task set
- [ ] Map release filter shows only assigned tasks

---

## Scenario 04: Changesets — Create, Review, Apply

**Time:** ~4 minutes
**Parallel Safe:** No (depends on Scenario 02)
**LLM Required:** No
**Type:** API (curl)

Tests the changeset system end-to-end: create a proposed set of changes, review item-by-item, accept, and verify the changes are applied to the map.

### Prerequisites

- Scenario 02 passed — project has populated map

### Steps

#### 1. Create a Changeset with Multiple Operations

```bash
CHANGESET=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/changesets" \
  -d "{
    \"title\": \"Add security review step\",
    \"reasoning\": \"The expert panel identified a gap: no explicit security review step exists in the map.\",
    \"source\": \"manual-test\",
    \"items\": [
      {
        \"entity_type\": \"step\",
        \"operation\": \"create\",
        \"after_state\": {
          \"name\": \"Security Review\",
          \"display_id\": \"STP-2.3\",
          \"activity_id\": \"$ACT2_ID\",
          \"sort_order\": 3
        },
        \"description\": \"New step for security-focused review of requirements\"
      },
      {
        \"entity_type\": \"task\",
        \"operation\": \"create\",
        \"after_state\": {
          \"title\": \"Verify security implications of new requirements\",
          \"display_id\": \"TSK-2.3.1\",
          \"user_story\": \"As an Engineering Lead, I want security implications flagged during review so that we catch issues early\",
          \"acceptance_criteria\": \"- Auth requirements identified\\n- Data privacy assessed\\n- OWASP top 10 checked\",
          \"priority\": \"high\",
          \"status\": \"proposed\"
        },
        \"description\": \"Security verification task for new requirements\"
      }
    ]
  }")
CS_ID=$(echo "$CHANGESET" | jq -r '.id')
echo "Changeset: $CS_ID"
```

**Expected:**
- Changeset created with status `draft` (or `pending`)
- Contains 2 items (step create + task create)

#### 2. Get Changeset Detail

```bash
api "$EDEN_URL/api/projects/$PROJECT_ID/changesets/$CS_ID" | jq '{
  title,
  status,
  source,
  item_count: (.items | length),
  items: [.items[] | {entity_type, operation, description}]
}'
```

**Expected:** 2 items, both with `entity_type` and `operation` fields.

#### 3. Accept the Changeset

```bash
ACCEPTED=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/changesets/$CS_ID/accept")
echo "$ACCEPTED" | jq '{status}'
```

**Expected:** Status changes to `accepted`.

#### 4. Verify Changes Applied to Map

```bash
# Check Activity 2 now has 3 steps
api "$EDEN_URL/api/projects/$PROJECT_ID/map" | jq '
  .activities[] | select(.display_id == "ACT-2") |
  {name, step_count: (.steps | length), steps: [.steps[].name]}
'
```

**Expected:**
- Activity 2 now has 3 steps (Triage Request, Panel Analysis, Security Review)
- New task appears under the new step

#### 5. Create and Reject a Changeset

```bash
REJECT_CS=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/changesets" \
  -d '{
    "title": "Remove all personas (bad idea)",
    "reasoning": "Testing rejection flow",
    "source": "manual-test",
    "items": [
      {
        "entity_type": "persona",
        "operation": "delete",
        "before_state": {"code": "PM"},
        "description": "Remove PM persona"
      }
    ]
  }')
REJECT_ID=$(echo "$REJECT_CS" | jq -r '.id')

api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/changesets/$REJECT_ID/reject" | jq '{status}'
```

**Expected:** Changeset status is `rejected`. PM persona still exists.

#### 6. Verify Rejected Changeset Had No Effect

```bash
api "$EDEN_URL/api/projects/$PROJECT_ID/personas" | jq '.[].code'
```

**Expected:** All 4 persona codes still present (PM, BA, EL, SH).

### Success Criteria

- [ ] Changeset created with multiple items
- [ ] Changeset detail returns items with correct operations
- [ ] Accept applies all items to the map
- [ ] New step and task appear in map after acceptance
- [ ] Reject does not modify the map
- [ ] All personas survive rejected deletion

---

## Scenario 05: Audit Trail & Export

**Time:** ~2 minutes
**Parallel Safe:** No (depends on Scenarios 01–04)
**LLM Required:** No
**Type:** API (curl)

Verifies that all operations from Scenarios 01–04 left an audit trail, and that export produces valid output.

### Prerequisites

- Scenarios 01–04 passed

### Steps

#### 1. Fetch Audit Log

```bash
AUDIT=$(api "$EDEN_URL/api/projects/$PROJECT_ID/audit")
echo "$AUDIT" | jq '{
  total: length,
  actions: [.[].action] | unique,
  entity_types: [.[].entity_type] | unique
}'
```

**Expected:**
- Multiple entries (15+ from Scenarios 01–04)
- Actions include: `create`, `update`, `accept`, `reject`
- Entity types include: `persona`, `activity`, `step`, `task`, `release`, `question`, `changeset`

#### 2. Filter Audit by Entity Type

```bash
api "$EDEN_URL/api/projects/$PROJECT_ID/audit?entity_type=changeset" | jq '.[].action'
```

**Expected:** Shows `create`, `accept`, `reject` actions for changesets.

#### 3. Export to JSON

```bash
JSON_EXPORT=$(api "$EDEN_URL/api/projects/$PROJECT_ID/export/json")
echo "$JSON_EXPORT" | jq 'keys'
```

**Expected:** Valid JSON with keys for project structure (activities, personas, tasks, etc.)

#### 4. Export to Markdown

```bash
MD_EXPORT=$(api "$EDEN_URL/api/projects/$PROJECT_ID/export/markdown")
echo "$MD_EXPORT" | head -20
```

**Expected:** Formatted Markdown with headings for activities, steps, task descriptions.

### Success Criteria

- [ ] Audit log contains entries from all CRUD operations
- [ ] Audit filterable by entity_type
- [ ] JSON export produces valid, complete project structure
- [ ] Markdown export produces readable requirements document

---

## Scenario 06: Story Map UI — Layout & Navigation

**Time:** ~5 minutes
**Parallel Safe:** No (depends on Scenarios 01–04 for data)
**LLM Required:** No
**Type:** Playwright

Verifies the story map UI renders the data created in previous scenarios correctly.

### Prerequisites

- Scenarios 01–04 passed — project has populated map with multiple activities, steps, tasks
- Playwright installed: `npx playwright install chromium`

### Test Script: `tests/e2e/manual-06-map-ui.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://eden.incept5-eden-sandbox.eh1.incept5.dev';
const PROJECT_SLUG = process.env.PROJECT_SLUG || 'manual-test';

test.describe('Scenario 06: Story Map UI', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to Eden and authenticate
    await page.goto(EDEN_URL);
    // Auth flow — adapt to current login mechanism
    await page.waitForURL('**/projects/**', { timeout: 15000 });
  });

  test('map renders activities as horizontal rows', async ({ page }) => {
    // Navigate to the manual-test project map
    await page.click(`text=${PROJECT_SLUG}`);
    await page.waitForSelector('[data-testid="story-map"]', { timeout: 10000 });

    // Verify 3 activities rendered
    const activities = page.locator('[data-testid^="activity-"]');
    await expect(activities).toHaveCount(3);

    // Verify activity names
    await expect(page.locator('text=Document Ingestion')).toBeVisible();
    await expect(page.locator('text=Expert Review')).toBeVisible();
    await expect(page.locator('text=Map Editing')).toBeVisible();
  });

  test('task cards show title and persona badges', async ({ page }) => {
    await page.click(`text=${PROJECT_SLUG}`);
    await page.waitForSelector('[data-testid="story-map"]');

    // Verify task cards exist
    const taskCards = page.locator('[data-testid^="task-card-"]');
    await expect(taskCards.first()).toBeVisible();

    // Verify persona badges on cards
    await expect(page.locator('text=Upload requirements document')).toBeVisible();
    await expect(page.locator('text=PM').first()).toBeVisible();
  });

  test('stats bar displays correct counts', async ({ page }) => {
    await page.click(`text=${PROJECT_SLUG}`);
    await page.waitForSelector('[data-testid="stats-bar"]', { timeout: 10000 });

    // Verify stats bar shows counts
    const statsBar = page.locator('[data-testid="stats-bar"]');
    await expect(statsBar).toContainText('4'); // personas or tasks
  });

  test('minimap is visible and interactive', async ({ page }) => {
    await page.click(`text=${PROJECT_SLUG}`);
    await page.waitForSelector('[data-testid="story-map"]');

    const minimap = page.locator('[data-testid="minimap"]');
    await expect(minimap).toBeVisible();

    // Minimap should show activity names
    await expect(minimap).toContainText('Document Ingestion');
  });

  test('task card hover shows lift effect', async ({ page }) => {
    await page.click(`text=${PROJECT_SLUG}`);
    await page.waitForSelector('[data-testid="story-map"]');

    const card = page.locator('[data-testid^="task-card-"]').first();
    await card.hover();

    // Verify hover state (shadow or transform change)
    const transform = await card.evaluate(el =>
      window.getComputedStyle(el).transform
    );
    expect(transform).not.toBe('none');
  });

  test('persona filter narrows visible tasks', async ({ page }) => {
    await page.click(`text=${PROJECT_SLUG}`);
    await page.waitForSelector('[data-testid="story-map"]');

    // Click persona filter for BA
    const baFilter = page.locator('text=Business Analyst').or(page.locator('text=BA'));
    if (await baFilter.isVisible()) {
      await baFilter.click();
      // Should show fewer tasks (only BA-owned)
      const cards = page.locator('[data-testid^="task-card-"]');
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(4); // Not all tasks
    }
  });
});
```

### Running

```bash
cd apps/web
npx playwright test tests/e2e/manual-06-map-ui.spec.ts --reporter=list
```

### Success Criteria

- [ ] Story map renders with horizontal layout (activities as rows)
- [ ] 3 activities visible with correct names
- [ ] Task cards display title and persona badges
- [ ] Stats bar shows accurate counts
- [ ] Minimap visible with activity labels
- [ ] Hover effect on task cards
- [ ] Persona filter narrows visible tasks

---

## Scenario 07: Q&A, Changes & Sources Pages

**Time:** ~5 minutes
**Parallel Safe:** No (depends on Scenarios 01–04)
**LLM Required:** No
**Type:** Playwright

Verifies the remaining UI pages render correctly with data from earlier scenarios.

### Test Script: `tests/e2e/manual-07-pages.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://eden.incept5-eden-sandbox.eh1.incept5.dev';
const PROJECT_SLUG = process.env.PROJECT_SLUG || 'manual-test';

test.describe('Scenario 07: Application Pages', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(EDEN_URL);
    await page.waitForURL('**/projects/**', { timeout: 15000 });
    await page.click(`text=${PROJECT_SLUG}`);
  });

  test('Q&A page shows questions with status', async ({ page }) => {
    await page.click('text=Q&A');
    await page.waitForSelector('[data-testid="qa-page"]', { timeout: 10000 });

    // Verify questions from Scenario 03
    await expect(page.locator('text=file size limit')).toBeVisible();
    await expect(page.locator('text=expert panel run')).toBeVisible();

    // Answered question should show status
    await expect(page.locator('text=answered').first()).toBeVisible();
  });

  test('Changes page shows accepted and rejected changesets', async ({ page }) => {
    await page.click('text=Changes');
    await page.waitForSelector('[data-testid="changes-page"]', { timeout: 10000 });

    // Verify changesets from Scenario 04
    await expect(page.locator('text=Add security review step')).toBeVisible();
    await expect(page.locator('text=Remove all personas')).toBeVisible();

    // Status tabs should work
    await page.click('text=Accepted');
    await expect(page.locator('text=Add security review step')).toBeVisible();

    await page.click('text=Rejected');
    await expect(page.locator('text=Remove all personas')).toBeVisible();
  });

  test('Releases page shows MVP Release with assigned tasks', async ({ page }) => {
    await page.click('text=Releases');
    await page.waitForSelector('[data-testid="releases-page"]', { timeout: 10000 });

    await expect(page.locator('text=MVP Release')).toBeVisible();
    await expect(page.locator('text=planning')).toBeVisible();
  });

  test('Audit page shows operation history', async ({ page }) => {
    await page.click('text=Audit');
    await page.waitForSelector('[data-testid="audit-page"]', { timeout: 10000 });

    // Should have multiple entries from Scenarios 01–04
    const rows = page.locator('[data-testid^="audit-entry-"]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(10);
  });

  test('Sources page allows document upload', async ({ page }) => {
    await page.click('text=Sources');
    await page.waitForSelector('[data-testid="sources-page"]', { timeout: 10000 });

    // Upload zone should be visible
    const uploadZone = page.locator('[data-testid="upload-zone"]')
      .or(page.locator('text=upload').or(page.locator('text=drag')));
    await expect(uploadZone.first()).toBeVisible();
  });
});
```

### Running

```bash
cd apps/web
npx playwright test tests/e2e/manual-07-pages.spec.ts --reporter=list
```

### Success Criteria

- [ ] Q&A page displays questions with open/answered status
- [ ] Changes page shows accepted and rejected changesets
- [ ] Changes page status tabs filter correctly
- [ ] Releases page shows MVP Release
- [ ] Audit page shows 10+ historical entries
- [ ] Sources page has document upload area

---

## Scenario 07b: Chat Panel UI

**Time:** ~5 minutes
**Parallel Safe:** No (depends on Scenarios 01–02 for project data)
**LLM Required:** No (UI chrome only) / Yes (for full agent round-trip)
**Type:** Playwright (local) + Eve (staging for agent responses)

Verifies the chat panel opens, accepts input, sends messages, displays typing indicator, strips routing prefixes, handles errors, and supports thread management. This tests the **chat UI itself** — the panel, input, message rendering, changeset detection — separate from the agent-side scenarios (09, 10, 14) which test agent behavior.

### Prerequisites

- Scenarios 01–02 passed — project exists with baseline map
- API running with `EVE_API_URL` and `EVE_PROJECT_ID` set (for thread/message API)

### Steps

#### 1. Open Chat Panel

Navigate to the story map, click the **Chat** button in the toolbar.

**Expected:**
- Chat panel slides in from the right (560px width)
- Header shows "Map Chat" with New Thread and Close buttons
- Empty state shows placeholder: "Ask me to edit the story map"
- Input textbox visible with "Ask about the map or request changes..." placeholder
- Send button disabled (no text entered)

#### 2. Type and Send a Message

Type "What tasks are in Document Ingestion?" and click Send (or press Enter).

**Expected:**
- User message appears as right-aligned accent-colored bubble
- **Message does NOT show `@eve pm` prefix** (stripped in display)
- Input becomes disabled during send/polling
- Typing indicator (three animated dots) appears below the user message
- After agent responds (or polling timeout), input re-enables

#### 3. Agent Response Rendering (requires staging)

Wait for the PM coordinator to respond.

**Expected:**
- Agent response appears as left-aligned gray bubble
- Markdown formatting rendered (bold, lists, code blocks)
- If response references a changeset, "Review Changeset" button appears inline

#### 4. New Thread

Click the **+** (New Thread) button.

**Expected:**
- Messages clear
- Active thread resets
- Empty state reappears
- Next message creates a fresh Eve thread

#### 5. Close Panel

Click the **×** close button (or the backdrop overlay).

**Expected:**
- Chat panel closes
- Chat toolbar button state returns to normal (not highlighted)

#### 6. Error Handling (requires EVE_PROJECT_ID unset)

If `EVE_PROJECT_ID` is not configured, opening chat and attempting to send should:

**Expected:**
- Error banner appears: "Failed to send message" or "Failed to load threads"
- No crash or unhandled exception
- Input re-enables so user can retry

#### 7. Changeset Review Flow (requires agent-created changeset)

When an agent response contains a changeset reference like "Changeset #abc123":

**Expected:**
- "Review Changeset" button appears in the message bubble
- Clicking it triggers `onReviewChangeset` callback
- Parent page opens changeset detail modal

### Success Criteria

- [ ] Chat panel opens/closes from toolbar button
- [ ] Empty state shows with placeholder text and example prompts
- [ ] User messages display without `@eve pm` routing prefix
- [ ] Send button disabled when input is empty or during loading/polling
- [ ] Typing indicator appears while polling for agent response
- [ ] New Thread button clears conversation and resets state
- [ ] Error state displays gracefully (no crash)
- [ ] Agent responses render markdown correctly (bold, lists, code)
- [ ] Changeset references in messages show "Review Changeset" button
- [ ] Chat panel coexists with story map (side by side layout)

---

## Scenario 08: Document Ingestion Pipeline

**Time:** ~10 minutes
**Parallel Safe:** No
**LLM Required:** Yes (Eve agents)
**Type:** API (curl) + Eve CLI

Uploads Eden's own high-level summary as a source document and triggers the Eve ingestion pipeline. Verifies the three-agent pipeline: ingest → extract → synthesize.

### Prerequisites

- Scenarios 01–02 passed — project exists with baseline map
- Eve agents synced to the eden project

### Steps

#### 1. Create Source Record

```bash
SOURCE=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/sources" \
  -d '{
    "filename": "high-level-summary.md",
    "content_type": "text/markdown",
    "file_size": 4096
  }')
SOURCE_ID=$(echo "$SOURCE" | jq -r '.id')
echo "Source: $SOURCE_ID"
```

**Expected:** Source created with status `uploaded`.

#### 2. Upload the Document Content

> Implementation depends on whether Eden uses presigned URLs or direct upload.
> If presigned URL:
> ```bash
> PRESIGN=$(api "$EDEN_URL/api/projects/$PROJECT_ID/sources/$SOURCE_ID/upload-url")
> UPLOAD_URL=$(echo "$PRESIGN" | jq -r '.url')
> curl -X PUT "$UPLOAD_URL" -T docs/prd/high-level-summary.md
> ```
> If direct attachment via Eve:
> ```bash
> eve ingest docs/prd/high-level-summary.md --project "$PROJECT_ID" --json
> ```

#### 3. Confirm Source to Trigger Pipeline

```bash
CONFIRM=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/sources/$SOURCE_ID/confirm")
echo "$CONFIRM" | jq '{status}'
```

**Expected:** Status changes to `processing`. Eve `doc.ingest` event fires.

#### 4. Monitor Pipeline Jobs

```bash
# Wait for Eve to create ingestion job
for i in $(seq 1 24); do
  JOBS=$(eve job list --project eden --status active --json 2>/dev/null)
  [ "$(echo "$JOBS" | jq 'length')" -gt 0 ] && break
  echo "Waiting for pipeline job... ($i)"
  sleep 5
done

# Follow the ingestion job
JOB_ID=$(echo "$JOBS" | jq -r '.[0].id')
eve job follow $JOB_ID
```

**Expected:**
- Ingestion agent reads the markdown file
- Extraction agent identifies personas, activities, steps, tasks
- Synthesis agent compares against existing map and creates changeset

#### 5. Verify Changeset Created

```bash
# Poll for changeset from ingestion pipeline
for i in $(seq 1 12); do
  CS_LIST=$(api "$EDEN_URL/api/projects/$PROJECT_ID/changesets?source=ingestion")
  [ "$(echo "$CS_LIST" | jq 'length')" -gt 0 ] && break
  sleep 5
done

echo "$CS_LIST" | jq '.[0] | {title, source, item_count: (.items | length)}'
```

**Expected:** At least 1 changeset with source `ingestion`, containing multiple items (tasks, steps, activities extracted from the document).

#### 6. Verify Source Status Updated

```bash
api "$EDEN_URL/api/projects/$PROJECT_ID/sources/$SOURCE_ID" | jq '{status, filename}'
```

**Expected:** Status is `synthesized` (or `extracted` if synthesis is still running).

### Debugging

```bash
# Check Eve job status
eve job list --project eden --json | jq '.[] | {id, description, phase, close_reason}'

# Diagnose stuck job
eve job diagnose $JOB_ID

# Check workflow trigger
eve job logs $JOB_ID
```

### Success Criteria

- [ ] Source record created via API
- [ ] Confirm triggers Eve doc.ingest event
- [ ] Ingestion job starts within 2 minutes
- [ ] Pipeline completes (ingest → extract → synthesize)
- [ ] Changeset created with extracted requirements
- [ ] Source status updated to reflect pipeline completion
- [ ] Extracted content relates to document contents (not hallucinated)

---

## Scenario 09: Expert Panel Review via Chat

**Time:** ~10 minutes
**Parallel Safe:** No
**LLM Required:** Yes (Eve agents — 1 coordinator + 7 experts)
**Type:** API (curl) + Eve CLI

**This is the core dogfooding scenario.** We send Eden's own PRD to the expert panel via chat, watch the staged council dispatch, and verify we get a comprehensive multi-perspective review.

### Prerequisites

- Scenarios 01–02 passed — project exists
- Eve agents synced and chat routing active

### Steps

#### 1. Create a Chat Thread

```bash
THREAD=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/chat/threads" \
  -d '{"title": "Expert panel review of Eden PRD"}')
THREAD_ID=$(echo "$THREAD" | jq -r '.id')
echo "Thread: $THREAD_ID"
```

**Expected:** Thread created, ready for messages.

#### 2. Send Message with Document Reference

```bash
# Read the PRD content
PRD_EXCERPT=$(cat docs/prd/high-level-summary.md | head -200)
MSG_PAYLOAD=$(jq -n --arg excerpt "$PRD_EXCERPT" '{content: ("Please review this requirements summary and give me a full expert panel assessment. What are we missing? What are the risks? Are we ready to build?\\n\\n---\\n\\n" + $excerpt)}')
MSG=$(api -X POST "$EDEN_URL/api/chat/threads/$THREAD_ID/messages" -d "$MSG_PAYLOAD")
MSG_ID=$(echo "$MSG" | jq -r '.id')
echo "Message sent: $MSG_ID"
```

**Expected:** Message accepted. Eve chat routing activates `team:expert-panel`.

#### 3. Monitor Coordinator Phase 1 (Triage)

```bash
# Watch for jobs
for i in $(seq 1 12); do
  JOBS=$(eve job list --project eden --status active --json 2>/dev/null)
  JOB_COUNT=$(echo "$JOBS" | jq 'length')
  echo "Active jobs: $JOB_COUNT ($i)"
  [ "$JOB_COUNT" -gt 0 ] && break
  sleep 5
done

# Identify coordinator job
COORD_JOB=$(echo "$JOBS" | jq -r '.[] | select(.description | test("pm|coordinator"; "i")) | .id')
echo "Coordinator job: $COORD_JOB"
```

**Expected:** Coordinator job starts. It reads the message, detects substantial document + analysis intent.

#### 4. Watch Expert Fan-Out (Phase 2)

```bash
# After coordinator returns "prepared", 7 expert jobs should start
for i in $(seq 1 24); do
  ALL_JOBS=$(eve job list --project eden --json 2>/dev/null)
  JOB_COUNT=$(echo "$ALL_JOBS" | jq 'length')
  echo "Total jobs: $JOB_COUNT ($i)"
  [ "$JOB_COUNT" -ge 8 ] && break  # 1 coordinator + 7 experts
  sleep 5
done

echo "$ALL_JOBS" | jq '.[] | {id, description, phase}'
```

**Expected:**
- 8 jobs total: 1 coordinator + 7 experts
- Experts run in parallel (all active simultaneously)
- Expert slugs: tech-lead, ux-advocate, business-analyst, gtm-advocate, risk-assessor, qa-strategist, devil-s-advocate

#### 5. Wait for Synthesis (Phase 3)

```bash
# Wait for all jobs to complete
for i in $(seq 1 36); do
  DONE=$(eve job list --project eden --json 2>/dev/null | jq '[.[] | select(.phase == "done")] | length')
  echo "Completed jobs: $DONE ($i)"
  [ "$DONE" -ge 8 ] && break
  sleep 10
done
```

**Expected:** All 8 jobs complete within ~6 minutes (coordinator triage + 7 parallel experts + coordinator synthesis).

#### 6. Verify Review Created

```bash
REVIEWS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/reviews")
REVIEW=$(echo "$REVIEWS" | jq '.[0]')
echo "$REVIEW" | jq '{id, status, expert_count: (.expert_opinions | length)}'
```

**Expected:**
- Review record created with synthesis
- 7 expert opinions attached

#### 7. Read Expert Opinions

```bash
REVIEW_ID=$(echo "$REVIEW" | jq -r '.id')
api "$EDEN_URL/api/projects/$PROJECT_ID/reviews/$REVIEW_ID" | jq '.expert_opinions[] | {slug, summary: .summary[0:100]}'
```

**Expected:** 7 distinct expert opinions, each from a different perspective:
- Tech Lead: architecture, feasibility
- UX Advocate: accessibility, user journeys
- Business Analyst: process flows, success criteria
- GTM Advocate: market positioning
- Risk Assessor: timeline, dependency risks
- QA Strategist: testing gaps, edge cases
- Devil's Advocate: challenged assumptions

#### 8. Read Synthesis

```bash
api "$EDEN_URL/api/projects/$PROJECT_ID/reviews/$REVIEW_ID" | jq '.synthesis'
```

**Expected:** Executive summary covering:
- Consensus across experts
- Points of dissent
- Critical risks
- Key open questions
- Recommended actions

#### 9. Poll Chat Thread for Response

```bash
MESSAGES=$(api "$EDEN_URL/api/chat/threads/$THREAD_ID/messages")
echo "$MESSAGES" | jq '.[-1].content[0:500]'
```

**Expected:** Final message in thread contains the synthesized expert review.

### Debugging

```bash
# Check chat route resolution
eve job list --project eden --json | jq '.[] | {id, description, phase, close_reason}'

# Inspect coordinator decision
eve job logs $COORD_JOB 2>&1 | grep -i "prepared\|success"

# Check expert jobs
eve job list --project eden --json | jq '.[] | select(.phase != "done") | {id, description, phase}'
```

### Success Criteria

- [ ] Chat thread created via API
- [ ] Message routed to expert-panel team
- [ ] Coordinator triages and returns `prepared`
- [ ] 7 expert jobs fan out in parallel
- [ ] All expert jobs complete within timeout
- [ ] Review record created with 7 opinions
- [ ] Each opinion covers its domain-specific perspective
- [ ] Synthesis combines all perspectives coherently
- [ ] Chat thread receives synthesized response
- [ ] No secrets (API keys, tokens) appear in job logs

---

## Scenario 10: Chat-Driven Map Editing

**Time:** ~5 minutes
**Parallel Safe:** No (depends on Scenarios 01–02)
**LLM Required:** Yes (map-chat agent)
**Type:** API (curl) + Eve CLI

Tests the conversational map editing flow: user describes a change in natural language via chat, the map-chat agent translates it to a changeset.

### Prerequisites

- Scenarios 01–02 passed — project has baseline map
- Eve agents synced

### Steps

#### 1. Send an Edit Request via Chat

```bash
THREAD=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/chat/threads" \
  -d '{"title": "Map edit request"}')
THREAD_ID=$(echo "$THREAD" | jq -r '.id')

api -X POST "$EDEN_URL/api/chat/threads/$THREAD_ID/messages" \
  -d '{"content": "Add a new persona called \"DevOps Engineer\" with code DOE and color #FF6B6B. Then add a task under Document Ingestion > Upload Document for this persona: \"Configure CI/CD pipeline for document processing\" with acceptance criteria about automated deployments and monitoring."}'
```

**Expected:** Message sent. Coordinator routes to map-chat agent (solo path).

#### 2. Wait for Changeset

```bash
for i in $(seq 1 24); do
  CS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/changesets?source=map-chat" | jq '.[0]')
  [ "$CS" != "null" ] && break
  sleep 5
done
echo "$CS" | jq '{title, item_count: (.items | length), items: [.items[] | {entity_type, operation}]}'
```

**Expected:** Changeset with items including:
- `persona` / `create` (DevOps Engineer)
- `task` / `create` (CI/CD pipeline task)
- Possibly `step_task` / `create` (placement)

#### 3. Accept and Verify

```bash
CS_ID=$(echo "$CS" | jq -r '.id')
api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/changesets/$CS_ID/accept"

# Verify persona exists
api "$EDEN_URL/api/projects/$PROJECT_ID/personas" | jq '.[] | select(.code=="DOE")'

# Verify task exists
api "$EDEN_URL/api/projects/$PROJECT_ID/map" | jq '
  [.activities[].steps[].tasks[] | select(.title | test("CI/CD"; "i"))] | .[0].title
'
```

**Expected:** New persona and task appear on the map after acceptance.

### Success Criteria

- [ ] Natural language edit request routed correctly
- [ ] Map-chat agent creates changeset (not direct mutation)
- [ ] Changeset contains correct entity types and operations
- [ ] Acceptance applies changes to the map
- [ ] New persona appears in persona list
- [ ] New task placed correctly on the map

---

## Scenario 11: Question Evolution Workflow

**Time:** ~5 minutes
**Parallel Safe:** No (depends on Scenario 03 for questions)
**LLM Required:** Yes (question-agent)
**Type:** API (curl) + Eve CLI

Tests the question evolution flow: answering an open question triggers the question-agent, which may create a changeset if the answer implies map changes.

### Prerequisites

- Scenario 03 passed — questions exist, Q2 is cross-cutting and still open

### Steps

#### 1. Answer the Cross-Cutting Question

```bash
# Q2: "Should the expert panel run for every document or only on explicit request?"
api -X PATCH "$EDEN_URL/api/projects/$PROJECT_ID/questions/$Q2_ID" \
  -d '{"answer": "The expert panel should run automatically for any document over 5 pages. For shorter documents, the coordinator should handle it solo. Users can always explicitly request a full panel review regardless of document length.", "status": "answered"}'
```

**Expected:** Question updated to `answered`.

#### 2. Trigger Evolution

```bash
EVOLVE=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/questions/$Q2_ID/evolve")
echo "$EVOLVE" | jq '{status}'
```

**Expected:** Evolution triggered. Eve `question.answered` event fires. Question-agent job starts.

#### 3. Wait for Agent Response

```bash
for i in $(seq 1 24); do
  Q_JOBS=$(eve job list --project eden --json 2>/dev/null | jq '[.[] | select(.description | test("question"; "i"))]')
  [ "$(echo "$Q_JOBS" | jq 'length')" -gt 0 ] && break
  sleep 5
done

JOB_ID=$(echo "$Q_JOBS" | jq -r '.[0].id')
eve job follow $JOB_ID
```

**Expected:** Question-agent evaluates the answer and decides whether to create a changeset.

#### 4. Check for Resulting Changeset

```bash
CS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/changesets?source=question-evolution" | jq '.[0]')
if [ "$CS" != "null" ]; then
  echo "Changeset created:"
  echo "$CS" | jq '{title, reasoning, item_count: (.items | length)}'
else
  echo "No changeset — answer was informational only (also valid)"
fi
```

**Expected:** Either:
- **Changeset created** — answer implies new requirements (e.g., "add page count threshold logic")
- **No changeset** — answer is informational, no map changes needed (both outcomes are valid)

### Success Criteria

- [ ] Question evolution triggers question-agent workflow
- [ ] Agent evaluates the answer in context of the map
- [ ] If answer implies changes: changeset created with source `question-evolution`
- [ ] If answer is informational: no changeset, no error
- [ ] Question status updated

---

## Scenario 12: Alignment Check After Changeset

**Time:** ~5 minutes
**Parallel Safe:** No (depends on accepted changeset from Scenario 10)
**LLM Required:** Yes (alignment agent)
**Type:** API (curl) + Eve CLI

Verifies that the alignment agent runs automatically after a changeset is accepted, scanning for conflicts, gaps, and duplicates.

### Prerequisites

- Scenario 10 passed — changeset accepted, map modified
- Eve `changeset.accepted` workflow trigger is active

### Steps

#### 1. Verify Alignment Job Triggered

```bash
# The alignment agent should have been triggered by the changeset.accepted event in Scenario 10
for i in $(seq 1 12); do
  ALIGN_JOBS=$(eve job list --project eden --json 2>/dev/null | jq '[.[] | select(.description | test("alignment"; "i"))]')
  [ "$(echo "$ALIGN_JOBS" | jq 'length')" -gt 0 ] && break
  sleep 5
done

ALIGN_JOB=$(echo "$ALIGN_JOBS" | jq -r '.[-1].id')
echo "Alignment job: $ALIGN_JOB"
eve job follow $ALIGN_JOB
```

**Expected:** Alignment job ran (triggered by `changeset.accepted` event).

#### 2. Check for Generated Questions

```bash
# Alignment agent creates questions for gaps, conflicts, duplicates
QUESTIONS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/questions?category=alignment")
echo "$QUESTIONS" | jq '.[] | {question: .question[0:100], category, priority}'
```

**Expected:** One or more questions created about:
- Gaps (persona without task coverage, single-step activities)
- Potential duplicates (semantic similarity between tasks)
- Assumptions needing validation

#### 3. Verify Storm Prevention

```bash
# Accept another changeset to trigger alignment again
STORM_CS=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/changesets" \
  -d '{
    "title": "Minor update for storm test",
    "reasoning": "Testing alignment storm prevention",
    "source": "manual-test",
    "items": [{"entity_type": "task", "operation": "update", "before_state": {"title": "Upload requirements document"}, "after_state": {"title": "Upload requirements document (v2)"}, "description": "Minor title update"}]
  }')
STORM_ID=$(echo "$STORM_CS" | jq -r '.id')
api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/changesets/$STORM_ID/accept"

sleep 30

# Check that alignment doesn't create duplicate questions
NEW_Q_COUNT=$(api "$EDEN_URL/api/projects/$PROJECT_ID/questions?category=alignment" | jq 'length')
echo "Alignment questions after storm test: $NEW_Q_COUNT"
```

**Expected:** Alignment agent skips questions already raised in last 24h (storm prevention).

### Success Criteria

- [ ] Alignment job triggered automatically after changeset acceptance
- [ ] Agent identifies at least one gap, conflict, or assumption
- [ ] Questions created with category `alignment`
- [ ] Storm prevention: duplicate questions not re-created

---

## Scenario 13: Full Project Lifecycle — PRD to Populated Map

**Time:** ~15 minutes
**Parallel Safe:** Yes (uses separate project)
**LLM Required:** Yes (full agent suite)
**Type:** API + Playwright (end-to-end)

**The ultimate integration test.** Creates a fresh project, uploads Eden's full EdenPRD.md, lets the AI populate the map, reviews changes, and verifies the result in the UI. This dogfoods the entire Eden workflow.

### Prerequisites

- All agents synced
- Eve ingestion pipeline operational

### Steps

#### 1. Create Fresh Project

```bash
LIFECYCLE_PROJECT=$(api -X POST "$EDEN_URL/api/projects" \
  -d '{"name": "Lifecycle Test — Eden PRD", "slug": "lifecycle-test"}')
export LC_PROJECT_ID=$(echo "$LIFECYCLE_PROJECT" | jq -r '.id')
```

#### 2. Upload EdenPRD.md as Source

```bash
SOURCE=$(api -X POST "$EDEN_URL/api/projects/$LC_PROJECT_ID/sources" \
  -d '{"filename": "EdenPRD.md", "content_type": "text/markdown", "file_size": 50000}')
LC_SOURCE_ID=$(echo "$SOURCE" | jq -r '.id')

# Upload content (adapt to upload mechanism)
# ... upload docs/prd/EdenPRD.md ...

# Confirm to trigger pipeline
api -X POST "$EDEN_URL/api/projects/$LC_PROJECT_ID/sources/$LC_SOURCE_ID/confirm"
```

#### 3. Wait for Ingestion Pipeline to Complete

```bash
for i in $(seq 1 60); do
  STATUS=$(api "$EDEN_URL/api/projects/$LC_PROJECT_ID/sources/$LC_SOURCE_ID" | jq -r '.status')
  echo "Source status: $STATUS ($i)"
  [ "$STATUS" = "synthesized" ] && break
  sleep 10
done
```

**Expected:** Pipeline completes: uploaded → processing → extracted → synthesized

#### 4. Review Generated Changeset

```bash
CS_LIST=$(api "$EDEN_URL/api/projects/$LC_PROJECT_ID/changesets")
echo "Changesets: $(echo "$CS_LIST" | jq 'length')"
echo "$CS_LIST" | jq '.[0] | {title, item_count: (.items | length), items: [.items[] | {entity_type, operation}] | group_by(.entity_type) | map({type: .[0].entity_type, count: length})}'
```

**Expected:** Changeset with extracted entities:
- Personas (PM, BA, Engineering Lead, Stakeholder)
- Activities (major feature areas from PRD)
- Steps (sub-processes)
- Tasks (user stories with acceptance criteria)

#### 5. Accept Changeset

```bash
CS_ID=$(echo "$CS_LIST" | jq -r '.[0].id')
api -X POST "$EDEN_URL/api/projects/$LC_PROJECT_ID/changesets/$CS_ID/accept"
```

#### 6. Verify Map is Populated

```bash
MAP=$(api "$EDEN_URL/api/projects/$LC_PROJECT_ID/map")
echo "$MAP" | jq '{
  personas: (.personas | length),
  activities: (.activities | length),
  total_steps: [.activities[].steps | length] | add,
  total_tasks: [.activities[].steps[].tasks | length] | add
}'
```

**Expected:**
- Multiple personas extracted from PRD
- Multiple activities representing feature areas
- Tasks with user stories derived from document content
- Non-zero counts across all entity types

#### 7. Request Expert Panel Review of the Generated Map

```bash
THREAD=$(api -X POST "$EDEN_URL/api/projects/$LC_PROJECT_ID/chat/threads" \
  -d '{"title": "Review generated story map"}')
THREAD_ID=$(echo "$THREAD" | jq -r '.id')

api -X POST "$EDEN_URL/api/chat/threads/$THREAD_ID/messages" \
  -d '{"content": "We just ingested our PRD and the AI generated a story map. Please review the current state of the map. Are there gaps? Missing personas? Duplicated requirements? What should we add or change?"}'

# Wait for review completion (up to 8 minutes)
for i in $(seq 1 48); do
  REVIEWS=$(api "$EDEN_URL/api/projects/$LC_PROJECT_ID/reviews")
  [ "$(echo "$REVIEWS" | jq 'length')" -gt 0 ] && break
  sleep 10
done

echo "$REVIEWS" | jq '.[0] | {expert_count: (.expert_opinions | length), synthesis: .synthesis[0:300]}'
```

**Expected:** Full expert panel review of the AI-generated map.

#### 8. Verify in UI (Playwright)

```typescript
// tests/e2e/manual-13-lifecycle.spec.ts
const EDEN_URL = process.env.EDEN_URL || 'https://eden.incept5-eden-sandbox.eh1.incept5.dev';
const LC_PROJECT_SLUG = process.env.LC_PROJECT_SLUG || 'lifecycle-test';

test('lifecycle project has populated map', async ({ page }) => {
  await page.goto(`${EDEN_URL}/projects`);
  await page.click(`text=${LC_PROJECT_SLUG}`);
  await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

  // Verify activities rendered
  const activities = page.locator('[data-testid^="activity-"]');
  const count = await activities.count();
  expect(count).toBeGreaterThan(2);

  // Verify task cards exist
  const cards = page.locator('[data-testid^="task-card-"]');
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThan(5);

  // Verify reviews page has content
  await page.click('text=Reviews');
  await expect(page.locator('text=synthesis').or(page.locator('text=expert'))).toBeVisible();
});
```

### Success Criteria

- [ ] Fresh project created from scratch
- [ ] Document uploaded and pipeline triggered
- [ ] Pipeline completes all 3 stages (ingest → extract → synthesize)
- [ ] Changeset contains realistic entities extracted from PRD
- [ ] Accepted changeset populates the map
- [ ] Map has personas, activities, steps, and tasks
- [ ] Expert panel reviews the generated map
- [ ] Review contains 7 expert opinions + synthesis
- [ ] UI renders the populated map correctly
- [ ] Audit trail records entire lifecycle

---

## Scenario 14: Reviews Integration — Chat to Map

**Time:** ~8 minutes
**Parallel Safe:** No
**LLM Required:** Yes
**Type:** API + Eve CLI

Verifies that expert panel review findings can be acted on — closing the loop from review → changeset → map update.

### Prerequisites

- Scenario 09 passed — expert panel review exists with identified issues

### Steps

#### 1. Read Expert Recommendations

```bash
REVIEW_ID=$(api "$EDEN_URL/api/projects/$PROJECT_ID/reviews" | jq -r '.[0].id')
RECS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/reviews/$REVIEW_ID" | jq '.synthesis')
echo "Recommendations:"
echo "$RECS" | head -50
```

#### 2. Act on a Recommendation via Chat

```bash
THREAD=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/chat/threads" \
  -d '{"title": "Act on review recommendation"}')
THREAD_ID=$(echo "$THREAD" | jq -r '.id')

# Use one of the actual recommendations from the review
api -X POST "$EDEN_URL/api/chat/threads/$THREAD_ID/messages" \
  -d '{"content": "Based on the expert review, the QA strategist identified that we have no explicit testing requirements. Please add a Testing & Validation activity with steps for unit testing, integration testing, and e2e testing, with appropriate tasks for each."}'
```

#### 3. Wait for Changeset

```bash
for i in $(seq 1 24); do
  CS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/changesets" | jq '[.[] | select(.status == "draft" or .status == "pending")] | .[0]')
  [ "$CS" != "null" ] && break
  sleep 5
done
echo "$CS" | jq '{title, item_count: (.items | length)}'
```

#### 4. Review and Accept

```bash
CS_ID=$(echo "$CS" | jq -r '.id')
echo "Changeset items:"
api "$EDEN_URL/api/projects/$PROJECT_ID/changesets/$CS_ID" | jq '.items[] | {entity_type, operation, description}'

api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/changesets/$CS_ID/accept"
```

#### 5. Verify Loop Closed

```bash
# Map should now have the testing activity
api "$EDEN_URL/api/projects/$PROJECT_ID/map" | jq '.activities[] | select(.name | test("[Tt]est")) | {name, step_count: (.steps | length)}'
```

**Expected:** New "Testing & Validation" activity appears with testing-related steps.

### Success Criteria

- [ ] Review recommendations are actionable
- [ ] Chat request based on recommendation creates changeset
- [ ] Changeset contains testing-related entities
- [ ] Acceptance adds testing activity to the map
- [ ] Full loop: review → chat → changeset → map update

---

## Running Order

The scenarios are designed to be run progressively:

```
Phase A: Foundation (API, no LLM)
  01 → 02 → 03 → 04 → 05

Phase B: UI Verification (Playwright, no LLM)
  06 → 07

Phase C: Intelligence (API + Eve agents)
  08 → 09 → 10 → 11 → 12

Phase D: Integration (Full stack)
  13 → 14
```

**Minimum viable run:** Scenarios 01–07 (Foundation + UI, ~25 minutes, no LLM cost)

**Full suite:** Scenarios 01–14 (~60 minutes, requires Eve agents and LLM)

### Quick Reference

| # | Name | Time | Type | LLM |
|---|------|------|------|-----|
| 01 | API Smoke & Project Setup | 2m | curl | No |
| 02 | Story Map CRUD | 5m | curl | No |
| 03 | Releases, Questions & Search | 3m | curl | No |
| 04 | Changesets — Create, Review, Apply | 4m | curl | No |
| 05 | Audit Trail & Export | 2m | curl | No |
| 06 | Story Map UI — Layout & Navigation | 5m | Playwright | No |
| 07 | Q&A, Changes & Sources Pages | 5m | Playwright | No |
| 08 | Document Ingestion Pipeline | 10m | curl + Eve | Yes |
| 09 | Expert Panel Review via Chat | 10m | curl + Eve | Yes |
| 10 | Chat-Driven Map Editing | 5m | curl + Eve | Yes |
| 11 | Question Evolution Workflow | 5m | curl + Eve | Yes |
| 12 | Alignment Check After Changeset | 5m | curl + Eve | Yes |
| 13 | Full Project Lifecycle — PRD to Map | 15m | All | Yes |
| 14 | Reviews Integration — Chat to Map | 8m | curl + Eve | Yes |

---

## Environment Variables Summary

```bash
# Required for all scenarios
export EVE_API_URL=https://api.eh1.incept5.dev
export ORG_SLUG=incept5
export EDEN_URL=https://eden.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev
export EVE_CLI_PROJECT=eden
export EVE_CLI_ENV=sandbox
export PROJECT_SLUG=manual-test
export LC_PROJECT_SLUG=lifecycle-test

# Set by Scenario 01 (used by all subsequent)
export PROJECT_ID=<from scenario 01>

# Set by individual scenarios (used within)
export LC_PROJECT_ID=<from scenario 13>
```

## Debugging

### Tier 1: User CLI (Always Try First)

```bash
eve job list --project eden --json | jq '.[] | {id, description, phase}'
eve job follow $JOB_ID
eve job diagnose $JOB_ID
eve system status
```

### Tier 2: Eve Logs

```bash
eve system logs api --tail 50
eve system logs worker --tail 50
eve job logs $JOB_ID
```

### Tier 3: Direct API

```bash
# Check chat routing
api "$EDEN_URL/api/projects/$PROJECT_ID/chat/threads" | jq '.[].title'

# Check all changesets
api "$EDEN_URL/api/projects/$PROJECT_ID/changesets" | jq '.[] | {title, status, source}'

# Check map state
api "$EDEN_URL/api/projects/$PROJECT_ID/map" | jq '{
  personas: [.personas[].code],
  activities: [.activities[].name],
  task_count: [.activities[].steps[].tasks | length] | add
}'
```
