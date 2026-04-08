# Scenario 08: Document Ingestion Pipeline

**Time:** ~10 minutes
**Parallel Safe:** No
**LLM Required:** Yes (Eve agents)

Uploads Eden's own high-level summary as a source document and triggers the Eve ingestion pipeline. Verifies the three-agent pipeline: ingest, extract, synthesize.

## Prerequisites

- Scenarios 01–02 passed — project exists with baseline map
- Eve agents synced to the eden project

## Steps

### 1. Create Source Record

```bash
SOURCE=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/sources" \
  -d '{
    "filename": "high-level-summary.md",
    "content_type": "text/markdown",
    "file_size": 4096
  }')
SOURCE_ID=$(echo "$SOURCE" | jq -r '.id')
echo "Source: $SOURCE_ID"
```

**Expected:** Source created with status `uploaded`.

### 2. Upload the Document Content

> Implementation depends on whether Eden uses presigned URLs or direct upload.
> If presigned URL:
> ```bash
> PRESIGN=$(api "$EDEN_URL/api/projects/$PROJECT_ID/sources/$SOURCE_ID/upload-url")
> UPLOAD_URL=$(echo "$PRESIGN" | jq -r '.url')
> curl -X PUT "$UPLOAD_URL" -T docs/prd/high-level-summary.md
> ```
> If direct attachment via Eve:
> ```bash
> eve ingest docs/prd/high-level-summary.md --project "$PROJECT_ID" --json
> ```

### 3. Confirm Source to Trigger Pipeline

```bash
CONFIRM=$(api -X POST "$EDEN_URL/api/projects/$PROJECT_ID/sources/$SOURCE_ID/confirm")
echo "$CONFIRM" | jq '{status}'
```

**Expected:** Status changes to `processing`. Eve `doc.ingest` event fires.

### 4. Monitor Pipeline Jobs

```bash
# Wait for Eve to create ingestion job
for i in $(seq 1 24); do
  PIPELINE_JOBS=$(eve job list --project eden --json 2>/dev/null | \
    jq '(.jobs // .) | map(select(((.title // "") + " " + (.description // "")) | test("extract|synthe|ingest"; "i"))) | sort_by(.created_at)')
  [ "$(echo "$PIPELINE_JOBS" | jq 'length')" -gt 0 ] && break
  echo "Waiting for pipeline job... ($i)"
  sleep 5
done

echo "$PIPELINE_JOBS" | jq '.[] | {id, phase, title: (.title // ""), description: (.description // "")}'

# Follow the most recent pipeline job, then inspect the latest synthesis log.
JOB_ID=$(echo "$PIPELINE_JOBS" | jq -r '.[-1].id')
SYNTH_JOB_ID=$(echo "$PIPELINE_JOBS" | jq -r '([.[] | select(((.title // "") + " " + (.description // "")) | test("synthe"; "i"))] | last | .id) // empty')
if [ -z "$SYNTH_JOB_ID" ] || [ "$SYNTH_JOB_ID" = "null" ]; then
  SYNTH_JOB_ID="$JOB_ID"
fi

eve job follow "$JOB_ID"

LOG_PATH="/tmp/eden-s08-${SYNTH_JOB_ID}.log"
eve job logs "$SYNTH_JOB_ID" 2>&1 | tee "$LOG_PATH"
CREATE_CALLS=$(rg -c 'eden changeset create' "$LOG_PATH" || true)
echo "create_calls=$CREATE_CALLS"
echo "Potential log problems (should print nothing):"
rg -n -i 'invalid_changeset|violates not-null|internal server error|requires approval|POST .*/changesets -> (400|500)' "$LOG_PATH" || true
echo "Changeset-create log lines:"
rg -n 'eden changeset create' "$LOG_PATH" || true
```

**Expected:**
- Ingestion agent reads the markdown file
- Extraction agent identifies personas, activities, steps, tasks
- Synthesis agent compares against existing map and creates changeset
- The synthesis log shows no `invalid_changeset`, `500`, `requires approval`, or DB-constraint errors
- The synthesis log includes at least one `eden changeset create` call

### 5. Verify Changeset Created

```bash
# Poll for changeset from ingestion pipeline
for i in $(seq 1 12); do
  ALL_CS=$(api "$EDEN_URL/api/projects/$PROJECT_ID/changesets")
  CS=$(echo "$ALL_CS" | jq '[.[] | select(.source=="ingestion")] | sort_by(.created_at) | last')
  [ "$CS" != "null" ] && break
  sleep 5
done

CS_ID=$(echo "$CS" | jq -r '.id')
api "$EDEN_URL/api/changesets/$CS_ID" | jq '{
  title,
  source,
  item_count: (.items | length),
  entity_types: ([.items[].entity_type] | group_by(.) | map({(.[0]): length}) | add),
  sample_task: ([.items[] | select(.entity_type=="task") | .after_state | {
    title,
    step_ref: (.step_ref // .step_display_id),
    acceptance_criteria_count: ((.acceptance_criteria // []) | length)
  }] | first)
}'
```

**Expected:** At least 1 changeset with source `ingestion`, containing multiple items. Task items retain parent step references and acceptance criteria.

### 6. Verify Source Status Updated

```bash
api "$EDEN_URL/api/projects/$PROJECT_ID/sources/$SOURCE_ID" | jq '{status, filename}'
```

**Expected:** Status is `done` (updated by Eve callback when pipeline completes). If still `processing`, the pipeline may still be running — wait and retry.

## Debugging

```bash
# Check Eve job status
eve job list --project eden --json | jq '(.jobs // .)[] | {id, description, phase, close_reason}'

# Diagnose stuck job
eve job diagnose $JOB_ID

# Check workflow trigger
eve job logs $JOB_ID
```

## Success Criteria

- [ ] Source record created via API
- [ ] Confirm triggers Eve doc.ingest event
- [ ] Ingestion job starts within 2 minutes
- [ ] Pipeline completes (ingest → extract → synthesize)
- [ ] Changeset created with extracted requirements
- [ ] Agent logs stay clean during changeset creation (no 400/500/approval errors)
- [ ] Synthesis logs show at least one `eden changeset create` call
- [ ] Source status updated to reflect pipeline completion
- [ ] Extracted content relates to document contents (not hallucinated)
