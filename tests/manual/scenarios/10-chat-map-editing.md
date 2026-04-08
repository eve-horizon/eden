# Scenario 10: Chat-Driven Map Editing

**Time:** ~5 minutes
**Parallel Safe:** No
**LLM Required:** Yes (map-chat agent)

Tests the conversational map editing flow: user describes a change in natural language via chat, the map-chat agent translates it to a changeset.

## Prerequisites

- Scenarios 01–02 passed — project has baseline map
- Eve agents synced

## Steps

### 1. Send an Edit Request via Chat

```bash
THREAD=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/chat/threads" \
  -d '{"title": "Map edit request"}')
THREAD_ID=$(echo "$THREAD" | jq -r '.id')

api -X POST "$EDEN_URL/api/chat/threads/$THREAD_ID/messages" \
  -d '{"content": "Add a new persona called \"DevOps Engineer\" with code DOE and color #FF6B6B. Then add a task under Document Ingestion > Upload Document for this persona: \"Configure CI/CD pipeline for document processing\" with acceptance criteria about automated deployments and monitoring."}'
```

**Expected:** Message sent. Coordinator routes to map-chat agent (solo path).

### 2. Wait for Changeset

```bash
for i in $(seq 1 24); do
  CS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/changesets" | jq '[.[] | select(.source=="map-chat")] | sort_by(.created_at) | last')
  [ "$CS" != "null" ] && break
  sleep 5
done
CS_ID=$(echo "$CS" | jq -r '.id')
api "$EDEN_URL/api/changesets/$CS_ID" | jq '{
  title,
  source,
  status,
  item_count: (.items | length),
  items: [.items[] | {entity_type, operation, description, display_reference}],
  task_items: [.items[] | select(.entity_type=="task") | .after_state | {
    title,
    step_ref: (.step_ref // .step_display_id),
    acceptance_criteria_count: ((.acceptance_criteria // []) | length)
  }]
}'
```

**Expected:** Changeset with items including:
- `persona` / `create` (DevOps Engineer)
- `task` / `create` (CI/CD pipeline task)
- Task items include a step reference and useful acceptance criteria

### 3. Inspect Recent Agent Logs

```bash
RECENT_CHAT_JOBS=$(eve job list --project eden --json 2>/dev/null | \
  jq '(.jobs // .) | map(select((((.title // "") + " " + (.description // "")) | test("map-chat|coordinator|map edit"; "i")))) | sort_by(.created_at)')
echo "$RECENT_CHAT_JOBS" | jq '.[-5:] | .[] | {id, phase, title: (.title // ""), description: (.description // "")}'

MAP_CHAT_JOB=$(echo "$RECENT_CHAT_JOBS" | jq -r '((([.[] | select((((.title // "") + " " + (.description // "")) | test("map-chat"; "i")))] | last) // .[-1]) | .id) // empty')
test -n "$MAP_CHAT_JOB" || { echo "No recent coordinator/map-chat job found"; exit 1; }
LOG_PATH="/tmp/eden-s10-${MAP_CHAT_JOB}.log"
eve job logs "$MAP_CHAT_JOB" 2>&1 | tee "$LOG_PATH"
CREATE_CALLS=$(rg -c 'eden changeset create' "$LOG_PATH" || true)
echo "create_calls=$CREATE_CALLS"
echo "Potential log problems (should print nothing):"
rg -n -i 'invalid_changeset|violates not-null|internal server error|requires approval|POST .*/changesets -> (400|500)' "$LOG_PATH" || true
echo "Changeset-create calls:"
rg -n 'eden changeset create' "$LOG_PATH" || true
```

**Expected:** Recent coordinator/map-chat logs show at least one `eden changeset create` call and no validation failures, approval prompts, or server errors.

### 4. Accept and Verify

```bash
api -X POST "$EDEN_URL/api/changesets/$CS_ID/accept"

# Verify persona exists
api "$EDEN_URL/api/projects/$PROJECT_ID/personas" | jq '.[] | select(.code=="DOE")'

# Verify task exists
api "$EDEN_URL/api/projects/$PROJECT_ID/map" | jq '
  [.activities[].steps[].tasks[] | select(.title | test("CI/CD"; "i"))] | .[0].title
'
```

**Expected:** New persona and task appear on the map after acceptance.

## Success Criteria

- [ ] Natural language edit request routed correctly
- [ ] Map-chat agent creates changeset (not direct mutation)
- [ ] Changeset contains correct entity types and operations
- [ ] Agent logs show no `invalid_changeset`, approval prompts, or server-side failures
- [ ] Agent logs show at least one `eden changeset create` call
- [ ] Acceptance applies changes to the map
- [ ] New persona appears in persona list
- [ ] New task placed correctly on the map
