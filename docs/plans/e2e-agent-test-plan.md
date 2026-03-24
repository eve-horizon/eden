# End-to-End Agent Test Plan

## Purpose

A comprehensive, agent-executable test plan that verifies the full Eden project lifecycle — from project creation through document ingestion, expert review, chat-driven map editing, and question evolution. Designed to be run by Claude Code agents using Playwright MCP for browser automation and the Eve CLI for backend job monitoring, simultaneously.

## Transport policy

Use the Eden CLI (`eden`) for all supported operations (projects, map, changesets, sources, questions, reviews, personas, tasks, activities, steps). Use raw API calls only when a required CLI command is unavailable.

> **Known CLI issue:** The changeset list `--status` help text says `pending/accepted/rejected`, but the actual DB status for new changesets is `draft`. Use `--status draft` to filter for unreviewed changesets.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Test Orchestrator                    │
│  (Main Claude Code agent executing this plan)        │
├──────────────────────┬──────────────────────────────┤
│  Browser Agent       │  Backend Monitor Agent        │
│  (Playwright MCP)    │  (Eve CLI + Eden CLI)         │
│                      │                               │
│  - Navigate UI       │  - eve job list/follow/logs   │
│  - Fill forms        │  - Poll jobs for status       │
│  - Click buttons     │  - Time agent job durations   │
│  - Take screenshots  │  - Capture error patterns     │
│  - Verify renders    │  - Record token/tool counts   │
└──────────────────────┴──────────────────────────────┘
```

**Orchestration model:** The test orchestrator launches browser actions and backend monitors as parallel subagents where possible. When an agent job is triggered (e.g., ingestion pipeline), one subagent monitors the job while another verifies the UI updates in real-time.

## Environment Setup

### Prerequisites

**Eden CLI setup:** The Eden CLI binary lives at `cli/bin/eden` in the repo. In Eve agent jobs, the platform auto-adds it to `PATH` via the `x-eve.cli` manifest declaration. For local test execution, you must add it to `PATH` manually and set the two env vars the CLI needs (`EVE_APP_API_URL_API` for the API base URL, `EVE_JOB_TOKEN` for Bearer auth).

**API URL:** The Eden API serves routes at the root path (e.g., `/health`, `/projects`). There is **no `/api` prefix** — requests to `/api/...` return 404.

**Auth:** `eve auth token` returns a JWT with your org membership. Creating a project auto-adds you as owner (via `project_members` row). Agent jobs receive their own job tokens and bypass project role checks, but still need correct `org_id` for RLS.

```bash
set -euo pipefail

# 1. Organisation slug — change this for your org
export ORG_SLUG="${ORG_SLUG:-incept5}"

# 2. Test project identifiers
export PROJECT_SLUG="e2e-cloudmetrics"
export PROJECT_NAME="E2E Test — CloudMetrics"

# 3. URLs — NOTE: API has no /api prefix
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"

# 4. Auth token (human user — org member)
export TOKEN="$(eve auth token)"

# 5. Eden CLI setup — two env vars required for local execution
export PATH="$PWD/cli/bin:$PATH"
export EVE_APP_API_URL_API="$EDEN_API"
export EVE_JOB_TOKEN="$TOKEN"
```

### Verify connectivity

```bash
# Health check (root path, no /api prefix)
curl -sf "$EDEN_API/health" | jq .

# Eden CLI works
eden projects list --json | jq '. | length'
```

### Browser authentication

The Eden web UI requires authentication. Before any browser steps, log in via the "Paste CLI token" flow:

1. Navigate to `$EDEN_URL`
2. Click **"Paste CLI token"**
3. Paste the output of `eve auth token` into the token input
4. Click **"Sign in"**
5. Verify the projects list page loads with the user's org name in the header

This must be done once per Playwright session. The token persists in the browser's localStorage.

### Idempotent cleanup (safe to re-run)

If a previous test run left the `e2e-cloudmetrics` project behind, delete it before starting:

```bash
EXISTING=$(curl -sf -H "Authorization: Bearer $TOKEN" "$EDEN_API/projects" \
  | jq -r ".[] | select(.slug == \"$PROJECT_SLUG\") | .id")
if [ -n "$EXISTING" ]; then
  echo "Cleaning up existing project: $EXISTING"
  curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" "$EDEN_API/projects/$EXISTING"
  echo "Deleted."
