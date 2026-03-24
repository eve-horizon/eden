# Scenario 17: Project Wizard

**Time:** ~10 minutes
**Parallel Safe:** Yes (uses its own project)
**LLM Required:** Yes

Verifies the AI-powered project wizard: user provides project context,
Eve agent generates an initial story map structure, output flows through
the changeset review system, and accepted items populate the project.

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
    STATUS=$(api "$EDEN_API/projects/$WIZARD_PROJECT_ID/generate-map/status" \
        -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.status')
    echo "Attempt $i: $STATUS"
    [ "$STATUS" = "complete" ] && break
    [ "$STATUS" = "failed" ] && { echo "FAILED"; break; }
    sleep 5
done
```

**Expected:** Status transitions: `pending` → `processing` → `complete`
within 3 minutes.

### 5. Retrieve Generated Changeset

```bash
WIZARD_CS_ID=$(api "$EDEN_API/projects/$WIZARD_PROJECT_ID/generate-map/status" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq -r '.changeset_id')
echo "Changeset: $WIZARD_CS_ID"

api "$EDEN_API/changesets/$WIZARD_CS_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" | jq '{
    title: .title,
    item_count: (.items | length),
    entity_types: [.items[].entity_type] | group_by(.) | map({(.[0]): length}) | add
}'
```

**Expected:** Changeset with items covering:
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
    jq '[.items[] | select(.entity_type=="task") | .after_state | {title, user_story}] | first(3)'
```

**Expected:**
- Personas relevant to food delivery (e.g., Customer, Restaurant Owner, Delivery Driver)
- Activities covering the described capabilities (ordering, delivery tracking, restaurant management)
- Tasks with coherent user stories referencing the personas

### 7. Accept All Items

```bash
api -X POST "$EDEN_API/changesets/$WIZARD_CS_ID/accept" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" | jq .
```

**Expected:** 200, changeset status → `accepted`.

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

        // Wait for completion (up to 3 min)
        await expect(page.locator('[data-testid="changeset-review"], [data-testid="review-modal"]'))
            .toBeVisible({ timeout: 180000 });
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
- [ ] Generated changeset contains ≥3 personas, ≥3 activities, ≥10 tasks
- [ ] Generated content is relevant to the provided project description
- [ ] Personas, activities, and tasks have coherent names and user stories
- [ ] Accepting changeset populates the map correctly
- [ ] Map endpoint returns the full generated structure
- [ ] Audit trail records the changeset acceptance
- [ ] UI wizard renders multi-step form
- [ ] UI shows progress during generation
- [ ] UI opens changeset review modal on completion
