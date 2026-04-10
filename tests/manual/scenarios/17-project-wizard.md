# Scenario 17: Project Wizard

**Time:** ~10 minutes
**Parallel Safe:** Yes (uses its own project)
**LLM Required:** Yes

Verifies the AI-powered project wizard: user provides project context,
Eve agent generates an initial story map structure, output flows through
the changeset review system, and accepted items populate the project.

> **Related:** For the wizard's **PDF-attachment** code path (file rides as
> an Eve `resource_ref`, agent reads it from `.eve/resources/` via Claude's
> native document support), see
> [Scenario 22: Wizard — PDF Attachment via Resource Refs](22-wizard-pdf-attachment.md).
> This scenario covers the text-field-only baseline.

## Prerequisites

- Eden deployed to sandbox with wizard agent skill synced
- Eve agents synced: `eve agents sync --local --allow-dirty`
- `$OWNER_TOKEN` available

```bash
export EDEN_API="https://api.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev/api"
export EDEN_URL="https://web.${ORG_SLUG}-eden-sandbox.eh1.incept5.dev"
export WIZARD_PROJECT_SLUG=wizard-test
```

---

## Steps

### 1. Create Empty Project

```bash
WIZARD_PROJECT_ID=$(api -X POST "$EDEN_API/projects" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Wizard Test Project","slug":"'$WIZARD_PROJECT_SLUG'"}' | jq -r '.id')
echo "Project: $WIZARD_PROJECT_ID"
```

**Expected:** 201, empty project created.

### 2. Verify Empty Map

```bash
api "$EDEN_API/projects/$WIZARD_PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    personas: (.personas | length),
    activities: (.activities | length)
}'
```

**Expected:** `{ "personas": 0, "activities": 0 }`

### 3. Trigger Map Generation

```bash
GENERATE_RESPONSE=$(api -X POST "$EDEN_API/projects/$WIZARD_PROJECT_ID/generate-map" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "description": "A mobile-first food delivery marketplace connecting local restaurants with customers",
        "audience": "Hungry consumers aged 18-45 in urban areas, plus restaurant owners managing their listings",
        "capabilities": "Browse restaurants, place orders, track delivery in real-time, manage restaurant menu, process payments, rate and review",
        "constraints": "Must support iOS and Android, integrate with Stripe for payments, comply with food safety regulations"
    }')
echo "$GENERATE_RESPONSE" | jq .
JOB_ID=$(echo "$GENERATE_RESPONSE" | jq -r '.job_id')
echo "Job: $JOB_ID"
```

**Expected:** 202, returns `job_id` for the generation task.

### 4. Poll for Completion

```bash
for i in $(seq 1 36); do
    RESULT=$(api "$EDEN_API/projects/$WIZARD_PROJECT_ID/generate-map/status?job_id=$JOB_ID" \
        -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.status')
    STATUS="$RESULT"
    echo "Attempt $i: $STATUS"
    [ "$STATUS" = "complete" ] && break
    [ "$STATUS" = "failed" ] && { echo "FAILED"; break; }
    sleep 5
done
```

**Expected:** Status transitions: `pending` → `processing` → `complete`
within 10 minutes (text-only runs typically finish faster; document-backed runs take 5-10 minutes).

```bash
WIZARD_LOG="/tmp/eden-s17-${JOB_ID}.log"
eve job logs "$JOB_ID" 2>&1 | tee "$WIZARD_LOG"
HELP_CALLS=$(rg -c 'eden --help' "$WIZARD_LOG" || true)
CREATE_CALLS=$(rg -c 'eden changeset create' "$WIZARD_LOG" || true)
INITIAL_MAP_CALLS=$(rg -c 'eden changeset create .*--initial-map-file' "$WIZARD_LOG" || true)
SCHEMA_EXPLORATION=$(rg -c 'Explore changeset schema|create-changeset-input\\.util\\.ts|contracts/create-changeset\\.schema\\.json' "$WIZARD_LOG" || true)
echo "help_calls=$HELP_CALLS create_calls=$CREATE_CALLS initial_map_calls=$INITIAL_MAP_CALLS schema_exploration=$SCHEMA_EXPLORATION"
echo "Potential log problems (should print nothing):"
rg -n -i 'invalid_changeset|violates not-null|internal server error|requires approval|POST .*/changesets -> (400|500)' "$WIZARD_LOG" || true
```

**Expected:** No `eden --help` calls, at least one `eden changeset create` call, at least one `--initial-map-file` call, `schema_exploration=0`, and no `invalid_changeset`, DB-constraint, approval, or server-side failures in the wizard job log.

### 5. Retrieve Generated Changeset

```bash
WIZARD_CS_ID=$(api "$EDEN_API/projects/$WIZARD_PROJECT_ID/generate-map/status?job_id=$JOB_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.changeset_id')
echo "Changeset: $WIZARD_CS_ID"

api "$EDEN_API/changesets/$WIZARD_CS_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    status: .status,
    title: .title,
    item_count: (.items | length),
    entity_types: [.items[].entity_type] | group_by(.) | map({(.[0]): length}) | add
}'
```

