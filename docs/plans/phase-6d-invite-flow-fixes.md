# Eden Phase 6d — Invite Flow Fixes & UX Improvements

> **Status**: Proposed
> **Date**: 2026-03-20
> **Phase**: 6d (follows 6a/6b/6c)
> **Depends on**: Phase 6a (roles & safety), app-initiated onboarding (merged)
> **Platform prereqs**: `orgs:members:read`, `orgs:invite`, member search endpoint
> **Estimated effort**: ~2 days (5 workstreams, partially parallel)
>
> **Delivers**: A working end-to-end invite flow where owners can invite
> existing org members (instant add) or new users (email invite with
> deep-link onboarding), with typeahead member search, pending invite
> management, auto-claim on first access, and clear success feedback.

---

## Problem

The app-initiated onboarding plan shipped platform capabilities and Eden
API endpoints, but the **web UI is wired incorrectly** and several pieces
are missing. The result: the invite flow is broken end-to-end.

### Bugs found in audit (2026-03-20)

| # | Bug | Severity | File |
|---|-----|----------|------|
| 1 | `useMembers.invite()` POSTs to `/projects/:id/members` (direct add) instead of `/projects/:id/invite` (smart invite endpoint) — the entire Eve org-check + email flow is dead code from the UI | **Critical** | `hooks/useMembers.ts:49` |
| 2 | `claim-invite` endpoint exists but is never called — invited users who complete onboarding land as generic viewers, not with their assigned role | **Critical** | `apps/web/` (zero references) |
| 3 | MembersPage has two invite forms (inline card + modal) doing the same thing | Medium | `pages/MembersPage.tsx:158-203` |
| 4 | Raw `User ID` field exposed in both forms — internal platform ID that no user would know | Medium | `InviteModal.tsx:115-129`, `MembersPage.tsx:162-168` |
| 5 | No pending invites display — owners can't see or cancel outstanding invites | Medium | Frontend gap |
| 6 | No success feedback — user doesn't know if person was added instantly or invited by email | Low | `InviteModal.tsx:42-47` |

### UX gaps vs platform capabilities

The platform now provides:
- **`GET /orgs/:id/members/search?q=...`** — prefix search by email/name
- **`GET /orgs/:id/members`** — full member list with `orgs:members:read`
- **`POST /orgs/:id/invites`** with `redirect_to` + `app_context`

None of these are surfaced in the UI. The invite experience is a blind
email input with no autocomplete, no org member awareness, and no
feedback on what happened.

---

## Architecture

After these fixes, the invite flow has three paths:

```
Owner clicks "Invite Member"
        │
        ▼
┌─────────────────────┐
│ Smart Email Input    │  ← Typeahead queries GET /orgs/:id/members/search?q=...
│ (single field)       │
└─────────┬───────────┘
          │
    ┌─────┴──────┐
    │            │
    ▼            ▼
[Match found]  [No match]
    │            │
    ▼            ▼
"Add to project"   "Send invite email"
    │                    │
    ▼                    ▼
POST /projects/:id/invite   POST /projects/:id/invite
  → status: "added"           → status: "invited"
  → instant member             → Eve org invite + email
  → green toast                → project_invites row
                               → blue toast
                               │
                               ▼
                         [User clicks email link]
                               │
                               ▼
                         GoTrue → SSO → Eve token exchange
                         (auto-applies org invite)
                               │
                               ▼
                         Redirect to Eden with ?project=<id>
                               │
                               ▼
                         ProjectShell mounts → auto-claims invite
                         POST /projects/:id/claim-invite
                               │
                               ▼
                         project_invites → project_members
                         User has correct role
```

---

## WS1: Fix Critical Wiring (30 min)

### 1a. Create `useInvite` hook

The `useMembers` hook handles member CRUD (list, role change, remove).
Inviting belongs on a separate hook that calls the correct endpoint and
returns the status.

**New file:** `apps/web/src/hooks/useInvite.ts`

