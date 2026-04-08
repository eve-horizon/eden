# Changeset Input Hardening & Agent Leniency

**Status:** Plan
**Date:** 2026-04-08
**Scope:** Harden agent-authored changeset creation after sandbox wizard verification exposed a brittle create boundary
**Tracking bead:** `eden-0gj3`
**Related beads:** `eden-19tg`, `eden-gtjy`

---

## Context

On 2026-04-08, sandbox wizard verification created project `Parity Verification 20260408-155948` and kicked off Eve job `eden-ff0e838b` for `map-generator`. The agent successfully generated a story-map payload, but changeset creation failed twice:

```text
POST /projects/33cda633-ae69-4170-aad2-44383f0d7fd1/changesets -> 500
```

Sandbox API logs showed the concrete cause:

```text
null value in column "title" of relation "changesets" violates not-null constraint
```

The immediate fault was a malformed agent payload missing the top-level `title`. The broader fault was that the API accepted untrusted agent JSON, performed no runtime validation or normalization, and let the database surface the first real error as a 500.

This plan addresses three related needs:

1. Agents should be guided more tightly toward a valid changeset envelope.
2. The API should reject truly invalid payloads with `400` and actionable validation details.
3. The API should be lenient for recoverable omissions by manufacturing safe defaults instead of failing hard.

---

## Problem Statement

Today the changeset-create boundary is too brittle for agent traffic.

- The generator skill documents a valid top-level envelope, but the server does not enforce it.
- The CLI forwards raw JSON directly to the API.
- The API inserts top-level fields directly into SQL.
- Missing non-essential fields become database exceptions instead of recoverable defaults.
- Missing essential fields become opaque server errors instead of agent-actionable validation messages.

This is the wrong failure mode for an agent-native system. Agents will make formatting mistakes. The platform should distinguish between:

- **Recoverable omissions**: missing title, missing source, missing description, invalid device casing, string-form acceptance criteria.
- **True contract violations**: no `items`, unknown `entity_type`, unsupported `operation`, missing locator for `update`, no parent reference for a `task/create`.

---

## Design Principles

1. **Be strict about structure, lenient about polish.**
2. **Do normalization before validation whenever defaults are safe.**
3. **Never return 500 for user or agent payload mistakes.**
4. **Preserve actionable error detail across the CLI hop.**
5. **Keep the golden path narrow for generator agents.**

---

## Goals

- Reduce malformed changeset submissions from generator and map-edit agents.
- Convert payload-shape failures into `400 Bad Request` with field-level guidance.
- Auto-fill non-essential fields server-side where the intent is still clear.
- Keep changeset creation auditable even when defaults are applied.
- Add verification so wizard generation is proven end to end in sandbox.

## Non-Goals

- Replacing the changeset model or review workflow.
- Accepting structurally meaningless payloads.
- Hiding low-quality agent behavior completely; defaults should still be visible as warnings/audit data.
- Solving every agent prompt-quality issue in one slice.

---

## 5 Whys Summary

1. Wizard generation failed because the map-generator job could not create its changeset.
2. Changeset creation failed because `/projects/:id/changesets` returned 500.
3. It returned 500 because Postgres rejected `changesets.title = null`.
4. `title` was null because the agent submitted an invalid top-level envelope.
5. That became a 500 because the API had no runtime validation or normalization layer before SQL.

This plan fixes both the immediate payload shape problem and the systemic boundary weakness.

---

## Workstreams

### WS1: Prompt & Skill Hardening

**Intent:** Make the generator more likely to submit a valid envelope on the first try.

#### Changes

- Tighten `skills/map-generator/SKILL.md` so the top-level envelope is even more explicit:
  - non-empty `title`
  - `source`
  - non-empty `items`
- Add a short pre-submit checklist:
  - title exists and is non-blank
  - `items.length > 0`
  - every item has `entity_type` and `operation`
  - `task/create` items include a step reference and at least a task label