**Expected:** Changeset with items covering:
- non-empty `title` (ideally `Initial story map for "Wizard Test Project"`)
- `status = "accepted"` because wizard completion auto-applies the generated changeset
- `persona`: ≥3 personas
- `activity`: ≥3 activities
- `step`: ≥6 steps
- `task`: ≥10 tasks
- `question`: ≥3 questions (optional)

### 6. Inspect Generated Content Quality

```bash
api "$EDEN_API/changesets/$WIZARD_CS_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.items[] | select(.entity_type=="persona") | .after_state | {name, code, color}'

api "$EDEN_API/changesets/$WIZARD_CS_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '.items[] | select(.entity_type=="activity") | .after_state | {name, description}'

api "$EDEN_API/changesets/$WIZARD_CS_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | \
    jq '[.items[] | select(.entity_type=="task") | .after_state | {
      title,
      step_ref: (.step_ref // .step_display_id),
      device,
      user_story,
      acceptance_criteria_count: ((.acceptance_criteria // []) | length)
    }] | first(3)'
```

**Expected:**
- Personas relevant to food delivery (e.g., Customer, Restaurant Owner, Delivery Driver)
- Activities covering the described capabilities (ordering, delivery tracking, restaurant management)
- Tasks with coherent user stories referencing the personas
- Task `device` is populated (or normalized) on generated task items
- Task `acceptance_criteria` populated with 2-4 useful entries
- Task items retain a parent step reference (`step_ref` or `step_display_id`)

### 7. Verify Wizard Auto-Accept

```bash
api "$EDEN_API/changesets/$WIZARD_CS_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    status,
    accepted_items: [.items[] | select(.status=="accepted")] | length
}'
```

**Expected:** changeset `status` remains `accepted` and most or all items are `accepted`.

### 8. Verify Populated Map

```bash
api "$EDEN_API/projects/$WIZARD_PROJECT_ID/map" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    personas: (.personas | length),
    activities: (.activities | length),
    total_steps: [.activities[].steps | length] | add,
    total_tasks: [.activities[].steps[].tasks | length] | add
}'
```

**Expected:**
- `personas`: ≥3
- `activities`: ≥3
- `total_steps`: ≥6
- `total_tasks`: ≥10

### 9. Verify Audit Trail

```bash
api "$EDEN_API/projects/$WIZARD_PROJECT_ID/audit" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '.entries | length'
```

**Expected:** Multiple audit entries recording the changeset acceptance
and entity creation.

### 10. UI — Wizard Flow (Playwright)

```typescript
import { test, expect } from '@playwright/test';

const EDEN_URL = process.env.EDEN_URL || 'https://web.incept5-eden-sandbox.eh1.incept5.dev';

test.describe('Scenario 17: Project Wizard UI', () => {
    test('wizard opens from create button', async ({ page }) => {
        await page.goto(EDEN_URL);
        await page.waitForLoadState('networkidle');

        // Click "Create Project" or similar button
        await page.locator('button:has-text("Create"), [data-testid="create-project"]').click();

        // Wizard modal/page appears
        await expect(page.locator('[data-testid="project-wizard"]')).toBeVisible({ timeout: 5000 });

        // Step 1: Name field
        await expect(page.locator('input[name="name"], [data-testid="wizard-name"]')).toBeVisible();
    });

    test('wizard captures context and triggers generation', async ({ page }) => {
        await page.goto(EDEN_URL);
        await page.locator('button:has-text("Create"), [data-testid="create-project"]').click();
        await page.waitForSelector('[data-testid="project-wizard"]');

        // Fill Step 1
        await page.fill('input[name="name"], [data-testid="wizard-name"]', 'Playwright Wizard Test');

        // Navigate to context step
        await page.locator('button:has-text("Next")').click();

        // Fill context fields
        await page.fill('[data-testid="wizard-audience"], textarea[name="audience"]',
            'Urban food delivery customers');
        await page.fill('[data-testid="wizard-capabilities"], textarea[name="capabilities"]',
            'Order food, track delivery, pay online');

        // Trigger generation
        await page.locator('button:has-text("Generate")').click();

        // Progress indicator visible
        await expect(page.locator('[data-testid="generate-progress"]')).toBeVisible({ timeout: 5000 });

        // Wait for completion (up to 10 min — text-only runs are faster but
        // document-backed generations take 5-10 minutes)
        await expect(page.locator('[data-testid="changeset-review"], [data-testid="review-modal"]'))
            .toBeVisible({ timeout: 600_000 });
    });
});
```

### 11. Clean Up

```bash
# Delete wizard test project
api -X DELETE "$EDEN_API/projects/$WIZARD_PROJECT_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN"
```

---

## Success Criteria

- [ ] `POST /generate-map` creates Eve job and returns job ID
- [ ] Status endpoint shows progress transitions (pending → processing → complete)
- [ ] Wizard job logs show `help_calls=0`, `create_calls>=1`, and no `invalid_changeset`, approval prompts, or server-side failures
- [ ] Generated changeset contains ≥3 personas, ≥3 activities, ≥10 tasks
- [ ] Generated content is relevant to the provided project description
- [ ] Personas, activities, and tasks have coherent names and user stories
- [ ] Wizard auto-accept populates the map correctly
- [ ] Map endpoint returns the full generated structure
- [ ] Audit trail records the changeset acceptance
- [ ] UI wizard renders multi-step form
- [ ] UI shows progress during generation
- [ ] UI opens changeset review modal on completion
