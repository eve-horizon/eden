# Scenario 22: Project Wizard — PDF Attachment via Resource Refs

**Time:** ~6 minutes
**Parallel Safe:** Yes (uses its own project)
**LLM Required:** Yes
**Requires platform:** Eve agent-runtime with `poppler-utils` installed (shipped in release-v0.1.255)

Verifies the wizard's large-PDF path: the user attaches a real requirements PDF, the wizard passes it through to the `map-generator` agent as an Eve `resource_ref`, the platform materializes the file into `.eve/resources/`, and the agent reads it natively via the Claude Code `Read` tool (which uses `pdftoppm` under the hood). The generated map must reflect the actual PRD content — not hallucinated domain knowledge — and auto-accept via the wizard's polling loop.

This exercises the code path shipped in `feat(wizard): large PDF support via Eve resource_refs` and is the regression guard for the `pdftoppm`-missing failure mode that was caught during initial verification and fixed in Eve platform `release-v0.1.255`.

## Prerequisites

- Eden deployed to sandbox with the wizard resource-ref support merged
- Eve platform at release-v0.1.255 or newer (poppler-utils in agent-runtime + worker images)
- Eve agents synced: `eve project sync`
- `$OWNER_TOKEN` available
- Fixture present at `tests/fixtures/Estm8_Strategic_Brief.pdf` (~380 KB, 8 pages, construction-estimation domain)

```bash
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api"
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
export WIZARD_PDF_PROJECT_SLUG=wizard-pdf-test-$(date +%s)
export FIXTURE=tests/fixtures/Estm8_Strategic_Brief.pdf

# Fail fast if the fixture is missing
test -f "$FIXTURE" || { echo "Missing fixture: $FIXTURE"; exit 1; }
FIXTURE_SIZE=$(stat -f%z "$FIXTURE" 2>/dev/null || stat -c%s "$FIXTURE")
echo "Fixture: $FIXTURE ($FIXTURE_SIZE bytes)"
```

---

## Steps

### 1. Create Empty Project

```bash
PDF_PROJECT_ID=$(api -X POST "$EDEN_API/projects" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Wizard PDF Test","slug":"'$WIZARD_PDF_PROJECT_SLUG'"}' | jq -r '.id')
echo "Project: $PDF_PROJECT_ID"
```

**Expected:** 201, empty project created.

### 2. Create Source Record + Upload PDF to S3

```bash
SOURCE=$(api -X POST "$EDEN_API/projects/$PDF_PROJECT_ID/sources" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "filename": "Estm8_Strategic_Brief.pdf",
        "content_type": "application/pdf",
        "file_size": '$FIXTURE_SIZE'
    }')
SOURCE_ID=$(echo "$SOURCE" | jq -r '.id')
INGEST_ID=$(echo "$SOURCE" | jq -r '.eve_ingest_id')
UPLOAD_URL=$(echo "$SOURCE" | jq -r '.upload_url')
echo "Source:  $SOURCE_ID"
echo "Ingest:  $INGEST_ID"

# Upload directly to S3 via the presigned URL
curl -sf -X PUT \
    -H "Content-Type: application/pdf" \
    --data-binary @"$FIXTURE" \
    "$UPLOAD_URL" \
    -o /dev/null -w "Upload HTTP: %{http_code}\n"
```

