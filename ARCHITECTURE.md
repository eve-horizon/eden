# Eden Architecture

## System Overview

Eden is a three-layer system: the **Eve Horizon platform** runs AI agents, the **Eden application** stores and serves data, and the **web UI** renders the story map.

```mermaid
graph TB
    subgraph Users["Users"]
        slack["Slack"]
        browser["Web Browser"]
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
            qtriage["Question Triage"]
            qevolve["Question Agent"]
            mapgen["Map Generator"]
        end
    end

    subgraph Eden["Eden Application"]
        api["NestJS API"]
        cli["Eden CLI"]
        web["React SPA"]
        db[("PostgreSQL 16\n+ RLS")]
    end

    slack --> gateway
    gateway --> coordinator
    coordinator -->|prepared| panel
    coordinator -->|success| api

    panel --> coordinator
    intelligence -->|eden CLI| api

    browser --> web
    web -->|REST| api
    api --> db
    cli -->|REST| api

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
    participant Experts as Expert Panel (x7)
    participant API as Eden API

    User->>Gateway: @eve pm "Review this doc..."
    Gateway->>PM: Route message + attachments

    Note over PM: Triage Decision

    alt Solo Path (simple question, map edit)
        PM->>API: Direct API call via eden CLI
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
        PM->>API: Create changeset via eden CLI
        PM-->>User: Executive synthesis + changeset link
    end
```

## Document Ingestion Pipeline

When a document is uploaded, agents work sequentially to extract requirements and propose changes to the story map. Note: the ingestion step runs on the platform side (content extraction from PDF/DOCX/audio/video) — the extraction and synthesis agents receive the extracted text.

```mermaid
flowchart LR
    upload["Document\nUploaded"] --> platform

    subgraph platform["Platform Ingest"]
        ingest["Content Extraction\n(PDF, DOCX, audio,\nvideo, images)"]
    end

    platform --> pipeline

    subgraph pipeline["Ingestion Pipeline (doc.ingest)"]
        direction LR
        extract["Extraction\nIdentify requirements\n(personas, activities,\nsteps, tasks, questions)"]
        synth["Synthesis\nCompare with map\nCreate changeset"]

        extract --> synth
    end

    synth --> changeset["Changeset\n(pending review)"]
    changeset --> review{"Human\nReview"}
    review -->|accept| map["Story Map\nUpdated"]
    review -->|reject| discard["Discarded"]
    map --> alignment["Alignment Check\n(auto-triggered)"]

    style platform fill:#0f3460,color:#fff
    style pipeline fill:#16213e,color:#fff
    style changeset fill:#fff3e0,color:#1a1a2e
```

## Project Wizard Flow

When a user creates a new project, the wizard generates an initial story map from a project description and optional uploaded documents.

```mermaid
sequenceDiagram
    participant User
    participant Web as React SPA
    participant API as Eden API
    participant Gen as Map Generator Agent

    User->>Web: Create project + description
    User->>Web: (optional) Upload documents
    Web->>API: POST /projects (with description)
    API-->>Web: Project created (empty map)

    Web->>API: POST /wizard/generate
    API->>Gen: Launch map-generator job
    Note over Gen: Read project description<br/>+ any uploaded docs

    Gen->>API: eden changeset create<br/>(personas, activities, steps, tasks)
    API-->>Gen: Changeset created (draft)

    API->>API: Auto-accept changeset
    API-->>Web: SSE progress updates
    Web-->>User: Story map populated
```

## Event-Driven Intelligence

Three workflows fire automatically on domain events, creating a feedback loop that keeps the story map consistent and evolving. The question-evolution workflow uses a two-step triage pattern: a fast classifier decides whether the answer warrants a map change before invoking the heavier question agent.

```mermaid
flowchart TB
    subgraph triggers["Trigger Events"]
        doc["doc.ingest\n(document uploaded)"]
        accepted["changeset.accepted\n(changeset applied)"]
        answered["question.answered\n(question answered)"]
    end

    subgraph workflows["Autonomous Workflows"]
        ip["Ingestion Pipeline\nextract -> synthesize"]
        ac["Alignment Check\nscan for conflicts, gaps, duplicates"]
        qt["Question Triage\nfast classify: needs_changes?"]
        qe["Question Agent\nevaluate answer -> propose changes"]
    end

    subgraph effects["Effects"]
        cs1["New Changeset"]
        qs["New Questions"]
        cs2["New Changeset"]
    end

    doc --> ip --> cs1
    accepted --> ac --> qs
    answered --> qt
    qt -->|"needs_changes"| qe --> cs2
    qt -->|"informational"| skip["No action"]

    cs1 -.->|when accepted| accepted
    cs2 -.->|when accepted| accepted
    qs -.->|when answered| answered

    style triggers fill:#0f3460,color:#fff
    style workflows fill:#1a1a2e,color:#fff
    style effects fill:#fff3e0,color:#1a1a2e
```

