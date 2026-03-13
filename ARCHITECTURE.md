# Eden Architecture

## System Overview

Eden is a three-layer system: the **Eve Horizon platform** runs AI agents, the **Eden application** stores and serves data, and the **web UI** renders the story map.

```mermaid
graph TB
    subgraph Users["Users"]
        slack["💬 Slack"]
        browser["🌐 Web Browser"]
    end

    subgraph Eve["Eve Horizon Platform"]
        direction TB
        gateway["Chat Gateway"]
        coordinator["PM Coordinator"]

        subgraph panel["Expert Panel"]
            tech["Tech Lead"]
            ux["UX Advocate"]
            biz["Biz Analyst"]
            gtm["GTM Advocate"]
            risk["Risk Assessor"]
            qa["QA Strategist"]
            devil["Devil's Advocate"]
        end

        subgraph intelligence["Intelligence Layer"]
            ingest["Ingestion"]
            extract["Extraction"]
            synth["Synthesis"]
            mapchat["Map Chat"]
            align["Alignment"]
            qevolve["Question Evolution"]
        end
    end

    subgraph Eden["Eden Application"]
        api["NestJS API"]
        web["React SPA"]
        db[("PostgreSQL 16\n+ RLS")]
    end

    slack --> gateway
    gateway --> coordinator
    coordinator -->|prepared| panel
    coordinator -->|success| api

    panel --> coordinator
    intelligence --> api

    browser --> web
    web -->|REST| api
    api --> db

    style Eve fill:#1a1a2e,color:#fff
    style panel fill:#0f3460,color:#fff
    style intelligence fill:#16213e,color:#fff
    style Eden fill:#fff3e0,color:#1a1a2e
    style Users fill:#f0f2f5,color:#1a1a2e
```

## Staged Council Dispatch

The core dispatch pattern. The coordinator runs first and decides: handle it solo, or fan out to the expert panel.

```mermaid
sequenceDiagram
    participant User
    participant Gateway as Chat Gateway
    participant PM as PM Coordinator
    participant Experts as Expert Panel (×7)
    participant API as Eden API

    User->>Gateway: @eve pm "Review this doc..."
    Gateway->>PM: Route message + attachments

    Note over PM: Triage Decision

    alt Solo Path (simple question, map edit)
        PM->>API: Direct API call
        API-->>PM: Response
        PM-->>User: Answer
    else Panel Path (document review, analysis)
        PM->>PM: Process files, prepare content
        PM-->>Gateway: Return "prepared"

        par 7 Experts in Parallel (300s each)
            Gateway->>Experts: Dispatch all experts
            Experts->>Experts: Read prepared content
            Experts-->>Gateway: Expert summaries
        end

        Gateway->>PM: Wake for synthesis
        PM->>PM: Read all 7 summaries
        PM->>API: Create changeset
        PM-->>User: Executive synthesis + changeset link
    end
```

## Document Ingestion Pipeline

When a document is uploaded, three agents work sequentially to extract requirements and propose changes to the story map.

```mermaid
flowchart LR
    upload["📄 Document\nUploaded"] --> ingest

    subgraph pipeline["Ingestion Pipeline (doc.ingest)"]
        direction LR
        ingest["🔍 Ingestion\nExtract content\n(PDF, DOCX, audio,\nvideo, images)"]
        extract["📋 Extraction\nIdentify requirements\n(personas, activities,\nsteps, tasks, questions)"]
        synth["⚖️ Synthesis\nCompare with map\nCreate changeset"]

        ingest --> extract --> synth
    end

    synth --> changeset["📝 Changeset\n(pending review)"]
    changeset --> review{"Human\nReview"}
    review -->|accept| map["🗺️ Story Map\nUpdated"]
    review -->|reject| discard["❌ Discarded"]
    map --> alignment["🔎 Alignment Check\n(auto-triggered)"]

    style pipeline fill:#16213e,color:#fff
    style changeset fill:#fff3e0,color:#1a1a2e
```

## Event-Driven Intelligence

