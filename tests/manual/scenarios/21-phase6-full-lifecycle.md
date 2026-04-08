# Scenario 21: Phase 6 Full Lifecycle

**Time:** ~15 minutes
**Parallel Safe:** Yes (uses its own project)
**LLM Required:** Yes

End-to-end integration test for all Phase 6 workstreams. Creates a project
via wizard, invites a member, tests the two-stage approval flow, verifies
drag-and-drop editing, named views, release slices, notifications, and
the onboarding walkthrough.

This is the **final gate** before Phase 6 is marked complete.

## Prerequisites

- All prior scenarios (15–20) passed individually
- Eve agents synced: `eve agents sync --local --allow-dirty`
- Two user tokens: `$OWNER_TOKEN` (org admin) and `$EDITOR_TOKEN` (org member)
- Playwright installed

```bash
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api"
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
export P6_PROJECT_SLUG=phase6-lifecycle
```

---

## Steps

### Phase A: Project Creation via Wizard

#### 1. Create Project

```bash
P6_PROJECT_ID=$(api -X POST "$EDEN_API/projects" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Phase 6 Lifecycle Test","slug":"'$P6_PROJECT_SLUG'"}' | jq -r '.id')
echo "Project: $P6_PROJECT_ID"
```

#### 2. Generate Initial Map via Wizard

```bash
GENERATE_RESPONSE=$(api -X POST "$EDEN_API/projects/$P6_PROJECT_ID/generate-map" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "description": "Internal knowledge base and documentation platform for engineering teams",
        "audience": "Software engineers, tech leads, and new hires onboarding",
        "capabilities": "Create and edit docs, search knowledge base, tag and categorize, track doc freshness, suggest improvements",
        "constraints": "Must support markdown, integrate with GitHub, SSO required"
    }')
echo "$GENERATE_RESPONSE" | jq .
JOB_ID=$(echo "$GENERATE_RESPONSE" | jq -r '.job_id')
echo "Job: $JOB_ID"
```

#### 3. Poll for Completion

```bash
for i in $(seq 1 36); do
    RESULT=$(api "$EDEN_API/projects/$P6_PROJECT_ID/generate-map/status?job_id=$JOB_ID" \
        -H "Authorization: Bearer $OWNER_TOKEN")
    STATUS=$(echo "$RESULT" | jq -r '.status')
    echo "Attempt $i: $STATUS"
    [ "$STATUS" = "complete" ] && break
    [ "$STATUS" = "failed" ] && { echo "FAILED: $(echo $RESULT | jq .)"; exit 1; }
    sleep 5
done

P6_CS_ID=$(echo "$RESULT" | jq -r '.changeset_id')
echo "Changeset: $P6_CS_ID"
```

#### 4. Inspect Wizard Logs and Auto-Accept Result

```bash
WIZARD_LOG="/tmp/eden-s21-${JOB_ID}.log"
eve job logs "$JOB_ID" 2>&1 | tee "$WIZARD_LOG"
HELP_CALLS=$(rg -c 'eden --help' "$WIZARD_LOG" || true)
CREATE_CALLS=$(rg -c 'eden changeset create' "$WIZARD_LOG" || true)
echo "help_calls=$HELP_CALLS create_calls=$CREATE_CALLS"
echo "Potential log problems (should print nothing):"
rg -n -i 'invalid_changeset|violates not-null|internal server error|requires approval|POST .*/changesets -> (400|500)' "$WIZARD_LOG" || true

api "$EDEN_API/changesets/$P6_CS_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{status, source, accepted_items: [.items[] | select(.status=="accepted")] | length}'
```

**Expected:** Wizard logs show `help_calls=0`, `create_calls>=1`, no `invalid_changeset`, approval prompts, or server-side failures. The generated changeset is already `accepted` via wizard auto-accept.

#### 5. Verify Populated Map

```bash
MAP=$(api "$EDEN_API/projects/$P6_PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN")
echo "$MAP" | jq '{
    personas: (.personas | length),
    activities: (.activities | length),
    total_steps: [.activities[].steps | length] | add,
    total_tasks: [.activities[].steps[].tasks | length] | add
}'
```

**Expected:** ≥3 personas, ≥3 activities, ≥6 steps, ≥10 tasks.

```bash
# Capture IDs for later steps
P6_ACT_ID=$(echo "$MAP" | jq -r '.activities[0].id')
P6_STEP1_ID=$(echo "$MAP" | jq -r '.activities[0].steps[0].id')
P6_STEP1_DISPLAY_ID=$(echo "$MAP" | jq -r '.activities[0].steps[0].display_id')
P6_STEP2_ID=$(echo "$MAP" | jq -r '.activities[0].steps[1].id // empty')
P6_TASK_ID=$(echo "$MAP" | jq -r '.activities[0].steps[0].tasks[0].id')
echo "ACT=$P6_ACT_ID STEP1=$P6_STEP1_ID STEP1_REF=$P6_STEP1_DISPLAY_ID STEP2=$P6_STEP2_ID TASK=$P6_TASK_ID"
```

---

### Phase B: Member Invitation & Role Setup

#### 6. Invite Editor

