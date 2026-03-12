# Eden — AI-First Requirements Platform

An Eve Horizon AgentPack — expert panel engine + living story map for AI-first requirements management.

## What It Does

When a document or topic is shared, a panel of 7 expert agents reviews it in parallel:

- **Tech Lead** — Technical feasibility, architecture, cost
- **UX Advocate** — User experience, accessibility, i18n
- **Business Analyst** — Process flows, requirements, success criteria
- **GTM Advocate** — Revenue impact, competitive positioning, launch readiness
- **Risk Assessor** — Timeline, dependency, commercial, regulatory risks
- **QA Strategist** — Testing strategy, edge cases, acceptance criteria
- **Devil's Advocate** — Challenges assumptions, proposes alternatives

Plus utility agents:
- **Chat Monitor** — Captures decisions and action items from channel chat
- **PM Search** — Searches the document catalog

## Install

Add to your `.eve/manifest.yaml`:

```yaml
x-eve:
  packs:
    - source: github:eve-horizon/eden
      ref: <commit-sha>
```

Then sync:

```bash
eve agents sync --project <proj_id> --ref main --repo-dir .
```

## Usage

Route messages to the expert panel via chat:

```
@eve pm "Review this Q1 roadmap proposal..."
```

Or route to a specific expert:

```
@eve tech-lead "Is this architecture feasible?"
@eve ux-advocate "Review the onboarding flow"
```

## Harness Configuration

Default: `mclaude` (Claude via Anthropic API). To switch to Qwen 3.5:

1. Set `PI_MODELS_JSON_B64` project secret pointing to your Qwen endpoint
2. Update `eve/x-eve.yaml` profiles to use `pi` harness