Three workflows fire automatically on domain events, creating a feedback loop that keeps the story map consistent and evolving.

```mermaid
flowchart TB
    subgraph triggers["Trigger Events"]
        doc["doc.ingest\n(document uploaded)"]
        accepted["changeset.accepted\n(changeset applied)"]
        answered["question.answered\n(question answered)"]
    end

    subgraph workflows["Autonomous Workflows"]
        ip["Ingestion Pipeline\ningest → extract → synthesize\n⏱️ 900s"]
        ac["Alignment Check\nscan for conflicts, gaps, duplicates\n⏱️ 600s"]
        qe["Question Evolution\nevaluate answer → propose changes\n⏱️ 600s"]
    end

    subgraph effects["Effects"]
        cs1["📝 New Changeset"]
        qs["❓ New Questions"]
        cs2["📝 New Changeset"]
    end

    doc --> ip --> cs1
    accepted --> ac --> qs
    answered --> qe --> cs2

    cs1 -.->|when accepted| accepted
    cs2 -.->|when accepted| accepted
    qs -.->|when answered| answered

    style triggers fill:#0f3460,color:#fff
    style workflows fill:#1a1a2e,color:#fff
    style effects fill:#fff3e0,color:#1a1a2e
```

## Story Map Data Model

The hierarchical structure of the story map and its supporting entities.

```mermaid
erDiagram
    PROJECT ||--o{ ACTIVITY : contains
    PROJECT ||--o{ PERSONA : defines
    PROJECT ||--o{ RELEASE : tracks
    PROJECT ||--o{ QUESTION : raises
    PROJECT ||--o{ CHANGESET : proposes
    PROJECT ||--o{ INGESTION_SOURCE : ingests

    ACTIVITY ||--o{ STEP : groups
    STEP ||--o{ STEP_TASK : places
    STEP_TASK }o--|| TASK : references
    TASK }o--o| PERSONA : "owned by"
    TASK }o--o| RELEASE : "targeted for"

    QUESTION }o--o{ TASK : "references"

    CHANGESET ||--o{ CHANGESET_ITEM : contains
    CHANGESET }o--o| INGESTION_SOURCE : "sourced from"

    REVIEW ||--o{ EXPERT_OPINION : collects

    PROJECT {
        uuid id PK
        text org_id
        text name
        text slug
    }
    ACTIVITY {
        uuid id PK
        text display_id "ACT-1"
        text name
        int sort_order
    }
    STEP {
        uuid id PK
        text display_id "STP-1.1"
        text name
        int sort_order
    }
    TASK {
        uuid id PK
        text display_id "TSK-1.1.1"
        text title
        text user_story
        jsonb acceptance_criteria
        text lifecycle "current|proposed|discontinued"
        text source_type "research|transcript|scope-doc|ingestion"
    }
    PERSONA {
        uuid id PK
        text code
        text name
        text color
    }
    QUESTION {
        uuid id PK
        text display_id "Q-1"
        text question
        text answer
        text category
        bool is_cross_cutting
    }
    CHANGESET {
        uuid id PK
        text title
        text reasoning
        text status "draft|accepted|rejected|partial"
        text actor
    }
    CHANGESET_ITEM {
        uuid id PK
        text entity_type
        text operation "create|update|delete"
        text status "pending|accepted|rejected"
        text display_reference
    }
```

## API Architecture

The NestJS API is organized into domain modules, each with its own controller and service. All endpoints are protected by an auth guard and scoped by RLS.

