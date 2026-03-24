# Eden Phase 6a — Roles & Safety Net

> **Status**: Proposed
> **Date**: 2026-03-17
> **Phase**: 6a of 6a/6b/6c
> **Depends on**: Phases 1–4 (implemented)
> **Supersedes**: `phase-2.1-editor-viewer-permissions.md`
> **Parent plan**: `phase-6-ux-convergence.md`
> **Analysis**: `docs/reports/differential-analysis-eden-vs-prototype.md`
> **Estimated effort**: ~2 weeks (WS1 then WS2, sequential)
>
> **Delivers**: Three-tier role model (owner/editor/viewer), permission
> guards on all mutating endpoints, project-level member management, and
> the two-stage approval workflow where editors create draft items that
> owners must approve. After this phase, Eden is safe for multi-user
> collaboration.

---

## Why This Is First

Without roles, every other UX feature is unsafe. Drag-and-drop, inline
editing, changeset approval — all need to know *who* is allowed to do
*what*. The prototype's PM/Participant split proves this isn't optional.

Eden currently has roles in the auth token (`owner`/`admin`/`member`)
but **doesn't use them anywhere** — every authenticated user has full
destructive access.

---

## Verification Protocol

Both workstreams follow the same deploy → test → verify loop:

```
┌─────────────────────────────────────────────────────┐
│  1. Implement workstream locally                     │
│  2. Type-check + build (npm run build in api + web) │
│  3. Commit + push to main                            │
│  4. Deploy to sandbox:                               │
│       eve project sync                               │
│       eve env deploy sandbox --ref HEAD --repo-dir . │
│  5. Run the workstream's manual test scenario        │
│  6. If any criterion fails → fix → repeat from 1    │
│  7. Run regression on prior scenarios (01–14)        │
│  8. Mark workstream complete                         │
└─────────────────────────────────────────────────────┘
```

---

## WS1: Roles & Permissions

### Role Model

Three roles, mapped from the prototype but adapted for Eden:

| Role | Source | Can Read | Can Edit Structure | Can Approve |
|------|--------|----------|-------------------|-------------|
| **owner** | Project creator, org owner/admin | Y | Y | Y |
| **editor** | Explicitly promoted org members | Y | Y | N (creates drafts) |
| **viewer** | Org members by default | Y | N | N |

### Data Model

> **Why Eden has its own `project_members` table:** The Eve platform already
> has `project_memberships` (roles: `owner`/`admin`/`member`), but those
> govern who can *deploy and run jobs on the Eve project*. Eden's
> `project_members` govern who can *edit the story map* — an orthogonal
> concern with different role semantics (`editor`/`viewer` have no platform
> equivalent). These tables serve different access domains and are not
> duplicates. Do not attempt to merge them.

```sql
CREATE TABLE project_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT NOT NULL,
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL,
    email       TEXT,
    role        TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('owner', 'editor', 'viewer')),
    invited_by  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (project_id, user_id)
);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON project_members
    USING (org_id = current_setting('app.org_id', true));
CREATE INDEX idx_pm_project ON project_members(project_id);
CREATE INDEX idx_pm_user ON project_members(user_id);
```

### Role Resolution

```
resolveProjectRole(user, projectId):
    // Agents (Eve job tokens) bypass role resolution entirely — see Backend below
    if user.type === 'job_token' → null (skip role checks)

    // Org owners/admins are always project owners
    if user.role in ['owner', 'admin'] → 'owner'

    // Check explicit project membership
    row = query project_members WHERE project_id AND user_id
    if row → row.role
    else → 'viewer'
```

### Backend

1. **ProjectRoleMiddleware** — runs after AuthGuard on project-scoped routes,
   attaches `req.projectRole` to every request
2. **EditorGuard** — 403 if `req.projectRole === 'viewer'` (blocks writes)
3. **OwnerGuard** — 403 if `req.projectRole !== 'owner'` (blocks approvals,
   member management, project deletion)
4. **Agent bypass** — agents propose via changesets, humans review. All three
   guards must check the token type and pass through agent requests:

```typescript
// In ProjectRoleMiddleware — skip role resolution for agents
if (req.user?.type === 'job_token') {
    req.projectRole = null; // no role — agent bypass
    return next();
}

// In EditorGuard and OwnerGuard — always allow agents
if (req.user?.type === 'job_token') return true;
```

> **Why `req.user.type`?** Eden's `main.ts` bridges Eve job tokens into
> `req.user` with `type: agent.type` (value: `'job_token'`). This is the
> existing mechanism — no new auth plumbing needed. See `main.ts:61-72`.

### Frontend

**`useProjectRole()` hook** returns `'owner' | 'editor' | 'viewer' | null`

**Conditional rendering:**

| Component | Owner | Editor | Viewer |
|-----------|-------|--------|--------|
| Map structure editing (drag, inline edit) | Y | Y | N |
| Add activity/step/task buttons | Y | Y | N |
| Changeset accept/reject | Y | N (creates draft) | N (read-only) |
| "Approve" button on draft items | Y | N | N |
| Source upload | Y | Y | N |
| Member management | Y | N | N |
| Chat (map-chat agent) | Y | Y | Y (read-only history) |
| Export, search, browse | Y | Y | Y |

### API Endpoints

```
GET    /projects/:id/members           List all (implicit + explicit)
POST   /projects/:id/members           Invite (owner only)
PATCH  /project-members/:id            Change role (owner only)
DELETE /project-members/:id            Remove (owner only)
GET    /projects/:id/my-role           Current user's resolved role
```

### Deliverables

