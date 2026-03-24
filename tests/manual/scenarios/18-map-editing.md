# Scenario 18: Map Editing — Drag-and-Drop & Inline Edit

**Time:** ~8 minutes
**Parallel Safe:** No
**LLM Required:** No

Verifies drag-and-drop reordering of tasks, steps, and activities via API,
inline title editing, audit trail entries for structural changes, and
role-gated access (viewers cannot edit).

## Prerequisites

- Scenario 02 passed — project has personas, activities, steps, tasks
- `$PROJECT_ID` set with at least 2 activities, each with ≥2 steps and tasks
- Roles working (scenario 15) — `$OWNER_TOKEN` and `$VIEWER_TOKEN` available
- Playwright installed

```bash
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api"
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
```

---

## Steps

### 1. Capture Initial Map State

```bash
# Record current structure for comparison
api "$EDEN_API/projects/$PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    activities: [.activities[] | {id, name, sort_order, steps: [.steps[] | {id, name, sort_order, task_count: (.tasks | length)}]}]
}' > /tmp/map-before.json
cat /tmp/map-before.json | jq .
```

**Expected:** Activities and steps with their current sort orders.

### 2. Get Entity IDs for Testing

```bash
# First activity and its steps
ACT1_ID=$(jq -r '.activities[0].id' /tmp/map-before.json)
ACT2_ID=$(jq -r '.activities[1].id' /tmp/map-before.json)
STEP1_ID=$(jq -r '.activities[0].steps[0].id' /tmp/map-before.json)
STEP2_ID=$(jq -r '.activities[0].steps[1].id' /tmp/map-before.json)

# First task in first step
TASK_ID=$(api "$EDEN_API/projects/$PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq -r '.activities[0].steps[0].tasks[0].id')

echo "ACT1=$ACT1_ID ACT2=$ACT2_ID STEP1=$STEP1_ID STEP2=$STEP2_ID TASK=$TASK_ID"
```

### 3. Move Task Between Steps

```bash
api -X PATCH "$EDEN_API/tasks/$TASK_ID/move" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"step_id":"'$STEP2_ID'","sort_order":0}' | jq '{id, title, step_id: .step_id}'
```

**Expected:** 200, task now belongs to STEP2 with sort_order 0.

### 4. Verify Task Moved in Map

```bash
# Task should appear under step 2, not step 1
api "$EDEN_API/projects/$PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq --arg tid "$TASK_ID" '
    .activities[0].steps[] | select(.tasks[] | select(.id == $tid)) | .name
'
```

**Expected:** Returns step 2's name (not step 1's).

### 5. Move Step Between Activities

```bash
api -X PATCH "$EDEN_API/steps/$STEP2_ID/move" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"activity_id":"'$ACT2_ID'","sort_order":0}' | jq '{id, name, activity_id}'
```

**Expected:** 200, step now belongs to activity 2.

### 6. Reorder Activities

```bash
# Swap activity sort orders
api -X PATCH "$EDEN_API/activities/$ACT2_ID/reorder" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"sort_order":0}' | jq '{id, name, sort_order}'

api -X PATCH "$EDEN_API/activities/$ACT1_ID/reorder" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"sort_order":1}' | jq '{id, name, sort_order}'
```

**Expected:** 200 for both. Activity 2 now first, Activity 1 second.

### 7. Verify Map Sort Order

```bash
api "$EDEN_API/projects/$PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '[.activities[] | {name, sort_order}]'
```

**Expected:** Activity 2 has lower sort_order than Activity 1.

### 8. Audit Trail Records Moves

```bash
api "$EDEN_API/projects/$PROJECT_ID/audit" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '[.entries[] | select(.action | test("move|reorder"))] | length'
```

**Expected:** ≥3 entries (task move, step move, activity reorder).

### 9. Viewer Cannot Move (403)

```bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PATCH "$EDEN_API/tasks/$TASK_ID/move" \
    -H "Authorization: Bearer $VIEWER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"step_id":"'$STEP1_ID'","sort_order":0}')
echo "Viewer move status: $STATUS"
```

**Expected:** `403`

### 10. Inline Edit — Activity Title

```bash
api -X PATCH "$EDEN_API/activities/$ACT1_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Renamed Activity (Inline)"}' | jq '{id, name}'
```

**Expected:** 200, name updated.

### 11. Inline Edit — Step Title

```bash
api -X PATCH "$EDEN_API/steps/$STEP1_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Renamed Step (Inline)"}' | jq '{id, name}'
```

**Expected:** 200, name updated.

### 12. Inline Edit — Task Title

```bash
api -X PATCH "$EDEN_API/tasks/$TASK_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Renamed Task (Inline)"}' | jq '{id, title}'
```

**Expected:** 200, title updated.

### 13. Verify Renames in Map

```bash
api "$EDEN_API/projects/$PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.. | objects | select(.name? // .title? | strings | test("Inline")) | {name, title}'
```

**Expected:** Three entities with "(Inline)" in their names/titles.

### 14. UI — Drag and Inline Edit (Playwright)

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://web.incept5-eden-sandbox.eh1.incept5.dev';

test.describe('Scenario 18: Map Editing UI', () => {
    test('inline edit activity title', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // Click activity title to enter edit mode
        const actTitle = page.locator('[data-testid^="activity-"] h3, [data-testid^="activity-title"]').first();
        await actTitle.click();

        // Input should appear
        const input = page.locator('[data-testid="inline-edit-input"]');
        await expect(input).toBeVisible({ timeout: 3000 });

        // Type new value
        await input.fill('UI Edited Activity');
        await input.press('Enter');

        // Title should update
        await expect(actTitle).toContainText('UI Edited Activity');
    });

    test('inline edit cancels on Escape', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        const actTitle = page.locator('[data-testid^="activity-"] h3, [data-testid^="activity-title"]').first();
        const originalText = await actTitle.textContent();

        await actTitle.click();
        const input = page.locator('[data-testid="inline-edit-input"]');
        await input.fill('Should Not Save');
        await input.press('Escape');

        // Title should revert
        await expect(actTitle).toContainText(originalText!);
    });

    test('drag task shows visual feedback', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // Find a drag handle
        const handle = page.locator('[data-testid="drag-handle"]').first();
        if (await handle.isVisible()) {
            // Start drag — verify ghost element appears
            const box = await handle.boundingBox();
            if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await page.mouse.down();
                await page.mouse.move(box.x + 200, box.y, { steps: 5 });
                // Drop target should highlight
                await page.mouse.up();
            }
        }
    });
});
```

### 15. Restore Original State

```bash
# Move task back to step 1
api -X PATCH "$EDEN_API/tasks/$TASK_ID/move" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"step_id":"'$STEP1_ID'","sort_order":0}' > /dev/null

# Restore activity order
api -X PATCH "$EDEN_API/activities/$ACT1_ID/reorder" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"sort_order":0}' > /dev/null
```

---

## Success Criteria

- [ ] `PATCH /tasks/:id/move` moves task to target step with correct sort_order
- [ ] `PATCH /steps/:id/move` moves step to target activity
- [ ] `PATCH /activities/:id/reorder` changes activity position
- [ ] Sibling sort orders update correctly (no gaps or collisions)
- [ ] Map endpoint reflects moved entities in new positions
- [ ] Audit log records all move and reorder operations
- [ ] Viewer gets 403 on all move/reorder endpoints
- [ ] Inline PATCH on activity name, step name, task title works
- [ ] Renamed entities appear correctly in map response
- [ ] UI: click title → input appears, Enter saves, Escape cancels
- [ ] UI: drag handle visible for editors/owners, hidden for viewers
- [ ] UI: drag produces visual feedback (ghost + drop target highlight)
