# Eden Phase 1 — Foundation & Story Map

> **Status**: Proposed
> **Date**: 2026-03-12
> **Phase**: 1 of 5
> **Depends on**: None (greenfield)
> **Parent plan**: `eden-evolution.md`
> **Estimated effort**: 3–4 weeks
>
> **Delivers**: A working story map with manual CRUD — no AI yet. Users can
> log in via Eve SSO, create projects, define personas, build the activity →
> step → task grid, and see it rendered as an interactive CSS Grid map.

---

## Scope

### What Ships

1. **NestJS API** — scaffolded with Eve Auth middleware, RLS-aware DB service,
   and CRUD/read-model endpoints for the 8 Phase 1 entities (projects,
   personas, activities, steps, tasks, step_tasks, questions, releases).
2. **Managed Postgres 16** — 15-table schema total: 10 active in Phase 1, 5
   reserved for Phase 2, all protected by RLS using `app.org_id`.
3. **React SPA** — Vite + Tailwind + Eve Auth SDK (`@eve-horizon/auth-react`).
   Story map grid, persona tabs, task card expand/collapse, org/project switcher.
4. **Eve Auth integration** — SSO login, org membership, `switchOrg()`,
   JWT-based API auth.
5. **Manifest + staging environment** — services defined, deploy pipeline wired.

### What Does NOT Ship

- No AI agents, no changesets, no ingestion pipeline.
- No chat panel, no alignment detection.
- No file upload or document processing.
- No export or search.
- No Sources, Reviews, or Changes UI/API yet; those tables exist only as
  dormant schema for Phase 2.
- No drag-and-drop reordering; Phase 1 uses explicit reorder controls and APIs.

---

## Prerequisites

- Eve Horizon staging environment (`eh1.incept5.dev`) accessible.
- Authenticated Eve CLI session with access to the target org/project.
- Eve project created for Eden (`eve org ensure eden-org && eve project ensure eden`).
- Node.js 22+, pnpm (via corepack), Docker for local dev.

---

## Implementation Steps

This document expands the parent plan's Phase 1 milestones. Items `1c`, `1h`,
`1j`, and `1k` are supporting workstreams inside the parent plan's `1a`-`1h`
sequence, not extra phase gates.

### 1a. Scaffold NestJS API (Medium)

```
apps/api/
  src/
    main.ts                   # eveUserAuth() middleware + app bootstrap
    app.module.ts             # Root module
    db.ts                     # pg.Pool config + schema status check
    common/
      database.service.ts     # RLS-aware: set_config(app.org_id) inside tx
      auth.guard.ts           # NestJS guard wrapping Eve JWT verification
  package.json                # @nestjs/*, pg, @eve-horizon/auth
  tsconfig.json               # ES2020, CommonJS, strict
  Dockerfile                  # Multi-stage: base → deps → build → production
```

- Use `@eve-horizon/auth` for backend JWT verification via `eveUserAuth()`
  middleware.
- Bridge `req.eveUser` → `req.user` in main.ts for controller compatibility.
- Database connection via raw `pg.Pool` (not TypeORM). Create `db.ts` with
  `DATABASE_URL` from env, SSL config for non-local DBs
  (`rejectUnauthorized: false`), and a `getDbStatus()` startup check.
- `DatabaseService` wraps all DB access: `withClient(context, fn)` acquires a
  connection from the pool, runs `BEGIN` → `set_config('app.org_id', $1, true)`
  → callback → `COMMIT`/`ROLLBACK`. Context is `{ org_id: string, user_id?: string }`.
  Also expose `query<T>()` and `queryOne<T>()` convenience methods.
- Enable CORS with comma-separated origins from `CORS_ORIGIN` env var.
- Expose `GET /health`, `GET /auth/config`, and `GET /auth/me` for the React
  auth bootstrap flow.
- Dockerfile: multi-stage (node:22-slim), pnpm via corepack, non-root user,
  healthcheck on `/health`.

### 1b. Scaffold React SPA (Medium)

```
apps/web/
  src/
    App.tsx                   # EveAuthProvider + Router
    main.tsx                  # Vite entry
    api/                      # Eve SDK integration + HTTP client
    components/
      auth/LoginForm.tsx      # SSO + token paste
      layout/AppShell.tsx     # Header + sidebar + content
  package.json                # React, react-router-dom, vite, @eve-horizon/auth-react
  vite.config.ts              # React plugin, dev proxy
  Dockerfile                  # Multi-stage: node build → nginx production
  nginx.conf                  # Reverse proxy /api/ → API service
```