```mermaid
graph TB
    subgraph clients["Clients"]
        web["React SPA"]
        agents["Eve Agents"]
        scripts["Test Scripts"]
    end

    subgraph auth["Authentication"]
        sso["Eve SSO Token\n(users)"]
        job["Eve Job Token\n(agents)"]
        dev["Dev Bypass\n(local only)"]
    end

    subgraph guard["Auth Guard + RLS"]
        authguard["AuthGuard\nextract org_id → SET LOCAL app.org_id"]
    end

    subgraph modules["API Modules"]
        direction TB
        projects["Projects"]
        map["Map\n(hydrated tree)"]
        activities["Activities"]
        steps["Steps"]
        tasks["Tasks"]
        personas["Personas"]
        questions["Questions"]
        changesets["Changesets"]
        releases["Releases"]
        chat["Chat\n(Eve proxy)"]
        sources["Sources\n(Eve ingest)"]
        search["Search\n(FTS/GIN)"]
        audit["Audit"]
        export["Export"]
    end

    subgraph db["PostgreSQL 16"]
        rls["RLS Policies\norg_id = current_setting('app.org_id')"]
        tables["15 Tables"]
        gin["GIN Indexes\n(full-text search)"]
    end

    subgraph eve["Eve Platform"]
        evechat["Chat Gateway"]
        eveingest["Ingest Service"]
        eveevents["Event Spine"]
    end

    clients --> auth
    auth --> guard
    guard --> modules
    modules --> db
    chat --> evechat
    sources --> eveingest
    changesets -->|changeset.accepted| eveevents
    questions -->|question.answered| eveevents

    style clients fill:#f0f2f5,color:#1a1a2e
    style auth fill:#16213e,color:#fff
    style guard fill:#0f3460,color:#fff
    style modules fill:#fff3e0,color:#1a1a2e
    style db fill:#1a1a2e,color:#fff
    style eve fill:#e65100,color:#fff
```

## Web Application

The React SPA with its page hierarchy and component architecture.

```mermaid
graph TB
    subgraph app["React Application"]
        authgate["AuthGate\n(Eve SSO)"]

        subgraph shell["AppShell (header + sidebar + nav)"]
            subgraph pages["Pages"]
                projects["ProjectsPage\n/"]
                mappage["MapPage\n/projects/:id/map"]
                qapage["QuestionsPage\n/projects/:id/qa"]
                releases["ReleasesPage\n/projects/:id/releases"]
                changes["ChangesetsPage\n/projects/:id/changes"]
                reviews["ReviewsPage\n/projects/:id/reviews"]
                sourcespage["SourcesPage\n/projects/:id/sources"]
                auditpage["AuditPage\n/projects/:id/audit"]
            end
        end
    end

    subgraph mapcomponents["Story Map Components"]
        storymap["StoryMap\n(grid renderer)"]
        personatabs["PersonaTabs\n(server filter)"]
        rolefilter["RoleFilterPills\n(client highlight)"]
        activityfilter["ActivityFilterBar\n(checkbox filter)"]
        taskcard["TaskCard\n(collapsed + expanded)"]
        minimap["MiniMap\n(bird's-eye navigator)"]
    end

    subgraph panels["Side Panels"]
        chatpanel["ChatPanel\n(Eve chat proxy)"]
        crosscut["CrossCuttingPanel\n(cross-cutting Qs)"]
        questionmodal["QuestionModal\n(autosave + evolve)"]
        changesetmodal["ChangesetReviewModal\n(per-item review)"]
    end

    authgate --> shell
    mappage --> storymap
    mappage --> panels
    storymap --> personatabs
    storymap --> rolefilter
    storymap --> activityfilter
    storymap --> taskcard
    storymap --> minimap

    style app fill:#f0f2f5,color:#1a1a2e
    style shell fill:#fff,color:#1a1a2e
    style mapcomponents fill:#fff3e0,color:#1a1a2e
    style panels fill:#e8eaf6,color:#1a1a2e
```

## Changeset Lifecycle

The changeset system decouples proposal from acceptance. Every AI-proposed change follows this path:

```mermaid
stateDiagram-v2
    [*] --> draft: Created

    draft --> accepted: Accept All
    draft --> rejected: Reject All
    draft --> partial: Per-Item Review

    state partial {
        [*] --> item_review
        item_review --> item_accepted: Accept Item
        item_review --> item_rejected: Reject Item
    }

    accepted --> [*]: Applied to Map\n+ changeset.accepted event
    rejected --> [*]: Discarded
    partial --> [*]: Mixed results applied

    note right of draft
        Sources:
        • Expert panel synthesis
        • Ingestion pipeline
        • Map chat editing
        • Question evolution
    end note

    note right of accepted
        Triggers:
        • alignment-check workflow
        • audit_log entries
    end note
```

