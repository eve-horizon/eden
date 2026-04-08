# Scenario 13: Full Project Lifecycle — PRD to Populated Map

**Time:** ~15 minutes
**Parallel Safe:** Yes (uses separate project)
**LLM Required:** Yes (full agent suite)

**The ultimate integration test.** Creates a fresh project, uploads Eden's full EdenPRD.md, lets the AI populate the map, reviews changes, and verifies the result in the UI. This dogfoods the entire Eden workflow.

## Prerequisites

- All agents synced
- Eve ingestion pipeline operational

## Steps

### 1. Create Fresh Project

```bash
LIFECYCLE_PROJECT=$(api -X POST "$EDEN_URL/api/projects" \
  -d '{"name": "Lifecycle Test — Eden PRD", "slug": "lifecycle-test"}')
export LC_PROJECT_ID=$(echo "$LIFECYCLE_PROJECT" | jq -r '.id')
```

### 2. Upload EdenPRD.md as Source

```bash
SOURCE=$(api -X POST "$EDEN_URL/api/projects/$LC_PROJECT_ID/sources" \
  -d '{"filename": "EdenPRD.md", "content_type": "text/markdown", "file_size": 50000}')
LC_SOURCE_ID=$(echo "$SOURCE" | jq -r '.id')

# Upload content (adapt to upload mechanism)
# ... upload docs/prd/EdenPRD.md ...

# Confirm to trigger pipeline
api -X POST "$EDEN_URL/api/projects/$LC_PROJECT_ID/sources/$LC_SOURCE_ID/confirm"
```

### 3. Wait for Ingestion Pipeline to Complete

```bash
for i in $(seq 1 60); do
  STATUS=$(api "$EDEN_URL/api/projects/$LC_PROJECT_ID/sources/$LC_SOURCE_ID" | jq -r '.status')
  echo "Source status: $STATUS ($i)"
  [ "$STATUS" = "synthesized" ] && break
  sleep 10
done
```

**Expected:** Pipeline completes: uploaded → processing → extracted → synthesized

```bash
PIPELINE_JOBS=$(eve job list --project eden --json 2>/dev/null | \
  jq '(.jobs // .) | map(select((((.title // "") + " " + (.description // "")) | test("extract|synthe|ingest"; "i")))) | sort_by(.created_at)')
echo "$PIPELINE_JOBS" | jq '.[] | {id, phase, title: (.title // ""), description: (.description // "")}'

SYNTH_JOB_ID=$(echo "$PIPELINE_JOBS" | jq -r '[.[] | select((((.title // "") + " " + (.description // "")) | test("synthe"; "i")))] | last.id')
if [ -z "$SYNTH_JOB_ID" ] || [ "$SYNTH_JOB_ID" = "null" ]; then
  SYNTH_JOB_ID=$(echo "$PIPELINE_JOBS" | jq -r '.[-1].id')
fi
LOG_PATH="/tmp/eden-s13-${SYNTH_JOB_ID}.log"
eve job logs "$SYNTH_JOB_ID" 2>&1 | tee "$LOG_PATH"
CREATE_CALLS=$(rg -c 'eden changeset create' "$LOG_PATH" || true)
echo "create_calls=$CREATE_CALLS"
echo "Potential log problems (should print nothing):"
rg -n -i 'invalid_changeset|violates not-null|internal server error|requires approval|POST .*/changesets -> (400|500)' "$LOG_PATH" || true
echo "Changeset-create log lines:"
rg -n 'eden changeset create' "$LOG_PATH" || true
```

**Expected:** The synthesis job log shows at least one `eden changeset create` call and no changeset-validation failures, DB errors, or approval prompts.

### 4. Review Generated Changeset