- Use `@eve-horizon/auth-react` for `EveAuthProvider`, `useEveAuth()`.
- API calls go through same-origin `/api/` prefix. In production, nginx proxies
  `/api/` to the internal API service via `${API_SERVICE_HOST}:3000`. In local
  dev, Vite's dev server proxy handles the same path. No `VITE_API_BASE`
  needed — the `/api` proxy pattern avoids CORS issues and hard-coded hostnames.
- nginx.conf uses `envsubst` to resolve `${API_SERVICE_HOST}` at container
  startup (set to `${ENV_NAME}-api` in the manifest, which resolves to the k8s
  service DNS name).
- Org switcher in header renders `orgs` list, calls `switchOrg()`.
- Tailwind configured with Eden's design tokens (from `eden-evolution.md`).
- Dockerfile: multi-stage — node:22-slim for Vite build, nginx:alpine for
  serving. Healthcheck via `wget http://localhost/health`.

### 1c. Database Migrations — 15 Tables (Medium)

Migrations are **plain SQL files** under `db/migrations/`, named with
timestamp prefixes: `YYYYMMDDHHmmss_description.sql`. They are executed by
Eve's `eve-migrate` image — a purpose-built migration runner that tracks
applied migrations in a `schema_migrations` table (idempotent, checksummed,
transactional). **Do not use TypeORM migrations.**

```
db/
  migrations/
    20260312000000_eden_foundation.sql    # Core schema + RLS + triggers
    20260312100000_seed_data.sql          # Optional seed data
```

Locally, run migrations via `docker compose run --rm migrate`. In staging,
the `migrate` pipeline step handles this automatically after deploy.

Tables in order:
1. `projects` (org_id, name, slug)
2. `personas` (project_id, code, name, color)
3. `activities` (project_id, display_id, name, sort_order)
4. `steps` (activity_id, display_id, name, sort_order)
5. `releases` (project_id, name, target_date, status)
6. `ingestion_sources` (project_id, filename, storage_key, status) — schema
   only in Phase 1; nullable FK target for `tasks.source_id`
7. `tasks` (project_id, display_id, title, user_story, acceptance_criteria
   JSONB, priority, status, device, nullable `release_id`, nullable `source_id`)
8. `step_tasks` (step_id, task_id, persona_id, role, sort_order)
9. `questions` (project_id, display_id, question, answer, status, priority, category)
10. `question_references` (`question_id`, `entity_type`, `entity_id`, cached
    `display_id`) — polymorphic target; validate existence in the service layer
11. `reviews` (project_id, eve_job_id, synthesis, status) — schema only
12. `expert_opinions` (review_id, expert_slug, summary) — schema only
13. `changesets` (project_id, title, reasoning, source, status) — schema only
14. `changeset_items` (changeset_id, entity_type, operation, before_state,
    after_state) — schema only
15. `audit_log` (project_id, entity_type, entity_id, action, actor)

All tables require:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `org_id TEXT NOT NULL` (for RLS)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (on mutable tables)

Enable `pgcrypto` extension for UUID generation. Create an
`update_updated_at_column()` trigger function and apply it to all mutable
tables.

RLS policies are applied inline with each table (not deferred to end).
Each table with `org_id` gets SELECT, INSERT, and UPDATE policies:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_select ON <table> FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY <table>_insert ON <table> FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY <table>_update ON <table> FOR UPDATE
  USING (...) WITH CHECK (...);
```

Notes:
- Active in Phase 1 UI/API: `projects`, `personas`, `activities`, `steps`,
  `tasks`, `step_tasks`, `questions`, `question_references`, `releases`,
  `audit_log`.
- Reserved for Phase 2 and intentionally unexposed: `ingestion_sources`,
  `reviews`, `expert_opinions`, `changesets`, `changeset_items`.
- Add supporting indexes during this step for the Phase 1 read model and
  ordering paths, especially `(org_id, project_id)`, `(activity_id, sort_order)`,
  `(step_id, sort_order)`, and `(question_id, entity_type)`.

### 1c-local. Local Development (docker-compose.yml)

```yaml
# docker-compose.yml (project root)
services:
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: eden
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d eden"]
      interval: 5s
      timeout: 5s
      retries: 5

  migrate:
    image: ghcr.io/incept5/eve-migrate:latest
    environment:
      DATABASE_URL: postgres://app:app@db:5432/eden
    volumes:
      - ./db/migrations:/migrations:ro
    depends_on:
      db:
        condition: service_healthy

volumes:
  pgdata:
```

This gives parity between local and staging migration execution.

### 1d. Projects + Personas CRUD (Small)

```
GET    /api/projects                    # List (with counts)
POST   /api/projects                    # Create
GET    /api/projects/:id                # Detail
PATCH  /api/projects/:id                # Update
DELETE /api/projects/:id                # Delete

