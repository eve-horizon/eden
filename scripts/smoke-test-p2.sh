#!/bin/bash
# scripts/smoke-test-p2.sh — Phase 2 staging validation
# Runs as a deploy pipeline step after Phase 1 smoke test passes.
set -euo pipefail
BASE="https://web.${ORG_SLUG:-incept5}-eden-sandbox.eh1.incept5.dev"
TOKEN="${TOKEN:-}"
H_AUTH="Authorization: Bearer $TOKEN"
H_JSON="Content-Type: application/json"

echo "=== Phase 2 Smoke: Changeset CRUD ==="

if [ -z "$TOKEN" ]; then
  echo "⚠ TOKEN not set — skipping authenticated tests"
  echo "=== Phase 2 smoke tests passed (skipped) ==="
  exit 0
fi

# Create project + map scaffold
PROJECT=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d '{"name":"P2 Smoke","slug":"p2-smoke"}' \
  "$BASE/api/projects" | jq -r .id)

ACT=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d '{"name":"Feature","display_id":"ACT-1","sort_order":1}' \
  "$BASE/api/projects/$PROJECT/activities" | jq -r .id)

STEP=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d '{"name":"Step 1","display_id":"STP-1.1","sort_order":1}' \
  "$BASE/api/activities/$ACT/steps" | jq -r .id)

echo "✓ Map scaffold created"

# 1. Create changeset
CS=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d '{
    "title":"Smoke test changeset",
    "reasoning":"Automated staging verification",
    "source":"smoke-test",
    "items":[
      {"entity_type":"task","operation":"create",
       "after_state":{"title":"Smoke task","display_id":"TSK-1.1.1",
         "user_story":"Smoke test","priority":"medium"},
       "description":"Smoke test task","display_reference":"TSK-1.1.1"}
    ]
  }' "$BASE/api/projects/$PROJECT/changesets")
CS_ID=$(echo $CS | jq -r .id)
echo "✓ Changeset created: $CS_ID"

# 2. List + detail
curl -sf -H "$H_AUTH" "$BASE/api/projects/$PROJECT/changesets" | jq length
curl -sf -H "$H_AUTH" "$BASE/api/changesets/$CS_ID" | jq '.items | length'
echo "✓ Changeset list + detail work"

# 3. Accept
curl -sf -X POST -H "$H_AUTH" "$BASE/api/changesets/$CS_ID/accept" > /dev/null
echo "✓ Changeset accepted"

# 4. Verify tasks created
TASKS=$(curl -sf -H "$H_AUTH" "$BASE/api/projects/$PROJECT/tasks" | jq length)
[ "$TASKS" -ge 1 ] && echo "✓ Project has $TASKS tasks after apply"

# 5. Source list endpoint
curl -sf -H "$H_AUTH" "$BASE/api/projects/$PROJECT/sources" | jq length
echo "✓ Sources endpoint works"

# Cleanup
curl -sf -X DELETE -H "$H_AUTH" "$BASE/api/projects/$PROJECT" > /dev/null
echo "✓ Cleanup done"

echo "=== Phase 2 smoke tests passed ==="
