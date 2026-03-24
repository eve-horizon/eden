# CLI-First Agent Enforcement

> **Status**: Implemented
> **Created**: 2026-03-23
> **Motivation**: Agents are inconsistently using the Eden CLI. `map-generator` still uses raw REST calls, and multiple skills (`map-chat`, `coordinator`, `alignment`, `question`) use `./cli/bin/eden` (stale — should be `eden` on PATH).

## Problem

Eden has a CLI (`cli/bin/eden`) that gets published to `$PATH` through the platform `x-eve.cli` mechanism. Agents are not fully aligned:

| Agent | CLI usage | Issue |
|-------|-----------|-------|
| **map-generator** | None — raw `POST /projects/{id}/changesets` | Completely bypasses CLI |
| **map-chat** | `./cli/bin/eden` | Stale path — should be `eden` on PATH |
| **coordinator** | `./cli/bin/eden` | Stale path — should be `eden` on PATH |
| **alignment** | `./cli/bin/eden` | Stale path — should be `eden` on PATH |
| **question** | `./cli/bin/eden` | Stale path — should be `eden` on PATH |
| **synthesis** | `eden` on PATH | Correct |
| **extraction** | `eden` on PATH | Correct |
| **ingestion** | None needed | N/A — pure document processing, no API calls |
| **expert panel** (7 agents) | None needed | N/A — read prepared content from `.eve/coordination-inbox.md` |

Additionally, the CLI currently lacks a few read commands that force agents to overfit around the existing interface.

## Design Principles

1. **CLI is the only API interface** — no agent should use curl, fetch, or raw HTTP endpoints.
2. **`eden` on PATH** — all skills must reference `eden`, not `./cli/bin/eden`.
3. **Changesets remain the write gate** — all map mutations go through `eden changeset create`.

## Implementation

### Step 1: Add missing CLI commands

The following CLI commands are needed by agents but do not exist:

**File:** `cli/src/commands/tasks.ts` (NEW)

```bash
eden task list --project <id> [--status <s>] [--priority <p>] [--release-id <id>] [--json]
eden task show <id> [--json]
```

The API supports filtering by `status`, `priority`, and `release_id`. Agents need to query tasks directly instead of parsing the full map JSON (`eden map` returns the full tree but is expensive for targeted lookups).

**File:** `cli/src/commands/activities.ts` (NEW)

```bash
eden activity list --project <id> [--json]
```

Read-only: agents need activity discovery without full map hydration.

**File:** `cli/src/commands/steps.ts` (NEW)

```bash
eden step list --activity <id> [--json]
```

Read-only: agents need per-activity step listings.

**File:** `cli/src/commands/sources.ts` (UPDATE)

Add:

```bash
eden source show <id> --json
```

**File:** `cli/src/index.ts` (UPDATE)

Register the new command modules.

### Step 2: Fix `map-generator` skill to use CLI

**File:** `skills/map-generator/SKILL.md`

Rewrite from raw REST (`POST /projects/{id}/changesets`) to CLI pattern:

1. Resolve project UUID from `eden projects list --json`
2. Build changeset JSON
3. Write JSON to a temp file
4. Create via `eden changeset create --project $PID --file /tmp/changeset.json --json`

The skill should include the CLI command reference table and explicitly prohibit curl/fetch/raw HTTP.

### Step 3: Replace stale `./cli/bin/eden` paths

**Files:**

- `skills/map-chat/SKILL.md`
- `skills/coordinator/SKILL.md`
- `skills/alignment/SKILL.md`
- `skills/question/SKILL.md`

Replace all `./cli/bin/eden` references with `eden`. Verify command snippets are complete and use JSON output where expected.

### Step 4: Standardize CLI reference sections across API-using agents

All API-using skills should include the canonical block:

