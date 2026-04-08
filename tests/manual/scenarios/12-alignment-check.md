# Scenario 12: Alignment Check After Changeset

**Time:** ~5 minutes
**Parallel Safe:** No
**LLM Required:** Yes (alignment agent)

Verifies that the alignment agent runs automatically after a changeset is accepted, scanning for conflicts, gaps, and duplicates.

## Prerequisites

- Scenario 10 passed — changeset accepted, map modified
- Eve `changeset.accepted` workflow trigger is active

## Steps

### 1. Verify Alignment Job Triggered

```bash
# The alignment agent should have been triggered by the changeset.accepted event in Scenario 10
for i in $(seq 1 12); do
  ALIGN_JOBS=$(eve job list --project eden --json 2>/dev/null | jq '(.jobs // .) | map(select((((.title // "") + " " + (.description // "")) | test("alignment"; "i")))) | sort_by(.created_at)')
  [ "$(echo "$ALIGN_JOBS" | jq 'length')" -gt 0 ] && break
  sleep 5
done

ALIGN_JOB=$(echo "$ALIGN_JOBS" | jq -r '.[-1].id')
echo "Alignment job: $ALIGN_JOB"
eve job follow "$ALIGN_JOB"

ALIGN_LOG="/tmp/eden-s12-${ALIGN_JOB}.log"
eve job logs "$ALIGN_JOB" 2>&1 | tee "$ALIGN_LOG"
echo "Potential log problems (should print nothing):"
rg -n -i 'invalid_changeset|violates not-null|internal server error|requires approval|POST .*/changesets -> (400|500)' "$ALIGN_LOG" || true
```

**Expected:** Alignment job ran (triggered by `changeset.accepted` event) and its logs show no server-side failures or approval prompts.

### 2. Check for Generated Questions

```bash
# Alignment agent creates questions for gaps, conflicts, duplicates, and assumptions
QUESTIONS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/questions")
echo "$QUESTIONS" | jq '.[] | select(.category=="conflict" or .category=="gap" or .category=="duplicate" or .category=="assumption") | {question: .question[0:100], category, priority}'
```

**Expected:** One or more questions created about:
- Gaps (persona without task coverage, single-step activities)
- Potential duplicates (semantic similarity between tasks)
- Assumptions needing validation

### 3. Verify Storm Prevention

```bash
TASK_DISPLAY_ID=$(api "$EDEN_URL/api/projects/$PROJECT_ID/map" | jq -r '.activities[0].steps[0].tasks[0].display_id')

# Accept another changeset to trigger alignment again
STORM_CS=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/changesets" \
  -d "{
    \"title\": \"Minor update for storm test\",
    \"reasoning\": \"Testing alignment storm prevention\",
    \"source\": \"manual-test\",
    \"items\": [{\"entity_type\": \"task\", \"operation\": \"update\", \"display_reference\": \"$TASK_DISPLAY_ID\", \"after_state\": {\"title\": \"Upload requirements document (v2)\"}, \"description\": \"Minor title update\"}]
  }")
STORM_ID=$(echo "$STORM_CS" | jq -r '.id')
api -X POST "$EDEN_URL/api/changesets/$STORM_ID/accept"

sleep 30

# Check that alignment doesn't create duplicate questions
NEW_Q_COUNT=$(api "$EDEN_URL/api/projects/$PROJECT_ID/questions" | jq '[.[] | select(.category=="conflict" or .category=="gap" or .category=="duplicate" or .category=="assumption")] | length')
echo "Alignment questions after storm test: $NEW_Q_COUNT"
```

**Expected:** Alignment agent skips questions already raised in last 24h (storm prevention). Question count should not spike with obvious duplicates.

## Success Criteria

- [ ] Alignment job triggered automatically after changeset acceptance
- [ ] Alignment logs show no `invalid_changeset`, approval prompts, or server-side failures
- [ ] Agent identifies at least one gap, conflict, duplicate, or assumption
- [ ] Questions use standard categories (`conflict`, `gap`, `duplicate`, `assumption`)
- [ ] Storm prevention: duplicate questions not re-created