GET    /api/projects/:id/personas       # List
POST   /api/projects/:id/personas       # Create
PATCH  /api/personas/:id                # Update
DELETE /api/personas/:id                # Delete
```

### 1e. Activities + Steps CRUD (Small)

```
GET    /api/projects/:id/activities     # List with steps
POST   /api/projects/:id/activities     # Create
PATCH  /api/activities/:id              # Update
DELETE /api/activities/:id              # Delete (cascades steps)
POST   /api/projects/:id/activities/reorder

GET    /api/activities/:id/steps        # List
POST   /api/activities/:id/steps        # Create
PATCH  /api/steps/:id                   # Update
DELETE /api/steps/:id                   # Delete
POST   /api/activities/:id/steps/reorder
```

### 1f. Tasks + Step-Tasks CRUD (Medium)

```
GET    /api/projects/:id/tasks          # List (filterable)
POST   /api/projects/:id/tasks          # Create (optionally with initial placement)
GET    /api/tasks/:id                   # Detail
PATCH  /api/tasks/:id                   # Update
DELETE /api/tasks/:id                   # Delete
POST   /api/tasks/:id/place             # Place on step
DELETE /api/step-tasks/:id              # Remove from step
POST   /api/projects/:id/tasks/reorder  # Reorder within step
```

### 1g. Questions + Releases CRUD (Small)

```
GET    /api/projects/:id/questions      # List (filterable)
POST   /api/projects/:id/questions      # Create (with references[])
GET    /api/questions/:id               # Detail
PATCH  /api/questions/:id               # Update (answer, resolve)
DELETE /api/questions/:id               # Delete manual-entry mistakes

GET    /api/projects/:id/releases       # List
POST   /api/projects/:id/releases       # Create
PATCH  /api/releases/:id                # Update
DELETE /api/releases/:id                # Delete
POST   /api/releases/:id/tasks          # Assign tasks { task_ids: [] }
DELETE /api/releases/:id/tasks/:taskId  # Remove task (clears tasks.release_id)
```

### 1h. Composite Map Endpoint (Medium)

```
GET    /api/projects/:id/map            # Full map: activities → steps → tasks → questions
                                        # ?persona=<code>, ?release=<id>
                                        # Includes stats: activity/step/task/AC/question counts,
                                        # answer progress, persona colors, display_ids
```

Single read-model response assembled inside one request-scoped DB transaction.
It can use multiple SQL queries internally if that keeps the implementation
clear and tunable. The contract is one API round-trip for the SPA. This is the
critical endpoint — it feeds the entire grid UI.

### 1i. Story Map Grid UI (Medium)

The heart of the SPA. Components:

```
components/map/
  StoryMap.tsx              # CSS Grid: activities × steps × tasks
  ActivityRow.tsx           # Dark header band (#1a1a2e) with persona pills
  StepHeader.tsx            # Accent-colored (#e65100) header with display_id
  TaskCard.tsx              # Expandable card: badges, title, chevron
  TaskCardExpanded.tsx      # User story block, AC checklist, question pills
  HandoffCard.tsx           # Dashed-border card for handoffs
  PersonaTabs.tsx           # Sticky tab bar: Overview + per-persona
  RoleFilterPills.tsx       # Header pill buttons for persona highlighting
  MapLegend.tsx             # Sticky legend bar
```

Grid layout: explicit fixed-width step columns inside a horizontally scrollable
container, for example
`grid-template-columns: repeat(var(--step-count), minmax(320px, 320px))`.
Avoid `auto-fill`, which changes the column count with viewport width and
breaks map alignment. Activities remain row groups, steps are columns, tasks
render as cards within cells.

Design tokens from `eden-evolution.md` — Inter font, gradient header, accent
orange, persona colors stored in DB and injected as CSS custom properties.

Reordering in Phase 1 is button/API-driven, not drag-and-drop. Keep the DOM and
keyboard interactions simple so the first release is accessible and reliable.

### 1j. Supporting Pages (Small)

```
pages/
  LoginPage.tsx             # Eve SSO login
  MapPage.tsx               # Default — story map
  QuestionsPage.tsx         # All questions (filterable)
  ReleasesPage.tsx          # Release list
```

Sidebar navigation: Map | Q&A | Releases (Sources, Reviews, Changes added in
later phases).

### 1k. Manifest + Deploy Pipeline (Small)

```yaml
# .eve/manifest.yaml
schema: eve/compose/v2
project: eden

registry: "eve"

