# PM Expert Panel — Eve Agent Pack

## What This Is

An Eve Horizon AgentPack — not a deployable service. This repo defines 10 agents, 1 team, and chat routing config that get synced into an Eve project via `eve agents sync`. There is no application code, no Dockerfile, no build pipeline.

## Repo Structure

```
.eve/manifest.yaml        # Project manifest (pack self-reference)
.eve/packs.lock.yaml      # Resolved pack state
eve/pack.yaml             # Pack descriptor (id: pm-expert-panel)
eve/agents.yaml           # 10 agent definitions
eve/teams.yaml            # expert-panel team (fanout, 7 members)
eve/chat.yaml             # Chat routes (regex match -> agent/team)
eve/workflows.yaml        # pm-review workflow (doc.ingest trigger)
eve/x-eve.yaml            # Harness profiles (coordinator/expert/monitor)
skills/                   # SKILL.md files per agent persona
skills.txt                # Skillpack source (eve-skillpacks)
```

## Agents

| Agent | Slug | Profile | Role |
|---|---|---|---|
| PM Coordinator | `pm` | coordinator | Routes to expert-panel team |
| Tech Lead | `tech-lead` | expert | Technical feasibility |
| UX Advocate | `ux-advocate` | expert | UX, accessibility, i18n |
| Business Analyst | `biz-analyst` | expert | Process flows, success criteria |
| GTM Advocate | `gtm-advocate` | expert | Revenue, competitive positioning |
| Risk Assessor | `risk-assessor` | expert | Timeline, dependency, regulatory risk |
| QA Strategist | `qa-strategist` | expert | Testing strategy, edge cases |
| Devil's Advocate | `devils-advocate` | expert | Challenges assumptions |
| Chat Monitor | `pm-monitor` | monitor | Captures decisions from chat |
| PM Search | `pm-search` | monitor | Searches document catalog |

## Team Dispatch

The `expert-panel` team fans out to all 7 expert agents in parallel (max_parallel: 7, member_timeout: 120s). The PM Coordinator is the lead.

## Harness Profiles (eve/x-eve.yaml)

All profiles currently use `claude` harness with `sonnet` model:
- **coordinator** — reasoning_effort: low
- **expert** — reasoning_effort: medium
- **monitor** — reasoning_effort: low

## Chat Routing (eve/chat.yaml)

- Direct agent routes via regex: `^@?tech.?lead`, `^@?ux`, `^@?qa`, etc.
- `search|find|catalog` -> pm-search
- `note|decision|action` -> chat-monitor
- Default catch-all -> team:expert-panel (full fanout review)

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
- All expert agents are `gateway.policy: routable` via Slack
- Slug must be lowercase alphanumeric + dashes, org-unique
- Skills are installed at runtime from `skills.txt` (eve-skillpacks)
- `.agents/` and `.claude/` are gitignored (runtime-generated)

## Editing Guidelines

- When modifying an agent's behavior, edit its `skills/<name>/SKILL.md`
- When adding a new agent, update: `eve/agents.yaml`, `eve/teams.yaml` (if team member), `eve/chat.yaml` (add route), and create `skills/<slug>/SKILL.md`
- When changing harness config, edit `eve/x-eve.yaml`
- After any config change, re-sync with `eve agents sync`