```bash
EDITOR_USER_ID=$(curl -sf "$EVE_API_URL/auth/me" \
    -H "Authorization: Bearer $EDITOR_TOKEN" | jq -r '.user_id // .id')

api -X POST "$EDEN_API/projects/$P6_PROJECT_ID/members" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"user_id":"'$EDITOR_USER_ID'","role":"editor"}' | jq .
```

**Expected:** 201, member added as editor.

#### 7. Verify Editor Role

```bash
api "$EDEN_API/projects/$P6_PROJECT_ID/my-role" \
    -H "Authorization: Bearer $EDITOR_TOKEN" | jq .
```

**Expected:** `{ "role": "editor" }`

---

### Phase C: Two-Stage Approval Flow

#### 8. Create Changeset (Simulating AI Chat Output)

```bash
P6_CS2_PAYLOAD=$(jq -n --arg step_ref "$P6_STEP1_DISPLAY_ID" '{
    title: "Add search improvements",
    source: "map-chat",
    items: [
        {
            entity_type: "task",
            operation: "create",
            after_state: {
                title: "Full-text search indexing",
                step_ref: $step_ref,
                user_story: "As an engineer, I want instant search results"
            },
            description: "Add FTS task"
        },
        {
            entity_type: "task",
            operation: "create",
            after_state: {
                title: "Search result ranking",
                step_ref: $step_ref,
                user_story: "As a user, I want relevant results first"
            },
            description: "Add ranking task"
        }
    ]
}')

P6_CS2=$(api -X POST "$EDEN_API/projects/$P6_PROJECT_ID/changesets" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$P6_CS2_PAYLOAD")
echo "$P6_CS2" | jq '{id, status, warnings}'
P6_CS2_ID=$(echo "$P6_CS2" | jq -r '.id')
echo "Changeset: $P6_CS2_ID"

api "$EDEN_API/changesets/$P6_CS2_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '[.items[] | select(.entity_type=="task") | .after_state | {
        title,
        step_ref: (.step_ref // .step_display_id),
        device,
        status,
        lifecycle
    }]'
```

**Expected:** Draft changeset created successfully. Task items retain `step_ref` and normalized `device` / `status` / `lifecycle`, and create `warnings` are surfaced if defaults were applied.

#### 9. Editor Accepts Changeset

```bash
ITEMS=$(api "$EDEN_API/changesets/$P6_CS2_ID" \
    -H "Authorization: Bearer $EDITOR_TOKEN" | jq '[.items[].id]')

REVIEW_PAYLOAD=$(echo "$ITEMS" | jq '{decisions: [.[] | {id: ., status: "accepted"}]}')

api -X POST "$EDEN_API/changesets/$P6_CS2_ID/review" \
    -H "Authorization: Bearer $EDITOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$REVIEW_PAYLOAD" | jq .

api "$EDEN_API/changesets/$P6_CS2_ID" \
    -H "Authorization: Bearer $EDITOR_TOKEN" | \
    jq '[.items[] | {id, status, approval_status}]'
```

**Expected:** Items accepted but with `approval_status='pending_approval'`. The created task items retain `step_ref` and normalized task defaults.

#### 10. Verify Preview State

```bash
api "$EDEN_API/projects/$P6_PROJECT_ID/pending-approvals" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq 'length'
```

**Expected:** `2` pending approvals.

#### 11. Check Notification for Owner

```bash
api "$EDEN_API/notifications" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.[] | select(.entity_type=="changeset") | {title, type, read}' | head -20
```

**Expected:** Notification about the changeset/pending approvals.

#### 12. Owner Approves All

```bash
PENDING_IDS=$(api "$EDEN_API/projects/$P6_PROJECT_ID/pending-approvals" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '[.[].id]')

api -X POST "$EDEN_API/projects/$P6_PROJECT_ID/approve-items" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"item_ids\": $PENDING_IDS}" | jq .
```

**Expected:** All items approved. Tasks now `approval='approved'`.

---

### Phase D: Map Editing

#### 13. Drag Task Between Steps

```bash
if [ -n "$P6_STEP2_ID" ]; then
    api -X PATCH "$EDEN_API/tasks/$P6_TASK_ID/move" \
        -H "Authorization: Bearer $EDITOR_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"step_id":"'$P6_STEP2_ID'","sort_order":0}' | jq '{id, title}'
    echo "Task moved to step 2"
else
    echo "Only one step — skipping move test"
fi
```

#### 14. Inline Edit Activity Title

```bash
api -X PATCH "$EDEN_API/activities/$P6_ACT_ID" \
    -H "Authorization: Bearer $EDITOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Knowledge Base (Renamed)"}' | jq '{id, name}'
```

**Expected:** 200, title updated.

---

### Phase E: Map Views & Release Slices

#### 15. Create Named View

```bash
api -X POST "$EDEN_API/projects/$P6_PROJECT_ID/views" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Engineering View","slug":"eng-view","filter":{"personas":["eng"]}}' | jq .
```

#### 16. Create Release and Assign Tasks

