# Scenario 15: Roles & Permissions

**Time:** ~8 minutes
**Parallel Safe:** No
**LLM Required:** No

Verifies the three-tier role model (owner/editor/viewer), project member
management API, EditorGuard and OwnerGuard enforcement, and role-conditional
UI rendering. Also confirms agent service principals bypass role checks.

## Prerequisites

- Scenario 01 passed — `$PROJECT_ID` is set
- Scenario 02 passed — project has personas, activities, steps, tasks
- Two Eve user tokens available:
  - `$OWNER_TOKEN` — org admin or owner (resolves to `owner` role)
  - `$MEMBER_TOKEN` — org member with no explicit project role (resolves to `viewer`)
- Playwright installed: `npx playwright install chromium`

```bash
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api"
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
OWNER_TOKEN="${EVE_TOKEN:-$(eve auth token --raw)}"
# For member token, use a second org member's credentials or impersonation
```

---

## Steps

### 1. Verify Role Resolution — Owner

```bash
api "$EDEN_API/projects/$PROJECT_ID/my-role" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq .
```

**Expected:** `{ "role": "owner" }`

### 2. Verify Role Resolution — Viewer (Default)

```bash
api "$EDEN_API/projects/$PROJECT_ID/my-role" \
    -H "Authorization: Bearer $MEMBER_TOKEN" | jq .
```

**Expected:** `{ "role": "viewer" }`

### 3. EditorGuard — Viewer Blocked on Write

```bash
# Attempt to create a task as viewer
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$EDEN_API/projects/$PROJECT_ID/tasks" \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Should fail","step_id":"'$STEP_ID'"}')
echo "Status: $STATUS"
```

**Expected:** `403`

### 4. EditorGuard — Owner Passes

```bash
# Create a task as owner
api -X POST "$EDEN_API/projects/$PROJECT_ID/tasks" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Owner-created task","step_id":"'$STEP_ID'"}' | jq '.id, .title'
```

**Expected:** 201, returns task ID and title.

### 5. Invite Member as Editor

```bash
# Get member's user ID from their token
MEMBER_USER_ID=$(curl -sf "$EVE_API_URL/auth/me" \
    -H "Authorization: Bearer $MEMBER_TOKEN" | jq -r '.user_id // .id')

api -X POST "$EDEN_API/projects/$PROJECT_ID/members" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"user_id":"'$MEMBER_USER_ID'","role":"editor"}' | jq .
```

**Expected:** 201, returns member record with `role: "editor"`.

### 6. Verify Role Changed to Editor

```bash
api "$EDEN_API/projects/$PROJECT_ID/my-role" \
    -H "Authorization: Bearer $MEMBER_TOKEN" | jq .
```

**Expected:** `{ "role": "editor" }`

### 7. EditorGuard — Editor Passes on Write

```bash
api -X POST "$EDEN_API/projects/$PROJECT_ID/tasks" \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Editor-created task","step_id":"'$STEP_ID'"}' | jq '.id, .title'
```

**Expected:** 201.

### 8. OwnerGuard — Editor Blocked on Approve

```bash
# Get a draft changeset ID (from scenario 04 or create one)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$EDEN_API/changesets/$CHANGESET_ID/accept" \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}')
echo "Status: $STATUS"
```

**Expected:** `403` (editors cannot approve changesets directly — they
create pending_approval items via WS2).

### 9. OwnerGuard — Editor Blocked on Member Management

```bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$EDEN_API/projects/$PROJECT_ID/members" \
    -H "Authorization: Bearer $MEMBER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"user_id":"user_xxx","role":"viewer"}')
echo "Status: $STATUS"
```

**Expected:** `403`

### 10. List All Members

```bash
api "$EDEN_API/projects/$PROJECT_ID/members" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '.members[] | {email, role, source}'
```

**Expected:** Shows implicit owners (source: `org_admin`) and the explicitly
added editor (source: `explicit`).

### 11. Change Editor to Viewer

```bash
# Get the project_member ID from the list
MEMBER_ID=$(api "$EDEN_API/projects/$PROJECT_ID/members" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.members[] | select(.source=="explicit") | .id')

api -X PATCH "$EDEN_API/project-members/$MEMBER_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"role":"viewer"}' | jq .
```

**Expected:** 200, role updated to `viewer`.

### 12. Verify Demotion

```bash
api "$EDEN_API/projects/$PROJECT_ID/my-role" \
    -H "Authorization: Bearer $MEMBER_TOKEN" | jq .
```

**Expected:** `{ "role": "viewer" }`

### 13. Agent Service Principal Bypass

```bash
# Use an Eve service token (from job context or manual creation)
api -X POST "$EDEN_API/projects/$PROJECT_ID/changesets" \
    -H "Authorization: Bearer $SERVICE_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "title": "Agent-proposed change",
        "source": "map-chat",
        "items": [{"entity_type":"persona","operation":"create","display_reference":"PER-AGT","after_state":{"name":"Agent Persona","code":"AGT","color":"#FF6B6B"}}]
    }' | jq '.id, .status'
```

**Expected:** 201 — agents are not blocked by EditorGuard or OwnerGuard.

### 14. UI — Viewer Experience (Playwright)

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://web.incept5-eden-sandbox.eh1.incept5.dev';

test.describe('Scenario 15: Role-Based UI', () => {
    test('viewer sees read-only map', async ({ page }) => {
        // Login as viewer/member
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // No "Add Activity" button
        await expect(page.locator('button:has-text("Add Activity")')).toHaveCount(0);
        // No "Add Step" button
        await expect(page.locator('button:has-text("Add Step")')).toHaveCount(0);
        // No drag handles on task cards
        await expect(page.locator('[data-testid="drag-handle"]')).toHaveCount(0);
        // No edit cursor on titles
        const actTitle = page.locator('[data-testid^="activity-"] h3').first();
        const cursor = await actTitle.evaluate(el => window.getComputedStyle(el).cursor);
        expect(cursor).toBe('default');  // not 'text' or 'pointer'
        // Upload button hidden on sources page
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/sources`);
        await expect(page.locator('[data-testid="upload-zone"]')).toHaveCount(0);
    });

    test('owner sees full edit controls', async ({ page }) => {
        // Login as owner/admin
        await page.goto(`${EDEN_URL}/projects/${process.env.PROJECT_SLUG}/map`);
        await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

        // Edit controls visible
        await expect(page.locator('[data-testid="drag-handle"]').first()).toBeVisible();
        // Title has edit cursor
        const actTitle = page.locator('[data-testid^="activity-"] h3').first();
        const cursor = await actTitle.evaluate(el => window.getComputedStyle(el).cursor);
        expect(cursor).not.toBe('default');
    });
});
```

### 15. Restore Editor Role for Subsequent Scenarios

```bash
api -X PATCH "$EDEN_API/project-members/$MEMBER_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"role":"editor"}' | jq .
```

---

## Success Criteria

- [ ] `GET /my-role` returns `owner` for org admin, `viewer` for default member
- [ ] Viewer gets 403 on all write endpoints (POST/PATCH/DELETE on entities)
- [ ] Editor gets 201 on write endpoints, 403 on approve/member-management
- [ ] Owner gets 201/200 on all endpoints
- [ ] Member invite, role change, and removal work correctly
- [ ] Member list shows implicit + explicit members with source attribution
- [ ] Agent service principal bypasses all role guards
- [ ] UI hides edit controls for viewers, shows them for editors/owners
- [ ] Audit log captures member management actions