fi
```

### Agent sync (run before first test)

```bash
eve project sync
eve agents sync --local --allow-dirty
```

### Agent permission model

Eve job tokens are standard `type: "user"` JWTs with org membership (`role: "member"`). The `EditorGuard`/`OwnerGuard` bypass for `type === 'job_token'` does **not** apply — agents authenticate like regular org members.

**How agents get write access:** The `ProjectRoleMiddleware` gives org `member` users `editor` rights by default on all projects (unless an explicit `viewer` row exists in `project_members`). This means agents can create changesets, upload sources, and send chat messages without needing explicit project membership.

**If you see 403 errors from agents:** Check that the token's org membership role is at least `member` and that no explicit `viewer` project_members row exists for the agent's user_id.

### Fixtures

All test input documents live in `tests/fixtures/`:
- `prd-saas-analytics.md` — Primary PRD for ingestion pipeline testing
- `supplementary-api-spec.md` — Secondary document for multi-document ingestion
- `chat-edit-requests.md` — Natural language prompts for map-chat testing
- `question-answers.md` — Pre-crafted answers for question-evolution testing

## Bug Protocol

When a bug is found during any phase:

1. **Open a bead:** `bd create "E2E: <description>" --description="<details>" -t bug -p 2 --json`
2. **Capture evidence:** Take a screenshot (Playwright), save API response, save job logs
3. **Pause testing** at current phase
4. **Fix the bug** — make code changes, commit
5. **Redeploy:** `eve env deploy sandbox --ref HEAD --repo-dir .`
6. **Verify the fix** by re-running the failed step
7. **Close the bead:** `bd close <id> --reason "Fixed" --json`
8. **Resume testing** from where we paused

## Testware Self-Improvement Protocol

Not every failure is an application bug. When a step fails, first determine the root cause category:

| Category | Symptoms | Action |
|----------|----------|--------|
| **Application bug** | API returns wrong status, agent creates duplicates, UI doesn't render data | Follow Bug Protocol above |
| **Testware bug** | Wrong URL, wrong env var, incorrect CLI syntax, bad jq filter, wrong assertion threshold | Follow the loop below |
| **Plan gap** | Step assumes state that doesn't exist, missing prerequisite, unclear instruction that leads the executor astray | Follow the loop below |

### The self-improvement loop

When you identify a testware bug or plan gap (not an application bug):

1. **Stop execution.** Do not try to work around the issue in-line.
2. **Diagnose.** Identify the root cause precisely — wrong URL format? Missing env var? Incorrect command syntax? Unrealistic timing assumption?
3. **Fix the plan.** Edit this document to correct the issue. The fix should prevent anyone following this plan from hitting the same problem again. Be specific: correct the bash snippet, add a prerequisite, update an assertion threshold, add a warning callout.
4. **Clean up.** Delete any test project created during the failed run (use the idempotent cleanup step). Reset to a clean starting state.
5. **Restart from Phase 1.** Do not resume mid-plan after a testware fix — the earlier phases may have produced different state than expected. A clean run validates the fix end-to-end.

### What qualifies as a testware fix

- Correcting environment variable names or values
- Fixing API URL paths (e.g., removing a `/api` prefix that doesn't exist)
- Adding missing CLI setup steps (PATH, auth tokens)
- Adjusting poll counts or timeouts based on observed agent behaviour
- Fixing jq filters to match actual API response shapes
- Adding idempotent cleanup for re-runnability
- Clarifying ambiguous instructions that caused the executor to take a wrong path
- Handling cases the plan didn't anticipate (e.g., agent self-accepting a changeset)

### What does NOT qualify (use Bug Protocol instead)

- The API returning an unexpected error code
- An agent skill making wrong API calls or wasting tool calls
- The UI not rendering data that the API confirms exists
- RLS or auth failures that indicate a real permission model bug

### Tracking testware fixes

For each testware fix, add a brief entry to this log so we can see how the plan has evolved:

| Date | Phase | Issue | Fix |
|------|-------|-------|-----|
| 2026-03-24 | Setup | `EDEN_API` had wrong `/api` prefix; all curl calls hit 404 | Removed prefix, documented that API serves at root |
| 2026-03-24 | Setup | Eden CLI not on PATH; no env vars documented for local execution | Added `PATH`, `EVE_APP_API_URL_API`, `EVE_JOB_TOKEN` setup |
| 2026-03-24 | Setup | No cleanup of prior failed runs; project creation fails on duplicate slug | Added idempotent cleanup step |
| 2026-03-24 | 1.4 | Wizard agent took >5 min; poll loop exhausted before completion | Increased polls to 90, added `eve job follow` for live logs |
| 2026-03-24 | 1.5 | Agent self-accepted changeset; `changeset_id` empty in status response | Added self-acceptance detection and skip logic for step 1.6 |
| 2026-03-24 | Setup | Browser steps assumed authenticated session; login page shown instead | Added "Browser authentication" section with CLI token paste flow |
| 2026-03-24 | 1.4 | Eden CLI `changeset create --project <slug>` passed slug into URL; API expects UUID → 500 | Fixed `autoDetectProject` to resolve slugs to UUIDs (commit cf4cc87) |
| 2026-03-24 | 1.4 | Eve job tokens have `type:user`, org role `member` → agents default to `viewer` → 403 | sp_ prefix detection wrong (reverted). Fixed: org members default to `editor` in ProjectRoleMiddleware (ef8820b) |
| 2026-03-24 | 2.2 | Eve platform ingestion callback may not reach API after a redeploy (webhook routing stale) | If source stays at `processing` after 5min despite Eve ingestion showing `done`, redeploy or wait for pod cycling |

## Agent Efficiency Protocol

For every agent job observed, record:

| Metric | How to capture |
|--------|---------------|
| **Wall-clock time** | Timestamp when job starts vs completes |
| **Job phase transitions** | `eve job show <id>` at intervals |
| **Token usage** | `eve job show <id> --json` → token counts if available |
| **Tool call count** | `eve job logs <id>` → count tool invocations |
| **Wasted turns** | `eve job logs <id>` → look for retries, permission blocks, wrong-path corrections |
| **Error patterns** | Any 4xx/5xx in job logs or agent stderr |

After each phase, write a brief efficiency note. At plan completion, compile into an efficiency report.

---

# Phase 1: Project Creation & Wizard

**Goal:** Create a fresh project, generate an initial story map via the wizard agent, review and accept the changeset.

**Estimated time:** 10 minutes (wizard agent typically takes 5-8 minutes)

### 1.1 Create Project

**API:**
```bash
PROJECT_ID=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PROJECT_NAME\",\"slug\":\"$PROJECT_SLUG\"}" \
  "$EDEN_API/projects" | jq -r '.id')
```

> No Eden CLI command exists yet for project creation; if this is unavailable, add `eden project create` before automating this plan.

**Browser (parallel):**
1. Navigate to `$EDEN_URL`
2. Verify projects list page loads
3. Verify the new project appears in the list

**Assertions:**
- API returns 201 with valid UUID
- Project appears in the browser project list

### 1.2 Verify Empty Map

**CLI:**
```bash
eden map --project "$PROJECT_ID" --json | jq '{personas: (.personas|length), activities: (.activities|length)}'
```

**Browser:**
1. Click into the project
2. Verify the map page loads with an empty state or wizard prompt

**Assertions:**
- `personas: 0, activities: 0`
- UI shows empty map or "Get Started" prompt

### 1.3 Trigger Map Generation (Wizard)

**API:**
```bash
GENERATE=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Real-time analytics platform for SaaS businesses. Ingests product usage events, computes key metrics (MRR, churn, activation, retention), and surfaces insights via dashboards and automated alerts.",
    "audience": "SaaS founders, product managers, customer success managers, and data engineers",
    "capabilities": "Event ingestion via REST API and SDKs, metric computation engine, drag-and-drop dashboards, threshold and anomaly alerting, customer health scoring, scheduled reporting",
    "constraints": "100K events/second peak, 99.9% uptime SLA, SOC 2 Type II, GDPR data residency, P95 dashboard load < 2s"
  }' \
  "$EDEN_API/projects/$PROJECT_ID/generate-map")
