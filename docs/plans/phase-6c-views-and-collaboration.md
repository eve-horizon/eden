# Eden Phase 6c — Views & Collaboration

> **Status**: Proposed
> **Date**: 2026-03-17
> **Phase**: 6c of 6a/6b/6c
> **Depends on**: Phase 6a (roles for gating), Phase 6b (map editing for full lifecycle)
> **Parent plan**: `phase-6-ux-convergence.md`
> **Analysis**: `docs/reports/differential-analysis-eden-vs-prototype.md`
> **Estimated effort**: ~2 weeks (WS5 + WS6 in parallel)
>
> **Delivers**: Named map views (saved filter tabs), visual release slices
> below the map grid, in-app notification system, project-level member
> management UI, and role-specific onboarding walkthrough. After this phase,
> Eden is a complete multi-user collaboration tool with UX parity to the
> prototype.

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

## WS5: Map Views & Release Slices

### 5a. Named Map Views (Tabs)

**What:** Multiple named views of the same project, each showing a
different arrangement of the shared task pool. Tabs appear below the
header, above the persona tabs.

**Data model:**

```sql
CREATE TABLE map_views (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT NOT NULL,
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    description TEXT,
    filter      JSONB,     -- { personas: [], activities: [], releases: [] }
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (project_id, slug)
);

ALTER TABLE map_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON map_views
    USING (org_id = current_setting('app.org_id', true));
```

**Approach:** Saved Filters (Option A). Each view is a saved combination of
persona tab + activity filter + release filter. Clicking a tab applies
those filters. All views share the same task pool and grid structure.

**API:**

```
GET    /projects/:id/views         List views
POST   /projects/:id/views         Create view (editor+)
PATCH  /views/:id                  Update view
DELETE /views/:id                  Delete view (owner only)
```

**Frontend:**

```
components/map/
    MapViewTabs.tsx          # Horizontal tabs below header
```

**Keyboard shortcut:** 1-9 switches between views (matches prototype).

### 5b. Release Slices on Map

**What:** Below the story map grid, horizontal release bands where users
can see (and drag) tasks assigned to each release.

**Component:**

```
components/map/
    ReleaseSlices.tsx         # Container below StoryMap
    ReleaseSlice.tsx          # Single release band with task pills
```

**Layout:**
```
┌─── Story Map Grid ───────────────────────────────────┐
│  activities → steps → tasks                           │
└──────────────────────────────────────────────────────┘
┌─── Release Slices ───────────────────────────────────┐
│  ┌─ v1.0 (March) ─────────────────────────────────┐  │
│  │ TSK-1.1.1  TSK-1.2.1  TSK-2.1.1  (+3 more)    │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─ Backlog ──────────────────────────────────────┐  │
│  │ TSK-4.1.1  TSK-4.2.1  TSK-5.1.1  (+12 more)   │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**Interaction:**
- Drag task from grid → release slice: assigns `release_id`
- Drag task between slices: reassigns release
- Click release header: collapse/expand
- Create/archive/rename releases inline

**API:** Uses existing release endpoints:
```
POST   /releases/:id/tasks         { task_ids: [] }
DELETE /releases/:id/tasks/:taskId
```

**Role gate:** Editor + Owner can drag. Viewer sees read-only slices.

### Deliverables

- [ ] Migration: `map_views` table
- [ ] Map views API (4 endpoints)
- [ ] `MapViewTabs` component
- [ ] `ReleaseSlices` + `ReleaseSlice` components
- [ ] Drag task → release interaction
- [ ] Inline release CRUD
- [ ] Keyboard shortcuts for view switching

### Verification Loop → Scenario 19

**Deploy:**
```bash
git push origin main
eve env deploy sandbox --ref HEAD --repo-dir .
```

**Run:** `tests/manual/scenarios/19-map-views-releases.md`

**Critical checks:**
1. `POST /projects/:id/views` creates a named view with filter config
2. `GET /projects/:id/views` lists all views for the project
3. Switching view tab applies saved filters (persona + activity + release)
4. Keyboard shortcut 1–9 switches between views
5. Release slices render below the map grid
6. Each slice shows correct task count and task pills
7. Drag task from grid → release slice assigns `release_id` via API
8. Drag task between slices reassigns release
9. Inline create release → new slice appears
10. Collapse/expand release slice works
11. Viewer cannot drag tasks into slices

**Regression:** Run scenario 03 (releases + questions) to verify existing
release CRUD still works. Run scenario 06 (story map UI) to verify grid.

---

## WS6: Collaboration

### 6a. Notification System

**What:** In-app notifications for async workflow results — changeset
created, review completed, question answered, pipeline finished.

**Data model:**

```sql
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT NOT NULL,
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL,
    type        TEXT NOT NULL,    -- 'changeset_created', 'review_complete',
                                 -- 'question_answered', 'pipeline_done',
                                 -- 'approval_requested', 'approval_decided'
    title       TEXT NOT NULL,
    body        TEXT,
    entity_type TEXT,             -- 'changeset', 'review', 'question', 'source'
    entity_id   UUID,
    read        BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON notifications
    USING (org_id = current_setting('app.org_id', true));
