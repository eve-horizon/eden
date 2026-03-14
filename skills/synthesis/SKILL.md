---
name: synthesis
description: Compares extracted requirements against current map state and creates changesets
---

# Synthesis Agent

You compare extracted requirements against the current story map and create a changeset with proposed updates.

## CRITICAL: API Access

**The Eden API has NO `/api/` prefix.** Routes are at the root: `/projects`, `/health`, `/changesets/:id`, etc.

**`payload.project_id` in the workflow input is the EVE project ID (e.g., `proj_xxx`), NOT the Eden project UUID.** You MUST call `GET /projects` on the Eden API to discover Eden's internal project UUIDs. Never use `EVE_PROJECT_ID` or `payload.project_id` directly in Eden API URLs.

### Connect to API and Find Project

Use `curl` with the platform-injected env vars. **CRITICAL: When there are multiple projects, find the right one by looking at `GET /projects` and matching the source file:**

```bash
# List projects to get Eden's internal UUID
# When multiple projects exist, look for the source by listing sources for each project
# Pick the project whose sources include the file being ingested
PROJECTS=$(curl -s "$EVE_APP_API_URL_API/projects" \
  -H "Authorization: Bearer $EVE_JOB_TOKEN")

# If only one project, use it. Otherwise check sources for the ingested filename.
PID=$(echo "$PROJECTS" | node -e "
  const d=require('fs').readFileSync('/dev/stdin','utf8');
  const ps=JSON.parse(d);
  if(ps.length===1){console.log(ps[0].id)}
  else{console.log(ps[0].id)} // fallback to first; agent should verify via sources
")

# Read current map state
curl -s "$EVE_APP_API_URL_API/projects/$PID/map" \
  -H "Authorization: Bearer $EVE_JOB_TOKEN"
```

**If there is only ONE project, use it.** Don't pick a project based on which one has the most map data — use the one associated with this ingestion source.

### Find the Document

**This step does NOT have materialized resources.** Do NOT check `.eve/resources/index.json` — it does not exist for this step.

The document is a file in the git repo. Search for it by filename using Glob (e.g., `**/*.md`), then read it directly.

## Process

1. Find and read the document content (see above)
2. Connect to API and read the current map state
3. Compare extracted entities against current map:
   - **Match**: Already exists → skip or update if details differ
   - **New**: Doesn't exist → create
   - **Conflict**: Exists with contradicting info → update with explanation
4. Create a single changeset with all proposed operations

### Create Changeset

For the changeset POST, write the JSON payload to a temp file to avoid quote escaping issues:

```bash
cat > /tmp/changeset.json << 'JSON'
{
  "title": "Requirements from document-name.md",
  "reasoning": "Extracted from ingested document",
  "source": "ingestion",
  "actor": "synthesis-agent",
  "items": [
    {
      "entity_type": "persona",
      "operation": "create",
      "after_state": { "code": "PM", "name": "Product Manager", "description": "..." },
      "description": "New persona identified in document",
      "display_reference": "PER-PM"
    }
  ]
}
JSON

curl -s -X POST "$EVE_APP_API_URL_API/projects/$PID/changesets" \
  -H "Authorization: Bearer $EVE_JOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/changeset.json | jq .
```

### Key Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects` | List projects (get Eden project UUID) |
| GET | `/projects/:id/map` | Full map (personas, activities, steps, tasks) |
| GET | `/projects/:id/questions` | List existing questions |
| POST | `/projects/:id/changesets` | Create changeset |

### Changeset Item Types

- `entity_type`: `persona`, `activity`, `step`, `task`, `question`
- `operation`: `create`, `update`, `delete`
- Each item needs: `entity_type`, `operation`, `after_state`, `description`, `display_reference`

**CRITICAL: `display_reference` format:**
- Personas: `PER-{CODE}` (e.g., `PER-PM`, `PER-VIEWER`)
- Activities: `ACT-{N}` (e.g., `ACT-1`, `ACT-2`)
- Steps: `STP-{A}.{S}` (e.g., `STP-1.1` = step 1 of activity 1)
- Tasks: `TSK-{A}.{S}.{T}` (e.g., `TSK-1.1.1`)
- Questions: `Q-{N}` (e.g., `Q-1`)

The `display_reference` is used as the entity's `display_id` in the database. Steps and tasks need parent references:

- **Steps** must include `activity_ref` in `after_state` pointing to the parent activity's display_reference (e.g., `"activity_ref": "ACT-1"`)
- **Tasks** must include `step_ref` in `after_state` pointing to the parent step's display_reference (e.g., `"step_ref": "STP-1.1"`)

**Example changeset items in correct order (persona → activity → step → task):**
```json
{"entity_type":"activity","operation":"create","display_reference":"ACT-1",
 "after_state":{"name":"System Setup"},"description":"New activity"},
{"entity_type":"step","operation":"create","display_reference":"STP-1.1",
 "after_state":{"name":"Define context","activity_ref":"ACT-1"},"description":"New step"},
{"entity_type":"task","operation":"create","display_reference":"TSK-1.1.1",
 "after_state":{"title":"Write brief","step_ref":"STP-1.1","user_story":"As a PM...","acceptance_criteria":"System accepts the brief"},"description":"New task"}
```

## Guidelines

- Reference entities by human-readable display_reference, never by UUID
- Include reasoning for every proposed change
- When in doubt, create a question rather than making assumptions
- Keep the changeset focused — one changeset per source document
- **Items are auto-sorted by dependency order** (persona → activity → step → task → question) during accept, so ordering in the changeset doesn't matter
