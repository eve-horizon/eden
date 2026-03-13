# Eden — AI-First Requirements Platform

An Eve Horizon application that combines an **expert panel engine**, an **intelligent document pipeline**, and a **living story map** for AI-first requirements management.

## How It Works

Teams share documents, conversations, and ideas with `@eve pm`. Eden's coordinator triages the input and decides the path:

**Solo path** — Simple questions, map edits, search queries. The coordinator handles it directly.

**Panel path** — Documents, proposals, substantial analysis. Seven expert agents review in parallel:

| Expert | Focus |
|--------|-------|
| Tech Lead | Feasibility, architecture, cost, engineering risk |
| UX Advocate | User experience, accessibility, i18n readiness |
| Business Analyst | Process flows, user journeys, success criteria |
| GTM Advocate | Revenue impact, competitive positioning, launch readiness |
| Risk Assessor | Timeline, dependency, regulatory risk |
| QA Strategist | Testing strategy, edge cases, acceptance criteria |
| Devil's Advocate | Challenges assumptions, proposes alternatives |

The coordinator synthesizes all expert opinions into actionable requirements — personas, activities, steps, tasks, questions — rendered on a living **story map**.

**Intelligence layer** — Three event-driven workflows keep the map alive:

- **Ingestion pipeline** — Upload a document → extract content → identify requirements → propose a changeset
- **Alignment check** — After a changeset is accepted, scan the map for conflicts, gaps, and duplicates
- **Question evolution** — When a question is answered, evaluate whether the answer implies a map change

Every AI-proposed change goes through the **changeset system** — per-item review before anything touches the map.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Slack / Chat                                    │
│  @eve pm "Review this requirements doc..."       │
└────────────────────┬─────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────┐
│  Eve Horizon Platform                            │
│  ┌─────────────┐  ┌──────────────────────────┐   │
│  │ PM          │  │ Expert Panel (7 agents)  │   │
│  │ Coordinator │─▶│ staged council dispatch  │   │
│  └──────┬──────┘  └──────────────────────────┘   │
│         │                                        │
│  ┌──────▼──────────────────────────────────────┐ │
│  │ Intelligence Layer                          │ │
│  │ ingestion · extraction · synthesis          │ │
│  │ map-chat · alignment · question-evolution   │ │
│  └──────┬──────────────────────────────────────┘ │
└─────────┼────────────────────────────────────────┘
          │ REST API
┌─────────▼────────────────────────────────────────┐
│  Eden Application                                │
│  ┌───────────┐  ┌────────────┐  ┌──────────────┐│
│  │ NestJS    │  │ React SPA  │  │ PostgreSQL   ││
│  │ API       │  │ Story Map  │  │ + RLS        ││
│  └───────────┘  └────────────┘  └──────────────┘│
└──────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed diagrams.

## Quick Start

### Local Development (Docker)

```bash
# Start PostgreSQL + run migrations
docker-compose up -d

# Start the API (port 3000)
cd apps/api && npm install && npm run start:dev

# Start the web app (port 5173, proxies /api to :3000)
cd apps/web && npm install && npm run dev
```

Open `http://localhost:5175`. Auth is bypassed locally (`DEV_AUTH_BYPASS=1`).

### Staging Deployment (Eve)

```bash
# Authenticate with Eve
eve auth login

# Sync agent config
eve agents sync --project <proj_id> --local --allow-dirty

# Deploy
eve deploy --env sandbox
```

## Project Structure

