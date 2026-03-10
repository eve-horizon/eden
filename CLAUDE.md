# PM Expert Panel — Eve Agent Pack

## What This Is

An Eve Horizon AgentPack — not a deployable service. This repo defines 8 agents, 1 team, and chat routing config that get synced into an Eve project via `eve agents sync`. There is no application code, no Dockerfile, no build pipeline.

## Architecture: Intelligent Coordinator

**One agent. One conversation. The coordinator decides everything.**

Users talk to `@eve pm`. The coordinator reads the message and any attachments, decides what's needed, and either handles it directly (solo path → `success`) or calls in the 7-expert panel (panel path → `prepared` → experts → synthesis).

The team uses **staged council dispatch**: coordinator runs first, experts fan out in parallel only when needed, coordinator wakes to synthesize.

## Repo Structure

```
.eve/manifest.yaml        # Project manifest (pack self-reference)
.eve/packs.lock.yaml      # Resolved pack state
eve/pack.yaml             # Pack descriptor (id: pm-expert-panel)
eve/agents.yaml           # 8 agent definitions (1 routable + 7 internal)
eve/teams.yaml            # expert-panel team (staged council, 7 members)
eve/chat.yaml             # Single catch-all route → team:expert-panel
eve/workflows.yaml        # pm-review workflow (doc.ingest trigger)
eve/x-eve.yaml            # Harness profiles (coordinator/expert/monitor)
skills/                   # SKILL.md files per agent persona
skills.txt                # Skillpack source (eve-skillpacks)
```

## Agents

| Agent | Slug | Profile | Gateway | Role |
|---|---|---|---|---|
| PM Coordinator | `pm` | coordinator | routable (Slack) | Triages, processes files, dispatches panel, synthesizes |
| Tech Lead | `tech-lead` | expert | internal | Technical feasibility, architecture |
| UX Advocate | `ux-advocate` | expert | internal | UX, accessibility, i18n |
| Business Analyst | `biz-analyst` | expert | internal | Process flows, success criteria |
| GTM Advocate | `gtm-advocate` | expert | internal | Revenue, competitive positioning |
| Risk Assessor | `risk-assessor` | expert | internal | Timeline, dependency, regulatory risk |
| QA Strategist | `qa-strategist` | expert | internal | Testing strategy, edge cases |
| Devil's Advocate | `devils-advocate` | expert | internal | Challenges assumptions |

## Team Dispatch

The `expert-panel` team uses **staged council** mode. The coordinator runs first (lead_timeout: 3600s). If it returns `prepared`, 7 experts fan out in parallel (max_parallel: 7, member_timeout: 300s). The coordinator then wakes to synthesize. If the coordinator returns `success`, experts are auto-cancelled.

## Harness Profiles (eve/x-eve.yaml)

All profiles use `claude` harness with `sonnet` model:
- **coordinator** — reasoning_effort: medium (triage, transcription, synthesis)
- **expert** — reasoning_effort: medium (deep analysis)
- **monitor** — reasoning_effort: low (lightweight classification)

## Chat Routing (eve/chat.yaml)

Single catch-all route: `.*` → `team:expert-panel`. The coordinator handles all triage and routing decisions internally.

## Key Commands

```bash
# Sync agents to a project (from committed ref)
eve agents sync --project <proj_id> --ref <sha> --repo-dir .

# Sync local state (development)
eve agents sync --project <proj_id> --local --allow-dirty

# Preview effective config
eve agents config --repo-dir .
```

## Conventions

- Agent persona/behavior lives in `skills/<name>/SKILL.md`
- Agent definitions (harness, gateway, workflow) live in `eve/agents.yaml`
- Only the coordinator is gateway-routable; experts are internal (invoked by team dispatch)
- Slug must be lowercase alphanumeric + dashes, org-unique
- Skills are installed at runtime from `skills.txt` (eve-skillpacks)
- `.agents/` and `.claude/` are gitignored (runtime-generated)

## Editing Guidelines

- When modifying an agent's behavior, edit its `skills/<name>/SKILL.md`
- When adding a new agent, update: `eve/agents.yaml`, `eve/teams.yaml` (if team member), and create `skills/<slug>/SKILL.md`
- When changing harness config, edit `eve/x-eve.yaml`
- After any config change, re-sync with `eve agents sync`
