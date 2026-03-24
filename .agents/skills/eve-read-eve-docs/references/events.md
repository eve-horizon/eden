# Events + Triggers (Current)

## Use When
- You need to configure, inspect, or reason about event sources and payloads.
- You need trigger wiring for webhook, webhook replacement, or automation hooks.
- You need to map events to pipeline/jobs and automation workflows.

## Load Next
- `references/pipelines-workflows.md` for trigger-to-run mapping and dependencies.
- `references/gateways.md` for chat-originated events and provider signatures.
- `references/cli.md` for live event/pipeline inspection commands.

## Ask If Missing
- Confirm event source (`github`, `slack`, `cron`, etc.) and target project.
- Confirm required webhook signatures or integration credentials are available.
- Confirm whether you need one-time replay or persistent subscription behavior.

## Event Model

Events are stored in Postgres and routed by the orchestrator.

Core fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | TypeID (`evt_xxx`) |
| `project_id` | string | Owning project |
| `type` | string | Namespaced event type (e.g., `github.push`) |
| `source` | enum | Event origin (see sources below) |
| `status` | enum | `pending` → `processing` → `completed` / `failed` |
| `payload_json` | object | Event-specific data (varies by type) |
| `env_name` | string? | Target environment |
| `ref_sha` | string? | Git commit SHA |
| `ref_branch` | string? | Git branch name |
| `actor_type` | enum? | `user`, `system`, or `app` |
| `actor_id` | string? | Actor identifier |
| `dedupe_key` | string? | Idempotency key (prevents duplicate processing) |

## Event Sources

`github`, `slack`, `cron`, `manual`, `app`, `system`, `runner`, `chat`

## Event Type Catalog

### GitHub Events

| Type | Trigger | Payload |
|------|---------|---------|
| `github.push` | Push to branch | `{ ref, commits, repository, sender, head_commit }` |
| `github.pull_request` | PR lifecycle | `{ action, number, pull_request: { head, base, title, ... } }` |

Delivered via webhook: `POST /integrations/github/events/{project_id}`. Signature verified with `X-Hub-Signature-256`.

**Quick setup:** `eve github setup --project proj_xxx` provisions the webhook secret and auto-creates the GitHub webhook via `gh` CLI (or prints manual instructions). Use `eve github test` to fire a synthetic push event and verify triggers.

### Slack Events

| Type | Trigger | Payload |
|------|---------|---------|
| `slack.message` | Message in channel | `{ text, channel, user, ts, thread_ts }` |
| `slack.app_mention` | @eve mention | `{ text, channel, user, ts }` |

Delivered via gateway: `POST /gateway/providers/slack/webhook` (or legacy `POST /integrations/slack/events`). Signature verified with Slack signing secret.

### System Events (Auto-Emitted)

| Type | Trigger | Payload |
|------|---------|---------|
| `system.job.failed` | Job execution failure | `{ job_id, attempt_id, error_message, error_code, exit_code }` |
| `system.pipeline.failed` | Pipeline run failure | `{ run_id, pipeline_name, error_message, error_code, exit_code }` |
| `system.doc.created` | Org doc created | `{ org_id, project_id, doc_id, doc_version_id, path, version, content_hash, mutation_id, request_id, metadata }` |
| `system.doc.updated` | Org doc updated | `{ org_id, project_id, doc_id, doc_version_id, path, version, content_hash, mutation_id, request_id, metadata }` |
| `system.doc.deleted` | Org doc deleted | `{ org_id, project_id, doc_id, path, version, content_hash, mutation_id, request_id, metadata }` |
| `system.doc.ingest` | Ingest upload confirmed | `{ org_id, project_id, ingest_id, file_name, mime_type, size_bytes, storage_key, title, callback_url }` |
| `system.resource.hydration.started` | Worker begins resource hydration | `{ job_id, attempt_id, resource_count }` |
| `system.resource.hydration.completed` | Worker completes hydration | `{ job_id, attempt_id, resolved_count, missing_optional_count, failed_required_count, resources[] }` |
| `system.resource.hydration.failed` | Worker hydration failed | `{ job_id, attempt_id, resolved_count, missing_optional_count, failed_required_count, resources[] }` |

These are emitted automatically by the orchestrator when failures occur. Use them for self-healing automation.

Doc events are emitted by the org docs API. Hydration events are emitted by the worker before harness launch.

### Webhook Events

Org and project webhooks can subscribe to event types emitted by the API. The
webhook system stores deliveries and supports replay of failed or filtered
deliveries.

### LLM Usage Events

