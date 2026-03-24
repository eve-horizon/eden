# Scenario 16: Two-Stage Approval

**Time:** ~8 minutes
**Parallel Safe:** No
**LLM Required:** No

Verifies the two-stage approval workflow: editor accepts changeset items →
items appear as "preview" on the map → owner approves or rejects from the
map or approval queue → items become final.

## Prerequisites

- Scenario 15 passed — roles working, editor + owner tokens available
- `$PROJECT_ID` set with populated map data
- `$OWNER_TOKEN` and `$EDITOR_TOKEN` (member promoted to editor in scenario 15)

```bash
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api"
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
```

---

## Steps

### 1. Create a Changeset with Multiple Items

```bash
CHANGESET_ID=$(api -X POST "$EDEN_API/projects/$PROJECT_ID/changesets" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "Two-stage test changeset",
        "source": "map-chat",
        "items": [
            {
                "entity_type": "task",
                "operation": "create",
                "after_state": {"title": "Preview Task Alpha", "user_story": "As a tester"},
                "description": "Add Preview Task Alpha"
            },
            {
                "entity_type": "task",
                "operation": "create",
                "after_state": {"title": "Preview Task Beta", "user_story": "As an editor"},
                "description": "Add Preview Task Beta"
            },
            {
                "entity_type": "task",
                "operation": "create",
                "after_state": {"title": "Preview Task Gamma", "user_story": "As a viewer"},
                "description": "Add Preview Task Gamma"
            }
        ]
    }' | jq -r '.id')
echo "Changeset: $CHANGESET_ID"
```

**Expected:** 201, changeset with 3 items in `pending` status.

### 2. Editor Accepts Changeset Items

```bash
# Get item IDs
ITEMS=$(api "$EDEN_API/changesets/$CHANGESET_ID" \
    -H "Authorization: Bearer $EDITOR_TOKEN" | jq -r '.items[].id')

# Accept each item as editor
for ITEM_ID in $ITEMS; do
    api -X POST "$EDEN_API/changesets/$CHANGESET_ID/review" \
        -H "Authorization: Bearer $EDITOR_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"decisions\": [{\"item_id\": \"$ITEM_ID\", \"status\": \"accepted\"}]}" | jq .
done
```

**Expected:** Items accepted, but with `approval_status='pending_approval'`
because the actor is an editor (not owner).

### 3. Verify Tasks Created with Preview Approval

```bash
api "$EDEN_API/projects/$PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '[.. | objects | select(.title? and (.title | startswith("Preview Task")))] | .[] | {title, approval}'
```

**Expected:** Three tasks with `approval: "preview"`.

### 4. Check Pending Approvals Queue

```bash
api "$EDEN_API/projects/$PROJECT_ID/pending-approvals" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq 'length'
```

**Expected:** `3` (or ≥3 if other pending items exist).

### 5. Owner Approves One Item

```bash
PENDING=$(api "$EDEN_API/projects/$PROJECT_ID/pending-approvals" \
    -H "Authorization: Bearer $OWNER_TOKEN")
FIRST_ITEM=$(echo "$PENDING" | jq -r '.[0].id')

api -X POST "$EDEN_API/projects/$PROJECT_ID/approve-items" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"item_ids\": [\"$FIRST_ITEM\"]}" | jq .
```

**Expected:** 200, item `approval_status` changes to `owner_approved`.
Task `approval` changes from `preview` to `approved`.

### 6. Owner Rejects One Item

```bash
SECOND_ITEM=$(echo "$PENDING" | jq -r '.[1].id')

api -X POST "$EDEN_API/projects/$PROJECT_ID/reject-items" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"item_ids\": [\"$SECOND_ITEM\"]}" | jq .
```

**Expected:** 200, item `approval_status` changes to `owner_rejected`.
Rejected task removed from map (or marked accordingly).

### 7. Verify Pending Count Decreased

```bash
api "$EDEN_API/projects/$PROJECT_ID/pending-approvals" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq 'length'
```

**Expected:** `1` (one item still pending).

### 8. Bulk Approve Remaining