```typescript
import { useCallback, useState } from 'react';
import { api } from '../api/client';

interface InviteResult {
  status: 'added' | 'invited';
  user_id?: string;
  invite_code?: string;
}

export function useInvite(projectId: string | undefined) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<InviteResult | null>(null);

  const invite = useCallback(
    async (email: string, role: string): Promise<InviteResult> => {
      if (!projectId) throw new Error('No project');
      setLoading(true);
      setError(null);
      try {
        const result = await api.post<InviteResult>(
          `/projects/${projectId}/invite`,
          { email, role },
        );
        setLastResult(result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invite failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  return { invite, loading, error, lastResult };
}
```

Note: no `userId` parameter — the server resolves the user from the email
via the Eve member search API. The frontend never needs to know user IDs.

### 1b. Wire InviteModal to `useInvite`

**File:** `apps/web/src/components/projects/InviteModal.tsx`

Changes:
- Remove `userId` field and state
- Change `onInvite` prop from `(userId, email, role) => Promise<void>` to
  `(email, role) => Promise<InviteResult>`
- Show result feedback inline before closing

### 1c. Wire MembersPage to `useInvite`

**File:** `apps/web/src/pages/MembersPage.tsx`

Changes:
- Import `useInvite` instead of using `useMembers.invite`
- Remove inline invite form (lines 158-203) — the modal is the single path
- Pass `useInvite.invite` to `InviteModal.onInvite`
- Refetch members list after successful invite

### 1d. Wire MembersPanel to `useInvite`

**File:** `apps/web/src/components/members/MembersPanel.tsx`

Same pattern as MembersPage — remove inline User ID field, use `useInvite`.

---

## WS2: Auto-Claim on Project Access (1 hr)

### 2a. Add `useClaimInvite` hook

**New file:** `apps/web/src/hooks/useClaimInvite.ts`

```typescript
import { useEffect, useRef } from 'react';
import { api } from '../api/client';

/**
 * On mount, attempt to claim any pending project invite for the current user.
 * Runs once per project. If the user has a pending invite, it's converted
 * to a project_members row and their role is upgraded.
 */
export function useClaimInvite(
  projectId: string | undefined,
  onClaimed?: (role: string) => void,
) {
  const claimed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId || claimed.current.has(projectId)) return;
    claimed.current.add(projectId);

    api.post<{ claimed: boolean; role?: string }>(
      `/projects/${projectId}/claim-invite`,
      {},
    ).then((result) => {
      if (result.claimed && result.role) {
        onClaimed?.(result.role);
      }
    }).catch(() => {
      // Silent — user may not have a pending invite, or may not be logged in
    });
  }, [projectId, onClaimed]);
}
```

### 2b. Call from ProjectShell

**File:** `apps/web/src/App.tsx` (or the project layout wrapper)

Add `useClaimInvite(projectId)` in the component that wraps all
`/projects/:projectId/*` routes. When a claim succeeds, refetch the
project role so guards update without a page reload.

### 2c. Handle the `?project=` deep-link

When a user completes onboarding, they're redirected to
`EDEN_WEB_URL/?project=<uuid>`. The landing page should detect this
param and redirect to `/projects/<uuid>/map`.

**File:** `apps/web/src/pages/ProjectsPage.tsx` (or router-level)

```typescript
// On mount, check for ?project= param
const searchParams = new URLSearchParams(location.search);
const deepLinkProject = searchParams.get('project');
if (deepLinkProject) {
  navigate(`/projects/${deepLinkProject}/map`, { replace: true });
}
```

---

## WS3: Smart Typeahead Input (2-3 hr)

### 3a. Add `useOrgMemberSearch` hook

**New file:** `apps/web/src/hooks/useOrgMemberSearch.ts`

