# PM Expert Panel — Story Map App

> **Status**: Proposed
> **Date**: 2026-03-11
> **Author**: Adam / Claude
> **Scope**: New React SPA + NestJS backend service, manifest updates, agent-native CRUD
> **Depends on**: `chat-attachment-aware-agents.md` (implemented)
> **Reference impl**: `incept5/sentinel-mgr` (SSO + org isolation pattern)
> **Platform features used**:
>   - Eve Auth SDK (`@eve-horizon/auth`, `@eve-horizon/auth-react`)
>   - Gateway providers (Slack webhook ingestion as the primary chat ingress)
>   - Job API (list, show, result, stream)
>   - Object store (file upload buckets)
>   - Managed DB (Postgres 16 with RLS)
>   - SSE job streams for review/job progress
>   - Workflow triggers (`doc.ingest` for web uploads)
>
> Note: No runtime code exists in the repo yet; this is a greenfield implementation
> plan.

## Problem

The PM expert panel produces structured expert feedback — but it evaporates
into Slack threads. There's no persistent artifact. No story map. No way to
see what was reviewed, what decisions were made, and what stories emerged.

We need an app that builds a **story map** from expert panel output. Documents
go in, expert reviews happen, stories come out — organized into tracks,
annotated with open questions, and visible to the whole team.

## Design Principle

**The story map is the product. The expert panel is the engine.**

The app's primary surface is a story map — tracks of user stories organized
by theme, with open questions and expert provenance. Document ingestion and
expert reviews feed into story creation, but the map itself is what users
work with day to day.

## What Users See

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PM Story Map              [Acme Corp ▾]                      [Profile] │
├──────────┬───────────────────────────────────────────────────────────────┤
│          │                                                              │
│ Projects │  ┌─ Story Map ───────────────────────────────────────────┐   │
│          │  │                                                       │   │
│ Launch   │  │  Onboarding          Payments         Core Loop       │   │
│ Pricing  │  │  ┌──────────┐       ┌──────────┐     ┌──────────┐    │   │
│ Platform │  │  │ Welcome  │       │ Checkout │     │ Dashboard│    │   │
│          │  │  │ flow     │       │ redesign │     │ v2       │    │   │
│ ──────── │  │  │ ⚑ 2 Qs  │       │ ✓ Ready  │     │ ⚑ 1 Q   │    │   │
│          │  │  ├──────────┤       ├──────────┤     ├──────────┤    │   │
│ Reviews  │  │  │ Email    │       │ Pricing  │     │ Search   │    │   │
│ Docs     │  │  │ confirm  │       │ tiers    │     │ upgrade  │    │   │
│ Chat     │  │  │ Draft    │       │ ⚑ 3 Qs  │     │ Approved │    │   │
│          │  │  └──────────┘       └──────────┘     └──────────┘    │   │
│          │  │                                                       │   │
│          │  │  [+ Add Track]                    [+ Add Story]       │   │
│          │  └───────────────────────────────────────────────────────┘   │
│          │                                                              │
│          │  ┌─ Chat ───────────────────────────────────────────────┐   │
│          │  │  You: review this pricing doc                         │   │
│          │  │  PM: Processing attached files...                     │   │
│          │  │  PM: [Executive Summary + 3 stories created]          │   │
│          │  │                                                       │   │
│          │  │  [Type a message...                          ] [Send] │   │
│          │  └───────────────────────────────────────────────────────┘   │
│          │                                                              │
└──────────┴──────────────────────────────────────────────────────────────┘
```

The sidebar switches between three views:

| View | What |
|------|------|
| **Story Map** (default) | Tracks and stories in a Kanban-like map |
| **Reviews** | Expert panel reviews with synthesis + individual opinions |
| **Docs** | Ingested documents with review status |

## Authentication (Eve SSO)

Follows the same pattern as `sentinel-mgr`. Two-mode login: Eve SSO
(default) and CLI token paste.

### Frontend Auth Flow

```typescript
// App.tsx — identical pattern to sentinel-mgr
import { EveAuthProvider, useEveAuth } from '@eve-horizon/auth-react';