- [ ] Migration: `project_members` table
- [ ] `ProjectRoleMiddleware` + `EditorGuard` + `OwnerGuard`
- [ ] Apply guards to all mutating endpoints
- [ ] Member management API (4 endpoints)
- [ ] `useProjectRole()` hook
- [ ] Conditional UI rendering across all pages
- [ ] Members panel in project settings

### Verification Loop → Scenario 15

**Deploy:**
```bash
git push origin main
eve env deploy sandbox --ref HEAD --repo-dir .
```

**Run:** `tests/manual/scenarios/15-roles-permissions.md`

**Critical checks:**
1. `GET /projects/:id/my-role` returns correct role for org admin vs org member
2. `POST /projects/:id/tasks` returns 403 for viewer token
3. `POST /projects/:id/tasks` returns 201 for editor token
4. `POST /projects/:id/members` returns 403 for editor, 201 for owner
5. Agent service principal can still create changesets (no 403)
6. UI hides edit controls for viewers, shows them for editors/owners

**Regression:** Run scenarios 01–07 to verify existing CRUD + UI still works.
Pay special attention to scenario 04 (changesets) — the EditorGuard must not
block the existing accept/reject flow for org admins.

**Full regression with agents:** Run scenarios 08–14 to verify service
principal tokens bypass role checks. This is the highest-risk regression
for WS1.

---

## WS2: Two-Stage Approval Workflow

> Depends on WS1. Builds on Eden's existing changeset model.

### Concept

When an **editor** accepts items from an AI changeset, the items aren't
applied immediately. Instead they become **draft items** visible on the
map with "Pending Review" badges. The **owner** then approves or rejects
them from the map or from a dedicated queue.

This creates the prototype's two-stage review: AI → editor review → owner
approval.

### Data Model Changes

```sql
ALTER TABLE changeset_items ADD COLUMN approval_status TEXT
    CHECK (approval_status IN ('applied', 'pending_approval', 'owner_approved', 'owner_rejected'))
    DEFAULT 'applied';

ALTER TABLE changeset_items ADD COLUMN approved_by TEXT;
ALTER TABLE changeset_items ADD COLUMN approved_at TIMESTAMPTZ;

ALTER TABLE tasks ADD COLUMN approval TEXT
    CHECK (approval IN ('approved', 'preview'))
    DEFAULT 'approved';
```

### Changeset Accept Flow (Modified)

```
Current flow:
    User clicks "Accept" on changeset item → applyItem() → done

New flow:
    Owner clicks "Accept" → applyItem() → task.approval = 'approved' → done
    Editor clicks "Accept" → applyItem() → task.approval = 'preview'
                           → changeset_item.approval_status = 'pending_approval'
                           → visible on map with badge → awaits owner
```

### Owner Approval Queue

```
GET  /projects/:id/pending-approvals   List items with approval_status='pending_approval'
POST /projects/:id/approve-items       Bulk approve: { item_ids: [] }
POST /projects/:id/reject-items        Bulk reject: { item_ids: [] }
```

### On-Map Approval UX

Task cards with `approval = 'preview'` show:

- Golden "Pending Review" badge (prototype pattern)
- For owners: "Approve" / "Reject" buttons directly on the card
- For editors: "Awaiting Approval" label (no action buttons)

Header shows **pending count badge** linking to filtered view.

### Accept Animation

- 2-second orange glow animation on the affected card
- CSS: `@keyframes flash-accept { 0% { box-shadow: 0 0 0 4px #f97316; } 100% { box-shadow: none; } }`

### Deliverables

- [ ] Migration: `approval_status` on changeset_items, `approval` on tasks
- [ ] Modify `applyItem()` to check `req.projectRole` and set approval accordingly
- [ ] Pending approvals API (3 endpoints)
- [ ] "Pending Review" badge on TaskCard
- [ ] On-card Approve/Reject buttons (owner only)
- [ ] Pending count badge in header
- [ ] Accept flash animation (CSS keyframes)
- [ ] Bulk approve/reject UI

### Verification Loop → Scenario 16

**Deploy:**
```bash
git push origin main
eve env deploy sandbox --ref HEAD --repo-dir .
```

**Run:** `tests/manual/scenarios/16-two-stage-approval.md`

**Critical checks:**
1. Create changeset via API, accept as editor → items get `approval_status='pending_approval'`
2. Tasks appear on map with `approval='preview'`
3. `GET /projects/:id/pending-approvals` returns the pending items
4. Owner approves → task `approval` changes to `'approved'`, card flash animates
5. Owner rejects → task removed from map, `approval_status='owner_rejected'`
6. Bulk approve/reject works for multiple items
7. UI: "Pending Review" badge visible on preview cards
8. UI: pending count shows in header for owner
9. UI: editor sees "Awaiting Approval" (no approve button)

**Regression:** Run scenarios 01–05 (API) + 04 specifically (existing changeset
flow must still work for owners — immediate apply, no preview step).

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Role enforcement breaks agent workflows | Service principals bypass role checks; test agent flows after WS1 |
| Two-stage approval adds friction | Make it opt-in per project (default: owner-only projects skip approval queue) |
| Migration adds columns to hot tables | `approval_status` and `approval` have defaults, no backfill needed |

---

## Exit Criteria

Phase 6a is complete when:

- [ ] **Scenario 15** passes — roles enforced, guards work, UI conditional
- [ ] **Scenario 16** passes — two-stage approval, preview badges, on-card approve
- [ ] **Scenarios 01–14** regression passes — no existing functionality broken
- [ ] Agent workflows (08–14) still function with role enforcement

**Phase 6a = Eden is safe for multi-user collaboration.**
