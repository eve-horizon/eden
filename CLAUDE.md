# Eden — AI-First Requirements Platform

## CRITICAL: Agent Bootstrap (run FIRST in every job)

If you are an Eve agent running a job, do this **before anything else**:

```bash
export PATH="$PWD/cli/bin:$PATH"
```

Then read your skill file for instructions:
```bash
cat skills/<your-agent-slug>/SKILL.md
```

**You MUST use `eden` CLI for ALL API interactions.** Do NOT use curl, fetch, or raw HTTP endpoints. Do NOT explore the codebase for API patterns. Do NOT write shell scripts. Your SKILL.md has the exact commands you need.

## What This Is

A full-stack Eve Horizon application: NestJS API + React SPA + PostgreSQL database + 14 AI agents. Users interact via Slack (`@eve pm`) or the web UI. The expert panel reviews documents, the intelligence layer keeps the story map alive, and the web app renders it all as an interactive grid.

## Architecture Overview

```
Slack / Web UI
      │
      ▼
Eve Horizon Platform
  ├── PM Coordinator (triage: solo or panel)
  ├── Expert Panel (7 agents, staged council)
  └── Intelligence Layer (ingestion, alignment, question-evolution)
      │
      ▼ REST API
Eden Application
  ├── apps/api (NestJS 11, 17 modules)
  ├── apps/web (React 18 + Vite + Tailwind)
  └── db/migrations (PostgreSQL 16 + RLS)
```

## Repo Structure

```
apps/api/src/               # NestJS REST API
  ├── projects/             # Project CRUD
  ├── activities/           # Story map backbone (top-level rows)
  ├── steps/                # Steps within activities
  ├── tasks/                # Tasks within steps
  ├── personas/             # User archetypes
  ├── releases/             # Release tracking
  ├── questions/            # Q&A layer + evolve trigger
  ├── changesets/           # Create/review/apply changeset workflow
  ├── map/                  # Hydrated map endpoint (tree of activities→steps→tasks)
  ├── chat/                 # Chat threads + Eve gateway proxy
  ├── sources/              # Document ingestion sources + Eve ingest
  ├── search/               # PostgreSQL full-text search (GIN indexes)
  ├── audit/                # Immutable audit trail
  ├── export/               # CSV + JSON export
  ├── health/               # Readiness probe
  └── common/               # AuthGuard, DatabaseService, EveEventsService

apps/web/src/               # React SPA
  ├── pages/                # 8 pages (Map, Q&A, Releases, Changes, Reviews, Sources, Audit)
  ├── components/
  │   ├── map/              # StoryMap grid, TaskCard, PersonaTabs, MiniMap, filters
  │   ├── chat/             # ChatPanel, ChatMessage, ChatInput, TypingIndicator
  │   ├── questions/        # QuestionModal, CrossCuttingPanel, AnswerProgress
  │   ├── changesets/       # ChangesetReviewModal
  │   └── layout/           # AppShell (header, sidebar, nav)
  ├── hooks/                # useProjects, useKeyboardShortcuts
  └── api/                  # Fetch client with Bearer auth

db/migrations/              # 4 PostgreSQL migrations
  ├── 20260312..._foundation.sql     # 15 tables, RLS, triggers
  ├── 20260313..._changesets.sql     # Ingestion + changeset columns
  ├── 20260314..._enrichments.sql    # Lifecycle, provenance, FTS
  └── 20260315..._ingest_index.sql   # Callback lookup index

eve/                        # Eve Horizon agent config
  ├── agents.yaml           # 14 agents (1 coordinator + 7 experts + 6 intelligence)
  ├── teams.yaml            # expert-panel (staged council dispatch)
  ├── chat.yaml             # Catch-all route → team:expert-panel
  ├── workflows.yaml        # 3 event-driven workflows
  ├── x-eve.yaml            # Harness profiles (Claude Sonnet)
  └── pack.yaml             # Pack descriptor

skills/                     # 14 SKILL.md persona files (one per agent)
scripts/                    # Smoke test scripts (local + staging)
tests/manual/               # 14 test scenario documents
tests/e2e/                  # Playwright specs
docs/plans/                 # Phase plans (1–5)
```