function AuthGate() {
  const { user, loading, error, loginWithToken, loginWithSso, logout } = useEveAuth();

  if (loading) return <LoadingSpinner />;
  if (!user) return <LoginPage onLoginWithToken={loginWithToken}
                               onStartSsoLogin={loginWithSso}
                               loading={loading} error={error} />;

  return (
    <BrowserRouter>
      <AppShell user={user} onLogout={logout}>
        <Routes>
          <Route path="/" element={<StoryMapPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/reviews/:id" element={<ReviewDetailPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default function App() {
  const API_BASE = import.meta.env.VITE_API_BASE || '/api';

  return (
    <EveAuthProvider apiUrl={API_BASE}>
      <AuthGate />
    </EveAuthProvider>
  );
}
```

### Backend Auth Middleware

```typescript
// main.ts — same middleware chain as sentinel-mgr
import { eveUserAuth } from '@eve-horizon/auth';

app.use(eveUserAuth());  // Verify JWT via JWKS, sets req.eveUser

// Bridge: map Eve SDK user to standard req.user
app.use((req: any, _res: any, next: any) => {
  if (req.eveUser) {
    req.user = {
      id: req.eveUser.id,
      org_id: req.eveUser.orgId,
      email: req.eveUser.email,
      name: req.eveUser.name,
      role: req.eveUser.role === 'member' ? 'viewer' : 'admin',
    };
  }
  next();
});
```

### Org Switching

The header displays an org dropdown (unlike sentinel-mgr's read-only badge).
When the user switches orgs, the frontend calls `switchOrg(orgId)` from the
Eve Auth SDK, which issues a new JWT scoped to the selected org. All
subsequent API requests use the new token. The page reloads project context
for the new org.

```typescript
// AppShell.tsx — org switcher in header
<header>
  <h1>PM Story Map</h1>
  <OrgSwitcher
    currentOrg={user.orgId}
    orgs={user.orgs}           // Available orgs from Eve user profile
    onSwitch={(orgId) => switchOrg(orgId)}
  />
  <UserMenu user={user} onLogout={logout} />
</header>
```

### Database-Level Org Isolation (RLS)

Same pattern as sentinel-mgr. Every data table has an `org_id` column.
PostgreSQL Row-Level Security enforces isolation:

```sql
-- Applied to every data table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_org_isolation ON projects
  USING (org_id = current_setting('app.org_id', true));

-- DatabaseService sets the session variable before every query
-- SELECT set_config('app.org_id', $1, true)
```

```typescript
// DatabaseService — identical pattern to sentinel-mgr
export interface DbContext {
  org_id: string;
  user_id?: string;
}

@Injectable()
export class DatabaseService {
  async withClient<T>(context: DbContext | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (context?.org_id) {
        await client.query("SELECT set_config('app.org_id', $1, true)", [context.org_id]);
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

## Architecture

```
                          ┌─────────────┐
                          │   Browser    │
                          │  React SPA  │
                          └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
               REST API   REST+SSE      SSO Auth
                    │            │            │
                    ▼            ▼            ▼
             ┌───────────┐ ┌─────────┐ ┌──────────┐
             │  NestJS   │ │ Gateway │ │ Eve SSO  │
             │  Backend  │ │ Service │ │ Broker   │
             └─────┬─────┘ └────┬────┘ └──────────┘
                   │            │
          ┌────────┼────────┐   │
          │        │        │   │
          ▼        ▼        ▼   ▼
      ┌──────┐ ┌──────┐ ┌──────────────────────┐
      │  DB  │ │ Obj  │ │     Eve Platform      │
      │(PG+  │ │Store │ │ Jobs / Agents / Chat  │
      │ RLS) │ │      │ │                        │
      └──────┘ └──────┘ └──────────────────────┘
```

### Components

| Component | What | Deployed as |
|---|---|---|
| **SPA** | React 19 + Tailwind + Vite | Eve service (`role: component`, public ingress) |
| **API** | NestJS backend | Eve service (`role: worker`, internal + public ingress) |
| **DB** | Managed Postgres 16 + RLS | Eve managed service (`role: managed_db`) |
| **Object Store** | S3-compatible bucket for uploads | Eve object store (via manifest) |

### Why NestJS + React (not just Eve API directly)

The Eve API provides job results, chat threads, and file storage — but the
app needs:

1. **Story map domain model**: Tracks, stories, open questions — not native to Eve
2. **Org isolation**: RLS-enforced multi-tenancy per org
3. **Aggregation**: Join job results with stories and project context
4. **Denormalization**: Cache expert feedback in queryable form
5. **Upload orchestration**: Accept file → store → trigger `doc.ingest` workflow

The NestJS backend is a thin orchestration layer. It delegates to Eve for
the heavy lifting (agent execution, chat, file processing) and owns only
the app-specific domain model.

### App Projects vs Eve Projects

App projects are **application-level concepts** — they exist in the app's
database, scoped by org. They are not Eve projects.

An app project *may* have an optional `eve_project_id` for future
integration (e.g., mapping to Eve's project-level job queries), but this
is not required for v1. The Slack channel binding is also optional — it
enables syncing Slack-originated reviews into the dashboard.

## Data Model (Managed DB)

All tables include `org_id` with RLS policies for org isolation.

```sql
-- App-level projects (NOT Eve projects)
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    slack_channel_id TEXT,           -- Optional Slack binding
    slack_team_id   TEXT,
    eve_project_id  TEXT,            -- Optional Eve project mapping
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, slug)
);

-- Story map tracks (horizontal lanes: "Onboarding", "Payments", etc.)
CREATE TABLE tracks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    color           TEXT,            -- Optional track color for UI
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- User stories (grouped under tracks)
CREATE TABLE stories (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              TEXT NOT NULL,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    track_id            UUID REFERENCES tracks(id) ON DELETE SET NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    acceptance_criteria TEXT,
    priority            TEXT DEFAULT 'medium',    -- low | medium | high | critical
    status              TEXT DEFAULT 'draft',     -- draft | refined | approved | in_progress | done
    sort_order          INT NOT NULL DEFAULT 0,   -- Position within track
    source_review_id    UUID REFERENCES reviews(id) ON DELETE SET NULL,
    created_by          TEXT,                     -- 'agent' | user email
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Open questions attached to stories
CREATE TABLE open_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL,
    story_id        UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    question        TEXT NOT NULL,
    answer          TEXT,            -- NULL until resolved
    resolved        BOOLEAN DEFAULT false,
    resolved_by     TEXT,            -- 'agent' | user email | expert slug
    source          TEXT,            -- 'agent' | 'user' | expert slug that raised it
    created_at      TIMESTAMPTZ DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

-- Ingested documents (denormalized from Eve jobs)
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL,
    project_id      UUID REFERENCES projects(id),
    filename        TEXT NOT NULL,
    content_type    TEXT,
    size_bytes      BIGINT,
    storage_key     TEXT NOT NULL,   -- Object store key
    source          TEXT NOT NULL,   -- 'slack' | 'web' | 'cli'
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | reviewing | reviewed
    eve_job_id      TEXT,            -- Job that processed this document
    ingested_at     TIMESTAMPTZ DEFAULT now()
);

-- Expert reviews (denormalized from job results)
CREATE TABLE reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL,
    document_id     UUID REFERENCES documents(id),
    project_id      UUID REFERENCES projects(id),
    eve_job_id      TEXT NOT NULL,   -- Coordinator job (parent or single)
    dispatch_mode   TEXT NOT NULL DEFAULT 'council',  -- 'council' | 'in_process'
    request_summary TEXT,            -- What was asked
    synthesis       TEXT,            -- Coordinator's executive summary
    expert_count    INT,             -- How many experts participated
    status          TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | complete
    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- Individual expert opinions (from child jobs OR parsed from coordinator output)
CREATE TABLE expert_opinions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL,
    review_id       UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    expert_slug     TEXT NOT NULL,   -- tech-lead, ux-advocate, etc.
    summary         TEXT NOT NULL,   -- Expert's analysis
    eve_job_id      TEXT,            -- Child job ID (NULL when in-process dispatch)
    completed_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (applied to all tables)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE expert_opinions ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON projects
  USING (org_id = current_setting('app.org_id', true));
-- ... same pattern for all tables
```

## API Design (NestJS Backend)

All endpoints require Eve SSO auth. Org context extracted from JWT and
applied via RLS — controllers never filter by org manually.

### Projects

```
GET    /api/projects                    List projects (with story/review counts)
POST   /api/projects                    Create project
GET    /api/projects/:id                Project detail
PATCH  /api/projects/:id                Update project
DELETE /api/projects/:id                Delete project
```

### Tracks

```
GET    /api/projects/:id/tracks         List tracks (ordered)
POST   /api/projects/:id/tracks         Create track
PATCH  /api/tracks/:id                  Update track (name, order, color)
DELETE /api/tracks/:id                  Delete track (stories become untracked)
POST   /api/projects/:id/tracks/reorder Bulk reorder tracks
```

### Stories

```
GET    /api/projects/:id/stories        List stories (filterable by track, status)
POST   /api/projects/:id/stories        Create story
GET    /api/stories/:id                 Story detail (with questions, source review)
PATCH  /api/stories/:id                 Update story (title, track, status, etc.)
DELETE /api/stories/:id                 Delete story
POST   /api/projects/:id/stories/reorder  Bulk reorder within track
POST   /api/projects/:id/stories/generate Agent-generate stories from a review
```

### Open Questions

```
GET    /api/stories/:id/questions       List questions for a story
POST   /api/stories/:id/questions       Add question
PATCH  /api/questions/:id               Update question (answer, resolve)
DELETE /api/questions/:id               Delete question
```

### Documents

```
GET    /api/projects/:id/documents      List ingested documents (paginated)
POST   /api/projects/:id/documents      Upload + ingest (multipart form)
GET    /api/documents/:id               Document detail (with review status)
GET    /api/documents/:id/download      Download original file
```

### Reviews

```
GET    /api/projects/:id/reviews        List reviews (paginated)
GET    /api/reviews/:id                 Review detail (with expert opinions)
GET    /api/reviews/:id/stream          SSE stream of review progress
```

### Chat (proxied to Eve)

```
GET    /api/projects/:id/chat/threads   List chat threads
GET    /api/chat/threads/:id/messages   Thread messages
POST   /api/chat/threads/:id/messages  Send message
GET    /api/chat/threads/:id/stream    SSE stream: proxied job/thread updates
```

### Notes
- Direct gateway websocket access is not assumed. Chat should use Eve-supported HTTP/SSE
  surfaces with a backend SSE bridge (`/api/chat/threads/:id/stream`) and a polling
  fallback path when SSE is unavailable.

## Feature Details

### a) Story Map (Primary View)

**The main surface of the app.** A Kanban-like board where columns are
tracks and cards are stories.

Each track is a thematic grouping (e.g., "Onboarding", "Payments",
"Core Loop"). Stories within a track are vertically ordered by priority.

**Story card** shows:
- Title and status badge (draft / refined / approved / in_progress / done)
- Priority indicator
- Open question count (if any)
- Source review link (if spawned from expert panel)

**Interactions**:
- Drag stories between tracks or reorder within a track
- Click to expand story detail (description, acceptance criteria, questions)
- Inline edit title, description, acceptance criteria
- Add/resolve open questions directly on the story
- Create stories manually or from expert review output

### b) Open Questions

First-class, optional annotations on stories. Any story can have zero or
more open questions.

**Sources**:
- **Agent-generated**: Experts may raise questions during review. The
  coordinator captures these and attaches them to the spawned stories.
- **User-created**: Team members add questions manually in the UI.

**Lifecycle**:
```
Question raised (source: agent | user | expert-slug)
  │
  ▼
Open (answer: null, resolved: false)
  │
  ▼
Answered (answer filled, still unresolved — pending confirmation)
  │
  ▼
Resolved (resolved: true, resolved_by: user or agent)
```

**UI**: Questions appear as a collapsible section on each story card.
Unresolved questions show a flag icon on the story card in the map view.

### c) Ingested Files View

**Data source**: `documents` table + Eve object store.

When a file is ingested (via Slack, web, or CLI), the backend:
1. Stores metadata in `documents` table
2. Stores file bytes in object store bucket
3. Triggers `doc.ingest` workflow via Eve API
4. Polls/streams job status to update `documents.status`

**Slack ingestion sync**:
- Primary path: webhook listener on `/gateway/providers/slack/webhook` ingests
  channel/thread events and maps them to project/channel metadata.
- Fallback path: periodic poller for job completion events where webhook
  delivery is delayed.
- Deduplication uses Slack `event_id` + Eve job IDs as idempotency keys to prevent
  duplicate document/review upserts.

### d) Expert Feedback View

**Data source**: `reviews` + `expert_opinions` tables.

The expert panel runs in one of two dispatch modes. The sync service
detects which mode was used and denormalizes accordingly:

**Council dispatch** (child jobs): The coordinator returns `prepared`,
the platform spawns 7 child jobs (one per expert), and the coordinator
wakes to synthesize. The sync service:
1. Fetches parent job result → `reviews.synthesis`
2. Fetches 7 child job results → 7 `expert_opinions` rows (each with `eve_job_id`)
3. Sets `reviews.dispatch_mode = 'council'`

**In-process dispatch** (no child jobs): The coordinator runs all 7
expert subagents internally within its own process. A single job
completes with the full synthesis and all expert analyses embedded in
the coordinator's output. The sync service:
1. Fetches the coordinator job result (the only job)
2. Parses expert sections from the structured output → 7 `expert_opinions` rows (`eve_job_id` = NULL)
3. Extracts synthesis → `reviews.synthesis`
4. Sets `reviews.dispatch_mode = 'in_process'`

**Detection heuristic**: If the coordinator job has child jobs, it's
council dispatch. If not, it's in-process. The sync service checks
`GET /jobs/{id}/tree` and inspects child nodes (fallback: `GET /jobs/{id}/context`).
Non-empty children ⇒ council dispatch; empty children ⇒ in-process.

**UI**: Identical regardless of dispatch mode. The user sees the
executive summary with expandable expert sections either way.

**Real-time**: During active reviews, the UI subscribes to
`GET /jobs/{id}/stream` (SSE) to show live progress. For in-process
dispatch, progress events come from the single coordinator job.

### e) Web Chat

**Implementation**: REST endpoint + SSE stream.

```typescript
const eventSource = new EventSource(
  `${API_BASE}/api/chat/threads/${threadId}/stream?token=${encodeURIComponent(token)}`
);
eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  appendChatEvent(update);
};
```

```typescript
// Example send flow
await fetch(`${API_BASE}/api/chat/threads/${threadId}/messages`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'review this document',
    agent_slug: 'pm',
    source: 'web',
  }),
});
```

The web chat uses the same coordinator agent and team dispatch as Slack.
Thread continuity works across sources by persisting `thread_key` and mapping it to
`job_id` / Eve thread IDs. If SSE is unavailable, fallback to polling
`GET /api/chat/threads/:id/messages`.

### f) Web File Ingestion

**Flow**:
1. User selects files in the dashboard
2. Frontend uploads to `POST /api/projects/:id/documents` (multipart)
3. Backend stores in object store, creates `documents` row
4. Backend triggers Eve `doc.ingest` workflow with file reference
5. Coordinator picks up the job, processes files, dispatches panel
6. Backend streams job progress to frontend via SSE
7. On completion, backend denormalizes results into `reviews` + `expert_opinions`
8. Coordinator-generated stories appear on the story map

### g) Project Switching

The project selector in the sidebar lists all projects for the current org.
Each project has:
- A display name (e.g., "Launch v2")
- A slug (e.g., "launch-v2")
- An optional Slack channel binding (e.g., `#pm-launch-v2`)
- An optional Eve project mapping (for future integration)

When the user switches projects, all views (story map, reviews, docs, chat)
filter to that project's scope.

## Agent-Managed Story Creation

The coordinator (or a new `story-writer` agent) creates stories and open
questions via the NestJS API. This makes the backend **agent-native** —
agents and humans use the same API.

```
┌──────────┐        ┌──────────┐        ┌──────────┐
│  Human   │───────▶│  NestJS  │◀───────│  Agent   │
│ (browser)│  REST  │   API    │  REST  │(pm coord)│
└──────────┘        └─────┬────┘        └──────────┘
                          │
                          ▼
                    ┌───────────┐
                    │  Managed  │
                    │  DB + RLS │
                    └───────────┘
```

**Agent access pattern**:
1. During synthesis, coordinator identifies actionable items from expert feedback
2. Coordinator creates stories with open questions:
   ```bash
   curl -X POST "${API_URL}/api/projects/${PROJECT_ID}/stories" \
     -H "Authorization: Bearer ${EVE_TOKEN}" \
     -d '{
       "title": "Add rate limiting to pricing API",
       "description": "Tech lead identified missing rate limiting...",
       "acceptance_criteria": "- 100 req/min per key\n- 429 with retry-after",
       "priority": "high",
       "track_id": "uuid-of-payments-track",
       "source_review_id": "review-uuid",
       "questions": [
         { "question": "What should the burst limit be?", "source": "tech-lead" },
         { "question": "Do free-tier users get rate limiting?", "source": "biz-analyst" }
       ]
     }'
   ```
3. Stories and questions appear on the map immediately
4. Humans review, edit, answer questions, and approve

**Coordinator skill update**:

```markdown
## Story Generation

After synthesizing expert feedback, extract concrete user stories:
- Each story has a title, description, acceptance criteria, and priority
- Assign to an existing track or suggest a new one
- Capture open questions raised by experts — attach to the relevant story
- POST each story (with questions) to the app API
- Include the story list in your executive summary
```

### Story Lifecycle

```
Review completes
  │
  ▼
Coordinator extracts stories + questions from expert feedback
  │
  ▼
Stories created (status: draft, questions attached, created_by: agent)
  │
  ▼
Human reviews on story map → edits, answers questions, reorders
  │
  ▼
Questions resolved → story refined (status: refined)
  │
  ▼
Story approved (status: approved)
  │
  ▼
(Future) Exported to Jira/Linear or assigned to engineering agents
```

## Manifest Changes

Add to `.eve/manifest.yaml`:

```yaml
schema: eve/compose/v2
project: eden

services:
  dashboard:
    build:
      context: ./apps/dashboard
      dockerfile: Dockerfile
    x-eve:
      role: component
      ingress:
        public: true
        port: 3000

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    x-eve:
      role: worker
      ingress:
        public: true
        port: 4000
      api_spec:
        type: openapi
        spec_url: /openapi.json
      object_store:
        buckets:
          - name: uploads
            visibility: private
            cors:
              origins: ["${service.dashboard.url}"]

  db:
    x-eve:
      role: managed_db
      managed:
        class: db.p1
        engine: postgres
        engine_version: "16"

  migrate:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    command: ["npx", "typeorm", "migration:run"]
    x-eve:
      role: job
    environment:
      DATABASE_URL: ${managed.db.url}

environments:
  staging:
    pipeline: deploy
    overrides:
      services:
        api:
          environment:
            NODE_ENV: staging
            DATABASE_URL: ${managed.db.url}
            EVE_API_URL: ${eve.api_url}
            EVE_PUBLIC_API_URL: ${eve.public_api_url}
            EVE_SSO_URL: ${eve.sso_url}
            EVE_ORG_ID: ${eve.org_id}
            STORAGE_ENDPOINT: ${storage.endpoint}
            STORAGE_ACCESS_KEY_ID: ${storage.access_key_id}
            STORAGE_SECRET_ACCESS_KEY: ${storage.secret_access_key}
            STORAGE_BUCKET_UPLOADS: ${storage.bucket.uploads}
```

`managed.*` and `eve.*` interpolation keys are platform-injection conventions and
should be confirmed against current manifest behavior before implementation.

## Repo Structure (After)

```
.eve/manifest.yaml              # Updated with services + environments
.eve/packs.lock.yaml            # Resolved pack state
eve/                            # Agent pack config (unchanged)
skills/                         # Agent skills (coordinator updated for story gen)
apps/
  dashboard/                    # React SPA
    src/
      components/
        auth/
          LoginForm.tsx         # SSO + token login (sentinel-mgr pattern)
        layout/
          AppShell.tsx          # Header with org switcher + nav
          OrgSwitcher.tsx       # Org dropdown
          ProjectSidebar.tsx    # Project list + view nav
        story-map/
          StoryMap.tsx          # Track columns + story cards
          TrackColumn.tsx       # Single track with draggable stories
          StoryCard.tsx         # Story card with status + question count
          StoryDetail.tsx       # Expanded story (edit, questions)
          QuestionList.tsx      # Open questions section
        reviews/
          ReviewList.tsx
          ReviewDetail.tsx
          ExpertOpinion.tsx
        docs/
          FileList.tsx
        chat/
          ChatPanel.tsx
      pages/
        LoginPage.tsx
        StoryMapPage.tsx        # Default view
        ReviewsPage.tsx
        ReviewDetailPage.tsx
        DocsPage.tsx
        ChatPage.tsx
      hooks/
        useEveAuth.ts           # Re-export from @eve-horizon/auth-react
        useChatStream.ts
        useSSE.ts
      api/
        client.ts               # Typed API client with auth header
      App.tsx
      main.tsx
    index.html
    vite.config.ts
    tailwind.config.ts
    Dockerfile
  api/                          # NestJS backend
    src/
      main.ts                   # eveUserAuth() + bridge middleware
      app.module.ts
      common/
        database.service.ts     # RLS-aware DB service (sentinel-mgr pattern)
        auth.guard.ts           # NestJS route guard
      projects/
        projects.controller.ts
        projects.service.ts
        projects.entity.ts
      tracks/
        tracks.controller.ts
        tracks.service.ts
        tracks.entity.ts
      stories/
        stories.controller.ts
        stories.service.ts
        stories.entity.ts
      questions/
        questions.controller.ts
        questions.service.ts
        questions.entity.ts
      documents/
        documents.controller.ts
        documents.service.ts
        documents.entity.ts
      reviews/
        reviews.controller.ts
        reviews.service.ts
        reviews.entity.ts
        expert-opinions.entity.ts
      chat/
        chat.stream.ts          # SSE bridge
      eve/
        eve.service.ts          # Eve API client wrapper
      sync/
        sync.service.ts         # Job result → DB denormalization (council + in-process)
    db/
      migrations/
        20260311000000_create_projects.sql
        20260311000001_create_tracks.sql
        20260311000002_create_stories.sql
        20260311000003_create_open_questions.sql
        20260311000004_create_documents.sql
        20260311000005_create_reviews.sql
    Dockerfile
docs/plans/                     # This file
```

## Implementation Order

| Phase | What | Effort |
|-------|------|--------|
| **1a** | Scaffold NestJS API + managed DB + RLS migrations | Medium |
| **1b** | Scaffold React SPA + Vite + Tailwind + Eve Auth (SSO + org switcher) | Medium |
| **1c** | Projects CRUD + org isolation | Small |
| **1d** | Tracks CRUD + reorder | Small |
| **1e** | Stories CRUD + open questions CRUD | Medium |
| **1f** | Story map UI (drag/drop tracks + cards) | Medium |
| **1g** | Documents list + upload + object store | Medium |
| **1h** | Review list + detail (job result denormalization) | Medium |
| **1i** | Web chat (REST + SSE stream bridge) | Medium |
| **1j** | Real-time review progress (SSE) | Small |
| **1k** | Coordinator skill update (story + question generation) | Small |
| **1l** | Manifest + deploy to staging | Small |
| **2a** | Story export (Jira/Linear webhook) | Small |
| **2b** | Slack review sync (backfill from channel history) | Medium |
| **2c** | Story map filtering + search | Small |

## Key Decisions

### Why story map first (not just a review dashboard)?

Reviews are ephemeral. Stories are the durable artifact. The expert panel
exists to produce structured feedback that feeds into actionable stories.
A dashboard that only shows reviews is a read-only report. A story map is
a working surface that the whole team uses daily.

### Why tracks instead of epics/themes?

"Track" is a visual metaphor that maps directly to the UI — horizontal
lanes on the story map. It avoids overloading terms like "epic" (Jira) or
"theme" (SAFe) that carry baggage. Tracks are simple groupings; they can
represent whatever the team wants (features, workstreams, user journeys).

### Why first-class open questions?

Expert review frequently surfaces unanswered questions: "What's the burst
limit?", "Who approves this?", "Is this GDPR-relevant?" These are currently
buried in review text. Attaching them directly to stories makes them
visible, trackable, and resolvable — and gives agents a structured way to
flag uncertainties.

### Why denormalize job results into our DB?

Eve's job API is optimized for job lifecycle, not dashboard queries. We need:
- Filter reviews by project, date range, status
- Full-text search across expert opinions
- Join documents → reviews → expert opinions efficiently
- Aggregate metrics (reviews per week, expert agreement rates)
- **Uniform access** regardless of dispatch mode (council vs in-process)

A sync service watches for job completion events and denormalizes results
into the managed DB. It detects the dispatch mode (child jobs present →
council; no children → in-process) and extracts expert opinions from either
child job results or the coordinator's structured output. The Eve job API
remains the source of truth for execution state; the DB is the source of
truth for app queries.

### Why RLS for org isolation?

Following the sentinel-mgr pattern. RLS ensures org isolation at the
database layer — even if a controller bug leaks an org filter, Postgres
won't return cross-org data. The DatabaseService sets `app.org_id` per
transaction, and every table policy enforces the match.

### App projects vs Eve projects

App projects are user-facing workspace containers — a team might have
"Launch v2", "Pricing Rework", "Platform Migration". These are not Eve
projects. An app project may optionally map to an Eve project ID for
future integration (e.g., scoping job queries), but v1 treats them as
independent concepts.

## Verification

### Story map flow
1. Create a project "Launch v2"
2. Add tracks: "Onboarding", "Payments", "Core Loop"
3. Add stories to tracks manually
4. Drag a story from "Onboarding" to "Payments"
5. Add an open question to a story
6. Resolve the question → flag disappears from card

### Expert review → story creation
1. Upload `roadmap.pdf` via dashboard
2. Review job starts, progress updates stream in
3. Review completes with synthesis
4. Stories auto-created by coordinator (status: draft, questions attached)
5. Stories appear on the story map in their assigned tracks
6. Open questions from experts visible on each story

### Org switching
1. Log in via Eve SSO
2. See projects for current org
3. Switch to different org via header dropdown
4. Projects, stories, reviews all switch to new org context
5. No cross-org data visible

### Cross-channel continuity
1. Start a review in Slack: `@eve pm review this + spec.pdf`
2. Open the same project in dashboard
3. See the review in reviews list
4. See auto-generated stories on the map
5. Continue conversation in web chat (same thread)