```bash
CS_LIST=$(api "$EDEN_URL/api/projects/$LC_PROJECT_ID/changesets")
CS=$(echo "$CS_LIST" | jq '[.[] | select(.source=="ingestion")] | sort_by(.created_at) | last')
echo "$CS" | jq '{id, title, source, status}'
CS_ID=$(echo "$CS" | jq -r '.id')
api "$EDEN_URL/api/changesets/$CS_ID" | jq '{
  title,
  source,
  item_count: (.items | length),
  entity_counts: ([.items[].entity_type] | group_by(.) | map({type: .[0], count: length})),
  sample_task: ([.items[] | select(.entity_type=="task") | .after_state | {
    title,
    step_ref: (.step_ref // .step_display_id),
    acceptance_criteria_count: ((.acceptance_criteria // []) | length)
  }] | first)
}'
```

**Expected:** Changeset with extracted entities:
- Personas (PM, BA, Engineering Lead, Stakeholder)
- Activities (major feature areas from PRD)
- Steps (sub-processes)
- Tasks (user stories with acceptance criteria)

### 5. Accept Changeset

```bash
api -X POST "$EDEN_URL/api/changesets/$CS_ID/accept"
```

### 6. Verify Map is Populated

```bash
MAP=$(api "$EDEN_URL/api/projects/$LC_PROJECT_ID/map")
echo "$MAP" | jq '{
  personas: (.personas | length),
  activities: (.activities | length),
  total_steps: [.activities[].steps | length] | add,
  total_tasks: [.activities[].steps[].tasks | length] | add
}'
```

**Expected:**
- Multiple personas extracted from PRD
- Multiple activities representing feature areas
- Tasks with user stories derived from document content
- Non-zero counts across all entity types

### 7. Request Expert Panel Review of the Generated Map

```bash
THREAD=$(api -X POST "$EDEN_URL/api/projects/$LC_PROJECT_ID/chat/threads" \
  -d '{"title": "Review generated story map"}')
THREAD_ID=$(echo "$THREAD" | jq -r '.id')

api -X POST "$EDEN_URL/api/chat/threads/$THREAD_ID/messages" \
  -d '{"content": "We just ingested our PRD and the AI generated a story map. Please review the current state of the map. Are there gaps? Missing personas? Duplicated requirements? What should we add or change?"}'

# Wait for review completion (up to 8 minutes)
for i in $(seq 1 48); do
  REVIEWS=$(api "$EDEN_URL/api/projects/$LC_PROJECT_ID/reviews")
  [ "$(echo "$REVIEWS" | jq 'length')" -gt 0 ] && break
  sleep 10
done

echo "$REVIEWS" | jq '.[0] | {expert_count: (.expert_opinions | length), synthesis: .synthesis[0:300]}'
```

**Expected:** Full expert panel review of the AI-generated map.

### 8. Verify in UI (Playwright)

```typescript
// tests/e2e/manual-13-lifecycle.spec.ts
const EDEN_URL = process.env.EDEN_URL || 'https://eden.incept5-eden-sandbox.eh1.incept5.dev';
const LC_PROJECT_SLUG = process.env.LC_PROJECT_SLUG || 'lifecycle-test';

test('lifecycle project has populated map', async ({ page }) => {
  await page.goto(`${EDEN_URL}/projects`);
  await page.click(`text=${LC_PROJECT_SLUG}`);
  await page.waitForSelector('[data-testid="story-map"]', { timeout: 15000 });

  const activities = page.locator('[data-testid^="activity-"]');
  const count = await activities.count();
  expect(count).toBeGreaterThan(2);

  const cards = page.locator('[data-testid^="task-card-"]');
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThan(5);

  await page.click('text=Reviews');
  await expect(page.locator('text=synthesis').or(page.locator('text=expert'))).toBeVisible();
});
```

## Success Criteria

- [ ] Fresh project created from scratch
- [ ] Document uploaded and pipeline triggered
- [ ] Pipeline completes all 3 stages (ingest → extract → synthesize)
- [ ] Synthesis logs stay clean during changeset creation (no 400/500/approval errors)
- [ ] Synthesis logs show at least one `eden changeset create` call
- [ ] Changeset contains realistic entities extracted from PRD
- [ ] Accepted changeset populates the map
- [ ] Map has personas, activities, steps, and tasks
- [ ] Expert panel reviews the generated map
- [ ] Review contains 7 expert opinions + synthesis
- [ ] UI renders the populated map correctly
- [ ] Audit trail records entire lifecycle
