# Differential Analysis: Eden (Eve Horizon) vs Prototype (incept5/eden)

**Date:** 2026-03-17
**Repos compared:**
- **Eden** — `/Users/adam/dev/eve-horizon/eden` (NestJS + React + PostgreSQL + 14 Eve agents)
- **Prototype** — `/Users/adam/dev/incept5/eden` (React SPA + Supabase, 2 commits)

---

## Executive Summary

Eden is a **production-grade, agent-orchestrated platform** with a proper API layer, relational database, 14 AI agents, and event-driven workflows. The Prototype is a **client-heavy SPA** with Supabase backend, browser-side AI calls, and a rich set of UX features developed for rapid iteration. Each has capabilities the other lacks.

**Key takeaway:** The Prototype's two most important innovations are its **role-based access model** (PM controls structure, participants suggest via drafts) and its **two-stage approval workflow** (BA reviews AI output → PM approves BA selections). These are more critical than any individual UI feature. Beyond roles, the Prototype has UX innovations (project wizard, inline editing, drag-and-drop, release slices, walkthrough, PRD generation) that Eden should adopt. Eden has the entire intelligence infrastructure (agents, changesets, pipelines, reviews, audit, multi-org RLS) that the Prototype can't replicate client-side.

---

## Architecture Comparison

| Dimension | Eden | Prototype |
|-----------|------|-----------|
| **Frontend** | React 18 + Vite + Tailwind | React 19 + Vite + plain CSS (923-line App.css) |
| **Backend** | NestJS 11 (17 modules) | None (Supabase SDK direct) |
| **Database** | PostgreSQL 16 (15 relational tables, RLS) | Supabase PostgreSQL (3 tables, JSONB blobs) |
| **AI integration** | 14 Eve Horizon agents (server-side) | Browser-side Anthropic API + local LLM fallback |
| **Auth** | Eve SSO + job tokens | Supabase magic link OTP |
| **State management** | React hooks + server state | 4 React Contexts (Auth, Project, Map, Walkthrough) |
| **Data model** | Normalized (15 tables) | Denormalized (JSONB: map_data, evolved_state, responses) |
| **Deployment** | Eve Horizon platform (Docker, S3, pipelines) | Supabase hosted + Vite static |
| **Routing** | React Router (8 routes) | No router (custom flow: Login → Projects → Map) |

---

## Feature-by-Feature Comparison

### What Both Have

| Feature | Eden | Prototype | Notes |
|---------|------|-----------|-------|
| Story map grid | CSS Grid, persona tabs, filters | CSS Grid, persona tabs, role filters | Both render activities → steps → tasks |
| Task cards | Expandable with metadata | Expandable with approval badges | Different detail views |
| Persona filtering | Server-side (query param) | Client-side (context state) | Eden refetches, Prototype filters in-memory |
| Role filtering | Client-side pill highlights | Client-side legend toggle | Same UX pattern |
| Activity filtering | Checkbox bar | Checkbox bar | Nearly identical |
| Mini-map | Draggable viewport, collapsible | Viewport indicator, click-to-scroll | Eden has drag; Prototype has click |
| Questions / Q&A | Full CRUD, cross-cutting panel | Modal + threaded responses | Eden has dedicated page; Prototype is modal-only |
| Chat panel | Eve gateway proxy, polling | Browser-side Claude API, streaming | Eden is agent-routed; Prototype is direct |
| Changesets | Full lifecycle (accept/reject per item) | AI-generated, ReviewPanel approval | Same concept, different implementation depth |
| Document upload | S3 + Eve ingest pipeline | Client-side extraction (PDF/DOCX/audio) | Eden is server-side; Prototype is browser-side |
| Release tracking | Dedicated page + CRUD | Release slices on map view | Different UX approach |
| Export | JSON + Markdown + CSV + Print | N/A (map data is JSONB blob) | Eden has formal export |
| Multi-project | Project list page | ProjectSelector with filter/delete | Both support multiple projects |

