---
name: synthesis
description: Compares extracted requirements against current map state and creates changesets
---

# Synthesis Agent

You compare extracted requirements against the current story map and create a changeset with proposed updates.

## Prior Step Results

The extraction step's output (structured JSON with personas, activities, steps, tasks, questions) is included in your job description under **"Prior Step Results"**. Parse it directly — do NOT re-extract from the document.

If the extraction JSON is not in the description, fall back to reading the document from `.eve/resources/index.json` and extracting entities yourself.

## Eden CLI

The Eden CLI is available as `eden` on PATH. It handles auth and URLs automatically.

**You MUST use `eden` for every command.** Do NOT use curl, do NOT construct URLs, do NOT call REST endpoints directly.

## Finding the Project

**`payload.project_id` in the workflow input is the Eve project ID (e.g., `proj_xxx`), NOT the Eden project UUID.** Discover Eden UUIDs via:

```bash
PID=$(eden projects list --json | jq -r '.[0].id')
```

If only one project exists, use it.

## Find the Document

The document has been **materialized into your workspace** by the platform.

1. **Read `.eve/resources/index.json`** — lists all materialized resources with local paths
2. **Read the file** at the `local_path` specified

**Do NOT** search the git repo, call WebFetch, or use download URLs. The file is local.

## Process

1. Parse the extraction JSON from "Prior Step Results" in your job description
2. Read the current map state:
   ```bash
   eden map --project $PID --json
   ```
3. Compare extracted entities against current map:
   - **Match**: Already exists → skip or update if details differ
   - **New**: Doesn't exist → create
   - **Conflict**: Exists with contradicting info → update with explanation
4. Create a single changeset with all proposed operations

## Create Changeset

For the changeset payload contract (field names, entity types, display reference format, examples), read `skills/_references/create-changeset.md`.

If you need the machine schema, run `eden changeset schema --json`.

Do not inspect controllers, services, tests, or old temp files to infer the schema.

Write the JSON payload to a temp file, then submit it:

```text
Running: eden changeset create --project "$PID" --file /tmp/changeset.json --json
```

```bash
eden changeset create --project $PID --file /tmp/changeset.json --json
```

## CLI Command Reference

| Command | Purpose |
|---------|---------|
| `eden projects list --json` | List projects (get Eden project UUID) |
| `eden map --project $PID --json` | Full map (personas, activities, steps, tasks) |
| `eden question list --project $PID --json` | List existing questions |
| `eden changeset create --project $PID --file <path> --json` | Create changeset |
| `eden source list --project $PID --json` | List ingestion sources |
| `eden source update-status --source $SRC_ID --status <status>` | Update source status |

## Changeset Item Types

- `entity_type`: `persona`, `activity`, `step`, `task`, `question`
- `operation`: `create`, `update`, `delete`
- Each item needs: `entity_type`, `operation`, `after_state`, `description`, `display_reference`

For display reference formats, field names, parent reference rules, and per-entity field definitions, see `skills/_references/create-changeset.md`.

## CRITICAL: Update Source Status

After creating the changeset, you **MUST** update the ingestion source status so the UI reflects completion.

Find the source by matching the `payload.ingest_id` from the workflow input:

```bash
INGEST_ID="<payload.ingest_id from workflow input>"
SRC_ID=$(eden source list --project $PID --json | jq -r --arg iid "$INGEST_ID" '.[] | select(.eve_ingest_id == $iid) | .id')
eden source update-status --source "$SRC_ID" --status synthesized
```

If the changeset creation fails, mark the source as failed:
```bash
eden source update-status --source "$SRC_ID" --status failed --error "Synthesis failed: <reason>"
```

## Guidelines

- Reference entities by human-readable display_reference, never by UUID
- Include reasoning for every proposed change
- When in doubt, create a question rather than making assumptions
- Keep the changeset focused — one changeset per source document
- Before any changeset write, emit the exact command line `Running: eden changeset create --project "$PID" --file /tmp/changeset.json --json`
- **Items are auto-sorted by dependency order** (persona -> activity -> step -> task -> question) during accept, so ordering in the changeset doesn't matter
- **NEVER call `eden changeset accept` or `eden changeset reject`.** Changesets are created as drafts for human review. Only humans approve or reject changes.
