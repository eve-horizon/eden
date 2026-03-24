# Eden Phase 6b — Interactive Map

> **Status**: Proposed
> **Date**: 2026-03-17
> **Phase**: 6b of 6a/6b/6c
> **Depends on**: Phase 6a (roles must exist for gating, but API work can start in parallel)
> **Parent plan**: `phase-6-ux-convergence.md`
> **Analysis**: `docs/reports/differential-analysis-eden-vs-prototype.md`
> **Estimated effort**: ~2 weeks (WS3 + WS4 in parallel)
>
> **Delivers**: AI-powered project wizard that generates an initial story
> map from a description, drag-and-drop reordering of tasks/steps/activities,
> inline click-to-edit on all titles, and on-card quick actions. After this
> phase, Eden's map is fully interactive — not just a read-only grid.

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

## WS3: Project Wizard

### Concept

Replace the bare "Create Project" form with a guided wizard that captures
project context and uses AI to generate an initial story map structure.
The wizard output goes through the existing changeset review flow.

### Wizard Flow

```
Step 1: Project Basics
    - Name (required)
    - Description (optional, textarea)

Step 2: Context (optional but encouraged)
    - Target audience / personas (textarea)
    - Key capabilities / goals (textarea)
    - Constraints or requirements (textarea)

Step 3: Generate
    - "Generate Story Map" button
    - Calls Eve agent to produce initial structure
    - Shows loading state with progress indicator

Step 4: Review
    - Opens ChangesetReviewModal with the generated structure
    - User can accept/reject individual items
    - On accept → project created with initial map data
```

### Backend

```
POST /projects/:id/generate-map
    Body: { description, audience, capabilities, constraints }
    → Creates an Eve job targeting the map-generator agent
    → Returns { job_id } for polling

GET  /projects/:id/generate-map/status
    → Polls Eve job status via GET /projects/{eveProjectId}/jobs/{jobId}
    → Returns { status, changeset_id } when complete
```

#### Eve Platform Integration

Eden's API creates the job by calling the Eve platform directly:

```typescript
// Eden API → Eve API (authenticated with EVE_SERVICE_TOKEN)
const response = await fetch(`${EVE_API_URL}/projects/${eveProjectId}/jobs`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${EVE_SERVICE_TOKEN}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        agent: 'map-generator',          // dedicated agent (see below)
        title: `Generate map: ${name}`,
        message: buildWizardPrompt({ description, audience, capabilities, constraints }),
    }),
});
const { id: jobId } = await response.json();
```

This is a **third invocation pattern** for Eden (alongside event-triggered
workflows and chat-based execution). It uses direct job creation because:
- The wizard needs a `job_id` to poll for completion
- Event-triggered workflows are fire-and-forget (no job ID returned to caller)
- Chat-based execution is for conversational flows, not one-shot generation

The agent runs with `with_apis: [api]` so it can call Eden's changeset API
to create the map structure. On completion, Eden's polling endpoint reads the
job result and extracts the `changeset_id` from the agent's output.

**Agent:** Create a dedicated `map-generator` agent (not pm-coordinator).
The coordinator is designed for multi-turn triage; the wizard needs a
single-shot structured output. Add to `eve/agents.yaml`:

```yaml
map-generator:
    slug: map-generator
    name: "Map Generator"
    skill: map-generator
    harness_profile: expert
    with_apis:
        - service: api
    policies:
        permission_policy: yolo
        git: { commit: never, push: never }
```

The agent receives the project context and produces a changeset containing:
- 3-6 personas with colors
- 4-8 activities with descriptions
- 2-5 steps per activity
- 1-3 tasks per step with user stories and acceptance criteria
- 5-10 initial questions

### Frontend

```
components/projects/
    ProjectWizard.tsx       # Multi-step form (Steps 1-3)
    WizardStep.tsx          # Individual step container
    GenerateProgress.tsx    # Loading state with polling
```

Triggered from ProjectsPage "Create Project" button. Replaces the current
inline form with a modal wizard.

### Deliverables

- [ ] `ProjectWizard` component (multi-step form)
- [ ] `POST /projects/:id/generate-map` endpoint
- [ ] Agent skill or prompt for initial map generation
- [ ] Changeset creation from agent output
- [ ] Integration with existing `ChangesetReviewModal`
- [ ] Loading/progress UI during generation

### Verification Loop → Scenario 17

**Deploy:**
```bash
git push origin main
eve project sync
eve agents sync --local --allow-dirty
eve env deploy sandbox --ref HEAD --repo-dir .
```

**Run:** `tests/manual/scenarios/17-project-wizard.md`

**Critical checks:**
1. Wizard UI renders with multi-step form (name, context, generate)
2. `POST /projects/:id/generate-map` creates Eve job and returns job ID
3. Polling `GET /projects/:id/generate-map/status` shows progress
4. On completion, a changeset is created with personas, activities, steps, tasks
5. ChangesetReviewModal opens with generated structure
6. Accept creates populated map (verify via `GET /projects/:id/map`)
7. Generated map has ≥3 personas, ≥3 activities, ≥10 tasks, ≥5 questions
8. Reject returns to wizard (can regenerate)