---

## What the Prototype Has That Eden Doesn't

### 1. Project Wizard (AI-Generated Initial Map)
**Component:** `ProjectWizard.tsx` (266 lines)
**What it does:** Guided new-project flow that captures name, audience, purpose, and capabilities — then calls Claude to generate an initial story map structure. The AI response goes through `ReviewPanel` for approval before becoming the project's base map.
**Why it matters:** Eden's project creation is a bare form (name only). The wizard provides a dramatically better onboarding experience and shows the AI value proposition immediately.
**Priority: HIGH**

### 2. Drag-and-Drop Reordering (Tasks, Steps, Activities)
**Component:** `StoryGrid.tsx` (501 lines) — native HTML5 drag
**What it does:** Users can:
- Drag tasks between steps (reassign to different column)
- Reorder tasks within a step
- Drag steps between activities
- Reorder activities
**Why it matters:** Eden's grid is read-only for layout — you can edit task content but can't reorganize the map structure visually. This is a core story mapping interaction.
**Priority: HIGH**

### 3. Release Slices (Visual Sprint Planning)
**Component:** `ReleaseSlices.tsx` (304 lines)
**What it does:** Below the story map grid, release bands appear as horizontal slices. Users drag tasks from the map into release slices to plan sprints. Supports create/archive/unarchive releases with task assignment tracking.
**Why it matters:** Eden has a separate Releases page with a table view. The Prototype's visual approach is more intuitive for sprint planning — it keeps the map context visible while assigning tasks to releases.
**Priority: MEDIUM**

### 4. Interactive Walkthrough / Onboarding
**Components:** `Walkthrough.tsx` (241 lines) + `WalkthroughTrigger.tsx` (38 lines)
**What it does:** Step-by-step guided tour highlighting key UI areas — tooltip overlays, sequenced steps, persistent trigger button to replay.
**Why it matters:** Eden has no onboarding. For a complex tool like a story map, first-use guidance is critical for adoption.
**Priority: MEDIUM**

### 5. PRD Generation with Caching
**Component:** `PRDModal.tsx` (178 lines)
**What it does:** AI generates a full Product Requirements Document from the current map state. Results are cached in Supabase (`prd_cache` column) to avoid regeneration. Displayed in a modal with rich text rendering.
**Why it matters:** This turns the story map from a planning tool into a deliverable generator. PMs can share formal PRDs derived directly from the living map.
**Priority: MEDIUM**

### 6. Inline Title Editing (Activities, Steps, Tasks)
**Component:** `InlineEdit.tsx` (69 lines)
**What it does:** Click any activity, step, or task title to edit in place. Saves on blur or Enter, cancels on Escape.
**Why it matters:** Eden requires opening an expanded card/form to edit. Inline editing is faster and more natural for quick refinements — a core story mapping workflow.
**Priority: HIGH**

### 7. Settings Modal (AI Model Configuration)
**Component:** `SettingsModal.tsx` (176 lines)
**What it does:** Users can choose between Claude and a local LLM, set API keys, configure temperature and max tokens, and specify a local model URL.
**Why it matters:** Eden's AI is fully server-side (Eve agents) so users have no model configuration. However, a settings panel for other preferences (display density, notification prefs, default filters) could be valuable.
**Priority: LOW** (different architecture)

### 8. Local LLM Support
**Service:** `ai.ts` — `callLocalAPI()` function
**What it does:** Falls back to any OpenAI-compatible endpoint (`/v1/chat/completions`) when Claude isn't available. Supports streaming.
**Why it matters:** Eden uses Eve agents exclusively. Private/local model support is on the Phase 5 roadmap (Qwen 3.5) but isn't implemented yet.
**Priority: LOW** (Phase 5 concern)

