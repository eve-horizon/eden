# Scenario 11: Question Evolution Workflow

**Time:** ~5 minutes
**Parallel Safe:** No
**LLM Required:** Yes (question-agent)

Tests the question evolution flow: answering an open question triggers the question-agent, which may create a changeset if the answer implies map changes.

## Prerequisites

- Scenario 03 passed — questions exist, Q2 is cross-cutting and still open

## Steps

### 1. Evolve the Cross-Cutting Question

The `/evolve` endpoint answers the question and triggers the workflow in one call. Routes are **not** project-scoped — use `/questions/:id/evolve`.

```bash
# Q2: "Should the expert panel run for every document or only on explicit request?"
EVOLVE=$(api -X POST "$EDEN_URL/api/questions/$Q2_ID/evolve" \
  -d '{"answer": "The expert panel should run automatically for any document over 5 pages. For shorter documents, the coordinator should handle it solo. Users can always explicitly request a full panel review regardless of document length."}')
echo "$EVOLVE" | jq '{status, answer}'
```

**Expected:** Question status changes to `answered`. Eve `question.answered` event fires. Question-agent job starts.

> **API note:** The evolve endpoint is `POST /questions/:id/evolve` (not project-scoped). It only accepts `{answer}` — it sets status to `answered` automatically. Using the project-scoped route will return 404.

### 2. Wait for Agent Response

```bash
for i in $(seq 1 24); do
  Q_JOBS=$(eve job list --project eden --json 2>/dev/null | jq '(.jobs // .) | map(select((((.title // "") + " " + (.description // "")) | test("question"; "i")))) | sort_by(.created_at)')
  [ "$(echo "$Q_JOBS" | jq 'length')" -gt 0 ] && break
  sleep 5
done

echo "$Q_JOBS" | jq '.[-5:] | .[] | {id, phase, title: (.title // ""), description: (.description // "")}'
JOB_ID=$(echo "$Q_JOBS" | jq -r '.[-1].id')
eve job follow "$JOB_ID"

LOG_PATH="/tmp/eden-s11-${JOB_ID}.log"
eve job logs "$JOB_ID" 2>&1 | tee "$LOG_PATH"
echo "Potential log problems (should print nothing):"
rg -n -i 'invalid_changeset|violates not-null|internal server error|requires approval|POST .*/changesets -> (400|500)' "$LOG_PATH" || true
```

**Expected:** Question-agent evaluates the answer and decides whether to create a changeset. Logs show no validation failures, approval prompts, or server errors.

### 3. Check for Resulting Changeset

```bash
CS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/changesets" | jq '[.[] | select(.source=="question-evolution")] | sort_by(.created_at) | last')
if [ "$CS" != "null" ]; then
  echo "Changeset created:"
  CS_ID=$(echo "$CS" | jq -r '.id')
  api "$EDEN_URL/api/changesets/$CS_ID" | jq '{
    title,
    source,
    item_count: (.items | length),
    items: [.items[] | {entity_type, operation, description, display_reference}]
  }'
  echo "Changeset-create calls in logs:"
  rg -n 'eden changeset create' "$LOG_PATH" || true
else
  echo "No changeset — answer was informational only (also valid)"
fi
```

**Expected:** Either:
- **Changeset created** — answer implies new requirements (e.g., "add page count threshold logic")
- **No changeset** — answer is informational, no map changes needed (both outcomes are valid)

## Success Criteria

- [ ] Question evolution triggers question-agent workflow
- [ ] Agent evaluates the answer in context of the map
- [ ] If answer implies changes: changeset created with source `question-evolution`
- [ ] If answer is informational: no changeset, no error
- [ ] Question-agent logs show no `invalid_changeset`, approval prompts, or server-side failures
- [ ] If a changeset is created, logs show an `eden changeset create` call
- [ ] Question status updated