```markdown
## Eden CLI

The Eden CLI is available as `eden` on PATH. It handles auth and URLs automatically.

**You MUST use `eden` for every command.** Do NOT use curl, do NOT construct URLs, do NOT call REST endpoints directly.

## CLI Command Reference

| Command | Purpose |
|---------|---------|
| `eden projects list --json` | List projects (get Eden project UUID) |
| `eden map --project $PID --json` | Full map state (activities→steps→tasks tree) |
| `eden changeset create --project $PID --file <path> --json` | Create changeset |
| `eden question list --project $PID --json` | List questions |
| `eden question show <id> --json` | Show question details |
| `eden question create --project $PID ...` | Create question |
| `eden source list --project $PID --json` | List sources |
| `eden source show <id> --json` | Show source details |
| `eden source update-status --source $SRC_ID --status <s>` | Update source status |
| `eden persona list --project $PID --json` | List personas |
| `eden review create --project $PID --file <path> --json` | Create expert review |
| `eden task list --project $PID --json` | List tasks (filterable) |
| `eden task show <id> --json` | Show task details |
| `eden activity list --project $PID --json` | List activities |
| `eden step list --activity <id> --json` | List steps for activity |
```

Only include commands relevant to each agent.

### Step 5: Keep command references aligned to implementation

- Ensure `skills/alignment/SKILL.md` includes `eden task list`.
- Ensure `skills/question/SKILL.md` includes `eden task show`.
- After commands are added in Step 1, update examples that still mention missing commands.

## Agent-by-agent changes

### map-generator (Step 2)
- Remove: Raw REST API documentation (`POST /projects/{id}/changesets`)
- Add: CLI preamble + command reference table
- Add: Changeset creation example using `eden changeset create --project $PID --file /tmp/changeset.json`
- Keep: changeset item format docs (persona/activity/step/task/question schemas)

### coordinator (Step 3)
- Replace all `./cli/bin/eden` occurrences with `eden`
- Verify command table includes `eden review create` (coordinator uses this for panel synthesis)
- Verify `eden question create`, `eden changeset create`, `eden map` references are complete

### map-chat, alignment, question (Step 3)
- Replace all `./cli/bin/eden` occurrences with `eden`
- Verify their command tables and examples are complete

### alignment (Step 4/5)
- Add `eden task list` to command reference when Step 1 lands

### question (Step 4/5)
- Add `eden task show` to command reference when Step 1 lands

### synthesis, extraction, ingestion
- Keep as-is — already use `eden` on PATH (synthesis, extraction) or make no API calls (ingestion)

## Files changed

| File | Change |
|------|--------|
| `cli/src/commands/tasks.ts` | NEW — `eden task list`, `eden task show` |
| `cli/src/commands/activities.ts` | NEW — `eden activity list` |
| `cli/src/commands/steps.ts` | NEW — `eden step list` |
| `cli/src/commands/sources.ts` | Add `eden source show` |
| `cli/src/index.ts` | Register new command modules |
| `skills/map-generator/SKILL.md` | Rewrite to use CLI instead of raw REST |
| `skills/map-chat/SKILL.md` | Replace `./cli/bin/eden` with `eden` |
| `skills/coordinator/SKILL.md` | Replace `./cli/bin/eden` with `eden` |
| `skills/alignment/SKILL.md` | Replace `./cli/bin/eden` with `eden` and add `eden task list` |
| `skills/question/SKILL.md` | Replace `./cli/bin/eden` with `eden` and add `eden task show` |

## Testing

1. Build the CLI: `cd cli && npm run build`
2. Run each new command against sandbox Eden deployment:
   - `eden task list --project $PID --json`
   - `eden task show <id> --json`
   - `eden activity list --project $PID --json`
   - `eden step list --activity <id> --json`
   - `eden source show <id> --json`
3. Re-sync agents and skills:
   - `eve project sync` (manifest)
   - `eve agents sync --local --allow-dirty` (agent configs + skill content)
4. Run policy scans to verify no stale references remain:
   - `rg -n '\./cli/bin/eden' skills` (stale CLI path — should find zero matches)
   - `rg -n 'curl\s|fetch\(' skills` (raw HTTP — should find zero matches)
   - `rg -n 'POST /projects|POST /questions|POST /changesets' skills` (raw REST endpoints — should find zero matches; changeset *item format* references like `"type": "persona"` are fine)
5. Create a map-generator job with `--with-apis api` and confirm it uses `eden changeset create`.
6. Create a map-chat/coordinator/alignment/question job and confirm all commands use `eden` on PATH.

## Out of scope

- Direct entity CRUD via CLI (persona/activity/task creation) — map mutations should remain changeset-driven.
- Batch reorder commands — covered by existing changeset flows.
- Additional changeset commands — `eden changeset accept/reject/show/list` already exist; no changes needed.