JOB_ID=$(echo "$GENERATE" | jq -r '.job_id')
```

**Assertions:**
- Returns 202 with `job_id`

### 1.4 Monitor Wizard Job (Backend Monitor)

**Start timing now.** Poll until complete. Use `eve job follow` in a parallel subagent to stream logs in real-time while polling the status endpoint.

**Status polling (main thread):**
```bash
START_TIME=$(date +%s)
for i in $(seq 1 90); do
  RESULT=$(curl -sf -H "Authorization: Bearer $TOKEN" \
    "$EDEN_API/projects/$PROJECT_ID/generate-map/status?job_id=$JOB_ID")
  STATUS=$(echo "$RESULT" | jq -r '.status')
  echo "[$i] status=$STATUS ($(( $(date +%s) - START_TIME ))s)"
  [ "$STATUS" = "complete" ] && break
  [ "$STATUS" = "failed" ] && echo "FAILED" && break
  sleep 5
done
ELAPSED=$(($(date +%s) - START_TIME))
echo "Wizard completed in ${ELAPSED}s"
CS_ID=$(echo "$RESULT" | jq -r '.changeset_id')
```

**Live log streaming (parallel subagent):**
```bash
eve job follow "$JOB_ID"
```

> **Watch for:** If the agent logs show it adding itself to `project_members` via `eve db sql --write`, that indicates a permission bug — the agent should not need project membership (guards bypass for `job_token` type). Open a bead and investigate.

**Also check job list (parallel subagent):**
```bash
eve job list --project eden --json | jq '.[] | select(.description | test("map-generator|wizard"; "i")) | {id, phase, description}'
```

**Efficiency checkpoint:**
- Record wall-clock time
- Examine job logs for wasted turns: `eve job logs $JOB_ID`
- Count total LLM calls — flag if > 30 (agent should be efficient)
- Flag if > 3 minutes (target: < 2 minutes; observed: ~5-10 minutes if agent hits issues)

**Assertions:**
- Status transitions: `pending` → `running` → `complete`
- Completes within 10 minutes (hard timeout)
- Returns valid `changeset_id`

### 1.5 Inspect Generated Changeset

> **Agent self-acceptance check:** The map-generator SKILL.md may instruct the agent to accept its own changeset. If `CS_ID` is empty (status endpoint shows `complete` but no `changeset_id`), the agent accepted it already. In that case, find the accepted changeset and skip step 1.6:
> ```bash
> # If CS_ID is empty, look for accepted changesets
> if [ -z "$CS_ID" ] || [ "$CS_ID" = "null" ]; then
>   CS_ID=$(eden changeset list --project "$PROJECT_ID" --json \
>     | jq -r '[.[] | select(.source == "map-generator")] | sort_by(.created_at) | last | .id')
>   echo "Agent self-accepted. Changeset: $CS_ID"
>   AGENT_SELF_ACCEPTED=true
> fi
> ```

```bash
CS=$(eden changeset show --id "$CS_ID" --json)
echo "$CS" | jq '{
  title: .title,
  status: .status,
  item_count: (.items | length),
  entity_types: [.items[].entity_type] | group_by(.) | map({(.[0]): length}) | add
}'
```

**Assertions:**
- `persona` count >= 3 (Founder, PM, CSM, Data Engineer)
- `activity` count >= 4 (Ingestion, Metrics, Dashboards, Alerting, Health Scoring, Reporting)
- `step` count >= 8
- `task` count >= 15
- Persona names relevant to the domain (not generic)
- Activity names map to the described capabilities

### 1.6 Accept Changeset

> Skip this step if `AGENT_SELF_ACCEPTED=true` (the agent already accepted in step 1.5).

**API:**
```bash
if [ "${AGENT_SELF_ACCEPTED:-}" != "true" ]; then
  eden changeset accept "$CS_ID"
fi
```

**Browser (parallel):**
1. Navigate to Changes page (`/projects/$PROJECT_ID/changes`)
2. Verify changeset appears with status `accepted`

**Assertions:**
- Changeset status = `accepted` (whether by agent or by this step)
- If agent self-accepted, note this in the efficiency report as a behaviour to review

### 1.7 Verify Populated Map

**CLI:**
```bash
MAP=$(eden map --project "$PROJECT_ID" --json)
echo "$MAP" | jq '{
  personas: (.personas | length),
  activities: (.activities | length),
  total_steps: [.activities[].steps | length] | add,
  total_tasks: [.activities[].steps[].tasks | length] | add
}'
```

**Browser:**
1. Navigate to Map page (`/projects/$PROJECT_ID/map`)
2. Take screenshot
3. Verify activities render as rows
4. Verify task cards are visible with persona badges
5. Verify persona tabs/filters appear
6. Verify stats bar shows correct counts

**Assertions (API):**
- personas >= 3
- activities >= 4
- total_steps >= 8
- total_tasks >= 15

**Assertions (Browser):**
- Activity rows visible
- Task cards render with titles
- No error banners
- No empty-state message (map is populated)

### 1.8 Verify Audit Trail

```bash
curl -sf -H "Authorization: Bearer $TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID/audit" | jq '.entries | length'
```

**Assertions:**
- Audit entries exist recording changeset acceptance and entity creation

---

# Phase 2: Document Ingestion Pipeline

**Goal:** Upload a PRD document, trigger the 3-agent ingestion pipeline (ingest → extract → synthesize), verify changeset creation.

**Estimated time:** 8 minutes

### 2.1 Create Source Record & Upload Content

> Note: Eden CLI does not yet support source creation; use raw API for this step.

```bash
# Step 1: Create source metadata — returns presigned upload_url
SOURCE=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename": "prd-saas-analytics.md", "content_type": "text/markdown", "file_size": 5000}' \
  "$EDEN_API/projects/$PROJECT_ID/sources")
