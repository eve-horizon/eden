# Eden — AI-First Requirements Platform

## What This Is

A full-stack Eve Horizon application: NestJS API + React SPA + PostgreSQL database + Eden CLI + 16 AI agents. Users interact via Slack (`@eve pm`) or the web UI. The expert panel reviews documents, the intelligence layer keeps the story map alive, and the web app renders it all as an interactive grid.

## Architecture Overview

```
Slack / Web UI
      |
      v
Eve Horizon Platform
  ├── PM Coordinator (triage: solo or panel)
  ├── Expert Panel (7 agents, staged council)
  └── Intelligence Layer (ingestion, alignment, question-triage, question-evolution)
      |
      v eden CLI
Eden Application
  ├── apps/api (NestJS 11, 20 domain modules)
  ├── apps/web (React 18 + Vite + Tailwind, 9 pages + login)
  ├── cli/ (eden CLI — canonical agent + human interface)
  └── db/migrations (PostgreSQL 16 + RLS, 8 migrations)
```

## Repo Structure

```
apps/api/src/               # NestJS REST API (20 domain modules)
  ├── projects/             # Project CRUD
  ├── activities/           # Story map backbone (top-level rows)
  ├── steps/                # Steps within activities
  ├── tasks/                # Tasks within steps
  ├── personas/             # User archetypes
  ├── releases/             # Release tracking
  ├── questions/            # Q&A layer + evolve trigger
  ├── changesets/           # Create/review/apply changeset workflow
  ├── map/                  # Hydrated map endpoint (tree of activities->steps->tasks)
  ├── chat/                 # Chat threads + Eve gateway proxy
  ├── sources/              # Document ingestion sources + Eve ingest
  ├── search/               # PostgreSQL full-text search (GIN indexes)
  ├── audit/                # Immutable audit trail
  ├── export/               # CSV + JSON export
  ├── reviews/              # Expert panel review records
  ├── members/              # Project membership (owner/editor/viewer roles)
  ├── invites/              # Project invite workflow (email + Eve org invite)
  ├── views/                # Saved map views (filter tabs)
  ├── notifications/        # User-scoped notification service
  ├── wizard/               # Project wizard (map-generator dispatch)
  ├── contracts/            # Changeset contract (Zod schema, JSON export)
  ├── health/               # Readiness probe
  └── common/               # AuthGuard, DatabaseService, EveEventsService

apps/web/src/               # React SPA (9 project pages + login)
  ├── pages/                # ProjectsPage, MapPage, QuestionsPage, ReleasesPage,
  │                         # ChangesetsPage, ReviewsPage, SourcesPage, AuditPage,
  │                         # MembersPage, LoginPage
  ├── components/
  │   ├── map/              # StoryMap grid, TaskCard, PersonaTabs, MiniMap, filters
  │   ├── chat/             # ChatPanel, ChatMessage, ChatInput, TypingIndicator
  │   ├── questions/        # QuestionModal, CrossCuttingPanel, AnswerProgress
  │   ├── changesets/       # ChangesetReviewModal
  │   ├── layout/           # AppShell (header, sidebar, nav)
  │   ├── auth/             # SSO login flow components
  │   ├── members/          # Member list, invite flow, role management
  │   ├── onboarding/       # Project wizard UI
  │   ├── projects/         # Project list, create dialog
  │   └── search/           # Search bar, results
  ├── hooks/                # useProjects, useMembers, useProjectRole, useClaimInvite,
  │                         # useKeyboardShortcuts, useDragDrop, useInvite, etc.
  └── api/                  # Fetch client with Eve auth (Bearer token)

cli/                        # Eden CLI (22 command modules)
  └── src/commands/         # activities, audit, auth, changesets, chat, export,
                            # health, invites, map, members, notifications, personas,
                            # projects, questions, releases, reviews, search, sources,
                            # steps, tasks, views, wizard

db/migrations/              # 8 PostgreSQL migrations
  ├── 20260312..._foundation.sql         # 15 tables, RLS, triggers
  ├── 20260313..._changesets.sql         # Ingestion + changeset columns
  ├── 20260314..._enrichments.sql        # Lifecycle, provenance, FTS
  ├── 20260315..._ingest_index.sql       # Callback lookup index
  ├── 20260315..._reviews_title.sql      # Review title column
  ├── 20260317..._phase6a_roles.sql      # project_members, approval columns
  ├── 20260318..._phase6c_views.sql      # map_views, notifications tables
  └── 20260318..._project_invites.sql    # project_invites table

eve/                        # Eve Horizon agent config
  ├── agents.yaml           # 16 agents (1 coordinator + 7 experts + 8 intelligence/wizard)
  ├── teams.yaml            # expert-panel (staged council dispatch)
  ├── chat.yaml             # Catch-all route -> team:expert-panel
  ├── workflows.yaml        # 3 event-driven workflows
  ├── x-eve.yaml            # Harness profiles (Claude Sonnet, 5 tiers)
  └── pack.yaml             # Pack descriptor

skills/                     # 16 SKILL.md persona files (one per agent) + shared references
  ├── coordinator/          # PM triage + synthesis
  ├── tech-lead/            # Technical feasibility
  ├── ux-advocate/          # UX + accessibility
  ├── biz-analyst/          # Process flows + success criteria
  ├── gtm-advocate/         # Revenue + competitive positioning
  ├── risk-assessor/        # Risk identification + scoring
  ├── qa-strategist/        # Test strategy + edge cases
  ├── devils-advocate/      # Challenge assumptions
  ├── ingestion/            # Document content extraction
  ├── extraction/           # Requirements identification
  ├── synthesis/            # Map diff + changeset creation
  ├── map-chat/             # Conversational map editing
  ├── alignment/            # Conflict/gap detection
  ├── question/             # Answer -> map change evaluation
  ├── question-triage/      # Fast answer classification (needs_changes vs informational)
  ├── map-generator/        # Project wizard story map generation
  └── _references/          # Shared skill reference material

scripts/                    # Smoke tests, contract checks, scenario runners
tests/
  ├── e2e/                  # Playwright specs
  └── manual/scenarios/     # 23 test scenario documents
docs/
  ├── plans/                # Phase plans (1-7) + feature plans (27 files)
  ├── prd/                  # Product requirements
  └── reports/              # Generated reports

docker-compose.yml          # Local dev (Postgres 16 + eve-migrate)
.eve/manifest.yaml          # Eve deployment manifest
ARCHITECTURE.md             # System architecture + mermaid diagrams
```

