# Agent Instructions

Eden is a full-stack AI-first requirements platform: NestJS API + React SPA + PostgreSQL + 14 Eve Horizon agents. See [ARCHITECTURE.md](ARCHITECTURE.md) for system diagrams.

## Project Context

- **API**: `apps/api/` — NestJS 11, 17 modules, PostgreSQL with RLS
- **Web**: `apps/web/` — React 18, Vite, Tailwind, 8 pages with story map grid
- **Agents**: `eve/agents.yaml` + `skills/` — 14 agents (coordinator, 7 experts, 6 intelligence)
- **Database**: `db/migrations/` — 15 tables, never edit existing migrations
- **Config**: `.eve/manifest.yaml` — deployment, pipelines, managed Postgres

## API Access Policy for Agents

- All agent documentation, runbooks, and skill workflows that touch Eden API data MUST call the `eden` CLI.
- Never call Eden REST endpoints directly from skills or agent workflows (`curl`, `fetch`, or manual URLs).
- Use `eden` (not `./cli/bin/eden`) so path handling remains stable across directories.
- If an agent needs an API operation the CLI does not expose, add the command in CLI first, then update skills.

## CRITICAL: Staging Deployment

**You MUST sync the manifest before every deploy.** Failure to do so causes "Manifest missing services" errors because the platform uses a stale server-side manifest for routing.

**Deploy checklist:**
```bash
# 1. Commit and push your code changes
git add <files> && git commit -m "..." && git push

# 2. Deploy (--repo-dir . syncs the manifest automatically)
eve env deploy sandbox --ref HEAD --repo-dir .
```

**NEVER run `eve env deploy` without `--repo-dir .`** — without it, the CLI uses whatever manifest was last synced to the server, which may be stale, corrupted, or from a different session. This is the #1 cause of deploy failures in this project.

**If deploy fails:**
1. Run `eve project sync` to force-sync the manifest
2. Retry: `eve env deploy sandbox --ref HEAD --repo-dir .`
3. If still failing, check `eve build diagnose <build_id>` for the specific error

**Verify after deploy:**
```bash
curl -sI https://eden.eh1.incept5.dev       # Should return 200
curl -sI https://api.incept5-eden-sandbox.eh1.incept5.dev/health  # API health
```

## Issue Tracking

This project uses **bd** (beads) for ALL issue tracking. Run `bd onboard` to get started.

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds


<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs via Dolt:

- Each write auto-commits to Dolt history
- Use `bd dolt push`/`bd dolt pull` for remote sync
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