SOURCE_ID=$(echo "$SOURCE" | jq -r '.id')
UPLOAD_URL=$(echo "$SOURCE" | jq -r '.upload_url')

# Step 2: Upload the actual file content to the presigned URL
curl -sf -X PUT -H "Content-Type: text/markdown" \
  --data-binary @tests/fixtures/prd-saas-analytics.md \
  "$UPLOAD_URL"
```

**Browser:**
1. Navigate to Sources page (`/projects/$PROJECT_ID/sources`)
2. Verify source appears with status `uploaded`

**Assertions:**
- API returns 201 with source ID and `upload_url`
- Upload returns 200
- Source status = `uploaded`

### 2.2 Confirm Source (Trigger Pipeline)

> Note: Source confirmation is not yet exposed in the Eden CLI.

```bash
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  "$EDEN_API/sources/$SOURCE_ID/confirm" | jq '{status}'
```

**This fires the `doc.ingest` event, triggering the ingestion-pipeline workflow.**

**Assertions:**
- Status changes to `processing`

### 2.3 Monitor Ingestion Pipeline (Backend Monitor — parallel subagent)

**Start timing.** This is a 3-stage pipeline: Eve ingest (platform-handled) → extract (agent) → synthesize (agent). Only the last two stages produce observable agent jobs.

```bash
START_TIME=$(date +%s)

# Watch for pipeline jobs
for i in $(seq 1 60); do
  JOBS=$(eve job list --project eden --json 2>/dev/null | jq '[.[] | select(.description | test("extract|synthe|ingest"; "i"))]')
  JOB_COUNT=$(echo "$JOBS" | jq 'length')
  echo "[$i] Pipeline jobs: $JOB_COUNT"
  echo "$JOBS" | jq '.[] | {id: .id[0:12], phase, description}'

  # Check if synthesis is done (last step)
  SYNTH_DONE=$(echo "$JOBS" | jq '[.[] | select(.description | test("synthe"; "i")) | select(.phase == "done")] | length')
  [ "$SYNTH_DONE" -gt 0 ] && echo "Pipeline complete!" && break
  sleep 10
done

ELAPSED=$(($(date +%s) - START_TIME))
echo "Ingestion pipeline completed in ${ELAPSED}s"
```

**Capture per-agent timing:**
- Extraction agent: start → done
- Synthesis agent: start → done
- Total pipeline wall-clock

**Efficiency checkpoint:**
- Review extraction agent logs for unnecessary API calls
- Review synthesis agent logs for redundant map reads
- Flag if total pipeline > 5 minutes (target: < 3 minutes)

### 2.4 Verify Source Status Updated

```bash
for i in $(seq 1 12); do
  STATUS=$(eden source show "$SOURCE_ID" --json | jq -r '.status')
  echo "Source status: $STATUS"
  if [ "$STATUS" = "synthesized" ] || [ "$STATUS" = "done" ]; then
    break
  fi
  sleep 10
done
```

**Browser (pipeline progress):**
1. Navigate to Sources page — source should already show `processing` status
2. Verify pipeline progress bar is visible (3-stage bar: processing → extracted → synthesized)
3. Verify the spinning indicator appears on the status badge
4. Verify auto-polling updates the status without manual refresh (page polls every 5s)
5. Wait for status badge to transition through: `processing` → `extracted` → `synthesized`
6. Click the source row to expand the detail panel
7. Verify detail panel shows: filename, content type, size, upload date
8. Take screenshot of completed pipeline progress

**Assertions:**
- Source status = `synthesized` or `done`
- Pipeline progress bar reached final stage
- Detail panel renders metadata correctly

### 2.5 Verify Ingestion Changeset

```bash
CS_LIST=$(eden changeset list --project "$PROJECT_ID" --status draft --json)
INGEST_CS=$(echo "$CS_LIST" | jq '[.[] | select(.source == "ingestion" or .source == "synthesis")] | .[0]')
echo "$INGEST_CS" | jq '{title, source, item_count: (.items | length), entity_types: [.items[].entity_type] | group_by(.) | map({(.[0]): length}) | add}'
```

**Assertions:**
- Changeset exists with source `ingestion` or `synthesis`
- Contains items relevant to the PRD content (not hallucinated)
- Items reference entities from the uploaded CloudMetrics PRD
- No duplicate entities that already exist on the map from Phase 1

### 2.6 Accept Ingestion Changeset

```bash
INGEST_CS_ID=$(echo "$INGEST_CS" | jq -r '.id')
eden changeset accept "$INGEST_CS_ID"
```

**Assertions:**
- Returns 200
- Map now includes entities from both wizard generation AND document ingestion

### 2.7 Verify Expanded Map

```bash
MAP=$(eden map --project "$PROJECT_ID" --json)
echo "$MAP" | jq '{
  personas: (.personas | length),
  activities: (.activities | length),
  total_steps: [.activities[].steps | length] | add,
  total_tasks: [.activities[].steps[].tasks | length] | add
}'
```

**Browser:**
1. Navigate to Map page
2. Take screenshot
3. Verify new entities appear alongside wizard-generated ones

**Assertions:**
- Entity counts have grown from Phase 1 baseline
- No duplicate activities with identical names

---

# Phase 3: Alignment Check (Automatic)

**Goal:** Verify that accepting the ingestion changeset in Phase 2 automatically triggered the alignment agent, which scans for conflicts, gaps, and duplicates.

**Estimated time:** 3 minutes

### 3.1 Monitor Alignment Job

The `changeset.accepted` event should have triggered the alignment-check workflow automatically.

```bash
START_TIME=$(date +%s)
for i in $(seq 1 24); do
  ALIGN_JOBS=$(eve job list --project eden --json 2>/dev/null | \
    jq '[.[] | select(.description | test("alignment"; "i")) | select(.phase != "done")]')
  DONE_JOBS=$(eve job list --project eden --json 2>/dev/null | \
    jq '[.[] | select(.description | test("alignment"; "i")) | select(.phase == "done")]')
  echo "[$i] Active alignment: $(echo "$ALIGN_JOBS" | jq length), Done: $(echo "$DONE_JOBS" | jq length)"
  [ "$(echo "$DONE_JOBS" | jq length)" -gt 0 ] && break
  sleep 10
