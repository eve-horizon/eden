# Scenario 09: Expert Panel Review via Chat

**Time:** ~10 minutes
**Parallel Safe:** No
**LLM Required:** Yes (Eve agents — 1 coordinator + up to 7 experts)

**This is the core dogfooding scenario.** We send Eden's own PRD to the expert panel via chat, watch the staged council dispatch, and verify we get a comprehensive multi-perspective review.

## Prerequisites

- Scenarios 01–02 passed — project exists
- Eve agents synced and chat routing active

## Steps

### 1. Send PRD Review Request via Chat Simulate

The Eve API's chat simulate endpoint handles routing to the correct team. Use the **Eve API URL** (not Eden API) and the **Eve project ID** (not Eden project UUID).

```bash
PRD_EXCERPT=$(head -200 docs/prd/high-level-summary.md)
THREAD=$(eve-api -X POST "$EVE_API_URL/projects/$EVE_PROJECT_ID/chat/simulate" \
  -d "$(jq -n --arg text "Please review this requirements summary and give me a full expert panel assessment. What are we missing? What are the risks? Are we ready to build?

---

$PRD_EXCERPT" \
    '{provider: "simulated", team_id: "expert-panel", text: $text, thread_key: "scenario09"}')")
THREAD_ID=$(echo "$THREAD" | jq -r '.thread_id')
PARENT_JOB=$(echo "$THREAD" | jq -r '.job_ids[0]')
echo "Thread: $THREAD_ID  Parent job: $PARENT_JOB"
```

**Expected:** Thread created. Response contains `thread_id` and `job_ids` (8 jobs: 1 coordinator + 7 experts in backlog).

> **API note:** Chat simulate requires `provider`, `team_id`, `text`. Response returns `{thread_id, route_id, target, job_ids}`.

### 2. Monitor Coordinator and Expert Fan-Out

The job IDs are returned by step 1. The parent job is the coordinator; children `.1` through `.7` are the 7 experts.

```bash
# Poll with abort detection (see README fail-fast section)
TIMEOUT=360; START=$(date +%s)
while true; do
  ELAPSED=$(( $(date +%s) - START ))
  [ $ELAPSED -gt $TIMEOUT ] && echo "TIMEOUT" && break

  PARENT_PHASE=$(eve job show $PARENT_JOB 2>&1 | grep "Phase:" | awk '{print $2}')
  ACTIVE=0; DONE=0; CANCELLED=0
  for s in .1 .2 .3 .4 .5 .6 .7; do
    P=$(eve job show "${PARENT_JOB}${s}" 2>&1 | grep "Phase:" | awk '{print $2}')
    case $P in active) ACTIVE=$((ACTIVE+1));; done) DONE=$((DONE+1));; cancelled) CANCELLED=$((CANCELLED+1));; esac
  done
  echo "[${ELAPSED}s] Parent: $PARENT_PHASE | Experts — active:$ACTIVE done:$DONE cancelled:$CANCELLED"

  [ "$PARENT_PHASE" = "done" ] && [ "$DONE" -ge 7 ] && echo "Panel complete!" && break
  [ "$CANCELLED" -ge 7 ] && echo "Solo path — coordinator handled it alone" && break

  # Abort if agent stuck on permissions
  BLOCKS=$(eve job logs $PARENT_JOB 2>&1 | grep -c "requires approval" || true)
  [ "$BLOCKS" -gt 3 ] && echo "ABORT: permission blocks ($BLOCKS)" && break

  sleep 10
done
```

**Expected (panel path):**
- Coordinator returns `prepared` → 7 expert jobs activate in parallel
- All 8 complete within ~6 minutes

**Acceptable (solo path):**
- Coordinator returns `success` → all 7 experts auto-cancelled
- Coordinator response contains all expert perspectives inline
- This happens when the coordinator decides it can handle the request alone (e.g., no file attachments, just inline text)

### 3. Read Chat Thread Response

```bash
# Thread messages are on the Eve API, not Eden
eve-api "$EVE_API_URL/threads/$THREAD_ID/messages" | jq '.messages[-1].content[0:500]'
```

**Expected:** Final message in thread contains the synthesized expert review.

### 4. Verify Expert Coverage

Check that the coordinator's output (either via panel synthesis or solo) covers all 7 expert perspectives:

```bash
eve job result $PARENT_JOB 2>&1 | head -100
```

**Expected:** Output addresses these domain-specific areas:
- Tech Lead: architecture, feasibility
- UX Advocate: accessibility, user journeys
- Business Analyst: process flows, success criteria
- GTM Advocate: market positioning
- Risk Assessor: timeline, dependency risks
- QA Strategist: testing gaps, edge cases
- Devil's Advocate: challenged assumptions

## Debugging

```bash
# Check chat route resolution
eve job list --project eden --json | jq '.[] | {id, description, phase, close_reason}'

# Inspect coordinator decision
eve job logs $PARENT_JOB 2>&1 | grep -i "prepared\|success"

# Check expert jobs
for s in .1 .2 .3 .4 .5 .6 .7; do
  eve job show "${PARENT_JOB}${s}" 2>&1 | grep -E "Phase:|Title:"
done
```

### 5. Verify Review Record Created

After the coordinator completes synthesis, it should create a review record in the Eden API (visible in the Reviews page).

```bash
TOKEN=$(eve auth token 2>/dev/null)
REVIEWS=$(curl -s -H "Authorization: Bearer $TOKEN" "$EDEN_URL/api/projects/$PROJECT_ID/reviews")
echo "$REVIEWS" | jq '[.[] | {id, title, status, expert_count, created_at}]'
```

**Expected:** At least one review record with:
- `status: "complete"`
- `expert_count: 7` (or however many experts responded)
- `title` containing the review topic

If no review record exists, the coordinator's SKILL.md may be missing the `review create` step in Phase 3 SYNTHESIZE.

## Success Criteria

- [ ] Chat message routed to expert-panel team
- [ ] Coordinator triages and returns `prepared` (panel) or `success` (solo)
- [ ] If panel: 7 expert jobs fan out, complete, and synthesis is generated
- [ ] If solo: coordinator covers all 7 expert domains inline
- [ ] Chat thread receives the review response
- [ ] Review covers all 7 domain-specific perspectives
- [ ] Review record created in Eden API (visible on Reviews page)
- [ ] No secrets (API keys, tokens) appear in job logs
