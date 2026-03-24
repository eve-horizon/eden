# Eden Phase 6 — UX Convergence (Overview)

> **Status**: Proposed
> **Date**: 2026-03-17
> **Source**: Differential analysis of `incept5/eden` prototype vs Eden
> **Analysis**: `docs/reports/differential-analysis-eden-vs-prototype.md`
>
> **Goal**: Bring the prototype's best UX innovations into Eden's
> production architecture. Three sub-phases, each self-contained with
> its own verification gate.

---

## Context

The `incept5/eden` prototype is a client-heavy React SPA with Supabase
backend. No API layer, no agents, no event workflows — but it has UX
innovations that Eden lacks. This plan cherry-picks the best and builds
them on Eden's infrastructure.

**Key gaps identified:**
1. No role-based access — every user has full destructive power
2. No two-stage approval — no PM/BA workflow separation
3. No AI project wizard — project creation is a bare name field
4. No drag-and-drop — map structure is layout-locked
5. No inline editing — requires opening forms to rename anything
6. No named map views — one view per project
7. No release slices — sprint planning on a separate page
8. No notifications — async workflow results are invisible
9. No onboarding walkthrough — complex tool with no guidance

---

## Three Phases

```
Phase 6a ──► Phase 6b ──► Phase 6c ──► Scenario 21 (final gate)
 (Roles)    (Map Edit)    (Collab)       (Full lifecycle)
 ~2 weeks    ~2 weeks      ~2 weeks
```

### [Phase 6a — Roles & Safety Net](phase-6a-roles-and-safety.md)

| Workstream | What Ships |
|------------|-----------|
| **WS1: Roles & Permissions** | owner/editor/viewer model, EditorGuard, OwnerGuard, member management API, conditional UI |
| **WS2: Two-Stage Approval** | Editor accept → preview items → owner approve on-card, pending queue, flash animation |

**Gate:** Scenarios 15 + 16 + full 01–14 regression

**Why first:** Without roles, every other collaborative feature is unsafe.

---

### [Phase 6b — Interactive Map](phase-6b-interactive-map.md)

| Workstream | What Ships |
|------------|-----------|
| **WS3: Project Wizard** | Multi-step form, Eve agent map generation, changeset review integration |
| **WS4: Map Editing** | Drag-and-drop (tasks/steps/activities), inline title editing, on-card actions |

**Gate:** Scenarios 17 + 18 + 01–09 regression

**Why second:** The two highest-impact UX gaps. Can run in parallel.

---

### [Phase 6c — Views & Collaboration](phase-6c-views-and-collaboration.md)

| Workstream | What Ships |
|------------|-----------|
| **WS5: Map Views & Releases** | Named view tabs (saved filters), release slices below map, drag-to-assign |
| **WS6: Collaboration** | Notification system, member management UI, role-specific walkthrough |

**Gate:** Scenarios 19 + 20 + 21 (full lifecycle) + 01–14 regression

**Why last:** Polish layer that makes Eden feel like a real multi-user tool.

---

## Test Scenarios

| # | Scenario | Phase | File | LLM | Duration |
|---|----------|-------|------|-----|----------|
| 15 | Roles & Permissions | 6a | `15-roles-permissions.md` | No | ~8m |
| 16 | Two-Stage Approval | 6a | `16-two-stage-approval.md` | No | ~8m |
| 17 | Project Wizard | 6b | `17-project-wizard.md` | Yes | ~10m |
| 18 | Map Editing | 6b | `18-map-editing.md` | No | ~8m |
| 19 | Map Views & Releases | 6c | `19-map-views-releases.md` | No | ~6m |
| 20 | Collaboration | 6c | `20-collaboration.md` | No | ~8m |
| 21 | Full Lifecycle | All | `21-phase6-full-lifecycle.md` | Yes | ~15m |

---

## Delivery Timeline

```
Week 1-2:  Phase 6a (WS1 → WS2, sequential)
Week 2-4:  Phase 6b (WS3 + WS4, parallel)
Week 4-6:  Phase 6c (WS5 + WS6, parallel)
Week 6:    Scenario 21 (full lifecycle gate)
```

**Total:** ~6 weeks. Can compress to ~4 weeks with parallel execution.

**Minimum viable convergence (2 weeks):** Phase 6a alone delivers roles +
approval — makes Eden safe for Ade's team to use.

---

## Eve Platform Review

> **Reviewed**: 2026-03-17. No blocking platform gaps found.

| Capability Needed | Platform Status | Impact |
|-------------------|----------------|--------|
| Project-level roles | Platform has `project_memberships` (owner/admin/member) — Eden uses its own `project_members` (owner/editor/viewer) because the access domains are different | None — app-level table is correct |
| Agent auth bypass | Job tokens set `req.user.type = 'job_token'` — guards check this | None — mechanism exists, specified in 6a |
| Direct job creation (wizard) | `POST /projects/:id/jobs` — fully supported | None — new invocation pattern for Eden, documented in 6b |
| In-app notifications | Platform has events + webhooks, no push/SSE channel | Non-blocking — polling at 30s is fine for MVP |
| Saved views / sort ordering | No platform equivalent | None — correctly app-level |
| Onboarding tours | No platform equivalent | None — correctly app-level |

---

## What Does NOT Ship

| Feature | Reason |
|---------|--------|
| Local LLM support | Phase 5 scope (Qwen 3.5) |
| Audio transcription | Low priority, niche use case |
| AI settings modal | Eden uses Eve agents, not browser-side API keys |
| Evolved state overlay | Two-stage approval (WS2) covers the safety net use case |
| PRD generation | Revisit after 6a-6c ship |
| Real-time collab editing | Future scope, requires CRDT/OT |