done
ELAPSED=$(($(date +%s) - START_TIME))
echo "Alignment completed in ${ELAPSED}s"
```

**Efficiency checkpoint:**
- Review alignment agent logs for redundant map reads
- Count API calls made by the agent
- Target: < 2 minutes for alignment scan

### 3.2 Verify Alignment Questions Created

```bash
QUESTIONS=$(eden question list --project "$PROJECT_ID" --json)
echo "$QUESTIONS" | jq '[.[] | {question: ((.question // .text) // "" )[0:80], category, status, priority}]'
ALIGNMENT_Q=$(echo "$QUESTIONS" | jq '[.[] | select(.category == "conflict" or .category == "gap" or .category == "duplicate" or .category == "assumption")] | length')
echo "Alignment questions: $ALIGNMENT_Q"
```

> Note: The alignment agent creates questions with standard categories (`conflict`, `gap`, `duplicate`, `assumption`) — there is no `alignment` category value.

**Browser:**
1. Navigate to Q&A page (`/projects/$PROJECT_ID/qa`)
2. Verify questions appear
3. Take screenshot

**Assertions:**
- At least 1 question created after changeset acceptance
- Questions reference real map entities (not hallucinated)
- Questions use valid categories: `conflict`, `gap`, `duplicate`, or `assumption`
- Q&A page renders them without errors

---

# Phase 4: Expert Panel Review

**Goal:** Send the populated map for expert panel review via chat, verify the staged council dispatch, and confirm the review record is created.

**Estimated time:** 10 minutes

### 4.1 Create Chat Thread and Send Review Request

```bash
THREAD=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "We have populated our CloudMetrics story map from the wizard and ingested the full PRD. Please do a comprehensive expert panel review. Are there gaps in our coverage? Missing personas? Architecture risks? Testing blind spots? What should we prioritize for MVP?"}' \
  "$EDEN_API/projects/$PROJECT_ID/chat/threads")
THREAD_ID=$(echo "$THREAD" | jq -r '.thread_id // .id')
echo "Thread: $THREAD_ID"
```

**Browser (parallel):**
1. Navigate to Map page
2. Open chat panel (if visible in sidebar)
3. Verify the message appears in the chat

### 4.2 Monitor Coordinator + Expert Fan-Out (Backend Monitor)

```bash
START_TIME=$(date +%s)
TIMEOUT=480

while true; do
  ELAPSED=$(( $(date +%s) - START_TIME ))
  [ $ELAPSED -gt $TIMEOUT ] && echo "TIMEOUT at ${ELAPSED}s" && break

  # Check job status via Eve CLI
  ALL_JOBS=$(eve job list --project eden --json 2>/dev/null)
  COORDINATOR=$(echo "$ALL_JOBS" | jq '[.[] | select(.description | test("coordinator|pm"; "i"))] | sort_by(.created_at) | last')
  EXPERTS=$(echo "$ALL_JOBS" | jq '[.[] | select(.description | test("tech-lead|ux-advocate|biz-analyst|gtm|risk-assess|qa-strat|devil"; "i"))]')

  COORD_PHASE=$(echo "$COORDINATOR" | jq -r '.phase // "unknown"')
  EXPERT_ACTIVE=$(echo "$EXPERTS" | jq '[.[] | select(.phase == "active")] | length')
  EXPERT_DONE=$(echo "$EXPERTS" | jq '[.[] | select(.phase == "done")] | length')
  EXPERT_CANCELLED=$(echo "$EXPERTS" | jq '[.[] | select(.phase == "cancelled")] | length')
  if [ "$COORD_PHASE" = "done" ] || [ "$COORD_PHASE" = "complete" ]; then COORD_DONE=0; else COORD_DONE=1; fi

  echo "[${ELAPSED}s] Coordinator: $COORD_PHASE | Experts — active:$EXPERT_ACTIVE done:$EXPERT_DONE cancelled:$EXPERT_CANCELLED"

  # Panel complete
  [ "$COORD_DONE" -eq 0 ] && [ "$EXPERT_DONE" -ge 7 ] && echo "Full panel complete!" && break
  # Solo path
  [ "$COORD_DONE" -eq 0 ] && [ "$EXPERT_CANCELLED" -ge 7 ] && echo "Solo path — coordinator handled alone" && break
  # All done
  [ "$COORD_DONE" -eq 0 ] && [ $((EXPERT_DONE + EXPERT_CANCELLED)) -ge 7 ] && break

  sleep 15
done

TOTAL_TIME=$(($(date +%s) - START_TIME))
echo "Expert panel completed in ${TOTAL_TIME}s"
```

**Efficiency checkpoint (critical):**
- Record per-expert timing
- Look for experts that take disproportionately long
- Check for permission blocks in job logs
- Count tool calls per expert — flag if any expert uses > 20 tool calls
- Check if coordinator makes redundant API calls before dispatching
- **Target:** Full panel < 6 minutes, each expert < 2 minutes

### 4.3 Verify Review Record Created

```bash
for i in $(seq 1 12); do
  REVIEWS=$(eden review list --project "$PROJECT_ID" --json)
  [ "$(echo "$REVIEWS" | jq 'length')" -gt 0 ] && break
  sleep 10
done