## Agents (14 total)

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
| Ingestion | `ingestion` | pipeline | Extract content from documents |
| Extraction | `extraction` | pipeline | Identify requirements from content |
| Synthesis | `synthesis` | pipeline | Compare with map, create changeset |
| Map Chat | `map-chat` | intelligence | Conversational map editing |
| Alignment | `alignment` | intelligence | Post-changeset conflict/gap scan |
| Question Agent | `question-agent` | intelligence | Answer → map change evaluation |

## Event-Driven Workflows

| Workflow | Trigger | Steps | Effect |
|----------|---------|-------|--------|
| ingestion-pipeline | `doc.ingest` | ingest → extract → synthesize | Creates changeset from document |
| alignment-check | `changeset.accepted` | align | Creates questions for conflicts/gaps |
| question-evolution | `question.answered` | evolve | Creates changeset from answer |

## Database (PostgreSQL 16)

15 tables with RLS (org-scoped isolation):

**Story Map:** projects, personas, activities, steps, tasks, step_tasks, releases
**Intelligence:** questions, question_references, ingestion_sources, reviews, expert_opinions
**Changesets:** changesets, changeset_items
**Audit:** audit_log (immutable, append-only)

Every query runs in a transaction with `SET LOCAL app.org_id`. RLS policies enforce scope.

## Key Patterns

- **Changeset model** — All AI-proposed changes go through changesets with per-item accept/reject
- **Staged council** — Coordinator first, experts fan out only when needed
- **RLS at query time** — `app.org_id` set per-transaction, policies enforce isolation
- **Dual auth** — Eve SSO (users) + Eve job tokens (agents), normalized to `req.user`
- **Display IDs** — Human-readable refs (TSK-1.2.1, ACT-3, Q-5) used across agents and UI

## Agent API Access Standard

- Agents and skill workflows must use `eden` CLI for API interactions.
- Do not use direct HTTP calls (`curl`, `fetch`, raw endpoint URLs, manual `POST/GET`) in skills or agent scripts.
- If a required operation is missing from CLI, add CLI support first, then update SKILL docs.

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

**The deploy pipeline does:** build → release → deploy → migrate → smoke-test → smoke-test-p2

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
cd apps/web && npm run dev        # Web on :5175, proxy /api → :3000

# Eve agent sync (after changing agents/teams/chat config)
eve project sync                  # Sync manifest to platform
eve agents sync --local --allow-dirty  # Sync agent configs

# Staging deploy (ALWAYS use --repo-dir .)
eve env deploy sandbox --ref HEAD --repo-dir .

# Smoke tests
./scripts/smoke-test-local-p2.sh  # Local
./scripts/smoke-test.sh           # Staging
```

## Conventions

- Agent persona/behavior → `skills/<name>/SKILL.md`
- Agent definitions → `eve/agents.yaml`
- Database schema → `db/migrations/` (immutable once created)
- Only the coordinator is gateway-routable; all others are internal
- Slug: lowercase alphanumeric + dashes, org-unique
- **Never edit existing migrations.** Create a new migration file with the next timestamp.

## Editing Guidelines

- **Agent behavior** → Edit `skills/<name>/SKILL.md`
- **New agent** → Update `eve/agents.yaml`, `eve/teams.yaml` (if team member), create `skills/<slug>/SKILL.md`
- **Harness config** → Edit `eve/x-eve.yaml`
- **API endpoint** → Add module in `apps/api/src/<name>/`, register in `app.module.ts`
- **Web page** → Add page in `apps/web/src/pages/`, add route in `App.tsx`
- **Database** → New migration file in `db/migrations/` (never edit existing ones)
- After agent config changes → `eve agents sync`

## Testing Strategy

**Two-tier verification:**

1. **Local Docker** — DB migrations, API CRUD, changeset apply, UI rendering. No Eve needed.
2. **Staging Sandbox** — Chat routing, SSE streaming, agent workflows, event-triggered pipelines.

Don't build local mocks of Eve infrastructure — test the real thing on staging.