```bash
P6_RELEASE_ID=$(api -X POST "$EDEN_API/projects/$P6_PROJECT_ID/releases" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Sprint 1","target_date":"2026-04-01","status":"planning"}' | jq -r '.id')

api -X POST "$EDEN_API/releases/$P6_RELEASE_ID/tasks" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"task_ids": ["'$P6_TASK_ID'"]}' | jq .
```

---

### Phase F: Final Verification

#### 17. Full Map State Check

```bash
api "$EDEN_API/projects/$P6_PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    personas: (.personas | length),
    activities: (.activities | length),
    total_tasks: [.activities[].steps[].tasks | length] | add,
    renamed_activity: [.activities[] | select(.name | test("Renamed"))] | length,
    approved_tasks: [.. | objects | select(.approval? == "approved")] | length
}'
```

**Expected:**
- Original wizard-generated entities present
- 2 additional tasks from changeset (now approved)
- Renamed activity present
- No preview tasks remaining

#### 18. Audit Trail Completeness

```bash
api "$EDEN_API/projects/$P6_PROJECT_ID/audit" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    total_entries: (.entries | length),
    actions: [.entries[].action] | group_by(.) | map({(.[0]): length}) | add
}'
```

**Expected:** Audit entries for: project create, changeset accept (wizard),
changeset accept (search improvements), task move, activity rename, release
create, task assignment.

#### 19. Notifications Received

```bash
api "$EDEN_API/notifications" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq 'length'
```

**Expected:** ≥2 notifications (wizard changeset, search changeset).

#### 20. UI — End-to-End Visual Verification (Playwright)

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://web.incept5-eden-sandbox.eh1.incept5.dev';
const PROJECT_SLUG = process.env.P6_PROJECT_SLUG || 'phase6-lifecycle';

test.describe('Scenario 21: Phase 6 Full Lifecycle UI', () => {
    test('populated map renders with wizard-generated content', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // Activities rendered
        const activities = page.locator('[data-testid^="activity-"]');
        expect(await activities.count()).toBeGreaterThanOrEqual(3);

        // Task cards rendered
        const cards = page.locator('[data-testid^="task-card-"]');
        expect(await cards.count()).toBeGreaterThanOrEqual(10);

        // Renamed activity visible
        await expect(page.locator('text=Knowledge Base (Renamed)')).toBeVisible();
    });

    test('no pending review badges remain', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // All items should be approved (no preview badges)
        await expect(page.locator('[data-testid="pending-review-badge"]')).toHaveCount(0);

        // Pending count badge should show 0 or be hidden
        const count = page.locator('[data-testid="pending-approval-count"]');
        if (await count.isVisible()) {
            await expect(count).toContainText('0');
        }
    });

    test('notification bell shows notifications', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${PROJECT_SLUG}/map`);
        await page.waitForLoadState('networkidle');

        const bell = page.locator('[data-testid="notification-bell"]');
        await expect(bell).toBeVisible();
        await bell.click();

        const list = page.locator('[data-testid="notification-list"]');
        await expect(list).toBeVisible({ timeout: 3000 });
    });

    test('map view tabs show engineering view', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        const tabs = page.locator('[data-testid="map-view-tabs"]');
        await expect(tabs).toBeVisible();
        await expect(tabs).toContainText('Engineering View');
    });

    test('release slices show Sprint 1', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        const slices = page.locator('[data-testid="release-slices"]');
        await expect(slices).toBeVisible();
        await expect(slices).toContainText('Sprint 1');
    });

    test('members panel shows editor', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${PROJECT_SLUG}/map`);
        await page.waitForLoadState('networkidle');

        const membersBtn = page.locator('[data-testid="members-button"], button:has-text("Members")');
        if (await membersBtn.isVisible()) {
            await membersBtn.click();
            const panel = page.locator('[data-testid="members-panel"]');
            await expect(panel).toBeVisible({ timeout: 3000 });
            // At least 2 members (owner + invited editor)
            const rows = panel.locator('[data-testid^="member-row"]');
            expect(await rows.count()).toBeGreaterThanOrEqual(2);
        }
    });
});
```

### 21. Clean Up

```bash
api -X DELETE "$EDEN_API/projects/$P6_PROJECT_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN"
echo "Lifecycle project cleaned up"
```

---

## Success Criteria

- [ ] Project wizard generates populated map from description (≥3 activities, ≥10 tasks)
- [ ] Wizard auto-accepts the generated changeset and fully populates the map
- [ ] Wizard logs show `help_calls=0`, `create_calls>=1`, and no changeset validation or server-side failures
- [ ] Editor invited and resolves to `editor` role
- [ ] Editor accepts AI changeset → items appear as `preview`
- [ ] Follow-up changeset task items retain `step_ref` and normalized task defaults
- [ ] Owner receives notification about pending approvals
- [ ] Owner approves all → items become `approved`, no preview badges remain
- [ ] Editor can move tasks and inline-edit titles
- [ ] Named map view created and visible as tab
- [ ] Release created and task assigned to it
- [ ] Release slice visible below map showing assigned task
- [ ] Audit trail records complete history across all phases
- [ ] UI renders all Phase 6 features correctly on sandbox
- [ ] No regressions in existing functionality (scenarios 01–14 still pass)