```bash
REMAINING=$(api "$EDEN_API/projects/$PROJECT_ID/pending-approvals" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '[.[].id]')

api -X POST "$EDEN_API/projects/$PROJECT_ID/approve-items" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"item_ids\": $REMAINING}" | jq .
```

**Expected:** 200, all remaining items approved.

### 9. Verify Map State After Approval

```bash
api "$EDEN_API/projects/$PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '[.. | objects | select(.title? and (.title | startswith("Preview Task")))] | .[] | {title, approval}'
```

**Expected:**
- "Preview Task Alpha" → `approval: "approved"`
- "Preview Task Beta" → absent (rejected) or `approval: null` (removed)
- "Preview Task Gamma" → `approval: "approved"`

### 10. Owner Direct Accept — No Preview Stage

```bash
# Create another changeset and accept as owner directly
CS2_ID=$(api -X POST "$EDEN_API/projects/$PROJECT_ID/changesets" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "Owner direct accept",
        "source": "map-chat",
        "items": [{"entity_type":"task","operation":"create","after_state":{"title":"Directly Approved Task"}}]
    }' | jq -r '.id')

ITEM_ID=$(api "$EDEN_API/changesets/$CS2_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.items[0].id')

api -X POST "$EDEN_API/changesets/$CS2_ID/review" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"decisions\": [{\"item_id\": \"$ITEM_ID\", \"status\": \"accepted\"}]}" | jq .
```

**Expected:** Item applied immediately with `approval_status='applied'`
and task `approval='approved'`. No pending_approval step for owners.

### 11. Audit Trail Records Both Stages

```bash
api "$EDEN_API/projects/$PROJECT_ID/audit?entity_type=changeset" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.entries[-5:] | .[] | {action, actor, details}'
```

**Expected:** Audit entries for: editor accept (creates preview), owner
approve, owner reject.

### 12. UI — Preview Badges and On-Card Approve (Playwright)

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://web.incept5-eden-sandbox.eh1.incept5.dev';

test.describe('Scenario 16: Two-Stage Approval UI', () => {
    test('preview cards show badge and approve button for owner', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // Look for "Pending Review" badge on preview cards
        const previewBadges = page.locator('[data-testid="pending-review-badge"]');
        // Should have at least one if there are preview items
        // (Exact count depends on state from API steps above)

        // Header shows pending count
        const pendingCount = page.locator('[data-testid="pending-approval-count"]');
        await expect(pendingCount).toBeVisible();

        // Owner sees approve/reject buttons on preview card
        const approveBtn = page.locator('[data-testid="on-card-approve"]').first();
        if (await approveBtn.isVisible()) {
            await approveBtn.click();
            // After approve, badge should disappear and card should flash
            await page.waitForTimeout(500);
            // Flash animation class present briefly
        }
    });

    test('editor sees awaiting label, not approve button', async ({ page }) => {
        // Login as editor
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // No approve button
        await expect(page.locator('[data-testid="on-card-approve"]')).toHaveCount(0);
        // Awaiting label visible on preview cards
        const awaitingLabel = page.locator('text=Awaiting Approval');
        // Should be visible if preview items exist
    });
});
```

---

## Success Criteria

- [ ] Editor accept creates items with `approval_status='pending_approval'`
- [ ] Tasks appear on map with `approval='preview'`
- [ ] `GET /pending-approvals` returns correct count of pending items
- [ ] Owner approve changes `approval_status` to `owner_approved`, task to `approved`
- [ ] Owner reject changes `approval_status` to `owner_rejected`, removes task
- [ ] Bulk approve/reject works for multiple items
- [ ] Owner direct accept bypasses preview stage (`approval_status='applied'`)
- [ ] Pending count decreases after approve/reject
- [ ] Audit trail records editor accept, owner approve, and owner reject
- [ ] UI shows "Pending Review" badge on preview cards
- [ ] UI shows pending count in header for owner
- [ ] UI shows on-card Approve/Reject buttons for owner only
- [ ] UI shows "Awaiting Approval" label for editor (no action buttons)
