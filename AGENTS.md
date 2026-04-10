# Agent Instructions

Eden is a full-stack AI-first requirements platform: NestJS API + React SPA + PostgreSQL + Eden CLI + 16 Eve Horizon agents. See [ARCHITECTURE.md](ARCHITECTURE.md) for system diagrams.

## Project Context

- **API**: `apps/api/` — NestJS 11, 20 domain modules, PostgreSQL with RLS (19 tables)
- **Web**: `apps/web/` — React 18, Vite, Tailwind, 9 project pages + login
- **CLI**: `cli/` — 22 command modules wrapping every REST endpoint
- **Agents**: `eve/agents.yaml` + `skills/` — 16 agents (coordinator, 7 experts, 8 intelligence/wizard)
- **Database**: `db/migrations/` — 8 migrations, never edit existing migrations
- **Config**: `.eve/manifest.yaml` — deployment, pipelines, managed Postgres

## API Access Policy for Agents

- All agent documentation, runbooks, and skill workflows that touch Eden API data MUST call the `eden` CLI.
- Never call Eden REST endpoints directly from skills or agent workflows (`curl`, `fetch`, or manual URLs).
- Use `eden` (not `./cli/bin/eden`) so path handling remains stable across directories.
- If an agent needs an API operation the CLI does not expose, add the command in CLI first, then update skills.
- CLI/API parity is mandatory for every non-webhook REST operation. When adding, changing, or removing a public Eden API route, update the `eden` CLI in the same change and keep docs/tests aligned so agents never need a raw REST fallback.

## Skill Authoring Rules

- **Inline templates only.** Agent SKILL.md files must keep critical structural templates (JSON schemas for changesets, entity shapes) inline in the prompt. Never move them to reference files — agents either skip reading them or read wrong files, resulting in malformed output (missing `display_reference`, `acceptance_criteria`, etc.).
- **Shared references** are fine for non-critical context in `skills/_references/`, but anything the agent must produce in a specific shape belongs inline in the SKILL.md.

## Changeset Contract Validation

When modifying changeset-related code (contracts, changeset service, skills that create changesets):
1. Run `./scripts/check-contract-drift.sh` to verify the contract JSON is in sync with the Zod schema
2. If the contract shape changes, regenerate with `npm run generate:contracts --prefix apps/api`
3. Update inline templates in affected SKILL.md files to match the new shape

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
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** — Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) — Tests, linters, builds
3. **Update issue status** — Close finished work, update in-progress items
4. **PUSH TO REMOTE** — This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** — Clear stashes, prune remote branches
6. **Verify** — All changes committed AND pushed
7. **Hand off** — Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing — that leaves work stranded locally
- NEVER say "ready to push when you are" — YOU must push
- If push fails, resolve and retry until it succeeds