CREATE INDEX idx_notif_user ON notifications(user_id, read, created_at DESC);
```

**Backend:**
- `NotificationsService` creates notifications when workflows complete
- Hooks into existing event handlers (changeset create, review complete, etc.)
- Also hooks into Phase 6a's two-stage approval flow: when an editor accepts
  items as preview, notify the project owner(s) (`approval_requested`); when
  an owner approves/rejects, notify the editor (`approval_decided`)
- **Recipient resolution:** notifications target specific users, not broadcast.
  Use `project_members` (from 6a) to find owners for approval notifications.
- API: `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`

**Frontend:**
```
components/layout/
    NotificationBell.tsx      # Bell icon in header with unread count
    NotificationList.tsx      # Dropdown list of recent notifications
```

- Polls every 30 seconds (MVP — the Eve platform does not currently provide
  SSE/WebSocket push channels for deployed apps; if it adds one later, swap
  polling for push with no backend changes)
- Click notification → navigates to relevant entity via routing map:
  | `entity_type` | Route |
  |---------------|-------|
  | `changeset` | `/projects/:id/changesets/:entityId` |
  | `review` | `/projects/:id/reviews/:entityId` |
  | `question` | `/projects/:id?question=:entityId` |
  | `source` | `/projects/:id/sources` |
- "Mark all read" action

### 6b. Member Management UI

**What:** Members panel in project settings for inviting and managing
project-level roles. (API from Phase 6a/WS1, UI here.)

**Component:**

```
components/projects/
    MembersPanel.tsx          # Member list with role dropdowns
    InviteModal.tsx           # Email input + role picker
```

**Features:**
- List all members (implicit owners shown with lock icon)
- Role dropdown for explicit members (owner can change)
- Remove button for explicit members
- "Invite" button opens modal: email + role picker
- Validation: invitee must be org member (Eden doesn't create Eve users)

### 6c. Onboarding Walkthrough

**What:** Step-by-step guided tour on first visit, with role-specific
sequences.

**Component:**

```
components/onboarding/
    Walkthrough.tsx           # Overlay tooltip sequence
    WalkthroughTrigger.tsx    # "?" button to replay