## Agents (16 total)

| Agent | Slug | Type | Role |
|-------|------|------|------|
| PM Coordinator | `pm` | routable | Triage, file processing, panel dispatch, synthesis |
| Tech Lead | `tech-lead` | expert panel | Technical feasibility, architecture |
| UX Advocate | `ux-advocate` | expert panel | UX, accessibility, i18n |
| Business Analyst | `biz-analyst` | expert panel | Process flows, success criteria |
| GTM Advocate | `gtm-advocate` | expert panel | Revenue, competitive positioning |
| Risk Assessor | `risk-assessor` | expert panel | Timeline, dependency, regulatory risk |
| QA Strategist | `qa-strategist` | expert panel | Test strategy, edge cases |
| Devil's Advocate | `devils-advocate` | expert panel | Challenge assumptions |
| Extraction | `extraction` | pipeline | Identify requirements from extracted content |
| Synthesis | `synthesis` | pipeline | Compare with map, create changeset |
| Map Chat | `map-chat` | intelligence | Conversational map editing |
| Alignment | `alignment` | intelligence | Post-changeset conflict/gap scan |
| Question Triage | `question-triage` | intelligence | Fast answer classification (needs_changes vs informational) |
| Question Agent | `question-agent` | intelligence | Answer -> map change evaluation |
| Map Generator | `map-generator` | wizard | Generate initial story map from project description |

Note: The Ingestion agent (`ingestion`) is defined in agents.yaml but content extraction is handled by the Eve platform's ingest service. The extraction agent receives the extracted text.

## Event-Driven Workflows

| Workflow | Trigger | Steps | Effect |
|----------|---------|-------|--------|
| ingestion-pipeline | `doc.ingest` | extract -> synthesize | Creates changeset from document |
| alignment-check | `changeset.accepted` | align | Creates questions for conflicts/gaps |
| question-evolution | `question.answered` | triage -> evolve (conditional) | Fast classify, then create changeset if needed |

The question-evolution workflow uses a two-step pattern: `question-triage` classifies the answer as `needs_changes` or `informational`. Only `needs_changes` triggers the heavier `question-agent`.

## Database (PostgreSQL 16)

19 tables with RLS (org-scoped isolation):

**Story Map:** projects, personas, activities, steps, tasks, step_tasks, releases
**Intelligence:** questions, question_references, ingestion_sources, reviews, expert_opinions
**Changesets:** changesets, changeset_items (with approval_status for two-stage review)
**Collaboration:** project_members (owner/editor/viewer), project_invites, map_views, notifications
**Audit:** audit_log (immutable, append-only)

Every query runs in a transaction with `SET LOCAL app.org_id`. RLS policies enforce scope.

## Key Patterns

