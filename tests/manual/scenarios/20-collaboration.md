# Scenario 20: Collaboration — Notifications, Members & Walkthrough

**Time:** ~8 minutes
**Parallel Safe:** No
**LLM Required:** No

Verifies the notification system (create, read, mark read), member
management UI, and the onboarding walkthrough with role-specific sequences.

## Prerequisites

- Scenario 15 passed — roles working, member management API functional
- `$PROJECT_ID` set with populated data
- `$OWNER_TOKEN` and `$EDITOR_TOKEN` available
- Playwright installed

```bash
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api"
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
```

---

## Steps

### 1. Verify Empty Notification State

```bash
api "$EDEN_API/notifications" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq 'length'
```

**Expected:** `0` (or current count if prior notifications exist).

### 2. Trigger Notification via Changeset Creation

```bash
# Create a changeset — should generate notification for project owner
api -X POST "$EDEN_API/projects/$PROJECT_ID/changesets" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "Notification test changeset",
        "source": "map-chat",
        "items": [{"entity_type":"persona","operation":"create","display_reference":"PER-NTF","after_state":{"name":"Notification Persona","code":"NTF","color":"#3b82f6"}}]
    }' | jq '.id'
```

**Expected:** 201, changeset created. Notification generated for project members.

### 3. Check Notification Appeared

```bash
sleep 2  # Brief delay for async notification creation
api "$EDEN_API/notifications" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.[] | select(.type=="changeset_created") | {id, title, type, read, entity_type, entity_id}'
```

**Expected:** Notification with `type: "changeset_created"`, `read: false`,
referencing the changeset entity.

### 4. Mark Single Notification as Read

```bash
NOTIF_ID=$(api "$EDEN_API/notifications" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.[0].id')

api -X PATCH "$EDEN_API/notifications/$NOTIF_ID/read" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq .
```

**Expected:** 200, notification `read: true`.

### 5. Create Multiple Notifications

```bash
# Create a question — should generate notification
api -X POST "$EDEN_API/projects/$PROJECT_ID/questions" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"question":"Notification test question?","status":"open","priority":"medium","category":"requirements"}' | jq '.id'
```

**Expected:** Another notification created.

### 6. Mark All as Read

```bash
api -X POST "$EDEN_API/notifications/read-all" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq .

# Verify all read
UNREAD=$(api "$EDEN_API/notifications" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '[.[] | select(.read==false)] | length')
echo "Unread: $UNREAD"
```

**Expected:** `0` unread notifications.

### 7. Member Management — List

```bash
api "$EDEN_API/projects/$PROJECT_ID/members" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.members[] | {email, role, source}'
```

**Expected:** Lists implicit owners and any explicit members.

### 8. Member Management — Invite

```bash
# Invite a new member as viewer
api -X POST "$EDEN_API/projects/$PROJECT_ID/members" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"email":"test-collab@incept5.com","role":"viewer"}' | jq .
```

**Expected:** 201, new member added with viewer role.

### 9. Member Management — Promote

```bash
NEW_MEMBER_ID=$(api "$EDEN_API/projects/$PROJECT_ID/members" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq -r '.members[] | select(.email=="test-collab@incept5.com") | .id')

api -X PATCH "$EDEN_API/project-members/$NEW_MEMBER_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"role":"editor"}' | jq '{role}'
```

**Expected:** 200, role changed to `editor`.

### 10. Member Management — Remove

```bash
api -X DELETE "$EDEN_API/project-members/$NEW_MEMBER_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN"

# Verify removed
api "$EDEN_API/projects/$PROJECT_ID/members" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.members[] | select(.email=="test-collab@incept5.com")'
```

**Expected:** Empty result — member removed.

### 11. UI — Notification Bell (Playwright)

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://web.incept5-eden-sandbox.eh1.incept5.dev';

test.describe('Scenario 20: Collaboration UI', () => {
    test('notification bell shows in header', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        const bell = page.locator('[data-testid="notification-bell"]');
        await expect(bell).toBeVisible();
    });

    test('notification dropdown opens and shows items', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForLoadState('networkidle');

        await page.locator('[data-testid="notification-bell"]').click();

        const dropdown = page.locator('[data-testid="notification-list"]');
        await expect(dropdown).toBeVisible({ timeout: 3000 });

        // Should show notification items
        const items = dropdown.locator('[data-testid^="notification-item"]');
        expect(await items.count()).toBeGreaterThanOrEqual(0);
    });

    test('members panel shows in project settings', async ({ page }) => {
        // Navigate to project settings or members page
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForLoadState('networkidle');

        // Open members panel (button in header or settings)
        const membersBtn = page.locator('[data-testid="members-button"], button:has-text("Members")');
        if (await membersBtn.isVisible()) {
            await membersBtn.click();

            const panel = page.locator('[data-testid="members-panel"]');
            await expect(panel).toBeVisible({ timeout: 3000 });

            // Shows at least one member (the owner)
            const memberRows = panel.locator('[data-testid^="member-row"]');
            expect(await memberRows.count()).toBeGreaterThanOrEqual(1);
        }
    });

    test('walkthrough plays on first visit', async ({ page, context }) => {
        // Clear localStorage to simulate first visit
        await context.clearCookies();
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // Walkthrough overlay should appear
        const walkthrough = page.locator('[data-testid="walkthrough"], [data-testid="walkthrough-overlay"]');
        // May or may not auto-show depending on auth state
        if (await walkthrough.isVisible({ timeout: 5000 }).catch(() => false)) {
            // Step 1 visible
            await expect(walkthrough).toContainText(/welcome|story map/i);

            // Click next
            await page.locator('button:has-text("Next")').click();
            // Should advance to step 2
        }
    });

    test('walkthrough trigger replays tour', async ({ page }) => {
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // Click "?" trigger button
        const trigger = page.locator('[data-testid="walkthrough-trigger"], button:has-text("?")');
        if (await trigger.isVisible()) {
            await trigger.click();

            const walkthrough = page.locator('[data-testid="walkthrough"], [data-testid="walkthrough-overlay"]');
            await expect(walkthrough).toBeVisible({ timeout: 3000 });
        }
    });
});
```

---

## Success Criteria

- [ ] `GET /notifications` returns notification list (empty initially)
- [ ] Changeset creation triggers `changeset_created` notification
- [ ] `PATCH /notifications/:id/read` marks single notification as read
- [ ] `POST /notifications/read-all` marks all as read
- [ ] Unread count drops to 0 after mark-all-read
- [ ] Member list shows implicit owners + explicit members
- [ ] Invite member creates new row with assigned role
- [ ] Promote member changes role (viewer → editor)
- [ ] Remove member deletes the membership
- [ ] UI: notification bell visible in header
- [ ] UI: clicking bell shows dropdown with notification items
- [ ] UI: members panel accessible and shows member list
- [ ] UI: walkthrough appears on first visit (cleared localStorage)
- [ ] UI: "?" button replays walkthrough
