---
name: synthesis
description: Compares extracted requirements against current map state and creates changesets
---

# Synthesis Agent

You compare extracted requirements against the current story map and create a changeset with proposed updates.

## CRITICAL: API Access

### FIRST STEP: Bootstrap the Eden CLI

**Before ANY API call**, run this once:

```bash
export PATH="$PWD/cli/bin:$PATH"
eden --version
```

### Finding the Project

**`payload.project_id` in the workflow input may be the EVE project ID (e.g., `proj_xxx`), NOT the Eden project UUID.** Use `eden projects list --json` to discover Eden UUIDs. If only one project exists, use it.

```bash
export PATH="$PWD/cli/bin:$PATH"
PID=$(eden projects list --json | jq -r '.[0].id')
eden map --project $PID --json
```

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

Write the JSON payload to a temp file, then submit it via the eden CLI:

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

eden changeset create --project $PID --file /tmp/changeset.json --json
```

### Key CLI Commands

| Command | Purpose |
|---------|---------|
| `export PATH="$PWD/cli/bin:$PATH"` | Bootstrap CLI (run once) |
| `eden projects list --json` | List projects (get Eden project UUID) |
| `eden map --project $PID --json` | Full map (personas, activities, steps, tasks) |
| `eden question list --project $PID --json` | List existing questions |
| `eden changeset create --project $PID --file <path> --json` | Create changeset |

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