**Expected:**
- Source row created with `status: "uploaded"` and a non-null `eve_ingest_id`
- Presigned S3 upload returns `HTTP 200`
- Source does **not** get confirmed (we deliberately skip the ingestion-pipeline workflow to avoid dedupe with the wizard's output)

### 3. Trigger Map Generation With `source_id`

```bash
GENERATE_RESPONSE=$(api -X POST "$EDEN_API/projects/$PDF_PROJECT_ID/generate-map" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "description": "Construction estimation platform",
        "source_id": "'$SOURCE_ID'"
    }')
echo "$GENERATE_RESPONSE" | jq .
PDF_JOB_ID=$(echo "$GENERATE_RESPONSE" | jq -r '.job_id')
echo "Job: $PDF_JOB_ID"
```

**Expected:** `202`, returns `job_id`.

### 4. Verify Audit Log Records the Resource-Ref Strategy

```bash
api "$EDEN_API/projects/$PDF_PROJECT_ID/audit?limit=5" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.entries[] | select(.action == "generate_map") | .details'
```

**Expected:** the `generate_map` audit entry contains:

```json
{
  "job_id": "eden-...",
  "source_id": "...",
  "document_strategy": "resource_ref",
  "source_content_type": "application/pdf",
  "source_excerpt_bytes": 0
}
```

`document_strategy: "resource_ref"` proves the hybrid branch picked the PDF path and did **not** fall through to `pdf-parse`-based excerpting. `source_excerpt_bytes: 0` confirms no inline excerpt was attached.

### 5. Inspect the Eve Job Description

```bash
eve job show $PDF_JOB_ID | sed -n '1,40p'
```

**Expected:** the job description contains a line like:

```
Attached document: Estm8_Strategic_Brief.pdf (materialized at .eve/resources/ — read .eve/resources/index.json, then Read the local_path to load its contents before writing the changeset).
```

And **not** an `Attached document excerpt:` block. The prompt stays short; the content lives in the materialized file.

### 6. Poll for Completion (Exercises In-Poll Auto-Accept)

```bash
for i in $(seq 1 60); do
    STATUS=$(api "$EDEN_API/projects/$PDF_PROJECT_ID/generate-map/status?job_id=$PDF_JOB_ID" \
        -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.status')
    echo "Attempt $i: $STATUS"
    [ "$STATUS" = "complete" ] && break
    [ "$STATUS" = "failed" ] && { echo "FAILED — check agent logs"; break; }
    sleep 5
done
```

**Expected:** Status transitions `running` → `complete` within 5 minutes. The polling loop's auto-accept fires as soon as the agent's changeset lands, so the status endpoint returns `complete` with a `changeset_id`.

### 7. Inspect Agent Logs — No `pdftoppm` Errors, Actual PDF Reads

The agent log is the JSON-serialized Claude Code harness output with heavily nested escaping, so the greps below are deliberately *broad*. The goal is to confirm key signals are present/absent — fine-grained structural matching is unreliable against this format.

```bash
# Dump the job log to a temp file for multi-grep analysis
eve job logs $PDF_JOB_ID > /tmp/wizard-pdf-log.txt 2>&1
wc -l /tmp/wizard-pdf-log.txt
```

**Expected:** non-empty log file (hundreds of lines typically).

```bash
# 7a. Confirm Sonnet is running (not Haiku config drift)
grep -oE '"model":"[^"]*"' /tmp/wizard-pdf-log.txt | sort -u
```

**Expected:** exactly one line, `"model":"sonnet"`. A `"model":"haiku"` entry means `eve/x-eve.yaml:generator` drifted away from Sonnet again.

```bash
# 7b. CRITICAL: confirm no pdftoppm-missing error
grep -c 'pdftoppm not available\|PDF could not be rendered' /tmp/wizard-pdf-log.txt
```

**Expected:** `0`. A non-zero count means the deployed `agent-runtime` / `worker` image is missing `poppler-utils` and the platform regression is back — file a beads issue referencing eve-horizon commit `5361577f` (Eve release `v0.1.255`) and re-check `eve env show sandbox` for the deployed image tag.

```bash
# 7c. Confirm the agent hit the PDF file (the filename should appear in the
#     tool_use input or tool_use_result stream, not only in SKILL.md text)
grep -c 'Estm8_Strategic_Brief\.pdf' /tmp/wizard-pdf-log.txt
```

**Expected:** `≥2` — at least one tool_use (Read with file_path) and one tool_use_result referencing the file. A value of `0–1` means the agent never actually hit the PDF and likely hallucinated from the description field alone.

```bash
# 7d. Confirm the agent saw a resolved resource in .eve/resources/index.json
grep -c '\.eve/resources/index\.json' /tmp/wizard-pdf-log.txt
```

**Expected:** `≥1`. This includes SKILL.md mentions (the skill instruction itself contains the path), but a completely absent match means the index was never loaded.

```bash
# 7e. Negative check — no silent Read errors on the PDF tool call.
#     Look for is_error:true lines in the immediate neighborhood of the PDF
#     filename. This catches both the pdftoppm failure and any future Read
#     regression on binary files.
grep -B2 -A2 'Estm8_Strategic_Brief' /tmp/wizard-pdf-log.txt | grep -c '"is_error":true'
```

**Expected:** `0`. Any hit here should be investigated before trusting the generated output — the agent likely silently fell back to "domain knowledge" and the map is hallucinated.

```bash
# 7f. Changeset hardening checks — the wizard should create the changeset
#     cleanly without validation or server-side failures.
HELP_CALLS=$(rg -c 'eden --help' /tmp/wizard-pdf-log.txt || true)
CREATE_CALLS=$(rg -c 'eden changeset create' /tmp/wizard-pdf-log.txt || true)
echo "help_calls=$HELP_CALLS create_calls=$CREATE_CALLS"
rg -n -i 'invalid_changeset|violates not-null|internal server error|requires approval|POST .*/changesets -> (400|500)' /tmp/wizard-pdf-log.txt || true
```

**Expected:** `help_calls=0`, `create_calls>=1`, and no `invalid_changeset`, DB-constraint, approval, or server-side failure signals in the log.

### 8. Verify Auto-Accept + Populated Map

```bash
CS_ID=$(api "$EDEN_API/projects/$PDF_PROJECT_ID/generate-map/status?job_id=$PDF_JOB_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.changeset_id')
echo "Changeset: $CS_ID"

api "$EDEN_API/changesets/$CS_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    status: .status,
    title: .title,
    accepted_items: [.items[] | select(.status=="accepted")] | length,
    draft_items:    [.items[] | select(.status=="pending")]  | length
}'
```

**Expected:**
- `status: "accepted"` (wizard auto-accepted — no manual Accept click needed)
- `accepted_items ≥ 20` (generation output)
- `draft_items == 0`

```bash
api "$EDEN_API/projects/$PDF_PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    personas: (.personas | length),
    activities: (.activities | length),
    total_steps: [.activities[].steps | length] | add,
    total_tasks: [.activities[].steps[].tasks | length] | add
}'
```

**Expected:**
- `personas ≥ 3`
- `activities ≥ 4`
- `total_steps ≥ 8`
- `total_tasks ≥ 16`

### 9. Content Relevance — Map Reflects the PDF, Not Just the Description

The description field was deliberately minimal (`"Construction estimation platform"`) so any *domain-specific* detail in the output must have come from the PDF.

```bash
MAP=$(api "$EDEN_API/projects/$PDF_PROJECT_ID/map" -H "Authorization: Bearer $OWNER_TOKEN")

# Task titles + user stories combined
echo "$MAP" | jq -r '.activities[].steps[].tasks[] | "\(.display_id): \(.title) — \(.user_story // "")"'
```

**Expected:** the task list should reference construction-estimation specifics from the Estm8 brief. Look for signals such as:

- Quantity takeoff / measurement from plans
- Cost database / regional cost lookups
- Subcontractor bid collection / bid leveling
- Change orders / variation tracking
- Estimator / Project Manager / Subcontractor personas
- Integrations the brief mentions (e.g. accounting or project-management tools)
- Reporting / Excel or owner-facing deliverables

If the output reads like a *generic* SaaS story map ("Onboarding", "User Management", "Dashboard"), the PDF was not actually influencing generation — revisit step 7d and check the agent logs for a silent `Read` failure on the PDF.

```bash
# Quick automated sniff test — at least 3 of these domain words should appear
echo "$MAP" | jq -r '.. | strings' | tr '[:upper:]' '[:lower:]' | \
    grep -oE 'takeoff|estimator|subcontractor|bid|change order|cost database|quantity|construction' | \
    sort -u
```

**Expected:** ≥3 distinct matches from the set.

### 10. Verify Source Stayed Unconfirmed

```bash
api "$EDEN_API/projects/$PDF_PROJECT_ID/sources/$SOURCE_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{status, filename}'
```

**Expected:** `status: "uploaded"` (still) — the wizard path deliberately does NOT call `confirm()`, which would trigger the parallel ingestion-pipeline workflow and create a second, duplicate changeset from the same document.

### 11. Verify Audit Trail Shows In-Poll Auto-Accept

```bash
api "$EDEN_API/projects/$PDF_PROJECT_ID/audit?limit=50" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '[.entries[] | {action, entity_type, details: (.details // {})}] | .[]' | \
    grep -A1 '"action": "accept"\|"action": "wizard_orphan_recovered"' | head -10
```

**Expected:** exactly one `"action": "accept"` entry for the wizard changeset. A `wizard_orphan_recovered` breadcrumb would indicate polling stopped before auto-accept fired (a secondary recovery path — not a failure, but not the expected happy path for this scenario).

### 12. UI — Wizard Upload Flow (Playwright, optional)

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

const EDEN_URL = process.env.EDEN_URL || 'https://web.incept5-eden-sandbox.eh1.incept5.dev';
const FIXTURE  = path.resolve('tests/fixtures/Estm8_Strategic_Brief.pdf');

test.describe('Scenario 22: Wizard PDF attachment UI', () => {
    test('user can attach a PDF and reach the review step', async ({ page }) => {
        await page.goto(EDEN_URL);
        await page.locator('button:has-text("Create"), [data-testid="create-project"]').click();
        await page.waitForSelector('[data-testid="project-wizard"]');

        // Step 1 — basics
        await page.fill('[data-testid="wizard-name"]', 'Playwright PDF Wizard');
        await page.locator('button:has-text("Next")').click();

        // Step 2 — context + file upload
        await page.fill('[data-testid="wizard-description"], textarea[name="description"]',
            'Construction estimation platform');

        // Drop the PDF into the file input (not the dropzone overlay)
        await page.locator('[data-testid="wizard-file-input"]').setInputFiles(FIXTURE);

        // Filename + large-file warning render
        await expect(page.locator('[data-testid="wizard-file-name"]'))
            .toContainText('Estm8_Strategic_Brief.pdf');

        // Trigger generation
        await page.locator('button:has-text("Generate")').click();

        // Progress indicator visible
        await expect(page.locator('[data-testid="generate-progress"]')).toBeVisible({ timeout: 5000 });

        // Review / success modal within 5 min
        await expect(page.locator('[data-testid="changeset-review"], [data-testid="review-modal"], [data-testid="wizard-complete"]'))
            .toBeVisible({ timeout: 300_000 });
    });
});
```

### 13. Clean Up

```bash
api -X DELETE "$EDEN_API/projects/$PDF_PROJECT_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN"
```

---

## Debugging

If step 6 times out or step 7d shows `pdftoppm not available`:

```bash
# Confirm the deployed agent-runtime image includes poppler-utils
eve env show sandbox | grep -i image
# → should be a tag >= release-v0.1.255

# Inspect the job's resolved resources
eve job show $PDF_JOB_ID | grep -A20 resource

# Look for Eve workflow recovery attempts
api "$EDEN_API/projects/$PDF_PROJECT_ID/audit?limit=20" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.entries[] | select(.action == "wizard_orphan_recovered")'
```

If the map is populated but generic:

```bash
# Re-run step 7c and 7e — the agent probably hit an error on Read and silently
# fell back to "domain knowledge". Check for any is_error:true following the
# PDF tool_use.
grep -B2 -A5 'Estm8_Strategic_Brief' /tmp/wizard-pdf-log.txt | grep -C3 'is_error":true'
```

---

## Success Criteria

- [ ] Source created with `eve_ingest_id` populated
- [ ] PDF uploaded to S3 via presigned URL (HTTP 200)
- [ ] `POST /generate-map` returns a job_id
- [ ] Audit log records `document_strategy: "resource_ref"` and `source_excerpt_bytes: 0`
- [ ] Eve job description contains the new `Attached document: ... (materialized at .eve/resources/ ...)` line and no `Attached document excerpt:` block
- [ ] Status polling reaches `complete` within 5 minutes
- [ ] Agent logs show `"model":"sonnet"` (and not `haiku`)
- [ ] Agent logs show at least one `Read` call on `.eve/resources/index.json`
- [ ] Agent logs show at least one `Read` call on the PDF file
- [ ] Agent logs contain **zero** `pdftoppm not available` / `PDF could not be rendered` errors
- [ ] Agent logs show `help_calls=0`, `create_calls>=1`, and no `invalid_changeset` / `400` / `500` / approval-failure signals
- [ ] Changeset `status: "accepted"` without any manual intervention
- [ ] Map populated (≥3 personas, ≥4 activities, ≥16 tasks)
- [ ] Map content references construction-estimation specifics from the PDF (≥3 domain keyword matches)
- [ ] Source row remains in `status: "uploaded"` — wizard path did not trigger the ingestion-pipeline workflow
- [ ] Exactly one `accept` audit entry for the wizard changeset; no `wizard_orphan_recovered` breadcrumb under normal polling
- [ ] Project deleted in cleanup