## Story Map Data Model

The hierarchical structure of the story map and its supporting entities. Phase 6 added project membership, saved views, notifications, and project invites.

```mermaid
erDiagram
    PROJECT ||--o{ ACTIVITY : contains
    PROJECT ||--o{ PERSONA : defines
    PROJECT ||--o{ RELEASE : tracks
    PROJECT ||--o{ QUESTION : raises
    PROJECT ||--o{ CHANGESET : proposes
    PROJECT ||--o{ INGESTION_SOURCE : ingests
    PROJECT ||--o{ PROJECT_MEMBER : "has members"
    PROJECT ||--o{ PROJECT_INVITE : "has invites"
    PROJECT ||--o{ MAP_VIEW : "has views"
    PROJECT ||--o{ NOTIFICATION : "sends alerts"

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
        text approval "approved|preview"
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
        text approval_status "applied|pending_approval|owner_approved|owner_rejected"
    }
    PROJECT_MEMBER {
        uuid id PK
        uuid project_id FK
        text user_id
        text email
        text role "owner|editor|viewer"
    }
    PROJECT_INVITE {
        uuid id PK
        uuid project_id FK
        text email
        text role "owner|editor|viewer"
        text status "pending|claimed|expired"
        text eve_invite_code
    }
    MAP_VIEW {
        uuid id PK
        uuid project_id FK
        text name
        text slug
        jsonb filter
        int sort_order
    }
    NOTIFICATION {
        uuid id PK
        uuid project_id FK
        text user_id
        text type
        text title
        bool read
    }
```

## API Architecture

The NestJS API is organized into domain modules, each with its own controller and service. All endpoints are protected by an auth guard and scoped by RLS. Agents access the API exclusively through the `eden` CLI — never via direct REST calls.

```mermaid
graph TB
    subgraph clients["Clients"]
        web["React SPA"]
        agents["Eve Agents\n(via eden CLI)"]
        scripts["Test Scripts"]
    end

    subgraph auth["Authentication"]
        sso["Eve SSO Token\n(users)"]
        job["Eve Job Token\n(agents)"]
        dev["Dev Bypass\n(local only)"]
    end

    subgraph guard["Auth Guard + RLS"]
        authguard["AuthGuard\nextract org_id -> SET LOCAL app.org_id"]
    end

    subgraph modules["API Modules (20)"]
        direction TB

        subgraph core["Story Map"]
            projects["Projects"]
            map["Map\n(hydrated tree)"]
            activities["Activities"]
            steps["Steps"]
            tasks["Tasks"]
            personas["Personas"]
            releases["Releases"]
        end

        subgraph intel["Intelligence"]
            questions["Questions"]
            changesets["Changesets"]
            reviews["Reviews"]
            sources["Sources\n(Eve ingest)"]
            search["Search\n(FTS/GIN)"]
        end

        subgraph collab["Collaboration"]
            members["Members"]
            invites["Invites"]
            views["Views"]
            notifications["Notifications"]
        end

        subgraph infra["Infrastructure"]
            chat["Chat\n(Eve proxy)"]
            wizard["Wizard"]
            audit["Audit"]
            export["Export"]
        end
    end

    subgraph db["PostgreSQL 16"]
        rls["RLS Policies\norg_id = current_setting('app.org_id')"]
        tables["19 Tables"]
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
    style core fill:#fff8e1,color:#1a1a2e
    style intel fill:#e8eaf6,color:#1a1a2e
    style collab fill:#e0f2f1,color:#1a1a2e
    style infra fill:#fce4ec,color:#1a1a2e
    style db fill:#1a1a2e,color:#fff
    style eve fill:#e65100,color:#fff
```

## Web Application

The React SPA with its page hierarchy and component architecture. Authentication uses Eve SSO via `@eve-horizon/auth-react`.

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
                memberspage["MembersPage\n/projects/:id/members"]
            end
        end

        login["LoginPage\n(pre-auth)"]
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

    subgraph collaboration["Collaboration Components"]
        membersmgmt["MembersList\n(invite, role assign)"]
        onboarding["OnboardingWizard\n(project setup)"]
        searchbar["SearchBar\n(full-text search)"]
        authcomp["AuthComponents\n(SSO login flow)"]
    end

    authgate --> shell
    authgate --> login
    mappage --> storymap
    mappage --> panels
    storymap --> personatabs
    storymap --> rolefilter
    storymap --> activityfilter
    storymap --> taskcard
    storymap --> minimap
    memberspage --> collaboration

    style app fill:#f0f2f5,color:#1a1a2e
    style shell fill:#fff,color:#1a1a2e
    style mapcomponents fill:#fff3e0,color:#1a1a2e
    style panels fill:#e8eaf6,color:#1a1a2e
    style collaboration fill:#e0f2f1,color:#1a1a2e