## Deployment

Eden deploys to Eve Horizon's managed infrastructure via a manifest-driven pipeline.

```mermaid
flowchart LR
    subgraph pipeline["Deploy Pipeline"]
        build["🔨 Build\nDocker images"]
        release["📦 Release\nPush to registry"]
        deploy["🚀 Deploy\nStart services"]
        migrate["🗃️ Migrate\nRun SQL migrations"]
        smoke1["✅ Smoke Test\nPhase 1"]
        smoke2["✅ Smoke Test\nPhase 2"]

        build --> release --> deploy --> migrate --> smoke1 --> smoke2
    end

    subgraph services["Running Services"]
        api["API\n(NestJS, port 3000)"]
        web["Web\n(nginx, port 80)"]
        db["Managed Postgres\n(db.p1, v16)"]
    end

    smoke2 --> services

    style pipeline fill:#1a1a2e,color:#fff
    style services fill:#fff3e0,color:#1a1a2e
```

## Security Model

```mermaid
graph LR
    subgraph tokens["Token Types"]
        user_token["User Token\n(Eve SSO)"]
        agent_token["Agent Token\n(Eve Job)"]
        dev_token["Dev Token\n(bypass, local only)"]
    end

    subgraph middleware["Middleware Stack"]
        eve_auth["eveUserAuth()\nparse SSO token"]
        agent_auth["Agent Auth\nverify job token"]
        guard["AuthGuard\nreject if no user"]
    end

    subgraph rls["Database Security"]
        set_org["SET LOCAL\napp.org_id = ?"]
        policies["RLS Policies\nSELECT/INSERT/UPDATE\nWHERE org_id = setting"]
    end

    user_token --> eve_auth
    agent_token --> agent_auth
    dev_token --> guard

    eve_auth --> guard
    agent_auth --> guard
    guard --> set_org
    set_org --> policies

    style tokens fill:#16213e,color:#fff
    style middleware fill:#0f3460,color:#fff
    style rls fill:#1a1a2e,color:#fff
```

## Agent Topology

All 14 agents and how they connect:

```mermaid
graph TB
    subgraph routable["Routable (Slack Gateway)"]
        pm["🎯 PM Coordinator\nTriage · Synthesis"]
    end

    subgraph panel["Expert Panel (Staged Council)"]
        direction LR
        tech["⚙️ Tech Lead"]
        ux["🎨 UX Advocate"]
        biz["📊 Biz Analyst"]
        gtm["📈 GTM Advocate"]
        risk["⚠️ Risk Assessor"]
        qa["🧪 QA Strategist"]
        devil["😈 Devil's Advocate"]
    end

    subgraph pipeline["Ingestion Pipeline (Sequential)"]
        direction LR
        ing["📥 Ingestion"]
        ext["📋 Extraction"]
        syn["⚖️ Synthesis"]
        ing --> ext --> syn
    end

    subgraph intel["Intelligence Layer (Event-Driven)"]
        direction LR
        mc["💬 Map Chat"]
        al["🔎 Alignment"]
        qe["❓ Question Evolution"]
    end

    pm -->|"prepared"| panel
    panel -->|"summaries"| pm

    doc_event["doc.ingest"] --> pipeline
    cs_event["changeset.accepted"] --> al
    qa_event["question.answered"] --> qe

    syn --> api["Eden API"]
    mc --> api
    al --> api
    qe --> api
    pm --> api

    style routable fill:#e65100,color:#fff
    style panel fill:#0f3460,color:#fff
    style pipeline fill:#16213e,color:#fff
    style intel fill:#1a1a2e,color:#fff
    style api fill:#fff3e0,color:#1a1a2e
```