echo "$REVIEWS" | jq '.[0] | {title, status, expert_count}'
REVIEW_ID=$(echo "$REVIEWS" | jq -r '.[0].id')
```

**Browser:**
1. Navigate to Reviews page (`/projects/$PROJECT_ID/reviews`)
2. Verify review card appears with title, status badge, expert count
3. Click review to expand
4. Verify synthesis text renders
5. Verify expert opinion sections are visible
6. Take screenshot

**Assertions:**
- At least 1 review record exists
- Review status = `complete`
- Expert opinions cover multiple domains (tech, ux, business, risk, qa)
- Synthesis text is non-empty and coherent
- Reviews page renders without 404 or errors

### 4.4 Verify Chat Response

```bash
MESSAGES=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$EDEN_API/chat/threads/$THREAD_ID/messages")
echo "$MESSAGES" | jq '.[-1].content[0:300]'
```

**Browser:**
1. Verify chat panel shows the response
2. Response should reference specific map entities

**Assertions:**
- Chat thread has response message(s)
- Response addresses technical feasibility, UX, business, risk, QA perspectives

---

# Phase 5: Chat-Driven Map Editing

**Goal:** Use natural language chat to make map changes, verifying the map-chat agent creates changesets (not direct mutations).

**Estimated time:** 8 minutes

### 5.1 Simple Persona Addition (CHAT-01)

**API:**
```bash
THREAD2=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Add a new persona called \"Data Engineer\" with code DE and color #8B5CF6. They are responsible for configuring event schemas, managing data pipelines, and troubleshooting ingestion failures."}' \
  "$EDEN_API/projects/$PROJECT_ID/chat/threads")
THREAD2_ID=$(echo "$THREAD2" | jq -r '.thread_id // .id')
```

**Monitor (parallel):** Watch for map-chat job and resulting changeset.

```bash
START_TIME=$(date +%s)
for i in $(seq 1 36); do
  CS=$(eden changeset list --project "$PROJECT_ID" --status draft --json \
    | jq '[.[] | select(.source == "map-chat")] | sort_by(.created_at) | last')
  [ "$CS" != "null" ] && [ -n "$CS" ] && echo "Changeset created!" && break
  sleep 5
done
ELAPSED=$(($(date +%s) - START_TIME))
echo "Map-chat responded in ${ELAPSED}s"
echo "$CS" | jq '{title, item_count: (.items | length), items: [.items[] | {entity_type, operation}]}'
```

**Assertions:**
- Changeset created with source `map-chat`
- Contains persona create operation for "Data Engineer"
- Completes within 2 minutes

**Accept:**
```bash
CS_CHAT_ID=$(echo "$CS" | jq -r '.id')
eden changeset accept "$CS_CHAT_ID"
```

### 5.2 Complex Multi-Entity Change (CHAT-07)

**API:**
```bash
THREAD3=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "The Customer Health Scoring section needs more detail. Add steps for: Health Score Configuration with tasks for defining score weights and configuring data sources, Risk Detection with tasks for automated red-flag identification and churn prediction model integration, and Intervention Workflows with tasks for CSM task auto-assignment and escalation policy configuration. Assign the CSM persona as owner and Product Manager as contributor."}' \
  "$EDEN_API/projects/$PROJECT_ID/chat/threads")
THREAD3_ID=$(echo "$THREAD3" | jq -r '.thread_id // .id')
```

**Monitor and accept** same as 5.1.

**Efficiency checkpoint:**
- Compare turnaround time for simple (5.1) vs complex (5.2) requests
- Check if map-chat makes excessive map reads before proposing changes
- Count total API calls in job logs
- **Target:** Simple change < 90s, complex change < 3 minutes

**Browser verification after accepting both:**
1. Navigate to Map page
2. Verify "Data Engineer" persona appears in filters
3. Verify new Customer Health Scoring steps/tasks appear
4. Take screenshot

### 5.3 Cross-Cutting Question Addition (CHAT-06)

**API:**
```bash
THREAD4=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "I am not sure about the pricing model yet. Can you add questions about: (1) whether per-event pricing will discourage high-volume usage, (2) how seat-based pricing handles API-only integrations with no human users, and (3) whether we need a free tier for developer adoption?"}' \
  "$EDEN_API/projects/$PROJECT_ID/chat/threads")
THREAD4_ID=$(echo "$THREAD4" | jq -r '.thread_id // .id')
```

**Monitor:** Wait for changeset with question entities.

**Assertions:**
- Changeset contains question-type items
- Questions are relevant to pricing (not generic)

---

# Phase 6: Question Evolution

**Goal:** Answer an alignment question, trigger the question-agent workflow, verify it evaluates the answer and optionally creates a changeset.

**Estimated time:** 5 minutes

### 6.1 Select a Question to Answer

```bash
QUESTIONS=$(eden question list --project "$PROJECT_ID" --status open --json)
# Pick the first open question
if [ "$(echo "$QUESTIONS" | jq 'length')" -eq 0 ]; then
  echo "No open questions available — abort phase 6.1."
  exit 1
fi
Q_ID=$(echo "$QUESTIONS" | jq -r '.[0].id')
Q_TEXT=$(echo "$QUESTIONS" | jq -r '.[0].text // .[0].question')
echo "Evolving question: $Q_TEXT"
```

### 6.2 Evolve with Answer

Use an answer from `tests/fixtures/question-answers.md` or craft one relevant to the selected question.

```bash
eden question evolve "$Q_ID" --answer "Cloud-only for the first 18 months. Self-hosted is a Phase 3 initiative targeting enterprise customers with strict data residency requirements. For now, we offer multi-region cloud deployment (US-East, EU-West, APAC-Singapore) to satisfy data residency needs without the operational burden of self-hosted support."
```

### 6.3 Monitor Question-Agent Job

```bash
START_TIME=$(date +%s)
for i in $(seq 1 24); do
  Q_JOBS=$(eve job list --project eden --json 2>/dev/null | \
    jq '[.[] | select(.description | test("question"; "i")) | select(.phase == "done")]')
  [ "$(echo "$Q_JOBS" | jq 'length')" -gt 0 ] && break
  sleep 10