```

## Changeset Lifecycle

The changeset system decouples proposal from acceptance. Every AI-proposed change follows this path. Phase 6a added two-stage approval for owner review.

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
        - Expert panel synthesis
        - Ingestion pipeline
        - Map chat editing
        - Question evolution
        - Project wizard (auto-accept)
    end note

    note right of accepted
        Triggers:
        - alignment-check workflow
        - audit_log entries
        - notifications
    end note
```

## Deployment

Eden deploys to Eve Horizon's managed infrastructure via a manifest-driven pipeline.

```mermaid
flowchart LR
    subgraph pipeline["Deploy Pipeline"]
        build["Build\nDocker images"]
        release["Release\nPush to registry"]
        deploy["Deploy\nStart services"]
        migrate["Migrate\nRun SQL migrations"]
        smoke1["Smoke Test\nPhase 1"]
        smoke2["Smoke Test\nPhase 2"]

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

All 16 agents and how they connect. Agents access the Eden API exclusively through the `eden` CLI — never via direct REST calls.

```mermaid
graph TB
    subgraph routable["Gateway-Routable"]
        pm["PM Coordinator\nTriage - Synthesis"]
    end

    subgraph panel["Expert Panel (Staged Council)"]
        direction LR
        tech["Tech Lead"]
        ux["UX Advocate"]
        biz["Biz Analyst"]
        gtm["GTM Advocate"]
        risk["Risk Assessor"]
        qa["QA Strategist"]
        devil["Devil's Advocate"]
    end

    subgraph pipeline["Ingestion Pipeline (Sequential)"]
        direction LR
        ext["Extraction"]
        syn["Synthesis"]
        ext --> syn
    end

    subgraph intel["Intelligence Layer (Event-Driven)"]
        direction LR
        mc["Map Chat"]
        al["Alignment"]
        qtriage["Question Triage\n(fast classifier)"]
        qagent["Question Agent"]
    end

    subgraph wizard["Wizard"]
        mg["Map Generator"]
    end

    pm -->|"prepared"| panel
    panel -->|"summaries"| pm

    doc_event["doc.ingest"] --> pipeline
    cs_event["changeset.accepted"] --> al
    qa_event["question.answered"] --> qtriage
    qtriage -->|"needs_changes"| qagent
    wizard_event["wizard/generate"] --> mg

    syn -->|"eden CLI"| api["Eden API"]
    mc -->|"eden CLI"| api
    al -->|"eden CLI"| api
    qagent -->|"eden CLI"| api
    pm -->|"eden CLI"| api
    mg -->|"eden CLI"| api

    style routable fill:#e65100,color:#fff
    style panel fill:#0f3460,color:#fff
    style pipeline fill:#16213e,color:#fff
    style intel fill:#1a1a2e,color:#fff
    style wizard fill:#4a148c,color:#fff
    style api fill:#fff3e0,color:#1a1a2e
```

## CLI Architecture

The `eden` CLI wraps every non-webhook REST endpoint, providing the canonical interface for agents and humans. Agents must use the CLI — never raw REST calls.

```mermaid
graph LR
    subgraph users["Users"]
        human["Developers"]
        agents["Eve Agents"]
    end

    subgraph cli["eden CLI (cli/)"]
        direction TB
        auth_cmd["auth"]
        proj["projects"]
        map_cmd["map"]
        act["activities"]
        stp["steps"]
        tsk["tasks"]
        per["personas"]
        cs["changesets"]
        q["questions"]
        rel["releases"]
        src["sources"]
        chat_cmd["chat"]
        mem["members"]
        inv["invites"]
        vw["views"]
        ntf["notifications"]
        wiz["wizard"]
        rev["reviews"]
        aud["audit"]
        exp["export"]
        srch["search"]
    end

    subgraph api["Eden REST API"]
        rest["20 Module Endpoints"]
    end

    human --> cli
    agents --> cli
    cli -->|"HTTP + Bearer token"| api

    style users fill:#f0f2f5,color:#1a1a2e
    style cli fill:#e8eaf6,color:#1a1a2e
    style api fill:#fff3e0,color:#1a1a2e
```