- **Changeset model** — All AI-proposed changes go through changesets with per-item accept/reject
- **Staged council** — Coordinator first, experts fan out only when needed
- **RLS at query time** — `app.org_id` set per-transaction, policies enforce isolation
- **Dual auth** — Eve SSO (users) + Eve job tokens (agents), normalized to `req.user`
- **Display IDs** — Human-readable refs (TSK-1.2.1, ACT-3, Q-5) used across agents and UI
- **CLI-first agents** — All agents access Eden through the `eden` CLI, never raw REST
- **Inline skill templates** — Agent SKILL.md files must keep structural templates (JSON schemas, changeset shapes) inline, not behind file pointers — agents skip or misread reference files
- **Two-step triage** — Cheap classifier before expensive agent (question-triage -> question-agent)
- **Changeset contract** — Canonical Zod schema in `apps/api/src/contracts/` defines the changeset shape; skills reference the exported JSON schema

## CRITICAL: Deploying to Staging

**Every deploy MUST sync the manifest first.** The platform stores the manifest server-side and uses the latest version for routing decisions (pipeline vs direct deploy). If the manifest is stale, deploys will fail with "Manifest missing services" or route incorrectly.

```bash
# 1. ALWAYS sync manifest before deploying (from the eden repo root)
eve project sync

# 2. Deploy using --repo-dir to auto-sync and deploy in one step
eve env deploy sandbox --ref <sha> --repo-dir .

# 3. Or deploy HEAD (sync resolves the ref)
eve env deploy sandbox --ref HEAD --repo-dir .
```

**Why `--repo-dir .` matters:** Without it, the CLI fetches the latest manifest hash from the server — which may be stale or from a different sync. With `--repo-dir .`, the CLI reads your local `.eve/manifest.yaml`, syncs it to the server, and uses the fresh hash. This prevents the manifest/commit mismatch that causes deploy failures.

**The deploy pipeline does:** build -> release -> deploy -> migrate -> smoke-test -> smoke-test-p2

**After deploy, verify:**
```bash
curl -sI https://eden.eh1.incept5.dev  # Alias URL (should be 200)
curl -sI https://web.incept5-eden-sandbox.eh1.incept5.dev  # Standard URL
```

## Key Commands

```bash
# Local dev
docker-compose up -d              # Postgres + migrations
cd apps/api && npm run start:dev  # API on :3000
cd apps/web && npm run dev        # Web on :5175, proxy /api -> :3000

# Eve agent sync (after changing agents/teams/chat config)
eve project sync                  # Sync manifest to platform
eve agents sync --local --allow-dirty  # Sync agent configs

# Staging deploy (ALWAYS use --repo-dir .)
eve env deploy sandbox --ref HEAD --repo-dir .

# Smoke tests
./scripts/smoke-test-local-p2.sh  # Local
./scripts/smoke-test.sh           # Staging

# Changeset contract
npm run generate:contracts --prefix apps/api  # Regenerate contract JSON
./scripts/check-contract-drift.sh             # Verify no drift
```

## Conventions

- Agent persona/behavior -> `skills/<name>/SKILL.md`
- Agent definitions -> `eve/agents.yaml`
- Database schema -> `db/migrations/` (immutable once created)
- Only the coordinator is gateway-routable; all others are internal
- Slug: lowercase alphanumeric + dashes, org-unique
- **Never edit existing migrations.** Create a new migration file with the next timestamp.
- **Inline skill templates.** Agent SKILL.md files must keep JSON schemas and changeset shapes inline in the prompt — agents skip or misread reference files behind pointers.

## Editing Guidelines

- **Agent behavior** -> Edit `skills/<name>/SKILL.md`
- **New agent** -> Update `eve/agents.yaml`, `eve/teams.yaml` (if team member), create `skills/<slug>/SKILL.md`
- **Harness config** -> Edit `eve/x-eve.yaml`
- **API endpoint** -> Add module in `apps/api/src/<name>/`, register in `app.module.ts`
- **API/CLI parity** -> Every non-webhook REST route must have `eden` CLI coverage. If you add, change, or remove an API endpoint, update `cli/src/commands/*` in the same change and keep docs/tests aligned.
- **Web page** -> Add page in `apps/web/src/pages/`, add route in `App.tsx`
- **Database** -> New migration file in `db/migrations/` (never edit existing ones)
- **Changeset schema** -> Edit `apps/api/src/contracts/create-changeset.contract.ts`, run `generate:contracts`, update inline templates in affected SKILL.md files
- After agent config changes -> `eve agents sync`

## Testing Strategy

**Two-tier verification:**

1. **Local Docker** — DB migrations, API CRUD, changeset apply, UI rendering. No Eve needed.
2. **Staging Sandbox** — Chat routing, SSE streaming, agent workflows, event-triggered pipelines.

Don't build local mocks of Eve infrastructure — test the real thing on staging.
