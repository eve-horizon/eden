# Scenario 04: Changesets — Create, Review, Apply

**Time:** ~4 minutes
**Parallel Safe:** No
**LLM Required:** No

Tests the changeset system end-to-end: create a proposed set of changes, review item-by-item, accept, and verify the changes are applied to the map.

## Prerequisites

- Scenario 02 passed — project has populated map

## Steps

### 1. Create a Changeset with Multiple Operations

```bash
CHANGESET=$(api -X POST "$EDEN_URL/projects/$PROJECT_ID/changesets" \
  -d "{
    \"title\": \"Add security review step\",
    \"reasoning\": \"The expert panel identified a gap: no explicit security review step exists in the map.\",
    \"source\": \"manual-test\",
    \"items\": [
      {
        \"entity_type\": \"step\",
        \"operation\": \"create\",
        \"display_reference\": \"STP-2.3\",
        \"after_state\": {
          \"name\": \"Security Review\",
          \"display_id\": \"STP-2.3\",
          \"activity_id\": \"$ACT2_ID\",
          \"sort_order\": 3
        },
        \"description\": \"New step for security-focused review of requirements\"
      },
      {
        \"entity_type\": \"task\",
        \"operation\": \"create\",
        \"after_state\": {
          \"title\": \"Verify security implications of new requirements\",
          \"display_id\": \"TSK-2.3.1\",
          \"step_ref\": \"STP-2.3\",
          \"user_story\": \"As an Engineering Lead, I want security implications flagged during review so that we catch issues early\",
          \"acceptance_criteria\": \"- Auth requirements identified\\n- Data privacy assessed\\n- OWASP top 10 checked\",
          \"priority\": \"high\"
        },
        \"description\": \"Security verification task for new requirements\"
      }
    ]
  }")
CS_ID=$(echo "$CHANGESET" | jq -r '.id')
echo "Changeset: $CS_ID"
```

**Expected:**
- Changeset created with status `draft` (or `pending`)
- Contains 2 items (step create + task create)
- Response may include `warnings` for normalized `acceptance_criteria` and defaulted task `device` / `status` / `lifecycle`

### 2. Get Changeset Detail

```bash
api "$EDEN_URL/changesets/$CS_ID" | jq '{
  title,
  status,
  source,
  item_count: (.items | length),
  items: [.items[] | {entity_type, operation, description}]
}'
```

**Expected:** 2 items, both with `entity_type` and `operation` fields.

### 3. Submit a Malformed Changeset and Verify Structured 400

```bash
HTTP_CODE=$(curl -s -o /tmp/eden-invalid-changeset.json -w '%{http_code}' \
  -X POST "$EDEN_URL/projects/$PROJECT_ID/changesets" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "source": "manual-test",
    "items": [
      {
        "entity_type": "task",
        "operation": "create",
        "after_state": {
          "title": "Broken task with no parent step"
        }
      }
    ]
  }')
echo "$HTTP_CODE"
jq '{code, message, errors, warnings}' /tmp/eden-invalid-changeset.json
```

**Expected:**
- HTTP `400`
- `code = "invalid_changeset"`
- At least one `errors[]` entry referencing `items[0].after_state.step_ref`
- `warnings[]` may include a generated default title

### 4. Accept the Changeset

```bash
ACCEPTED=$(api -X POST "$EDEN_URL/changesets/$CS_ID/accept")
echo "$ACCEPTED" | jq '{status}'
```

**Expected:** Status changes to `accepted`.

### 5. Verify Changes Applied to Map

```bash
# Check Activity 2 now has 3 steps
api "$EDEN_URL/projects/$PROJECT_ID/map" | jq '
  .activities[] | select(.display_id == "ACT-2") |
  {name, step_count: (.steps | length), steps: [.steps[].name]}
'
```

**Expected:**
- Activity 2 now has 3 steps (Triage Request, Panel Analysis, Security Review)
- New task appears under the new step

### 6. Create and Reject a Changeset

```bash
REJECT_CS=$(api -X POST "$EDEN_URL/projects/$PROJECT_ID/changesets" \
  -d '{
    "title": "Add rejected draft task",
    "reasoning": "Testing rejection flow",
    "source": "manual-test",
    "items": [
      {
        "entity_type": "task",
        "operation": "create",
        "display_reference": "TSK-2.3.9",
        "after_state": {
          "title": "Rejected draft task",
          "step_ref": "STP-2.3",
          "user_story": "As an Engineering Lead, I want to reject noisy tasks so that the map stays clean"
        },
        "description": "Draft task that should never be applied"
      }
    ]
  }')
REJECT_ID=$(echo "$REJECT_CS" | jq -r '.id')

api -X POST "$EDEN_URL/changesets/$REJECT_ID/reject" | jq '{status}'
```

**Expected:** Changeset status is `rejected`.

### 7. Verify Rejected Changeset Had No Effect

```bash
api "$EDEN_URL/projects/$PROJECT_ID/map" | jq '
  .activities[] | select(.display_id == "ACT-2") |
  .steps[] | select(.display_id == "STP-2.3") |
  {step: .name, task_titles: [.tasks[].title]}
'
```

**Expected:** `Rejected draft task` is absent from the step's `task_titles`.

## Success Criteria

- [ ] Changeset created with multiple items
- [ ] Changeset detail returns items with correct operations
- [ ] Invalid payloads return structured `400 invalid_changeset` errors
- [ ] Accept applies all items to the map
- [ ] New step and task appear in map after acceptance
- [ ] Reject does not modify the map