- Update the wizard-generated prompt so it names the expected title directly, for example:
  - `Changeset title: Initial story map for "<projectName>"`
- Keep the current “3 tool calls only” discipline for `map-generator`; no `--help`, no schema exploration, no fallback browsing.

#### Why this matters

The skill already documents `title`, but the sandbox logs show the agent still wandered off the golden path. The prompt needs to reduce ambiguity and force a last sanity check before calling `eden changeset create`.

#### Verification

- New sandbox generation should show no `eden --help` exploration in the job log.
- The first `eden changeset create` attempt should succeed without a schema-learning loop.

---

### WS2: Server-Side Normalization & Lenient Defaults

**Intent:** Recover from non-essential agent omissions before validation and persistence.

#### Proposed shape

Add a dedicated normalization layer for `POST /projects/:projectId/changesets`, for example:

- `normalizeCreateChangesetInput(raw, ctx, project)`
- returns:
  - `sanitized`
  - `warnings[]`
  - `errors[]`

The controller/service path becomes:

1. Parse raw body
2. Normalize recoverable fields
3. Validate mandatory fields
4. If errors remain, return `400`
5. Otherwise create the changeset with sanitized input

#### Recoverable fields to default or normalize

| Field | Behavior |
|---|---|
| `title` | If blank/missing, manufacture `Generated changeset for <project name> - <UTC timestamp>` |
| `source` | Infer from authenticated agent slug when available, else `manual` |
| `actor` | Infer from authenticated identity when available |
| `items[].description` | Synthesize from `entity_type`, `operation`, and best available reference |
| `items[].display_reference` | Derive from `after_state.display_id`, persona code, or other entity-specific identifier where safe |
| `task.create.priority` | Default to `medium` |
| `task.create.status` | Default to `draft` |
| `task.create.device` | Normalize to `desktop` / `mobile` / `all`; default invalid or missing values to `all` |
| `task.create.lifecycle` | Default to `current` |
| `task.create.acceptance_criteria` | Normalize strings or mixed arrays into object form; if missing, store `[]` and emit warning |
| `question.create.priority` | Default to `medium` |
| `question.create.category` | Default to `requirements` |
| `persona.create.code` | If missing but `name` exists, derive an uppercase short code when safe |

#### Mandatory fields that should still fail

| Condition | Result |
|---|---|
| Missing or empty `items` array | `400` |
| Missing `entity_type` or `operation` | `400` |
| Unknown `entity_type` or unsupported `operation` | `400` |
| `create` item missing `after_state` object | `400` |
| `update` or `delete` item missing locator / reference | `400` |
| `task/create` missing step reference | `400` |
| `step/create` missing parent activity reference | `400` |
| Payload not an object | `400` |

#### Notes

- The leniency line should be pragmatic, not magical. Missing `title` is recoverable. Missing the entire `items` array is not.
- Defaults should be audited as warnings so we can see when an agent is leaning on recovery too often.
- This normalization layer should live close to `changesets.service.ts`, not only in prompts, so it protects all callers uniformly.

---

### WS3: Useful 400 Responses

**Intent:** Make malformed payloads self-correctable by agents and readable by humans.

#### Response contract

For invalid payloads, return `400 Bad Request` with a structured body such as:

```json
{
  "code": "invalid_changeset",
  "message": "Changeset payload validation failed",
  "errors": [
    {
      "path": "items[3].after_state.step_display_id",
      "message": "task/create requires a step reference"
    }
  ],
  "warnings": [
    {
      "path": "title",
      "message": "Missing title; generated default title instead"
    }
  ]
}
```

#### Implementation notes

- Do not rely on TypeScript interfaces alone; they disappear at runtime.
- Prefer a custom normalization/validation pass for this route over a thin DTO-only approach, because this boundary needs project-aware defaults and warnings.
- Throw `BadRequestException` with structured JSON after normalization.
- Keep the DB insert path unreachable when `errors.length > 0`.