```
eden/
├── apps/
│   ├── api/                    # NestJS REST API (17 modules)
│   │   └── src/
│   │       ├── projects/       # Project CRUD
│   │       ├── activities/     # Story map backbone
│   │       ├── steps/          # Steps under activities
│   │       ├── tasks/          # Tasks under steps
│   │       ├── personas/       # User archetypes
│   │       ├── releases/       # Release tracking
│   │       ├── questions/      # Q&A + evolution trigger
│   │       ├── changesets/     # Changeset create/review/apply
│   │       ├── map/            # Hydrated map endpoint
│   │       ├── chat/           # Chat threads + Eve gateway proxy
│   │       ├── sources/        # Document ingestion sources
│   │       ├── search/         # Full-text search (GIN indexes)
│   │       ├── audit/          # Immutable audit trail
│   │       ├── export/         # CSV + JSON export
│   │       ├── health/         # Readiness check
│   │       └── common/         # Auth guard, DB service, Eve events
│   └── web/                    # React 18 + Vite + Tailwind SPA
│       └── src/
│           ├── pages/          # 8 pages (map, Q&A, releases, changes, ...)
│           ├── components/
│           │   ├── map/        # StoryMap grid, TaskCard, filters, MiniMap
│           │   ├── chat/       # ChatPanel, messages, typing indicator
│           │   ├── questions/  # QuestionModal, CrossCuttingPanel
│           │   ├── changesets/ # ChangesetReviewModal
│           │   └── layout/     # AppShell (header, sidebar, nav)
│           ├── hooks/          # useProjects, useKeyboardShortcuts
│           └── api/            # Fetch client with Eve auth
├── db/
│   └── migrations/             # 4 PostgreSQL migrations (RLS, GIN indexes)
├── eve/                        # Eve Horizon agent config
│   ├── agents.yaml             # 14 agents (1 coordinator + 7 experts + 6 intelligence)
│   ├── teams.yaml              # expert-panel (staged council, 7 members)
│   ├── chat.yaml               # Catch-all route → team:expert-panel
│   ├── workflows.yaml          # 3 workflows (ingest, align, evolve)
│   ├── x-eve.yaml              # Harness profiles (Claude Sonnet)
│   └── pack.yaml               # Pack descriptor
├── skills/                     # 14 SKILL.md persona files
│   ├── coordinator/            # PM triage + synthesis
│   ├── tech-lead/              # Technical feasibility
│   ├── ux-advocate/            # UX + accessibility
│   ├── biz-analyst/            # Process flows + success criteria
│   ├── gtm-advocate/           # Revenue + competitive positioning
│   ├── risk-assessor/          # Risk identification + scoring
│   ├── qa-strategist/          # Test strategy + edge cases
│   ├── devils-advocate/        # Challenge assumptions
│   ├── ingestion/              # Document content extraction
│   ├── extraction/             # Requirements identification
│   ├── synthesis/              # Map diff + changeset creation
│   ├── map-chat/               # Conversational map editing
│   ├── alignment/              # Conflict/gap detection
│   └── question/               # Answer → map change evaluation
├── scripts/                    # Smoke test scripts (local + staging)
├── tests/
│   ├── e2e/                    # Playwright specs
│   └── manual/                 # 14 test scenario docs
├── docs/
│   ├── prd/                    # Product requirements
│   └── plans/                  # Phase plans (1–5)
├── docker-compose.yml          # Local dev (Postgres + migrate)
├── .eve/manifest.yaml          # Eve deployment manifest
├── ARCHITECTURE.md             # System architecture + diagrams
└── CLAUDE.md                   # AI coding assistant instructions
```

## Key Concepts

### Story Map

A hierarchical grid: **Activities** → **Steps** → **Tasks**. Each task has a user story, acceptance criteria, persona assignments, and linked questions. The map is the single source of truth for what the product should do.

### Changesets

Every proposed change to the map — whether from a human, the expert panel, the ingestion pipeline, or conversational editing — is captured as a changeset with individual items. Each item can be accepted or rejected before it touches the map. Full audit trail.

### Staged Council Dispatch

The coordinator runs first. If it returns `prepared`, seven experts activate in parallel (300s each). The coordinator wakes to synthesize. If the coordinator handles it solo (`success`), experts never start. Cheap triage, expensive analysis only when needed.

### Row-Level Security

Every database query runs inside a transaction that sets `app.org_id` via PostgreSQL config. RLS policies enforce org-scoped data isolation at the database level — no application-level filtering needed.

## API Endpoints

| Resource | Endpoints |
|----------|-----------|
| Projects | `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id` |
| Map | `GET /projects/:id/map?persona=&release=` |
| Activities | `GET/POST /projects/:id/activities`, `PATCH/DELETE /activities/:id` |
| Steps | `GET/POST /projects/:id/steps`, `PATCH/DELETE /steps/:id` |
| Tasks | `GET/POST /projects/:id/tasks`, `GET/PATCH/DELETE /tasks/:id` |
| Personas | `GET/POST /projects/:id/personas`, `GET/PATCH/DELETE /personas/:id` |
| Questions | `GET/POST /projects/:id/questions`, `GET/PATCH /questions/:id`, `POST /questions/:id/evolve` |
| Changesets | `GET/POST /projects/:id/changesets`, `GET /changesets/:id`, `POST /changesets/:id/{accept,reject,review}` |
| Releases | `GET/POST /projects/:id/releases`, `PATCH/DELETE /releases/:id` |
| Chat | `GET/POST /projects/:id/chat/threads`, `GET/POST /chat/threads/:id/messages` |
| Sources | `GET/POST /projects/:id/sources`, `POST /sources/:id/confirm` |
| Search | `GET /projects/:id/search?q=` |
| Audit | `GET /projects/:id/audit` |
| Export | `GET /projects/:id/export/{story-map,csv}` |

## Testing

```bash
# Local smoke tests (Docker + API + Web running)
./scripts/smoke-test-local-p2.sh
./scripts/smoke-test-local-p3.sh
./scripts/smoke-test-local-p4.sh

# Staging smoke tests (Eve deployed)
./scripts/smoke-test.sh
./scripts/smoke-test-p2.sh
./scripts/smoke-test-p3.sh

# E2E (Playwright)
npx playwright test tests/e2e/
```

See `tests/manual/` for 14 detailed test scenarios covering the full platform.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | NestJS 11, Express 5, TypeScript 5.7 |
| Database | PostgreSQL 16, RLS, GIN full-text search |
| Frontend | React 18, Vite 6, Tailwind CSS 3, React Router 6 |
| Auth | Eve SSO (`@eve-horizon/auth`) + agent job tokens |
| Agents | 14 Claude Sonnet agents via Eve Horizon |
| Deploy | Eve Horizon (manifest-driven, managed Postgres) |
| Local Dev | Docker Compose (Postgres + eve-migrate) |