services:
  api:
    build:
      context: ./apps/api
      dockerfile: ./apps/api/Dockerfile
    ports: [3000]
    environment:
      NODE_ENV: production
      DATABASE_URL: ${managed.db.url}
      CORS_ORIGIN: "https://eden.eh1.incept5.dev,https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"

  web:
    build:
      context: ./apps/web
      dockerfile: ./apps/web/Dockerfile
    ports: [80]
    environment:
      API_SERVICE_HOST: ${ENV_NAME}-api
    depends_on:
      api:
        condition: service_healthy
    x-eve:
      ingress:
        public: true
        port: 80
        alias: eden

  migrate:
    image: public.ecr.aws/w7c4v0w3/eve-horizon/migrate:latest
    environment:
      DATABASE_URL: ${managed.db.url}
      MIGRATIONS_DIR: /migrations
    x-eve:
      role: job
      files:
        - source: db/migrations
          target: /migrations

  db:
    x-eve:
      role: managed_db
      managed:
        class: db.p1
        engine: postgres
        engine_version: "16"

environments:
  sandbox:
    pipeline: deploy

pipelines:
  deploy:
    steps:
      - name: build
        action: { type: build }
      - name: release
        depends_on: [build]
        action: { type: release }
      - name: deploy
        depends_on: [release]
        action: { type: deploy }
      - name: migrate
        depends_on: [deploy]
        action:
          type: job
          service: migrate
      - name: smoke-test
        depends_on: [migrate]
        script:
          run: ./scripts/smoke-test.sh
          timeout: 300
```

Key differences from a naïve approach (validated against working Eve apps):

- **Schema `eve/compose/v2`** — the current Eve manifest schema (v1 is legacy).
- **`eve-migrate` image** — not TypeORM. Uses the Eve platform's migration
  runner with plain SQL files mounted via `x-eve.files`.
- **Pipeline order: build → release → deploy → migrate → smoke-test** — migrate
  runs *after* deploy (the managed DB must be provisioned first). The `release`
  step pushes images to the registry between build and deploy.
- **Web service has public ingress, API does not.** The nginx reverse proxy in
  the web container proxies `/api/` to the internal API service. This avoids
  CORS issues and eliminates the need for hard-coded API hostnames.
- **`dockerfile` path is relative to project root**, not to `context`.
- **`ports` declared at service level**, `ingress` under `x-eve` only on the
  public-facing web service.

---

## Verification Loop (Staging)

### Deploy

```bash
# Validate manifest, sync project metadata, then deploy to sandbox
eve manifest validate
eve project sync --dir .
eve env deploy sandbox --ref main --repo-dir . --watch --timeout 300
```

### Health Check

```bash
# Verify environment is healthy
eve env health eden sandbox
# Expected: { ready: true, status: "ready" }

# Get service URLs
eve env services eden sandbox
# Expected:
#   web → https://eden.{org}-eden-sandbox.eh1.incept5.dev  (public, nginx proxy)
#   api → (internal only, reached via web's /api/ proxy)
```

### Acceptance Criteria

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| **V1.1** | Eve SSO login | Open dashboard URL → redirected to SSO → login → redirected back | User sees project list, org switcher populated |
| **V1.2** | Create project | POST /api/projects with name + slug | 201, project appears in list |
| **V1.3** | Create personas | POST /api/projects/:id/personas × 3 (PM, ENG, UX) | Each gets a color, code, appears in persona tabs |
| **V1.4** | Build map structure | Create 2 activities, 3 steps each, 5 tasks placed on steps | Map grid renders: 2 activity rows, 3 step columns each, task cards in cells |
| **V1.5** | Task card expand | Click task card → expand | Shows user story (accent-bordered), ACs (checklist), question count |
| **V1.6** | Persona tab filter | Click "PM" persona tab | Only PM-assigned tasks highlighted, others dimmed (15% opacity) |
| **V1.7** | Role filter pills | Click "ENG" role pill in header | ENG tasks highlighted across all persona views |
| **V1.8** | Add question | POST /api/projects/:id/questions with task reference | Question flag appears on task card, Q&A page shows question |
| **V1.9** | Org isolation | Switch org → create project in org B → switch back to org A | Org A projects only visible, no cross-org data leak |
| **V1.10** | Release filter | Create release → assign 2 tasks → filter map by release | Only assigned tasks remain visible; release metadata stays consistent |
| **V1.11** | Map endpoint | GET /api/projects/:id/map | Returns full tree: activities → steps → tasks → questions, stats object with counts |

### Smoke Test Script

```bash
#!/bin/bash
# scripts/smoke-test.sh — runs as a pipeline step after migrate
set -euo pipefail
BASE="https://eden.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"