Harnesses emit `llm.call` events after each provider call. These events contain
usage-only metadata (token counts, model identifiers) and are used for receipts
and live cost tracking. No prompt or response content is included.

### Cron Events

| Type | Trigger | Payload |
|------|---------|---------|
| `cron.tick` | Schedule fires | `{ schedule, trigger_name }` |

### Manual / App Events (Custom)

| Type | Trigger | Payload |
|------|---------|---------|
| `manual.*` | User-created via CLI/API | Any JSON |
| `app.*` | Application-emitted | Any JSON |

Custom events use any `type` string. No schema enforcement — payload can be arbitrary JSON.

## API + CLI

```bash
# List events (filterable)
eve event list [project] --type github.push --source github --status completed

# Show event details
eve event show <event-id>

# Emit a custom event
eve event emit --type manual.test --source manual --payload '{"k":"v"}'
eve event emit --type app.deploy-check --source app --env staging --branch main
```

API endpoints:

```
POST /projects/{project_id}/events         # Create event
GET  /projects/{project_id}/events         # List events (filters: type, source, status)
GET  /projects/{project_id}/events/{id}    # Get event details
```

## Trigger Routing

The orchestrator polls pending events, matches them against manifest triggers, and creates pipeline runs or workflow jobs.

Claiming mechanics use `FOR UPDATE SKIP LOCKED`, so multiple orchestrator
instances can process the queue without double-claiming.

Events can include a `dedupe_key`; the API checks for an existing event with
the same key before creating a new record.

### How Triggers Work

1. Event arrives in the events table (status: `pending`)
2. Orchestrator polls every ~5 seconds
3. Loads project manifest and checks all pipeline/workflow triggers
4. If a trigger matches, creates a pipeline run or workflow job
5. Marks event as `completed` (or `failed`)

### Trigger Types

Triggers are defined in the manifest under `pipelines.<name>.trigger` or `workflows.<name>.trigger`.

#### GitHub Trigger

```yaml
trigger:
  github:
    event: push              # "push" or "pull_request"
    branch: main             # Branch pattern (supports wildcards)
```

```yaml
trigger:
  github:
    event: pull_request
    action: [opened, synchronize, reopened]   # PR actions to match
    base_branch: main                          # Target branch filter
```

Supported PR actions: `opened`, `synchronize`, `reopened`, `closed`.
Branch patterns: exact (`main`), prefix wildcards (`release/*`), suffix wildcards (`*-prod`).

#### Slack Trigger

```yaml
trigger:
  slack:
    event: message           # Slack event type
    channel: C123ABC         # Channel ID
```

#### System Trigger (Self-Healing)

```yaml
trigger:
  system:
    event: job.failed        # "job.failed" or "pipeline.failed"
    pipeline: deploy         # Optional: scope to specific pipeline
```

Use system triggers to build automated remediation flows. When a job or pipeline fails, the system event triggers a recovery pipeline or workflow.

#### Cron Trigger

```yaml
trigger:
  cron:
    schedule: "0 */6 * * *"  # Standard cron expression
```

#### App Trigger (Application Events)

```yaml
trigger:
  app:
    event: document.uploaded  # Matches event.type from source=app
```

Use app triggers for event-driven workflows within your application. Emit events via the API (`eve event emit --source app --type document.uploaded`) and the orchestrator auto-dispatches matching workflows.

#### Generic Event Trigger

```yaml
trigger:
  event:
    source: app              # Any event source (app, runner, chat, etc.)
    type: document.uploaded   # Optional type filter
```

The generic `event` trigger matches any event source+type combination. Use this when your events come from non-standard sources. The `app` trigger is a shorthand for `event.source: app`.

#### Manual Trigger (No Auto-Trigger)

```yaml
trigger:
  manual: true               # Only runs when explicitly invoked
```

### Complete Trigger Example

```yaml
pipelines:
  ci:
    trigger:
      github:
        event: pull_request
        action: [opened, synchronize]
        base_branch: main
    steps:
      - name: test
        script: { run: "pnpm test" }

  deploy:
    trigger:
      github:
        event: push
        branch: main
    steps:
      - name: build
        action: { type: build }
      - name: deploy
        depends_on: [build]
        action: { type: deploy, env_name: staging }

  self-heal:
    trigger:
      system:
        event: job.failed
        pipeline: deploy
    steps:
      - name: diagnose
        agent: { prompt: "Diagnose the failed deploy and suggest a fix" }

workflows:
  process-upload:
    trigger:
      app:
        event: document.uploaded
    steps:
      - name: ingest
        agent: { prompt: "Process the uploaded document" }
```
