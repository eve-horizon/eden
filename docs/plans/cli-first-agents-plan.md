# CLI-First Agent Enforcement

> **Status**: Ready to implement
> **Created**: 2026-03-23
> **Motivation**: Agents are inconsistently using the Eden CLI. `map-generator` uses raw REST calls, `map-chat` and `coordinator` reference `./cli/bin/eden` (stale — should be `eden` on PATH), and several agents lack CLI commands for operations they need.

## Problem

Eden has a CLI (`cli/bin/eden`) that gets published to `$PATH` via the platform's `x-eve.cli` mechanism. But agents aren't consistently using it:

| Agent | CLI usage | Issue |
|-------|-----------|-------|
| **map-generator** | None — raw `POST /projects/{id}/changesets` | Completely bypasses CLI |
| **map-chat** | `./cli/bin/eden` | Stale path — should be `eden` on PATH |
| **coordinator** | `./cli/bin/eden` | Stale path — should be `eden` on PATH |
| **synthesis** | `eden` on PATH | Correct |
| **extraction** | `eden` on PATH | Correct |
| **alignment** | `eden` on PATH | Correct |
| **question** | `eden` on PATH | Correct |
| **ingestion** | No API calls needed | N/A |
| **expert panel** (6 agents) | No API calls needed | N/A |

Additionally, the CLI is missing commands that agents need, forcing them into workarounds.

## Design Principles

1. **CLI is the only API interface** — no agent should use curl, fetch, or raw HTTP. The CLI handles auth, base URL, error formatting.
2. **`eden` on PATH** — all skills must reference `eden`, not `./cli/bin/eden`. The platform puts it on PATH via `x-eve.cli`.
3. **Changesets remain the write gate** — all map mutations go through `eden changeset create`. Direct entity CRUD commands are read-only or for non-map operations.

## Implementation

### Step 1: Add missing CLI commands

The following CLI commands are needed by agents but don't exist:

**File:** `cli/src/commands/tasks.ts` (NEW)

```
eden task list --project <id> [--status <s>] [--release <id>] [--json]
eden task show <id> [--json]
```

Agents need to query tasks directly instead of parsing the full map JSON. The alignment agent in particular needs this for targeted analysis.

**File:** `cli/src/commands/activities.ts` (NEW)

```
eden activity list --project <id> [--json]
```

Read-only — agents need to list activities independently of the full map.

**File:** `cli/src/commands/steps.ts` (NEW)

```
eden step list --activity <id> [--json]
```

Read-only — agents need to list steps for a specific activity.

**File:** `cli/src/commands/sources.ts` (UPDATE)

Add `eden source show <id> --json` — agents need to check individual source details.

**File:** `cli/src/index.ts` (UPDATE)

Register the new command modules.

### Step 2: Fix `map-generator` skill to use CLI

**File:** `skills/map-generator/SKILL.md`

The map-generator currently documents raw REST `POST /projects/{id}/changesets`. Rewrite to use the CLI pattern that synthesis already follows:

1. Use `eden projects list --json` to discover the project UUID
2. Build changeset JSON and write to temp file
3. Use `eden changeset create --project $PID --file /tmp/changeset.json --json`

The skill instructions should include the CLI command reference table (matching synthesis pattern), and explicitly prohibit curl/fetch/raw HTTP.

### Step 3: Fix `map-chat` skill — stale CLI path

**File:** `skills/map-chat/SKILL.md`

Replace all `./cli/bin/eden` references with `eden`. The platform puts the CLI on PATH via `x-eve.cli` — relative paths are fragile and break when the working directory changes.

### Step 4: Fix `coordinator` skill — stale CLI path

**File:** `skills/coordinator/SKILL.md`

Same as map-chat: replace all `./cli/bin/eden` with `eden`.

### Step 5: Standardize CLI reference section across all API-using agents

Every agent that calls the Eden API should have a consistent CLI reference block. The canonical pattern (from synthesis) is:

```markdown
## Eden CLI

The Eden CLI is available as `eden` on PATH. It handles auth and URLs automatically.

**You MUST use `eden` for every command.** Do NOT use curl, do NOT construct URLs, do NOT call REST endpoints directly.

## CLI Command Reference

| Command | Purpose |
|---------|---------|
| `eden projects list --json` | List projects (get Eden project UUID) |
| `eden map --project $PID --json` | Full map state |
| `eden changeset create --project $PID --file <path> --json` | Create changeset |
| `eden question list --project $PID --json` | List questions |
| `eden question create --project $PID ...` | Create question |
| `eden source list --project $PID --json` | List sources |
| `eden source update-status --source $SRC_ID --status <s>` | Update source status |
| `eden task list --project $PID --json` | List tasks |
| `eden task show <id> --json` | Show task details |
```

Only include commands relevant to that agent's role.

## Agent-by-agent changes

### map-generator (Step 2)
- **Remove**: Raw REST API documentation (POST /projects/{id}/changesets)
- **Add**: CLI preamble + command reference table
- **Add**: Example using `eden changeset create --project $PID --file /tmp/changeset.json`
- **Add**: Project discovery via `eden projects list --json`
- **Keep**: Changeset item format documentation (persona/activity/step/task/question schemas)

### map-chat (Step 3)
- **Replace**: All `./cli/bin/eden` → `eden`
- **Verify**: Command reference table is complete

### coordinator (Step 4)
- **Replace**: All `./cli/bin/eden` → `eden`
- **Verify**: Command reference table is complete

### synthesis (no changes needed)
- Already uses `eden` on PATH correctly

### extraction (no changes needed)
- Already uses `eden` on PATH correctly

### alignment (minor update)
- **Add**: `eden task list` to command reference once available (Step 1)

### question (minor update)
- **Add**: `eden task show` to command reference once available (Step 1)

## Files changed

| File | Change |
|------|--------|
| `cli/src/commands/tasks.ts` | NEW — `eden task list`, `eden task show` |
| `cli/src/commands/activities.ts` | NEW — `eden activity list` |
| `cli/src/commands/steps.ts` | NEW — `eden step list` |
| `cli/src/commands/sources.ts` | Add `eden source show` |
| `cli/src/index.ts` | Register new command modules |
| `skills/map-generator/SKILL.md` | Rewrite to use CLI instead of raw REST |
| `skills/map-chat/SKILL.md` | Fix `./cli/bin/eden` → `eden` |
| `skills/coordinator/SKILL.md` | Fix `./cli/bin/eden` → `eden` |
| `skills/alignment/SKILL.md` | Add `eden task list` to command reference |
| `skills/question/SKILL.md` | Add `eden task show` to command reference |

## Testing

1. Build the CLI: `cd cli && npm run build`
2. Run each new command against the sandbox Eden deployment
3. Re-sync agents: `eve project sync` from the Eden repo root
4. Create a map-generator job with `--with-apis api` and verify it uses `eden changeset create` (not curl)
5. Create a map-chat job and verify it uses `eden` on PATH (not `./cli/bin/eden`)

## Out of scope

- Direct entity CRUD via CLI (persona create, activity create, etc.) — all mutations go through changesets by design
- Batch reorder commands — covered by changesets
- Changeset review/approval commands — not needed by current agents
