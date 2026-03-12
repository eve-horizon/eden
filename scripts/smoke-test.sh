#!/bin/bash
# scripts/smoke-test.sh — runs as a pipeline step after migrate
set -euo pipefail
BASE="https://web.${ORG_SLUG:-incept5}-eden-sandbox.eh1.incept5.dev"
TOKEN="${TOKEN:-}"

echo "=== Phase 1 Smoke Tests ==="

# Health (nginx /health returns 200, /api/health checks API + DB)
curl -sf "$BASE/health" > /dev/null
echo "✓ Web healthy"
curl -sf "$BASE/api/health" | jq .status
echo "✓ API healthy"

if [ -z "$TOKEN" ]; then
  echo "⚠ TOKEN not set — skipping authenticated tests"
  echo "=== Phase 1 smoke tests passed (health only) ==="
  exit 0
fi

# Auth (requires valid token)
curl -sf -H "Authorization: Bearer $TOKEN" "$BASE/api/projects" | jq length
echo "✓ Auth working"

# Create project
PROJECT=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test","slug":"smoke-test"}' \
  "$BASE/api/projects" | jq -r .id)
echo "✓ Project created: $PROJECT"

# Create persona
PERSONA=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"pm","name":"Product Manager","color":"#059669"}' \
  "$BASE/api/projects/$PROJECT/personas" | jq -r .id)
echo "✓ Persona created: $PERSONA"

# Create activity
ACT=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Onboarding","display_id":"ACT-1","sort_order":1}' \
  "$BASE/api/projects/$PROJECT/activities" | jq -r .id)
echo "✓ Activity created: $ACT"

# Create step
STEP=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Registration","display_id":"STP-1.1","sort_order":1}' \
  "$BASE/api/activities/$ACT/steps" | jq -r .id)
echo "✓ Step created: $STEP"

# Create task
TASK=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Email signup","display_id":"TSK-1.1.1","user_story":"As a new user...","acceptance_criteria":[],"priority":"high"}' \
  "$BASE/api/projects/$PROJECT/tasks" | jq -r .id)
echo "✓ Task created: $TASK"

# Place task on step
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"step_id\":\"$STEP\",\"persona_id\":\"$PERSONA\",\"role\":\"owner\",\"sort_order\":1}" \
  "$BASE/api/tasks/$TASK/place" > /dev/null
echo "✓ Task placed on map"

# Add question
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"Should signup require CAPTCHA?\",\"references\":[{\"entity_type\":\"task\",\"entity_id\":\"$TASK\"}]}" \
  "$BASE/api/projects/$PROJECT/questions" > /dev/null
echo "✓ Question created"

# Create release and assign task
REL=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"MVP","status":"planning"}' \
  "$BASE/api/projects/$PROJECT/releases" | jq -r .id)
curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"task_ids\":[\"$TASK\"]}" \
  "$BASE/api/releases/$REL/tasks" > /dev/null
echo "✓ Release assignment working"

# Get filtered map
MAP=$(curl -sf -H "Authorization: Bearer $TOKEN" "$BASE/api/projects/$PROJECT/map?release=$REL")
echo "$MAP" | jq '.stats'
echo "$MAP" | jq -e --arg task "$TASK" '.. | objects | select(.id? == $task)' > /dev/null
echo "✓ Map endpoint working"

# Cleanup
curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/api/projects/$PROJECT" > /dev/null
echo "✓ Cleanup done"

echo "=== All Phase 1 smoke tests passed ==="