```typescript
import { useCallback, useRef, useState } from 'react';
import { api } from '../api/client';

interface OrgMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
}

export function useOrgMemberSearch() {
  const [results, setResults] = useState<OrgMember[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string) => {
    abortRef.current?.abort();
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);

    try {
      const data = await api.get<{ data: OrgMember[] }>(
        `/org-members/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setResults(data.data ?? []);
      }
    } catch {
      if (!controller.signal.aborted) setResults([]);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, []);

  return { results, searching, search };
}
```

### 3b. Eden API proxy for org member search

The web app can't call the Eve API directly (CORS, different origin).
Add a thin proxy endpoint in Eden's API.

**New file:** `apps/api/src/members/org-members.controller.ts`

```typescript
@Controller('org-members')
@UseGuards(AuthGuard)
export class OrgMembersController {
  @Get('search')
  async search(@Req() req: Request, @Query('q') query: string) {
    const ctx = dbContext(req);
    const eveApiUrl = process.env.EVE_API_URL || 'http://api.eve.lvh.me';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';

    const res = await fetch(
      `${eveApiUrl}/orgs/${ctx.org_id}/members/search?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) return { data: [] };
    return res.json();
  }
}
```

Register in `MembersModule`.

### 3c. Rewrite InviteModal with typeahead

Replace the current Email + User ID fields with a single smart input:

```
┌──────────────────────────────────────────────────┐
│ Invite Member                              [X]   │
├──────────────────────────────────────────────────┤
│                                                  │
│ Email                                            │
│ ┌──────────────────────────────────────────────┐ │
│ │ sar                                          │ │
│ ├──────────────────────────────────────────────┤ │
│ │ sarah@incept5.com — Sarah Chen     [member]  │ │
│ │ sarita@incept5.com — Sarita Lopez  [admin]   │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Role                                             │
│ ○ Owner  ● Editor  ○ Viewer                      │
│                                                  │
│                    [Cancel] [Add to Project]      │
└──────────────────────────────────────────────────┘
```

Behavior:
- As the user types (debounce 300ms), query the search endpoint
- If a dropdown match is selected → show "Add to Project" button
- If the typed email has no match → show "Send Invite" button
- After success, show inline feedback:
  - Green: "Sarah Chen added as Editor"
  - Blue: "Invite sent to newperson@gmail.com — they'll join as Viewer
    after completing signup"

### 3d. Remove User ID from all forms

Delete the User ID field from:
- `InviteModal.tsx` — replaced by typeahead
- `MembersPage.tsx` inline form — being deleted entirely
- `MembersPanel.tsx` — replaced by typeahead

---

## WS4: Pending Invites Display (1 hr)

### 4a. Add `usePendingInvites` hook

**New file:** `apps/web/src/hooks/usePendingInvites.ts`

```typescript
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

export function usePendingInvites(projectId: string | undefined) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!projectId) { setInvites([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await api.get<PendingInvite[]>(
        `/projects/${projectId}/invites`,
      );
      setInvites(data);
    } catch {
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetch(); }, [fetch]);

  const cancel = useCallback(async (inviteId: string) => {
    if (!projectId) return;
    await api.delete(`/projects/${projectId}/invites/${inviteId}`);
    await fetch();
  }, [projectId, fetch]);

  return { invites, loading, refetch: fetch, cancel };
}
```

### 4b. Add pending invites section to MembersPage

Below the member list, add a "Pending Invites" section (owner only):

```
──── Pending Invites (2) ────────────────────────────
  newperson@gmail.com    Viewer    2h ago    [Cancel]
  another@example.com    Editor    1d ago    [Cancel]
─────────────────────────────────────────────────────
```

- Show relative timestamps (`2h ago`, `1d ago`)
- "Cancel" button calls `DELETE /projects/:id/invites/:inviteId`
- Section hidden when no pending invites exist
- Only visible to owners

---

## WS5: Polish & Cleanup (30 min)

### 5a. Remove inline invite form from MembersPage

Delete lines 158-203 in `MembersPage.tsx` — the inline card with User ID +
Email + Role dropdown + Invite button. The modal is the only invite path.

### 5b. Remove inline invite form from MembersPanel

Same cleanup in `MembersPanel.tsx`. The panel should only list members
with role/remove controls. Invite action opens the modal.

### 5c. Toast component for success feedback

Add a lightweight toast/banner that appears at the top of the page after
an invite action:

```typescript
// Success states
{ status: 'added' }   → green: "<email> added as <role>"
{ status: 'invited' } → blue:  "Invite sent to <email> — they'll join as <role> after signup"
```

Auto-dismiss after 5 seconds or on click.

---

## Implementation Order

```
WS1 (fix critical wiring)  ──► WS3 (smart typeahead)
        │                              │
        ├──► WS2 (auto-claim)          │
        │                              │
        ├──► WS4 (pending invites)     │
        │                              │
        └──► WS5 (polish & cleanup)  ◄─┘
```

WS1 must go first — everything else depends on the correct endpoint
being called. WS2-WS5 are independent of each other and can be
parallelized after WS1.

| Step | Work | Effort |
|------|------|--------|
| 1 | WS1: `useInvite` hook, wire modal + pages to `/invite` | 30 min |
| 2 | WS5a-b: Remove inline forms, User ID fields | 15 min |
| 3 | WS2: `useClaimInvite`, wire to ProjectShell, deep-link | 1 hr |
| 4 | WS4: `usePendingInvites`, pending invites section | 1 hr |
| 5 | WS3: `useOrgMemberSearch`, proxy endpoint, typeahead | 2-3 hr |
| 6 | WS5c: Toast component | 30 min |
| 7 | Full verification loop | 1 hr |

---

## Verification Protocol

All verification runs against the **local k3d stack** using Mailpit
(`http://mail.eve.lvh.me`) for email capture.

### Prerequisites

```bash
# Ensure k3d stack is running
eve local status

# Ensure Eden is deployed
cd /Users/adam/dev/eve-horizon/eden
eve project sync
eve env deploy sandbox --ref HEAD --repo-dir .

# Confirm URLs
curl -sI http://eden.incept5-eden-sandbox.eve.lvh.me  # Eden web
curl -sI http://api.eve.lvh.me/health                 # Eve API
open http://mail.eve.lvh.me                            # Mailpit UI

# Login as org owner
eve profile use local
eve auth login --email adam@incept5.com --ssh-key ~/.ssh/id_ed25519

# Store vars for scripting
export EVE_TOKEN=$(eve auth token)
export EVE_API=http://api.eve.lvh.me
export ORG_ID=org_Incept5
export EDEN_API=http://eden-api.incept5-eden-sandbox.eve.lvh.me
```

### Deploy Loop

Every workstream follows this loop:

```
┌─────────────────────────────────────────────────────────────┐
│  1. Implement workstream locally                             │
│  2. Type-check + build:                                      │
│       cd apps/api && npm run build                           │
│       cd apps/web && npm run build                           │
│  3. Commit + push to main                                    │
│  4. Deploy:                                                  │
│       eve project sync                                       │
│       eve env deploy sandbox --ref HEAD --repo-dir .         │
│  5. Run verification scenarios for the workstream            │
│  6. If any check fails → fix → repeat from 1                │
│  7. Run regression (existing scenarios 01–14)                │
└─────────────────────────────────────────────────────────────┘
```

---

### Scenario V1: Invite Existing Org Member (tests WS1, WS3, WS5)

**Precondition:** Two users exist in the org — the owner (adam@incept5.com)
and at least one other member.

```bash
# 1. Verify org members are visible via the proxy endpoint
curl -s -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/org-members/search?q=adam" | jq '.data'
# Expected: at least one result with email, display_name, role

# 2. Verify the invite endpoint works for existing org members
curl -s -X POST \
  -H "Authorization: Bearer $EVE_TOKEN" \
  -H "Content-Type: application/json" \
  "$EDEN_API/projects/$PROJECT_ID/invite" \
  -d '{"email":"other-member@incept5.com","role":"editor"}'
# Expected: { "status": "added", "user_id": "..." }

# 3. Verify member appears in project members list
curl -s -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/members" | jq '.[] | select(.email=="other-member@incept5.com")'
# Expected: { role: "editor", email: "other-member@incept5.com", ... }
```

**Browser verification (Playwright or manual):**

1. Navigate to Members page
2. Click "+ Invite Member" — modal opens
3. Type first 3 chars of an existing org member's email
4. Verify: typeahead dropdown appears with matching org members
5. Select a member from the dropdown
6. Verify: button reads "Add to Project"
7. Select "Editor" role, click "Add to Project"
8. Verify: green toast — "{name} added as Editor"
9. Verify: modal closes, member appears in the member list
10. Verify: User ID field is gone from the modal

---

### Scenario V2: Invite New User (not in org) (tests WS1, WS3)

**Precondition:** The email being invited does NOT exist in the org.

```bash
# 1. Invite a completely new user
curl -s -X POST \
  -H "Authorization: Bearer $EVE_TOKEN" \
  -H "Content-Type: application/json" \
  "$EDEN_API/projects/$PROJECT_ID/invite" \
  -d '{"email":"brand-new-user@example.com","role":"viewer"}'
# Expected: { "status": "invited", "invite_code": "..." }

# 2. Verify project_invites row was created
curl -s -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/invites" | jq '.'
# Expected: includes brand-new-user@example.com with status "pending"

# 3. Verify email was sent — check Mailpit
open http://mail.eve.lvh.me
# Expected: email to brand-new-user@example.com with a magic link
# Magic link should contain redirect_to parameter pointing to Eden
```

**Browser verification:**

1. Open Members page
2. Click "+ Invite Member"
3. Type `brand-new-user@example.com` — no typeahead matches
4. Verify: button reads "Send Invite"
5. Select "Viewer" role, click "Send Invite"
6. Verify: blue toast — "Invite sent to brand-new-user@example.com —
   they'll join as Viewer after completing signup"
7. Verify: modal closes
8. Verify: "Pending Invites" section now shows brand-new-user@example.com

---

### Scenario V3: Invite Email Deep-Link + Auto-Claim (tests WS2)

**Precondition:** A pending project invite exists from Scenario V2.

```bash
# 1. Open Mailpit and find the invite email for brand-new-user@example.com
open http://mail.eve.lvh.me

# 2. Extract the magic link from the email body
# The link should look like:
#   http://sso.eve.lvh.me/callback?access_token=...&type=invite&redirect_to=...

# 3. Verify redirect_to is set correctly
# It should be: http://eden.incept5-eden-sandbox.eve.lvh.me/?project=<PROJECT_ID>

# 4. Open the magic link in a browser
# → GoTrue validates the token
# → SSO callback exchanges tokens, sets cookies
# → auto-applies org invite (user becomes org member)
# → redirects to redirect_to URL

# 5. Verify: browser lands at Eden with ?project= param
# → Eden detects ?project= and redirects to /projects/<id>/map
# → useClaimInvite fires POST /projects/<id>/claim-invite
# → pending invite becomes project_members row

# 6. Verify the claim happened
eve auth login --email brand-new-user@example.com --ssh-key ~/.ssh/id_ed25519
export NEW_TOKEN=$(eve auth token)

curl -s -H "Authorization: Bearer $NEW_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/my-role"
# Expected: { "role": "viewer" } — NOT the default "viewer" from fallback,
# but the explicitly assigned role from the invite

# 7. Verify invite status changed
eve auth login --email adam@incept5.com --ssh-key ~/.ssh/id_ed25519
export EVE_TOKEN=$(eve auth token)

curl -s -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/invites" | jq '.'
# Expected: brand-new-user@example.com with status "claimed"
```

**What to look for in Mailpit:**

1. Email was received for the invited address
2. Email contains a clickable magic link
3. The magic link's `redirect_to` parameter points to Eden (not the SSO
   broker or a generic page)
4. After clicking the link and setting a password, the browser ends up
   in Eden at the correct project

---

### Scenario V4: Pending Invites Management (tests WS4)

```bash
# 1. Create two pending invites
curl -s -X POST -H "Authorization: Bearer $EVE_TOKEN" \
  -H "Content-Type: application/json" \
  "$EDEN_API/projects/$PROJECT_ID/invite" \
  -d '{"email":"pending1@example.com","role":"editor"}'

curl -s -X POST -H "Authorization: Bearer $EVE_TOKEN" \
  -H "Content-Type: application/json" \
  "$EDEN_API/projects/$PROJECT_ID/invite" \
  -d '{"email":"pending2@example.com","role":"viewer"}'

# 2. List pending invites
curl -s -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/invites" | jq '.'
# Expected: 2 pending invites

# 3. Cancel one
INVITE_ID=$(curl -s -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/invites" | jq -r '.[0].id')

curl -s -o /dev/null -w '%{http_code}' \
  -X DELETE -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/invites/$INVITE_ID"
# Expected: 204

# 4. Verify only one remains
curl -s -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/invites" | jq 'length'
# Expected: 1
```

**Browser verification:**

1. Navigate to Members page
2. Verify: "Pending Invites" section visible with invite rows
3. Each row shows: email, role, relative time, Cancel button
4. Click "Cancel" on one invite
5. Verify: invite disappears from the list
6. Verify: cancelled invite no longer appears in API response

---

### Scenario V5: Permission Guard Regression (tests existing)

Non-owners should not see invite controls or pending invites.

```bash
# Login as a regular org member (not owner/admin)
eve auth login --email member@test.incept5.com --ssh-key ~/.ssh/id_ed25519
export MEMBER_TOKEN=$(eve auth token)

# 1. Cannot invoke invite endpoint
curl -s -o /dev/null -w '%{http_code}' \
  -X POST -H "Authorization: Bearer $MEMBER_TOKEN" \
  -H "Content-Type: application/json" \
  "$EDEN_API/projects/$PROJECT_ID/invite" \
  -d '{"email":"test@example.com","role":"editor"}'
# Expected: 403

# 2. Cannot list pending invites
curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $MEMBER_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/invites"
# Expected: 403

# 3. Cannot cancel invites
curl -s -o /dev/null -w '%{http_code}' \
  -X DELETE -H "Authorization: Bearer $MEMBER_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/invites/some-id"
# Expected: 403

# 4. CAN claim own invite (this is not owner-gated)
curl -s -X POST -H "Authorization: Bearer $MEMBER_TOKEN" \
  -H "Content-Type: application/json" \
  "$EDEN_API/projects/$PROJECT_ID/claim-invite" \
  -d '{}'
# Expected: 200 (with claimed: false if no pending invite)
```

**Browser verification:**

1. Login as non-owner member
2. Navigate to Members page
3. Verify: "+ Invite Member" button is hidden
4. Verify: "Pending Invites" section is hidden
5. Verify: role dropdowns are read-only (no select)
6. Verify: no remove buttons

---

### Scenario V6: Full Round-Trip End-to-End

This is the happy path from invite to landing, verified entirely via
the k3d stack and Mailpit.

| Step | Actor | Action | Verify |
|------|-------|--------|--------|
| 1 | Owner | Open Members page, click "+ Invite Member" | Modal opens |
| 2 | Owner | Type `newuser@example.com`, select Viewer, click "Send Invite" | Blue toast, pending invite appears |
| 3 | Owner | Check Mailpit at `http://mail.eve.lvh.me` | Email received for newuser@example.com |
| 4 | — | Extract magic link from email, note `redirect_to` param | Points to Eden with `?project=<id>` |
| 5 | New user | Open magic link in incognito browser | Redirected to SSO callback |
| 6 | New user | Set password (if GoTrue prompts) | Auth tokens issued |
| 7 | New user | SSO callback redirects to Eden | Browser at Eden `/?project=<id>` |
| 8 | New user | Eden detects `?project=` and redirects to map | Map page loads |
| 9 | New user | `useClaimInvite` fires on mount | `POST /claim-invite` returns `{ claimed: true, role: "viewer" }` |
| 10 | New user | Page reflects assigned role | Read-only view, no edit controls |
| 11 | Owner | Refresh Members page | newuser@example.com listed as Viewer |
| 12 | Owner | "Pending Invites" section | newuser@example.com shows "claimed" or is gone |

---

### Scenario V7: Typeahead Autocomplete UX

| Step | Action | Verify |
|------|--------|--------|
| 1 | Open invite modal | Single email field, no User ID field |
| 2 | Type `a` | No dropdown (too short, min 2 chars) |
| 3 | Type `ad` | Dropdown appears with matching org members |
| 4 | Type `adam@` | Dropdown narrows to exact match |
| 5 | Click a dropdown result | Email field populated, button = "Add to Project" |
| 6 | Clear field, type `nonexistent@example.com` | No dropdown results |
| 7 | Tab out or wait | Button = "Send Invite" |
| 8 | Press Escape | Modal closes, no action taken |

---

### Regression Checklist

After all workstreams are complete, run these against the k3d stack:

```bash
# Existing auth flows
eve auth login --email adam@incept5.com --ssh-key ~/.ssh/id_ed25519
eve system health --json
# Expected: healthy

# Existing member management
curl -s -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/members" | jq 'length'
# Expected: ≥ 0

# Existing role resolution
curl -s -H "Authorization: Bearer $EVE_TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/my-role" | jq '.role'
# Expected: "owner" (for org owner)

# Map page still loads
# Navigate to a project map page — verify no errors, grid renders

# Q&A, Releases, Changes pages still load
# Quick smoke check on each nav item

# Existing scenarios 01, 04, 08, 15 as representative sample
```

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Eve member search endpoint doesn't exist on k3d | Verify `GET /orgs/:id/members/search?q=...` returns 200 before starting WS3. If missing, fall back to `GET /orgs/:id/members` with client-side filtering. |
| GoTrue doesn't preserve `redirect_to` in magic-link emails | Check Mailpit for the actual link content in Scenario V3 step 4. If missing, pass redirect_to via the invite code lookup after SSO exchange. |
| Eden API proxy for org search introduces latency | The search call is fast (SQL prefix match, LIMIT 20). Debounce at 300ms on the frontend. |
| Claim-invite races with page render | `useClaimInvite` fires on mount. If the role hasn't resolved yet, the middleware fallback is `viewer`. After claim, refetch the role. Small flash is acceptable for first-time access. |
| Duplicate invite for same email | `project_invites` has `UNIQUE(project_id, email)`. The insert uses `ON CONFLICT ... DO UPDATE` to upsert. Safe. |

---

## What Does NOT Ship

| Feature | Reason |
|---------|--------|
| Bulk invites (CSV upload) | Not needed for MVP. Single invites cover the common case. |
| Custom email templates | GoTrue defaults work. Customize later via GoTrue env vars. |
| "Add all org members" button | Nice-to-have but not essential. Owners can add one by one. |
| Invite expiry cron job | `project_invites.status` has `expired` but no cleanup. Add later. |
| Notification when invite is claimed | `notifications` table exists but delivery isn't wired. Separate effort. |
| Resend invite | Cancel + re-invite achieves the same thing. |

---

## Exit Criteria

- [ ] Invite modal calls `/projects/:id/invite` (not `/members`)
- [ ] User ID field removed from all invite forms
- [ ] Inline invite form removed from MembersPage and MembersPanel
- [ ] Typeahead shows org member matches as user types
- [ ] "Add to Project" vs "Send Invite" button text reflects the action
- [ ] Success toast shows correct feedback (added vs invited)
- [ ] Pending invites section visible to owners on Members page
- [ ] Cancel pending invite works
- [ ] `?project=` deep-link redirects to project map
- [ ] `useClaimInvite` fires on project access, converts pending invite
- [ ] New user completing onboarding lands in Eden with correct role
- [ ] Non-owners cannot see invite controls or pending invites
- [ ] All 7 verification scenarios pass against local k3d stack
- [ ] Regression: existing scenarios 01, 04, 08, 15 still pass