### 9. Audio Transcription
**Service:** `fileExtractor.ts` — `transcribeWithMlxAudio()`
**What it does:** Sends audio files to a local mlx-audio server for speech-to-text, then includes the transcript in chat context.
**Why it matters:** Niche but useful for PMs recording stakeholder interviews. Eden's ingestion pipeline handles PDF/DOCX but not audio.
**Priority: LOW**

### 10. Notification System
**Component:** `NotificationBell.tsx` (93 lines) + Supabase table
**What it does:** Bell icon with unread count, notification list with read/dismiss actions. Backed by a dedicated `notifications` table.
**Why it matters:** Eden has no in-app notification system. As agent workflows produce results (changesets, reviews, answered questions), users need to be notified.
**Priority: MEDIUM**

### 11. Member Management + Email Invites
**Component:** `MembersPanel.tsx` (120 lines) + Supabase Edge Function
**What it does:** Add/remove project members by email with role assignment (BA, engineer). Sends invite emails via SMTP through a Deno edge function.
**Why it matters:** Eden relies on Eve's org-level access. Project-level member management with invitations enables better collaboration.
**Priority: MEDIUM**

### 12. Multiple Named Maps (Tabs)
**Component:** `MapTabs.tsx` (62 lines)
**What it does:** Horizontal tabs switch between named map views (platform, CU, MR, DI, MD, EST, PM, PS, main) — all sharing the same task pool but showing different arrangements.
**Why it matters:** Eden has one map per project. Named views allow different stakeholders to see relevant slices without creating separate projects.
**Priority: MEDIUM**