**Regression:** Run scenario 01 (project creation still works via basic form
for users who skip the wizard). Run scenarios 08–09 to verify agent
infrastructure still works.

---

## WS4: Map Editing

Three capabilities: drag-and-drop, inline editing, on-card actions.

### 4a. Drag-and-Drop Reordering

**What:** Users can reorganize the map by dragging:
- Tasks between steps (reassign to different column)
- Tasks within a step (reorder)
- Steps between activities (move column)
- Activities (reorder rows)

**Implementation:** Native HTML5 Drag and Drop (no library — matches
prototype approach).

```
StoryMap.tsx additions:
    - dragStart/dragOver/dragEnd handlers for tasks, steps, activities
    - Visual feedback: drag ghost, drop target highlight
    - On drop: PATCH API call + optimistic UI update
```

**API endpoints:**

```
PATCH /tasks/:id/move           { step_id, sort_order }
PATCH /steps/:id/move           { activity_id, sort_order }
PATCH /activities/:id/reorder   { sort_order }
```

Each endpoint:
- Validates the move is legal (same project, valid target)
- Updates sort_order for affected siblings
- Creates audit_log entry
- Returns updated entity

**Role gate:** Editor + Owner only (viewer sees no drag handles).

### 4b. Inline Title Editing

**Component:** `InlineEdit.tsx` (~70 lines)

```typescript
interface InlineEditProps {
    value: string;
    onSave: (value: string) => Promise<void>;
    disabled?: boolean;    // true for viewers
    element?: 'h3' | 'h4' | 'span';
}
```

**Behavior:**
- Click text → transforms to input field (same size/font)
- Enter or blur → saves via PATCH endpoint
- Escape → cancels, restores original
- Optimistic UI: shows new value immediately, reverts on error

**Applied to:**
- Activity names in `ActivityRow.tsx`
- Step names in `StepHeader.tsx`
- Task titles in `TaskCard.tsx` (collapsed view)

**Role gate:** Editor + Owner only. Viewers see plain text (no hover cursor).

### 4c. On-Card Quick Actions

**For owners (when Phase 6a ships):**
- "Approve" / "Reject" on preview cards
- Quick status change (current → proposed → discontinued)

**For editors:**
- Quick question: "Ask Question" opens QuestionModal pre-linked to task
- Quick edit: expand card inline (already exists, just needs polish)

### Deliverables

- [ ] HTML5 drag-and-drop in StoryMap (tasks, steps, activities)
- [ ] Move/reorder API endpoints (3 endpoints)
- [ ] `InlineEdit` component
- [ ] Inline editing wired to activities, steps, tasks
- [ ] On-card action buttons
- [ ] Audit trail for all structural changes
- [ ] Role gating (when Phase 6a ships)

### Verification Loop → Scenario 18

**Deploy:**
```bash
git push origin main
eve env deploy sandbox --ref HEAD --repo-dir .
```

**Run:** `tests/manual/scenarios/18-map-editing.md`

**Critical checks:**
1. `PATCH /tasks/:id/move` moves task to different step, returns updated entity
2. `PATCH /steps/:id/move` moves step to different activity
3. `PATCH /activities/:id/reorder` changes activity sort order
4. Audit log records all move/reorder operations
5. Sort order of sibling entities updates correctly (no gaps, no collisions)
6. UI: drag task between steps → card moves, API called, map refreshes
7. UI: drag activity row → row reorders, grid updates
8. UI: click activity title → input appears, Enter saves, Escape cancels
9. UI: click step title → inline edit works
10. UI: click task title → inline edit works
11. UI: viewer sees no drag handles, no edit cursor on titles
12. Map endpoint returns correct sort order after moves

**Regression:** Run scenario 02 (CRUD) to verify standard task/step/activity
creation still works. Run scenario 06 (story map UI) to verify grid rendering.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Drag-and-drop performance on large maps | Use native HTML5 drag, throttle DOM updates, test with 500+ tasks |
| Project wizard agent quality | Use existing pm-coordinator prompt patterns; iterate on system prompt |
| Sort order conflicts on concurrent edits | Use gapless integer ordering with atomic increment; audit resolves ties |
| Inline edit saves on blur → accidental edits | Require meaningful change (diff check before PATCH) |

---

## Exit Criteria

Phase 6b is complete when:

- [ ] **Scenario 17** passes — wizard generates map, changeset review, populated project
- [ ] **Scenario 18** passes — drag-and-drop, inline edit, audit trail, role gating
- [ ] **Scenarios 01–07** regression passes — API and UI still work
- [ ] **Scenarios 08–09** regression passes — agent infrastructure unaffected

**Phase 6b = Eden's map is fully interactive, not just a read-only grid.**
