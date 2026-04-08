# Scenario 14: Reviews Integration — Panel to UI to Action

**Time:** ~8 minutes
**Parallel Safe:** No
**LLM Required:** Yes

Verifies the complete expert panel review lifecycle: panel review creates a review record visible in the Eden UI, and review recommendations can be acted on via chat to create changesets.

## Prerequisites

- Scenario 09 passed — expert panel review completed
- Reviews API endpoint deployed and accessible

## Steps

### 1. Verify Review Record Exists

```bash
TOKEN=$(eve auth token 2>/dev/null)
REVIEWS=$(curl -s -H "Authorization: Bearer $TOKEN" "$EDEN_URL/api/projects/$PROJECT_ID/reviews")
REVIEW_COUNT=$(echo "$REVIEWS" | jq 'length')
echo "Reviews found: $REVIEW_COUNT"
echo "$REVIEWS" | jq '[.[] | {id, title, status, expert_count}]'
```

**Expected:** At least one review with `status: "complete"` and `expert_count >= 1`.

If no reviews exist, the coordinator didn't call `eden review create` during synthesis. Check the coordinator skill Phase 3.

### 2. Verify Review Details via API

```bash
REVIEW_ID=$(echo "$REVIEWS" | jq -r '.[0].id')
REVIEW=$(curl -s -H "Authorization: Bearer $TOKEN" "$EDEN_URL/api/reviews/$REVIEW_ID")
echo "$REVIEW" | jq '{title, status, synthesis: (.synthesis | .[0:200]), expert_count, experts: [.expert_opinions[].expert_slug]}'
```

**Expected:**
- `synthesis` contains executive summary text
- `expert_opinions` array has entries for each responding expert
- Each opinion has `expert_slug` and `summary`

### 3. Verify Reviews Page in UI (Playwright)

```bash
# Navigate to Reviews page and verify no 404 error
npx playwright test --grep "Reviews page" tests/e2e/manual-07-pages.spec.ts
```

**Or manually via browser:**
1. Navigate to `$EDEN_URL/projects/$PROJECT_ID/reviews`
2. Verify no error banner appears
3. Verify review card(s) are visible with title, status badge, expert count
4. Click a review card to expand — verify synthesis and expert opinions render

### 4. Act on a Review Recommendation via Chat

```bash
THREAD=$(eve-api -X POST "$EVE_API_URL/projects/$EVE_PROJECT_ID/chat/simulate" \
  -d "$(jq -n --arg text '[eden-project:'"$PROJECT_ID"'] Based on the expert review, the QA strategist identified that we have no explicit testing requirements. Please add a Testing & Validation activity with steps for unit testing, integration testing, and e2e testing, with appropriate tasks for each.' \
    '{provider: "simulated", team_id: "expert-panel", text: $text, thread_key: "scenario14"}')")
THREAD_ID=$(echo "$THREAD" | jq -r '.thread_id')
PARENT_JOB=$(echo "$THREAD" | jq -r '.job_ids[0]')
echo "Thread: $THREAD_ID  Job: $PARENT_JOB"
```

### 5. Wait for Changeset

```bash
TIMEOUT=120; START=$(date +%s)
while true; do
  ELAPSED=$(( $(date +%s) - START ))
  [ $ELAPSED -gt $TIMEOUT ] && echo "TIMEOUT" && break

  CS=$(curl -s -H "Authorization: Bearer $TOKEN" "$EDEN_URL/api/projects/$PROJECT_ID/changesets" \
    | jq '[.[] | select(.status == "draft" or .status == "pending")] | sort_by(.created_at) | last')
  [ "$CS" != "null" ] && [ -n "$CS" ] && break
  sleep 5
done
echo "$CS" | jq '{id, title, item_count: (.items | length), status}'
```

### 5b. Inspect Agent Logs for the Changeset Proposal

```bash
LOG_PATH="/tmp/eden-s14-${PARENT_JOB}.log"
eve job logs "$PARENT_JOB" 2>&1 | tee "$LOG_PATH"
echo "Potential log problems (should print nothing):"
rg -n -i 'invalid_changeset|violates not-null|internal server error|requires approval|POST .*/changesets -> (400|500)' "$LOG_PATH" || true
echo "Changeset-create calls:"
rg -n 'eden changeset create' "$LOG_PATH" || true
```

**Expected:** The agent job log stays clean while creating the proposal and shows a changeset-create call.

### 6. Review and Accept Changeset

```bash
CS_ID=$(echo "$CS" | jq -r '.id')
echo "Changeset items:"
curl -s -H "Authorization: Bearer $TOKEN" "$EDEN_URL/api/changesets/$CS_ID" \
  | jq '{title, source, item_count: (.items | length), items: [.items[] | {entity_type, operation, description, display_reference}]}'

curl -s -X POST -H "Authorization: Bearer $TOKEN" "$EDEN_URL/api/changesets/$CS_ID/accept"
```

### 7. Verify Map Updated

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$EDEN_URL/api/projects/$PROJECT_ID/map" \
  | jq '.activities[] | select(.name | test("[Tt]est")) | {name, step_count: (.steps | length)}'
```

**Expected:** New testing-related activity appears in the map.

## Debugging

```bash
# Check if reviews API is working
curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$EDEN_URL/api/projects/$PROJECT_ID/reviews"

# Check coordinator skill has review create step
grep -A 5 "review create" skills/coordinator/SKILL.md

# Check CLI has review command
eden review --help
```

## Success Criteria

- [ ] Reviews API returns 200 (not 404)
- [ ] At least one review record exists after expert panel review
- [ ] Review contains synthesis and expert opinions
- [ ] Reviews page in UI renders without errors
- [ ] Review card expands to show synthesis with markdown rendering
- [ ] Expert opinion badges are color-coded by expert type
- [ ] Chat request based on recommendation creates changeset (not direct mutation)
- [ ] Agent logs show no `invalid_changeset`, approval prompts, or server-side failures
- [ ] Agent logs show at least one `eden changeset create` call
- [ ] Changeset contains testing-related entities
- [ ] Acceptance adds testing activity to the map
- [ ] Full loop: expert panel → review record → UI display → chat action → changeset → map update