### 13. Evolved State / Reset Capability
**Context:** `MapContext` — `evolved_state` JSONB column
**What it does:** AI changes are stored as a layer on top of the base `map_data`. Users can reset to original state, discarding all AI-proposed modifications.
**Why it matters:** Eden's changeset model handles this differently (accepted changes are permanent, rejected are discarded). But the ability to "undo all AI changes" is a useful safety net.
**Priority: LOW** (Eden's changeset model is more granular)

### 14. Preview Mode (Proposed vs Approved Tasks)
**Feature:** Task cards show approval status badges, can be filtered
**What it does:** Tasks added by AI show a "preview" badge. The `Hide 2.0` toggle filters them out. Users can approve individual tasks to make them permanent.
**Why it matters:** Eden has the `Hide Proposed` toggle on the map, but the per-task approval workflow on the grid itself is more fluid than navigating to the Changesets page.
**Priority: MEDIUM**

### 15. Keyboard Shortcuts for Map Navigation
**Feature:** Keys 1-9 switch between map tabs
**What it matters:** Eden has a `useKeyboardShortcuts` hook stub but no implemented shortcuts. Power users benefit enormously from keyboard navigation.
**Priority: LOW**

---

## What Eden Has That the Prototype Doesn't

### 1. Full REST API (NestJS, 17 Modules)
Eden has a proper backend with typed controllers, services, guards, and database access. The Prototype talks directly to Supabase from the browser.
**Why it matters:** API-first architecture enables agent integration, webhooks, background processing, and proper authorization.

### 2. 14 AI Agents with Staged Council Dispatch
Eden orchestrates a coordinator + 7 expert panel agents + 6 intelligence agents through Eve Horizon. The Prototype makes direct browser-side Claude calls.
**Why it matters:** Multi-agent architecture produces richer analysis (7 expert perspectives vs 1 AI response) and enables async workflows.

### 3. Event-Driven Workflows (3 Pipelines)
- `doc.ingest` → extraction → synthesis → changeset
- `changeset.accepted` → alignment → questions
- `question.answered` → question-agent → changeset

The Prototype has none — all AI interaction is synchronous, user-initiated.

### 4. Expert Panel Reviews
Dedicated reviews system with synthesis text + per-expert opinions, color-coded by role. The Prototype has no multi-expert review concept.

### 5. Normalized Relational Schema (15 Tables)
Eden stores activities, steps, tasks, personas, questions, changesets, etc. in separate tables with foreign keys, indexes, and RLS policies. The Prototype stores everything in 3 JSONB columns.
**Why it matters:** Enables querying, reporting, full-text search, concurrent edits, and audit trails that JSONB blobs can't support.

### 6. Immutable Audit Trail
Dedicated `audit_log` table with entity tracking, actor attribution, JSON diffs, and timeline view. The Prototype has no audit capability.

### 7. Full-Text Search (GIN Indexes)
PostgreSQL GIN indexes on tasks for full-text search. The Prototype has no search at all.

### 8. Multi-Organization Support with RLS
Every query is scoped to `app.org_id` via RLS policies. The Prototype has email-domain whitelisting but no true multi-tenancy.

### 9. Changeset Per-Item Accept/Reject
Eden's changeset model allows accepting some items and rejecting others within a single changeset. The Prototype is all-or-nothing.

### 10. Sources Page with Pipeline Progress
Visual progress tracking through ingestion pipeline stages (uploaded → processing → extracted → synthesized → done). Auto-polling with 5-second refresh.

### 11. Dedicated Q&A Page with Filters
Full-page Q&A management with status/priority/category filters, beyond the modal-only approach in the Prototype.

### 12. CSV + Markdown + JSON Export
Formal export endpoints producing structured output files.

### 13. Eden CLI (Agent Tooling)
A command-line interface (`cli/bin/eden`) that agents use to interact with the API — enables agent-native operations.

### 14. Changeset Source Attribution
Each changeset tracks its origin: `map-chat`, `expert-panel`, `ingest-pipeline`, `question-evolution`. The Prototype doesn't track change provenance.

### 15. Cross-Cutting Question Panel
Side panel showing questions that span multiple entities, with reference navigation. The Prototype has a similar `CrossCuttingPanel` but less developed.

---

## Deep Dive: User Types & Role-Based Access

This is one of the **most significant gaps** between the two systems. The Prototype has a fully realized role-based experience model. Eden has roles in the auth token but doesn't use them.

### Prototype: Three-Tier Role System

**Tier 1 — Authentication (domain whitelist):**
- Only `@incept5.com`, `@fintex.group`, `@amplifiedbusiness.ai` emails can sign in
- Magic link OTP via Supabase

**Tier 2 — Global role (PM vs Participant):**
- PM status determined by hardcoded email list (`steve.miller@incept5.com`, `ade.risidore@incept5.com`)
- Everyone else is a Participant

**Tier 3 — Project role (BA vs Engineer):**
- Per-project membership with role assignment
- Stored in `project_members` table

### Prototype Feature Matrix by Role

| Capability | PM | BA / Engineer |
|------------|:--:|:------------:|
| **Project lifecycle** | | |
| Create projects | Y | N |
| Delete projects | Y | N |
| Manage members (invite/remove) | Y | N |
| **Map structure** | | |
| Inline edit activity titles | Y | N |
| Inline edit step titles | Y | N |
| Inline edit task titles | Y | N |
| Drag-and-drop reorder tasks | Y | N |
| Drag-and-drop reorder steps | Y | N |
| Drag-and-drop reorder activities | Y | N |
| **Release planning** | | |
| Create / rename / archive releases | Y | N |
| Drag tasks into release slices | Y | N |
| **AI & Content** | | |
| Use AI chat | Y | Y |
| Upload documents | Y | Y |
| Raise questions | Y | Y |
| Answer questions | Y | Y |
| **Approval workflow** | | |
| Changes auto-approved on save | Y | N |
| Changes saved as "preview" (draft) | N | Y |
| Approve/reject preview items | Y | N |
| "Approve All" bulk action | Y | N |
| **Settings** | | |
| Edit AI model config | Admin only | View only |

### Prototype Walkthrough (Role-Specific Onboarding)

The `WalkthroughContext` delivers **different onboarding sequences** based on role:
- **PM_STEPS** — Emphasize map control, approval workflow, release planning, member management
- **PARTICIPANT_STEPS** — Emphasize reading, questioning, AI chat suggestions, and the preview workflow

This means the first-use experience is tailored to what the user can actually do.

### Eden: Roles Exist But Are Unused

Eden receives `{ id, email, orgId, role, organizations[] }` from Eve SSO. The `role` field contains values like `owner`, `admin`, `member`. However:

- **No UI elements are gated by role.** Every authenticated user sees the same navigation, buttons, and forms.
- **No controller-level permission checks.** The `AuthGuard` validates the token but doesn't check roles — any authenticated user can call any endpoint.
- **No concept of PM vs Participant.** There's no distinction between someone who owns the map structure and someone who contributes suggestions.
- **No read-only mode.** Even a casual viewer can modify tasks, accept changesets, or delete entities.

### Gap Analysis: User Types

| Dimension | Eden | Prototype | Gap Severity |
|-----------|------|-----------|:------------:|
| Role-based UI | None | Full PM/Participant split | **CRITICAL** |
| Structural edit protection | None | PM-only for all map structure | **CRITICAL** |
| Approval workflow by role | None | BA creates previews, PM approves | **HIGH** |
| Role-specific onboarding | None | Different walkthrough per role | **MEDIUM** |
| Project-level membership | Org-level only | Per-project with roles | **HIGH** |
| Settings access control | None | Admin-only for AI config | **LOW** |

### Recommendation

This is arguably **more important than any single UX feature** because it's about trust and safety. Without role-based access:
- Any user can accept a changeset that restructures the entire map
- Any user can delete activities, steps, or tasks
- There's no concept of "suggest vs commit" for different experience levels
- A new team member has the same destructive power as the PM

**Implementation path for Eden:**
1. Add `project_members` table with `(project_id, user_id, role)` — roles: `owner`, `editor`, `viewer`
2. Add middleware that checks role on mutating endpoints (POST/PATCH/DELETE)
3. Gate UI actions: viewer sees read-only cards, editor can suggest (creates draft changesets), owner can accept/reject
4. The changeset model already exists — the missing piece is **who** can create them directly vs. who must go through review

---

## Deep Dive: Draft Changes & Approval Workflow

Both systems have a concept of "AI proposes, human disposes." But the implementations differ profoundly in where drafts live and how approval works.

### Prototype: Evolved State Layer

The Prototype uses a **dual-storage model**:

```
map_data (JSONB)          ← baseline: the "blessed" state
evolved_state (JSONB)     ← overlay: AI changes + unapproved edits
```

**How it works:**

1. **AI generates a changeset** — structured JSON with 8 operation types:
   - `add_task`, `modify_task`, `add_activity`, `add_step`
   - `add_question`, `modify_question`, `resolve_question`, `modify_user_story`

2. **ReviewPanel shows before/after diffs** — per-change accept/reject buttons, plus bulk accept/reject all

3. **Accepted changes merge into state** — with role-dependent approval status:
   - PM accepts → `approval: 'approved'` (immediately committed)
   - BA/Engineer accepts → `approval: 'preview'` (draft, needs PM sign-off)

4. **Both layers are saved** — `saveMapData()` + `saveEvolvedStateDb()` persist independently

5. **On load, evolved state merges onto baseline** — `MapContext` line 177-214 applies the overlay

6. **Reset capability** — `clearEvolvedStateDb()` discards all AI changes, restoring baseline

### Prototype Visual Indicators

| State | Card Border | Background | Badge |
|-------|-------------|------------|-------|
| Approved (normal) | Persona color | White | None |
| Preview (draft) | — | — | Golden "Pending Review" |
| AI-modified | Purple (#8b5cf6) | White | — |
| AI-added | Green (#10b981) | Green gradient | — |
| Newly accepted | Orange glow | — | 2-second flash animation |

The Prototype also tracks two sets: `_added_task_ids[]` and `_modified_task_ids[]` — enabling the visual distinction between "AI touched this" and "human created this."

### Prototype: PM Approval Flow for Previews

```
BA uses AI chat → AI proposes changes → BA accepts in ReviewPanel
    → Tasks created with approval='preview'
    → Appear on map with golden "Pending Review" badge
    → PM sees preview count in header
    → PM clicks "Approve & Commit" on individual cards
        OR uses "Approve All" bulk action
    → Tasks become approval='approved'
```

This creates a **two-stage review**: first the BA reviews the AI output, then the PM reviews the BA's selections.

### Eden: Changeset Table Model

Eden uses a **relational changeset model**:

```
changesets (id, project_id, title, reasoning, source, status, actor)
    └── changeset_items (entity_type, operation, before_state, after_state, status, display_reference)
```

**Changeset statuses:** `draft` → `accepted` | `rejected` | `partial`
**Item statuses:** `pending` → `accepted` | `rejected`

**How it works:**

1. **AI agents create changesets** via the Eden CLI or API — stored in the database with all items in `pending` status

2. **User reviews in ChangesetReviewModal** — per-item accept/reject with before/after JSON diff view, plus bulk accept/reject all

3. **On accept, `applyItem()` executes the operation** — creates/updates tasks, activities, personas, questions in the real tables. Respects dependency ordering (persona → activity → step → task).

4. **Audit trail records everything** — who accepted what, when, with full state diffs

5. **Source attribution** — each changeset tracks its origin: `map-chat`, `expert-panel`, `ingest-pipeline`, `question-evolution`

### Eden Visual Indicators

| State | Card Border | Background | Badge |
|-------|-------------|------------|-------|
| AI-modified | Purple (#8b5cf6) | White | — |
| AI-added | Green (#10b981) | White | — |
| Proposed lifecycle | Green (#10b981) | Green-to-white gradient | — |
| Discontinued lifecycle | Gray (#9ca3af) | Muted (opacity 0.45) | — |
| Current lifecycle | Persona color | White | — |

Eden tracks `aiModifiedEntities` and `aiAddedEntities` Sets in MapPage state, populated when a changeset with source `map-chat`/`question-evolution`/`expert-panel` is accepted.

The `EvolvedBadge` component shows a green pill ("EVOLVED") in the toolbar when `evolvedCount > 0`.

The `hideProposed` toggle filters out tasks with `lifecycle='proposed'`.

### Gap Analysis: Draft Changes

| Dimension | Eden | Prototype | Gap Severity |
|-----------|------|-----------|:------------:|
| Per-item review | Y (changeset_items) | Y (per-change in ReviewPanel) | Parity |
| Bulk accept/reject | Y | Y | Parity |
| Before/after diff | Y (JSON) | Y (visual) | Parity |
| Role-based approval status | **N** — all accepts are final | **Y** — PM=approved, BA=preview | **HIGH** |
| Two-stage review (BA→PM) | **N** | **Y** | **HIGH** |
| Evolved state overlay | **N** — changes applied directly | **Y** — non-destructive layer | **MEDIUM** |
| Reset all AI changes | **N** | **Y** | **MEDIUM** |
| Flash animation on accept | **N** | **Y** — 2-sec orange glow | **LOW** |
| Preview count in header | **N** | **Y** — badge showing pending count | **MEDIUM** |
| On-card approve button | **N** — must use Changeset page | **Y** — "Approve & Commit" on card | **HIGH** |
| Source attribution | **Y** — 4 source types | **N** | Eden leads |
| Audit trail | **Y** — immutable log | **N** | Eden leads |
| Dependency-ordered apply | **Y** — persona→activity→step→task | **N** — flat apply | Eden leads |

### The Critical Missing Piece

Eden's changeset architecture is **more sophisticated** than the Prototype's — relational storage, per-item granularity, audit trail, source attribution, dependency ordering. But it's missing the **role-gated approval layer** that makes the Prototype's workflow collaborative:

**What Eden needs:**

1. **Draft changesets from non-owners** — When a `viewer` or `editor` accepts an AI changeset, it shouldn't immediately apply. Instead, it should create a "pending approval" state visible to the project owner.

2. **On-map approval UX** — The Prototype's "Pending Review" badge + "Approve & Commit" button on the card itself is faster than navigating to the Changesets page. Eden should show pending items inline on the map with a one-click approve action.

3. **Preview count badge** — Header should show count of items awaiting owner approval, linking to a filtered view.

4. **Accept animation** — Small UX touch: a brief visual flash when a change is accepted, so the user's eye is drawn to what changed on the grid.

5. **Evolved state reset** — An "undo all AI changes since X" capability. Could be implemented as "reject all accepted changesets since date" using the existing changeset model rather than a separate overlay column.

### Combined Implementation Vision

The ideal system combines both approaches:

```
AI Agent creates changeset (Eden: relational, audited, source-attributed)
    → Editor reviews per-item (Eden: ChangesetReviewModal)
    → Editor accepts items
        IF editor is owner → applied immediately (Eden: applyItem)
        IF editor is contributor → marked as 'preview' (Prototype: approval workflow)
    → Owner sees preview count in header
    → Owner approves on-card or bulk (Prototype: "Approve & Commit")
    → Applied to map with flash animation
    → Audit trail records both stages
```

This preserves Eden's infrastructure strengths while adding the Prototype's collaborative safety net.

---

## Data Model Comparison

### Eden: Normalized (15 tables)
```
projects ─┬─ personas
           ├─ activities ── steps ── step_tasks ── tasks
           ├─ releases
           ├─ questions ── question_references
           ├─ changesets ── changeset_items
           ├─ ingestion_sources
           ├─ reviews ── expert_opinions
           └─ audit_log
```
**Strengths:** Queryable, concurrent-edit safe, audit trail, FTS, RLS isolation
**Weakness:** More API endpoints to maintain, migration overhead

### Prototype: Denormalized (JSONB blobs)
```
projects (map_data, evolved_state, responses, chat_history, notifications, prd_cache)
project_members (email, role)
app_settings (ai_settings)
```
**Strengths:** Simple, fast iteration, easy state snapshot/restore
**Weakness:** No concurrent editing, no querying inside blobs, no audit, no FTS

---

## UX Comparison

| UX Dimension | Eden | Prototype | Winner |
|--------------|------|-----------|--------|
| **First-use experience** | Blank project form | AI-powered project wizard | Prototype |
| **Map editing speed** | Expand card → form → save | Inline click-to-edit | Prototype |
| **Map reorganization** | Not supported | Drag-and-drop | Prototype |
| **Sprint planning** | Separate releases page | Visual release slices below map | Prototype |
| **AI interaction** | Chat panel + async agent workflows | Chat panel + instant streaming | Tie (different tradeoffs) |
| **Change review** | Dedicated page, per-item granularity | ReviewPanel modal, all-or-nothing | Eden |
| **Document processing** | Server-side pipeline with progress | Client-side instant extraction | Tie |
| **Onboarding** | None | Interactive walkthrough | Prototype |
| **Multi-view** | Single map per project | Named map tabs | Prototype |
| **Search** | GIN-indexed full-text | None | Eden |
| **Audit** | Full timeline with filters | None | Eden |
| **Notifications** | None | Bell icon with count | Prototype |
| **Multi-expert review** | 7-agent panel synthesis | Single AI response | Eden |
| **Keyboard shortcuts** | Stub only | Map tab switching (1-9) | Prototype |

---

## Recommendations: Priority Adoption List

### Critical (Foundation for Everything Else)

1. **Role-Based Access Control** — PM/Editor/Viewer roles with UI gating and API-level permission checks. Without this, every other collaborative feature is unsafe. The Prototype's PM-vs-Participant split is the minimum viable model. Eden's existing auth token already carries role data — the work is enforcing it.

2. **Two-Stage Approval Workflow** — Non-owners accepting AI changes creates "preview" items that owners must approve. Eden's changeset model already has the per-item status machinery — add a `pending_approval` state and role checks on `applyItem()`.

### High Priority (Adopt from Prototype)

3. **Project Wizard** — AI-generated initial map on project creation. This is the single biggest UX gap. Users should see value in the first 60 seconds.

4. **Drag-and-Drop Reordering** — Tasks between steps, steps between activities, activity reordering. Core story mapping interaction that's completely missing. Must respect roles (PM/editor only).

5. **Inline Title Editing** — Click-to-edit on activity/step/task titles. Small implementation effort, massive UX improvement. Gated to PM/editor role.

6. **On-Map Approval UX** — "Pending Review" badges on task cards with one-click "Approve & Commit" button. Preview count in header. Faster than navigating to the Changesets page for every approval.

### Medium Priority (Adopt from Prototype)

7. **Release Slices on Map** — Visual sprint planning below the grid. Could coexist with the dedicated Releases page.

8. **Named Map Views (Tabs)** — Multiple views of the same project. Requires data model consideration (shared task pool vs. separate maps).

9. **Notification System** — In-app notifications for changeset creation, review completion, question answers. Agent workflows produce results users need to know about.

10. **Interactive Walkthrough** — Step-by-step onboarding guide for new users. Role-specific sequences (PM gets map control tour, participant gets suggestion workflow tour).

11. **Member Management** — Project-level member invitations with role assignment. Currently org-level only via Eve.

12. **Accept Animation** — Brief visual flash (orange glow) when changes are accepted, drawing the eye to what changed on the grid.

### Low Priority (Consider Later)

13. **PRD Generation** — Useful deliverable but not core to the story mapping workflow.
14. **Keyboard Shortcuts** — Implement the existing stub with meaningful bindings.
15. **Audio Transcription** — Niche but novel for stakeholder interview workflows.
16. **Evolved State Reset** — Implementable as "reject all accepted changesets since date" using existing model.
17. **Settings UI** — Less relevant with server-side agents, but useful for display preferences.

---

## Technical Notes

### Migration Path for Prototype Features

**Project Wizard → Eden:**
- Add `POST /projects/generate` endpoint that calls an Eve agent
- New `ProjectWizard` component in `apps/web/src/components/`
- Wizard output → changeset → review → apply (reuse existing flow)

**Drag-and-Drop → Eden:**
- Add `PATCH /activities/:id/reorder`, `PATCH /steps/:id/move`, `PATCH /tasks/:id/move` endpoints
- Implement HTML5 drag in `StoryMap.tsx` with drop handlers
- Audit trail captures reorder events

**Inline Editing → Eden:**
- Create `InlineEdit` component (small, ~70 lines)
- Wire to existing `PATCH` endpoints for activities/steps/tasks
- Debounce saves, Escape to cancel

**Release Slices → Eden:**
- New `ReleaseSlices` component rendered below `StoryMap`
- Uses existing `/releases` and `/tasks` APIs
- Drag from grid to slice calls `PATCH /tasks/:id` with `release_id`

---

## Appendix: Tech Stack Comparison

| Dependency | Eden | Prototype |
|------------|------|-----------|
| React | 18.3.1 | 19.2.4 |
| TypeScript | 5.7.3 | 5.9.3 |
| Vite | 6.2.0 | 8.0.0 |
| CSS | Tailwind 4.0 | Plain CSS (App.css) |
| Routing | React Router 7 | None (custom) |
| Backend | NestJS 11 | None (Supabase direct) |
| Database | PostgreSQL 16 (pg driver) | Supabase (SDK) |
| AI | Eve Horizon agents | Anthropic SDK (browser) |
| PDF | Server-side (Eve ingest) | pdfjs-dist 5.5.207 |
| DOCX | Server-side (Eve ingest) | mammoth 1.12.0 |
| Auth | Eve SSO | Supabase magic link |
| State | React hooks | React Context (4 providers) |
| Build | tsc + Vite | tsc -b + Vite |
