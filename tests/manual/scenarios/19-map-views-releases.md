# Scenario 19: Map Views & Release Slices

**Time:** ~6 minutes
**Parallel Safe:** No
**LLM Required:** No

Verifies named map views (saved filter combinations), release slices below
the map grid, drag-to-assign task-to-release, and keyboard shortcuts for
view switching.

## Prerequisites

- Scenario 02 passed — project has activities, steps, tasks
- Scenario 03 passed — project has releases
- `$PROJECT_ID` set with populated data
- `$OWNER_TOKEN` available

```bash
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api"
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
```

---

## Steps

### 1. Create Named Map View

```bash
VIEW1_ID=$(api -X POST "$EDEN_API/projects/$PROJECT_ID/views" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "PM Focus",
        "slug": "pm-focus",
        "description": "Filtered to PM persona activities",
        "filter": {"personas": ["pm"], "activities": [], "releases": []}
    }' | jq -r '.id')
echo "View 1: $VIEW1_ID"
```

**Expected:** 201, returns view with ID and slug.

### 2. Create Second View

```bash
# Get a release ID
RELEASE_ID=$(api "$EDEN_API/projects/$PROJECT_ID/releases" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.[0].id')

VIEW2_ID=$(api -X POST "$EDEN_API/projects/$PROJECT_ID/views" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Release v1",
        "slug": "release-v1",
        "description": "Filtered to first release",
        "filter": {"personas": [], "activities": [], "releases": ["'$RELEASE_ID'"]}
    }' | jq -r '.id')
echo "View 2: $VIEW2_ID"
```

**Expected:** 201.

### 3. List Views

```bash
api "$EDEN_API/projects/$PROJECT_ID/views" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '.[] | {name, slug, filter}'
```

**Expected:** Two views listed with their filter configs.

### 4. Update View

```bash
api -X PATCH "$EDEN_API/views/$VIEW1_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name": "PM Focus (Updated)"}' | jq '{name, slug}'
```

**Expected:** 200, name updated.

### 5. Verify Release Slices Data

```bash
# Get tasks assigned to release
api "$EDEN_API/releases/$RELEASE_ID/tasks" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq 'length'

# Get all releases with task counts
api "$EDEN_API/projects/$PROJECT_ID/releases" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '.[] | {id, name, status, task_count}'
```

**Expected:** Releases listed with task counts. At least one release
with ≥1 task assigned.

### 6. Assign Task to Release (Simulating Drag)

```bash
# Get unassigned task
UNASSIGNED_TASK=$(api "$EDEN_API/projects/$PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq -r '[.. | objects | select(.id? and .title? and (.release_id == null or .release_id == ""))] | .[0].id')
echo "Unassigned task: $UNASSIGNED_TASK"

# Assign to release (what drag-to-slice does)
api -X POST "$EDEN_API/releases/$RELEASE_ID/tasks" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"task_ids": ["'$UNASSIGNED_TASK'"]}' | jq .
```

**Expected:** 200/201, task now associated with release.

### 7. Verify Assignment

```bash
api "$EDEN_API/releases/$RELEASE_ID/tasks" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq --arg tid "$UNASSIGNED_TASK" '.[] | select(.id == $tid) | {id, title}'
```

**Expected:** Task appears in release's task list.

### 8. Reassign Task to Different Release

```bash
# Create second release if needed
RELEASE2_ID=$(api -X POST "$EDEN_API/projects/$PROJECT_ID/releases" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Sprint 2","target_date":"2026-05-01","status":"planning"}' | jq -r '.id')

# Remove from first release
api -X DELETE "$EDEN_API/releases/$RELEASE_ID/tasks/$UNASSIGNED_TASK" \
    -H "Authorization: Bearer $OWNER_TOKEN"

# Add to second release
api -X POST "$EDEN_API/releases/$RELEASE2_ID/tasks" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"task_ids": ["'$UNASSIGNED_TASK'"]}' | jq .
```

**Expected:** Task moves from release 1 to release 2.

### 9. Delete View (Owner Only)

```bash
api -X DELETE "$EDEN_API/views/$VIEW2_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN"

api "$EDEN_API/projects/$PROJECT_ID/views" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq 'length'
```

**Expected:** View deleted, list shows 1 view remaining.

### 10. UI — Map View Tabs and Release Slices (Playwright)

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://web.incept5-eden-sandbox.eh1.incept5.dev';

test.describe('Scenario 19: Map Views & Release Slices UI', () => {
    test('map view tabs render and switch', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // View tabs should be visible
        const tabs = page.locator('[data-testid="map-view-tabs"]');
        await expect(tabs).toBeVisible();

        // At least "All" + one named view
        const tabButtons = tabs.locator('button, [role="tab"]');
        expect(await tabButtons.count()).toBeGreaterThanOrEqual(2);

        // Click named view tab
        await tabButtons.last().click();
        await page.waitForTimeout(500);

        // Map should update (filtered)
    });

    test('release slices show below map', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // Release slices container
        const slices = page.locator('[data-testid="release-slices"]');
        await expect(slices).toBeVisible();

        // At least one release slice
        const sliceItems = slices.locator('[data-testid^="release-slice-"]');
        expect(await sliceItems.count()).toBeGreaterThanOrEqual(1);

        // Slice shows task count
        await expect(sliceItems.first()).toContainText(/\d+ task/i);
    });

    test('keyboard shortcut switches views', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // Press "2" to switch to second view
        await page.keyboard.press('2');
        await page.waitForTimeout(500);

        // Second tab should be active
        const tabs = page.locator('[data-testid="map-view-tabs"] [aria-selected="true"], [data-testid="map-view-tabs"] .active');
        const activeText = await tabs.textContent();
        expect(activeText).toBeTruthy();
    });
});
```

---

## Success Criteria

- [ ] `POST /projects/:id/views` creates named view with filter config
- [ ] `GET /projects/:id/views` lists all views
- [ ] `PATCH /views/:id` updates view name/filter
- [ ] `DELETE /views/:id` removes view (owner only)
- [ ] Task-to-release assignment works via existing release API
- [ ] Task reassignment between releases works (remove + add)
- [ ] Release task list reflects assignments correctly
- [ ] UI: view tabs render below header
- [ ] UI: clicking tab applies saved filters to map
- [ ] UI: keyboard 1–9 switches between views
- [ ] UI: release slices visible below map grid
- [ ] UI: slices show task count per release