#### Why this matters

Agents can only self-correct if the error survives the whole stack. “Internal server error” is unusable feedback. A path-level `400` lets the agent fix the exact field and retry once.

---

### WS4: CLI Error Surfacing

**Intent:** Preserve validation detail for agent callers using `eden changeset create`.

Today `cli/src/client.ts` prints only `message`. That is enough for humans, but not enough for agents trying to repair malformed JSON.

#### Changes

- When the API returns `400` with `errors` and `warnings`, print them in a stable machine-readable way.
- Keep the existing non-zero exit code.
- Prefer concise stderr output such as:

```text
POST /projects/.../changesets -> 400: Changeset payload validation failed
  error: items[3].after_state.step_display_id - task/create requires a step reference
  warning: title - Missing title; generated default title instead
```

#### Outcome

The agent can repair mandatory failures and does not have to reverse-engineer the API or inspect backend code.

---

### WS5: Verification & Guardrails

**Intent:** Prove the hardened boundary works in the exact wizard flow that failed.

#### API-level cases

- Missing `title` still creates a changeset and returns a generated title.
- Missing `source` and `actor` are inferred.
- Empty `items` returns `400`.
- Unknown `entity_type` returns `400`.
- `task/create` with missing `step_display_id` returns `400`.
- String-form acceptance criteria normalize to object form.
- Invalid `device` values normalize to `all` with warning.

#### Agent/CLI cases

- `eden changeset create` prints structured validation errors from the API.
- `map-generator` can recover from one malformed draft locally without exploratory help commands.

#### Sandbox E2E cases

1. Create a fresh project via the wizard.
2. Generate the map.
3. Confirm changeset creation succeeds.
4. Confirm the generated map is populated.
5. Confirm header AC count is non-zero.
6. Confirm the first task card shows device metadata and visible AC rows.

---

## Implementation Order

1. Harden `map-generator` skill and wizard prompt with a fixed title requirement and pre-submit checklist.
2. Add changeset input normalization with recoverable defaults.
3. Add structured validation with `400` responses for mandatory failures.
4. Update CLI error rendering so agents see field-level feedback.
5. Add API tests for normalization and validation behavior.
6. Re-run sandbox wizard generation and verify story-map parity outcomes.

---

## Risks & Mitigations

### Risk: Too much leniency hides agent regressions

**Mitigation:** Keep warnings explicit in logs/audit data. Structural violations still fail with `400`.

### Risk: Manufactured defaults create low-quality map data

**Mitigation:** Default only what is operationally safe. Missing task placement or unknown operation still fails hard.

### Risk: Different agents depend on different payload quirks

**Mitigation:** Normalize at the shared API boundary rather than per-agent only.

### Risk: Validation messages never reach the calling agent

**Mitigation:** Change both the API response shape and CLI stderr formatting in the same slice.

---

## Success Criteria

- Missing non-essential changeset fields no longer cause `500`s.
- Mandatory create-contract violations return `400` with field-level guidance.
- `map-generator` submits valid changeset envelopes reliably on sandbox.
- Fresh wizard-generated maps populate successfully and expose AC/device metadata.
- Backend logs no longer show DB not-null errors for malformed changeset input.

---

## References

- [apps/api/src/changesets/changesets.service.ts](/Users/adam/dev/eve-horizon/eden/apps/api/src/changesets/changesets.service.ts)
- [apps/api/src/changesets/changesets.controller.ts](/Users/adam/dev/eve-horizon/eden/apps/api/src/changesets/changesets.controller.ts)
- [apps/api/src/wizard/wizard.service.ts](/Users/adam/dev/eve-horizon/eden/apps/api/src/wizard/wizard.service.ts)
- [skills/map-generator/SKILL.md](/Users/adam/dev/eve-horizon/eden/skills/map-generator/SKILL.md)
- [cli/src/client.ts](/Users/adam/dev/eve-horizon/eden/cli/src/client.ts)