done
ELAPSED=$(($(date +%s) - START_TIME))
echo "Question-agent completed in ${ELAPSED}s"
```

**Efficiency checkpoint:**
- How many API calls does the question-agent make?
- Does it read the full map or just relevant portions?
- **Target:** < 2 minutes

### 6.4 Check for Resulting Changeset

```bash
EVOLUTION_CS=$(eden changeset list --project "$PROJECT_ID" --status draft --json \
  | jq '[.[] | select(.source == "question-evolution")] | last')

if [ "$EVOLUTION_CS" != "null" ] && [ -n "$EVOLUTION_CS" ]; then
  echo "Changeset created from answer:"
  echo "$EVOLUTION_CS" | jq '{title, item_count: (.items | length)}'
  # Accept it
  EVO_CS_ID=$(echo "$EVOLUTION_CS" | jq -r '.id')
  eden changeset accept "$EVO_CS_ID"
else
  echo "No changeset — answer was informational (valid outcome)"
fi
```

**Browser:**
1. Navigate to Q&A page
2. Verify answered question shows updated status
3. If changeset created, verify it appears on Changes page

**Assertions:**
- Question status updated to `answered`
- Either a changeset is created (answer implies changes) or no changeset (informational) — both valid
- No errors in question-agent job logs

---

# Phase 7: Second Document Ingestion

**Goal:** Ingest a supplementary document to verify the pipeline handles incremental additions without creating duplicates.

**Estimated time:** 5 minutes

### 7.1 Upload Supplementary Document (Browser Flow)

**This phase tests the real user upload flow via the browser UI.** Phase 2 used API calls; this verifies the drag-and-drop/file-picker path end-to-end.

**Browser (primary):**
1. Navigate to Sources page (`/projects/$PROJECT_ID/sources`)
2. Verify the upload zone is visible (`[data-testid="upload-zone"]`)
3. Upload `tests/fixtures/supplementary-api-spec.md` via Playwright file upload:
   - Use `browser_file_upload` targeting the hidden file input inside the upload zone
   - Accepted types: `.pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg`
4. Verify "Processing..." spinner appears in the upload zone during upload
5. Verify the new source appears in the sources table after upload completes
6. Verify source status badge shows `processing` (confirm was called automatically by the UI)
7. Take screenshot

**Assertions:**
- Upload zone accepts the file without errors
- No error banner appears (e.g., "Upload failed", CORS errors on presigned URL)
- Source appears in table with filename `supplementary-api-spec.md`
- Status progresses past `uploaded` automatically (UI calls create → PUT → confirm in sequence)

**Backend verification (parallel):**
```bash
# Get the second source ID from the list
SOURCE2_ID=$(eden source list --project "$PROJECT_ID" --json \
  | jq -r '[.[] | select(.filename == "supplementary-api-spec.md")] | .[0].id')
echo "Source2: $SOURCE2_ID"
```

### 7.2 Monitor Pipeline (same as Phase 2.3)

Record timing and compare to first ingestion run.

**Browser (parallel with backend monitor):**
1. Stay on Sources page — verify auto-polling updates status without manual refresh
2. Watch status badge transition: `processing` → `extracted` → `synthesized`
3. Verify pipeline progress bar animates through stages
4. Click the source row to expand detail panel after completion
5. Verify "Tasks from this source" section populates (if pipeline created tasks)
6. Take screenshot of completed state

### 7.3 Verify Incremental Changeset

**Assertions:**
- Changeset contains genuinely new entities from the API spec
- Does NOT duplicate entities already on the map (e.g., doesn't re-create "Event Ingestion" activity)
- Synthesis agent recognized existing map state and proposed only additions/modifications

### 7.4 Accept and Verify Map Growth

Accept changeset, then verify map entity counts grew without duplicates.

**Efficiency checkpoint:**
- Compare pipeline timing: first run vs second run
- Does synthesis agent spend less time on incremental additions?
- Flag any duplicate entity creation as a bug

---

# Phase 8: UI Comprehensive Verification

**Goal:** Full browser-driven verification of all UI pages with the now-rich project data.

**Estimated time:** 5 minutes

All steps use Playwright MCP browser automation.

### 8.1 Map Page

1. Navigate to `/projects/$PROJECT_ID/map`
2. **Verify layout:** Activities as horizontal rows, steps as columns, task cards in cells
3. **Verify persona tabs:** Click each persona tab, verify card filtering
4. **Verify stats bar:** Shows accurate counts matching API
5. **Verify minimap:** Visible, shows activity labels
6. **Verify search:** Type a task name in search, verify results narrow
7. Take screenshot

### 8.2 Q&A Page

1. Navigate to `/projects/$PROJECT_ID/qa`
2. Verify questions list renders (both alignment and chat-created)
3. Verify answered questions show different status badge
4. Click a question to see references
5. Take screenshot

### 8.3 Changes Page

1. Navigate to `/projects/$PROJECT_ID/changes`
2. Verify multiple changesets listed (wizard, ingestion x2, map-chat, question-evolution)
3. Verify status badges (accepted, draft)
4. Click a changeset to see items
5. Take screenshot

### 8.4 Reviews Page

1. Navigate to `/projects/$PROJECT_ID/reviews`
2. Verify review card(s) render
3. Expand a review — verify synthesis and expert opinions
4. Take screenshot

### 8.5 Sources Page

1. Navigate to `/projects/$PROJECT_ID/sources`
2. Verify both uploaded documents appear
3. Verify status badges show completion
4. Take screenshot

### 8.6 Audit Page

1. Navigate to `/projects/$PROJECT_ID/audit`
2. Verify audit entries span the full lifecycle
3. Verify actions include: changeset accepts, entity creates, question evolution
4. Take screenshot

### 8.7 Releases Page

1. Navigate to `/projects/$PROJECT_ID/releases`
2. Verify page renders without errors (may be empty — that's OK)

### 8.8 Members Page

1. Navigate to `/projects/$PROJECT_ID/members`
2. Verify page renders, shows current user as owner

---

# Phase 9: Edge Cases & Negative Testing

**Goal:** Verify the system handles invalid inputs, concurrent operations, and boundary conditions gracefully.

**Estimated time:** 5 minutes

### 9.1 Reject a Changeset

Create a changeset via chat, then reject it instead of accepting.

```bash
# Send a chat message that will create a changeset
THREAD_NEG=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Add a new activity called Temporary Test Activity with one step and one task."}' \
  "$EDEN_API/projects/$PROJECT_ID/chat/threads")

