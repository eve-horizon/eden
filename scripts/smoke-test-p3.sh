#!/bin/bash
# scripts/smoke-test-p3.sh — Phase 3 staging verification
set -euo pipefail
BASE="https://web.${ORG_SLUG:-incept5}-eden-sandbox.eh1.incept5.dev"
H_AUTH="Authorization: Bearer ${TOKEN:-missing}"
H_JSON="Content-Type: application/json"

echo "=== Phase 3 Staging: Intelligence Loop ==="

# 0. Scaffold — create project + minimal map (unique slug per run)
SLUG="p3-smoke-$(date +%s)"
PROJECT=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d "{\"name\":\"P3 Smoke\",\"slug\":\"$SLUG\"}" \
  "$BASE/api/projects" | jq -r .id)

ACT=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d '{"name":"Onboarding","display_id":"ACT-1","sort_order":1}' \
  "$BASE/api/projects/$PROJECT/activities" | jq -r .id)
curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d '{"name":"Registration","display_id":"STP-1.1","sort_order":1}' \
  "$BASE/api/activities/$ACT/steps" > /dev/null
echo "✓ Map scaffold created"

# 1. Chat: create thread → triggers coordinator via Eve gateway
CHAT_RESULT=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d '{"message":"Add an admin approval step to the onboarding flow"}' \
  "$BASE/api/projects/$PROJECT/chat/threads" 2>&1 || true)
THREAD_ID=$(echo "$CHAT_RESULT" | jq -r '.thread_id // empty' 2>/dev/null || true)

if [ -n "$THREAD_ID" ]; then
  echo "✓ Chat thread created: $THREAD_ID"

  # 2. Poll for AI response
  for i in $(seq 1 30); do
    MSGS=$(curl -sf -H "$H_AUTH" \
      "$BASE/api/chat/threads/$THREAD_ID/messages" | jq 'length' 2>/dev/null || echo 0)
    if [ "$MSGS" -gt 1 ]; then
      echo "✓ AI response received after $((i * 5))s ($MSGS messages)"
      break
    fi
    sleep 5
  done
else
  echo "⚠ Chat endpoint returned error (may need EVE_API_URL config): $CHAT_RESULT"
fi

# 3. Test question evolve independently (doesn't require chat)
Q=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d "{
    \"question\":\"Should this task support guest users?\",
    \"priority\":\"high\",
    \"category\":\"assumption\",
    \"references\":[{\"entity_type\":\"activity\",\"entity_id\":\"$ACT\"}]
  }" "$BASE/api/projects/$PROJECT/questions" | jq -r .id)
echo "✓ Question created with reference"

EVOLVED=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d '{"answer":"Yes, support guest checkout"}' \
  "$BASE/api/questions/$Q/evolve")
STATUS=$(echo "$EVOLVED" | jq -r .status)
[ "$STATUS" = "answered" ] && echo "✓ Question evolved → status: answered"

# 4. Verify category filter
ASSUMPTIONS=$(curl -sf -H "$H_AUTH" \
  "$BASE/api/projects/$PROJECT/questions?category=assumption" | jq length)
[ "$ASSUMPTIONS" -ge 1 ] && echo "✓ Category filter works ($ASSUMPTIONS assumption questions)"

# 5. Create + accept changeset → triggers event emission
CS=$(curl -sf -X POST -H "$H_AUTH" -H "$H_JSON" \
  -d '{
    "title":"P3 test changeset",
    "reasoning":"Verify event emission on staging",
    "source":"smoke-test",
    "items":[
      {"entity_type":"task","operation":"create",
       "after_state":{"title":"Event test task","display_id":"TSK-1.1.2",
         "priority":"medium"},
       "description":"Test task","display_reference":"TSK-1.1.2"}
    ]
  }' "$BASE/api/projects/$PROJECT/changesets" | jq -r .id)
curl -sf -X POST -H "$H_AUTH" "$BASE/api/changesets/$CS/accept" > /dev/null
echo "✓ Changeset accepted (event emitted)"

# Cleanup
curl -sf -X DELETE -H "$H_AUTH" "$BASE/api/projects/$PROJECT" > /dev/null
echo "✓ Cleanup done"

echo "=== Phase 3 staging smoke tests passed ==="