```

**Owner walkthrough (8 steps):**
1. Welcome to Eden — your AI-powered story map
2. The map grid — activities, steps, tasks
3. Persona tabs — filter by user type
4. Chat panel — talk to AI, propose changes
5. Changesets — review AI proposals
6. Approval queue — approve editor suggestions
7. Members — invite your team
8. Sources — upload documents for AI analysis

**Editor walkthrough (6 steps):**
1. Welcome — you can edit and suggest changes
2. The map grid — browse and edit
3. Chat — suggest changes via AI
4. Your changes appear as drafts for owner review
5. Questions — raise and answer questions
6. Sources — upload documents

**Viewer walkthrough (4 steps):**
1. Welcome — explore the story map
2. Browse activities, steps, and tasks
3. Questions — read and contribute answers
4. Export — download the map data

**Trigger:** Shows on first visit (tracked in localStorage). "?" button
in footer to replay anytime.

### Deliverables

- [ ] Migration: `notifications` table
- [ ] `NotificationsService` with workflow hooks
- [ ] Notifications API (3 endpoints)
- [ ] `NotificationBell` + `NotificationList` components
- [ ] `MembersPanel` + `InviteModal` components
- [ ] `Walkthrough` + `WalkthroughTrigger` components
- [ ] Role-specific walkthrough sequences
- [ ] localStorage first-visit tracking

### Verification Loop → Scenario 20

**Deploy:**
```bash
git push origin main
eve env deploy sandbox --ref HEAD --repo-dir .
```

**Run:** `tests/manual/scenarios/20-collaboration.md`

**Critical checks:**
1. `GET /notifications` returns empty list initially
2. Create changeset → notification appears for project owner
3. `PATCH /notifications/:id/read` marks as read
4. `POST /notifications/read-all` marks all as read
5. UI: bell icon shows unread count
6. UI: click bell → dropdown shows recent notifications
7. UI: click notification → navigates to referenced entity
8. Members panel lists all members with correct roles
9. Invite member by email → new row appears with assigned role
10. Change member role via dropdown → API updates
11. Remove member → row disappears
12. Walkthrough plays on first visit (clear localStorage, reload)
13. "?" button replays walkthrough
14. Owner sees 8-step sequence, viewer sees 4-step sequence

**Regression:** Run scenario 07 (UI pages) to verify header/nav still
renders correctly with the notification bell added.

---

## Phase 6 Full Lifecycle → Scenario 21

After all three phases (6a, 6b, 6c) pass individually, run the integration
scenario that exercises the complete flow end-to-end:

```
1. Create project via wizard (6b) → AI generates initial map
2. Owner accepts generated changeset → populated map
3. Owner invites editor (6a)
4. Editor uses chat to propose changes → changeset created
5. Editor accepts changeset → items appear as "preview" (6a)
6. Owner sees notification (6c) + pending count in header
7. Owner approves on-card (6a) → flash animation
8. Editor drags task to different step (6b) → audit entry
9. Editor inline-edits activity title (6b)
10. Owner creates named map view (6c)
11. Owner drags tasks into release slices (6c)
12. Verify map state, audit trail, notifications
```

**Run:** `tests/manual/scenarios/21-phase6-full-lifecycle.md`

This scenario is the **final gate** before Phase 6 is marked complete.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Named map views add data model complexity | Start with Option A (saved filters) — no schema changes to core tables |
| Notification spam | Rate-limit: max 1 notification per entity per 5 minutes; batch similar events |
| Walkthrough blocks interaction | Make dismissible at any step; never auto-show after first completion |

---

## What Deliberately Does NOT Ship

| Feature | Reason |
|---------|--------|
| Local LLM support | Phase 5 scope (Qwen 3.5) |
| Audio transcription | Low priority, niche use case |
| AI settings modal | Eden uses Eve agents, not browser-side API keys |
| PRD generation | Useful but not core — revisit after 6a-6c ship |
| Real-time collab editing | Future scope, requires CRDT/OT infrastructure |

---

## Exit Criteria

Phase 6c is complete when:

- [ ] **Scenario 19** passes — named views, release slices, drag-to-assign
- [ ] **Scenario 20** passes — notifications, member management, walkthrough
- [ ] **Scenario 21** passes — full lifecycle end-to-end integration
- [ ] **Scenarios 01–14** regression passes — no existing functionality broken

**Phase 6c = Eden UX parity with prototype, on production architecture.**
**Phase 6 complete.**