# Wait for map-chat changeset, then reject it
for i in $(seq 1 24); do
  NEG_CS=$(eden changeset list --project "$PROJECT_ID" --status draft --json \
    | jq '[.[] | select(.source == "map-chat")] | sort_by(.created_at) | last')
  if [ "$NEG_CS" != "null" ] && [ -n "$NEG_CS" ]; then
    NEG_CS_ID=$(echo "$NEG_CS" | jq -r '.id')
    break
  fi
  sleep 5
done
[ -n "${NEG_CS_ID:-}" ] || { echo "No map-chat draft changeset found"; exit 1; }

eden changeset reject "$NEG_CS_ID"
```

**Assertions:**
- Changeset status = `rejected`
- Map is NOT modified (no "Temporary Test Activity" appears)
- No alignment job triggered (rejected changesets should not fire `changeset.accepted`)

### 9.2 Invalid Project Access

```bash
# Try accessing a non-existent project
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
  "$EDEN_API/projects/00000000-0000-0000-0000-000000000000/map"
```

**Assertions:**
- Returns 404 (not 500)

### 9.3 Unauthenticated Access

```bash
curl -s -o /dev/null -w "%{http_code}" "$EDEN_API/projects/$PROJECT_ID/map"
```

**Assertions:**
- Returns 401

### 9.4 Duplicate Project Slug

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Duplicate Test","slug":"e2e-cloudmetrics"}' \
  "$EDEN_API/projects"
```

**Assertions:**
- Returns 409 or 400 (not 500)

### 9.5 Empty Wizard Input

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "", "audience": "", "capabilities": "", "constraints": ""}' \
  "$EDEN_API/projects/$PROJECT_ID/generate-map"
```

**Assertions:**
- Returns 400 or handles gracefully (not 500)

### 9.6 Double Accept

```bash
# Try to accept an already-accepted changeset
eden changeset accept "$CS_ID"
```

**Assertions:**
- CLI should fail gracefully with non-acceptance feedback (idempotent, not 500)

### 9.7 Evolve Already-Answered Question

```bash
eden question evolve "$Q_ID" --answer "Trying to answer again"
```

**Assertions:**
- Should fail with a non-acceptance error or report idempotent "already answered" (not a crash).

---

# Phase 10: Cleanup & Efficiency Report

### 10.1 Delete Test Project

```bash
# DELETE returns 204 No Content (empty body)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$EDEN_API/projects/$PROJECT_ID")
echo "Delete status: $HTTP_CODE"
```

**Assertions:**
- Returns 204

**Browser:**
1. Navigate to projects list
2. Verify "E2E Test — CloudMetrics" no longer appears

### 10.2 Compile Efficiency Report

After all phases, compile a summary:

```
## Agent Efficiency Report

### Timing Summary
| Agent Job | Wall Clock | Target | Status |
|-----------|-----------|--------|--------|
| Map Generator (wizard) | Xs | < 2min | OK/SLOW |
| Ingestion Pipeline #1 | Xs | < 3min | OK/SLOW |
| Ingestion Pipeline #2 | Xs | < 3min | OK/SLOW |
| Alignment Check | Xs | < 2min | OK/SLOW |
| Expert Panel (total) | Xs | < 6min | OK/SLOW |
| Expert Panel (per-expert avg) | Xs | < 2min | OK/SLOW |
| Map-Chat (simple) | Xs | < 90s | OK/SLOW |
| Map-Chat (complex) | Xs | < 3min | OK/SLOW |
| Question Evolution | Xs | < 2min | OK/SLOW |

### Waste Analysis
- Total tool calls across all jobs: N
- Estimated wasted calls (retries, wrong paths): N (X%)
- Permission blocks encountered: N
- Most expensive agent: <name> (N tool calls, Xs)

### Recommendations
(Fill after analysis — specific suggestions for reducing latency/cost)
```

### 10.3 Close All Beads

```bash
# List any open bugs found during testing
bd list --status=open
# Close any that were fixed during the run
bd close <id1> --reason "Fixed" --json
```

---

# Quick Reference: Phase Summary

| Phase | What | Agents Exercised | Estimated Time |
|-------|------|-----------------|---------------|
| 1 | Project creation + wizard | map-generator | 10 min |
| 2 | Document ingestion | extraction, synthesis | 8 min |
| 3 | Alignment check (auto) | alignment | 3 min |
| 4 | Expert panel review | pm-coordinator + 7 experts | 10 min |
| 5 | Chat-driven editing | map-chat (via coordinator) | 8 min |
| 6 | Question evolution | question-agent | 5 min |
| 7 | Second ingestion (browser upload) | extraction, synthesis | 5 min |
| 8 | UI verification | (browser only) | 5 min |
| 9 | Edge cases & negative | (API only) | 5 min |
| 10 | Cleanup + report | (none) | 2 min |
| **Total** | | **14 agents** | **~61 min** |

## Fixtures Reference

| File | Used In | Purpose |
|------|---------|---------|
| `tests/fixtures/prd-saas-analytics.md` | Phase 2 | Primary document for ingestion pipeline |
| `tests/fixtures/supplementary-api-spec.md` | Phase 7 | Secondary document for incremental ingestion |
| `tests/fixtures/chat-edit-requests.md` | Phase 5 | Natural language prompts for map-chat |
| `tests/fixtures/question-answers.md` | Phase 6 | Pre-crafted answers for question evolution |