echo "=== Phase 1 Smoke Tests ==="

# Health (nginx /health returns 200, /api/health checks API + DB)
curl -sf "$BASE/health" > /dev/null
echo "✓ Web healthy"
curl -sf "$BASE/api/health" | jq .status
echo "✓ API healthy"

# Auth (requires valid token)
curl -sf -H "Authorization: Bearer $TOKEN" "$BASE/api/projects" | jq length
echo "✓ Auth working"

# Create project
PROJECT=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test","slug":"smoke-test"}' \
  "$BASE/api/projects" | jq -r .id)
echo "✓ Project created: $PROJECT"

# Create persona
PERSONA=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"pm","name":"Product Manager","color":"#059669"}' \
  "$BASE/api/projects/$PROJECT/personas" | jq -r .id)
echo "✓ Persona created: $PERSONA"

# Create activity
ACT=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Onboarding","display_id":"ACT-1","sort_order":1}' \
  "$BASE/api/projects/$PROJECT/activities" | jq -r .id)
echo "✓ Activity created: $ACT"

# Create step
STEP=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Registration","display_id":"STP-1.1","sort_order":1}' \
  "$BASE/api/activities/$ACT/steps" | jq -r .id)
echo "✓ Step created: $STEP"

# Create task
TASK=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Email signup","display_id":"TSK-1.1.1","user_story":"As a new user...","acceptance_criteria":[],"priority":"high"}' \
  "$BASE/api/projects/$PROJECT/tasks" | jq -r .id)
echo "✓ Task created: $TASK"

# Place task on step
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"step_id\":\"$STEP\",\"persona_id\":\"$PERSONA\",\"role\":\"owner\",\"sort_order\":1}" \
  "$BASE/api/tasks/$TASK/place" > /dev/null
echo "✓ Task placed on map"

# Add question
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"Should signup require CAPTCHA?\",\"references\":[{\"entity_type\":\"task\",\"entity_id\":\"$TASK\"}]}" \
  "$BASE/api/projects/$PROJECT/questions" > /dev/null
echo "✓ Question created"

# Create release and assign task
REL=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"MVP","status":"planning"}' \
  "$BASE/api/projects/$PROJECT/releases" | jq -r .id)
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"task_ids\":[\"$TASK\"]}" \
  "$BASE/api/releases/$REL/tasks" > /dev/null
echo "✓ Release assignment working"

# Get filtered map
MAP=$(curl -sf -H "Authorization: Bearer $TOKEN" "$BASE/api/projects/$PROJECT/map?release=$REL")
echo "$MAP" | jq '.stats'
echo "$MAP" | jq -e --arg task "$TASK" '.. | objects | select(.id? == $task)' > /dev/null
echo "✓ Map endpoint working"

# Cleanup
curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/api/projects/$PROJECT" > /dev/null
echo "✓ Cleanup done"

echo "=== All Phase 1 smoke tests passed ==="
```

---

## Exit Criteria

Phase 1 is complete when:

- [ ] All 15 DB tables created with RLS policies; the 5 Phase 2 tables exist but remain unexposed
- [ ] All CRUD endpoints return correct responses with org isolation
- [ ] Map composite endpoint returns full tree structure with stats
- [ ] SPA renders the CSS Grid story map with real data
- [ ] Persona tabs filter the map correctly
- [ ] Release assignment and release-based map filtering work end-to-end
- [ ] Eve SSO login + org switching works end-to-end
- [ ] nginx `/api/` proxy routes to internal API service correctly
- [ ] Dashboard auth bootstrap works without hard-coded environment hostnames
- [ ] Deployed to sandbox environment with healthy services
- [ ] All V1.x acceptance criteria pass on staging
- [ ] Smoke test script passes clean on staging

---

## Risks

| Risk | Mitigation |
|------|-----------|
| RLS context leaks across pooled DB connections | Force all request DB access through a request-scoped transaction that calls `set_config('app.org_id', ...)` before any queries |
| RLS performance on the map read model | Test with 100+ tasks early; add indexes on org_id + project_id and measure query plans before tuning |
| CSS Grid rendering at scale | Test with 10 activities × 10 steps × 5 tasks per step |
| Eve Auth SDK integration issues | Prototype SSO flow in isolation before wiring into the SPA |
| `question_references` polymorphic links drift or orphan | Enforce allowed `entity_type` values with checks, validate referenced entity existence in the service layer, add a repair query for staging data |
| SPA cannot reliably discover the API base URL in staging | **Resolved**: using nginx reverse proxy (`/api/` → internal API service). No CORS, no hard-coded hostnames. Verify proxy passthrough in the first sandbox deploy |
