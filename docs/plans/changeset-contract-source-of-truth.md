# Changeset Contract Single Source of Truth

**Status:** Plan
**Date:** 2026-04-10
**Scope:** Make the changeset-create contract easy for agents to load, hard to drift, and shared across API validation, OpenAPI, CLI, and skill references
**Related plans:** `changeset-input-hardening.md`, `changeset-shape-canonicalization.md`

---

## Context

The current changeset contract is split across several places:

- The API create path normalizes and validates payloads in `apps/api/src/changesets/create-changeset-input.util.ts`.
- Skills such as `map-chat`, `synthesis`, `question`, and `map-generator` contain handwritten examples and field rules.
- The wizard's `map-generator` skill contains its own inline changeset format section with structural rules and a pre-submit checklist.
- The wizard prompt contains additional requirements for task richness and acceptance criteria.
- The manifest declares `x-eve.api_spec.type: openapi`, but Eden does not currently serve or commit an actual OpenAPI spec artifact.

This creates the exact failure mode seen in sandbox runs:

1. The agent does not have one small, sanctioned artifact it can load for the payload contract.
2. It explores the codebase to infer the shape.
3. It may copy an accidental example from the workspace or logs.
4. The skill text and backend behavior can drift apart over time.

The immediate temptation is to add a handwritten schema reference file under `.agents/skills/` and point agents at it. That would improve ergonomics, but it would not solve drift unless that file is generated from the real contract.

---

## Problem Statement

There is no single, agent-loadable source of truth for the changeset-create payload.

Today:

- OpenAPI is declared in the manifest, but not concretely published.
- The CLI has no `schema` or `template` command for changesets.
- The backend validator is the real law, but it is only available by reading implementation code.
- Skill docs are readable, but they are authored guidance rather than generated contract output.

As a result, the agent has no clean answer to "what JSON should I produce?" other than "read the skill and hope it is current" or "inspect the code and infer it."

That is the wrong architecture for an agent system. The narrow path should be obvious, cheap, and authoritative.

---

## Design Principles

1. **One canonical contract, many generated views.**
2. **The API remains the law.** OpenAPI, CLI schema output, and skill references are generated from the same contract.
3. **Agents need a narrow path.** They should not have to inspect controllers, services, tests, or old temp files.
4. **OpenAPI is necessary but not sufficient.** It is useful for ecosystem tooling, but agents also need a small, direct contract artifact for one payload.
5. **Drift must fail fast.** If generated artifacts are stale, CI should fail.
6. **Structural schema and normalization semantics must stay co-located.** JSON Schema alone cannot express all aliasing, defaulting, and canonicalization rules.

---

## Goals

- Introduce a single canonical contract module for create-changeset payloads.
- Generate a machine-readable JSON Schema artifact from that module.
- Publish an actual OpenAPI document for Eden and wire it into the manifest.
- Expose a small CLI-first path for agents to fetch the changeset schema directly.
- Generate a concise skill reference file from the contract so skills can point to it without drifting.
- Update all changeset-writing skills and wizard prompts to use the sanctioned contract artifact and forbid schema exploration.
- Add CI and tests that catch drift between code, generated artifacts, and agent-facing docs.

## Non-Goals

- Replacing the changeset model or review flow.
- Encoding every normalization behavior in pure JSON Schema.
- Making agents parse the full OpenAPI document just to author one payload.
- Keeping handwritten skill examples as an independent source of truth.

---

## Proposed Architecture

### 1. Canonical Contract Module

Add a dedicated contract module in app code, for example:

`apps/api/src/contracts/create-changeset.contract.ts`

This module becomes the single source of truth for the create-changeset contract. It should define:

- Top-level payload shape
- Supported `entity_type` / `operation` combinations
- Per-item `after_state` structural requirements
- Canonical field names and display-reference conventions
- Human-readable examples
- Normalization metadata:
  - accepted aliases
  - defaultable fields
  - canonicalization rules
  - warning messages

The current `create-changeset-input.util.ts` should depend on this contract module rather than embedding the rules ad hoc.

### 2. Generated Contract Artifacts

Generate the following from the canonical contract module:

- `contracts/create-changeset.schema.json`
  - Small, direct JSON Schema artifact for the payload shape
- `docs/contracts/create-changeset.md` or `skills/_references/create-changeset.md`
  - Concise human-readable reference for agents
  - Must be generated and marked `DO NOT EDIT`
- OpenAPI component schema and request-body schema
  - Included in Eden's published OpenAPI spec

These generated outputs are views of the same contract, not peer-authored documents.

### 3. API Integration

Refactor the create path so the controller/service uses the canonical contract module for:

- validation
- normalization
- warnings
- error shaping

This keeps the runtime behavior aligned with the generated JSON Schema and human reference.

### 4. CLI Integration

Add a narrow command for agents:

```bash
eden changeset schema --json
```

This command should print the generated changeset schema directly.

Preferred behavior:

1. In repo mode, read the checked-in generated artifact.
2. Outside repo mode, fetch a dedicated API endpoint or fall back to a published schema URL.

This is a better agent interface than asking the model to parse a large OpenAPI document.

### 5. OpenAPI Publication

Make Eden publish a real OpenAPI document and wire the manifest to it.

That means:

- generating or serving `/openapi.json`
- ensuring the create-changeset request schema references the canonical contract
- updating `.eve/manifest.yaml` to include a concrete `spec_url`

For example:

```yaml
x-eve:
  api_spec:
    type: openapi
    spec_url: /openapi.json
```

OpenAPI should exist for platform and integration tooling, but agents should still prefer the small contract artifact or CLI command.

### 6. Agent Consumption Path

After this change, the intended read path for agents becomes:

1. If a skill needs the payload shape, read `skills/_references/create-changeset.md`.
2. If the exact machine contract is needed, load `contracts/create-changeset.schema.json` or run `eden changeset schema --json`.
3. Do not inspect `changesets.service.ts`, controller code, tests, or temp files to infer the format.

Skills should explicitly say this.

---

## Contract Model

The contract should distinguish between two layers that live together but are not the same:

### A. Structural Contract

What fields are valid:

- top-level fields: `title`, `reasoning`, `source`, `source_id`, `actor`, `items[]`
- item discriminators: `entity_type`, `operation`
- required `after_state` presence for `create` and `update` operations
- parent references: `activity_display_id` for `step/create`, `step_display_id` for `task/create`
- supported entity/operation matrix:
  - `activity/create`
  - `persona/create`
  - `question/create`, `question/update`
  - `step/create`
  - `task/create`, `task/update`, `task/delete`
- accepted data shapes for acceptance criteria (string, array of strings, or array of `{given, when, then}` objects)

This is what JSON Schema and OpenAPI should express.

### B. Normalization Semantics

What the server will repair or canonicalize:

- field aliases such as `step_ref -> step_display_id`, `name -> title` (tasks), `name -> title` (activities/steps as `title -> name` alias), `description -> user_story` (tasks), `position -> sort_order`, `activity_ref -> activity_display_id`
- display-reference canonicalization such as `act-1 -> ACT-1`, `task-1.2.3 -> TSK-1.2.3`
- defaulted task fields such as `device` (`all`), `status` (`draft`), `lifecycle` (`current`), `priority` (`medium`)
- defaulted question fields such as `priority` (`medium`), `category` (`requirements`)
- acceptance criteria normalization (string/array-of-string → `{given, when, then}` object form)
- persona code derivation from name when code is missing
- warning generation when defaults or aliases are applied

This should remain procedural code, but it should live in the same contract module as the structural definitions so the contract stays coherent.

JSON Schema is the structural view. The contract module is the full source of truth.

---

## Workstreams

### WS1: Create the Canonical Contract Module

**Intent:** Move create-changeset rules into a single dedicated home.

#### Changes

- Add `apps/api/src/contracts/create-changeset.contract.ts`
- Move or re-express current rules from `create-changeset-input.util.ts` into this module
- Export:
  - payload type definitions
  - structural schema definitions
  - allowed entity/operation matrix
  - normalization helpers (including acceptance-criteria and device normalization from `common/acceptance-criteria.util.ts`)
  - examples

#### Notes

- Prefer a schema-first runtime representation that can emit JSON Schema cleanly.
- The implementation can use a schema library or a typed JSON-schema constant, but the output must be deterministic and generation-friendly.
- Subsume the acceptance-criteria and device normalization logic currently in `apps/api/src/common/acceptance-criteria.util.ts`, or re-export it from the contract module so callers have one import path.
- Do not make the skill markdown the source of truth.

### WS2: Refactor API Create Path to Use the Contract

**Intent:** Make the runtime validator and normalizer depend on the canonical module.

#### Changes

- Update `apps/api/src/changesets/create-changeset-input.util.ts`
- Reduce duplicated rule tables inside that file
- Keep existing warning and error behavior, but derive it from contract metadata where practical
- Ensure `changesets.service.ts` uses the refactored path unchanged from the caller perspective

#### Acceptance

- Existing validation behavior still works
- Existing canonicalization behavior still works
- The contract module is now the obvious place to edit the schema

### WS3: Generate JSON Schema Artifact

**Intent:** Produce a direct machine-readable schema file that agents and tools can load.

#### Changes

- Add a generator script, for example:
  - `scripts/generate-changeset-contract.ts`
- Emit:
  - `contracts/create-changeset.schema.json`
- Add a generated-file header or metadata field indicating:
  - source module path
  - generation timestamp or version
  - "DO NOT EDIT"

#### Why this matters

This gives agents a single small file to read instead of reverse-engineering implementation code.

### WS4: Generate Agent Reference File

**Intent:** Keep the ergonomic skill-local reference without making it a handwritten source of truth.

#### Changes

- Generate a concise markdown reference, for example:
  - `.agents/skills/_references/create-changeset.md`
- Include:
  - top-level payload shape
  - supported item types
  - required parent refs
  - accepted acceptance-criteria forms
  - canonical display-reference patterns
  - one canonical example
  - explicit anti-patterns

#### Rules

- Mark the file generated
- Skills may point to it, but must not duplicate the contract inline beyond a minimal example

### WS5: Add CLI Schema Access

**Intent:** Give agents a sanctioned command for the exact contract.

#### Changes

- Add `eden changeset schema --json`
- Optionally add `eden changeset schema --format markdown`
- In repo mode, read `contracts/create-changeset.schema.json`
- In deployed mode, fetch a dedicated endpoint or schema URL

#### Why this matters

The CLI becomes the narrow path:

- cheaper than code exploration
- less error-prone than parsing OpenAPI
- aligned with Eden's CLI-first policy

### WS6: Publish Real OpenAPI and Wire the Manifest

**Intent:** Make the existing `x-eve.api_spec` declaration concrete.

#### Changes

- Add OpenAPI generation to the Nest app or build pipeline
- Publish `/openapi.json`
- Ensure the changeset create request body references the generated contract schema
- Update `.eve/manifest.yaml`:

```yaml
x-eve:
  api_spec:
    type: openapi
    spec_url: /openapi.json
```

#### Important

OpenAPI should be generated from the same contract source, not separately authored.

### WS7: Update Skills and Wizard Prompts

**Intent:** Force agents onto the narrow path and away from code exploration.

#### Changes

Update all changeset-writing skills:

- `skills/map-chat/SKILL.md`
- `skills/synthesis/SKILL.md`
- `skills/question/SKILL.md`
- `skills/map-generator/SKILL.md`
- any wizard/generator prompt text in `apps/api/src/wizard/wizard.service.ts`

#### New rules

- "If you need the payload shape, read `skills/_references/create-changeset.md`"
- "If you need the machine contract, run `eden changeset schema --json`"
- "Do not inspect controllers, services, tests, or old temp files to infer the schema"
- "Do not read or reuse `/tmp/changeset.json` from earlier jobs"

#### Content tightening

- Make the acceptance-criteria requirement explicit and repeated in wizard/generator instructions
- Deduplicate the `map-generator` pre-submit checklist — it already has one; the generated reference should be the single source
- Add a pre-submit checklist that includes:
  - each task has 2-4 Given/When/Then acceptance criteria
  - each `task/create` has a parent step reference via `step_display_id`
  - each `step/create` has a parent activity reference via `activity_display_id`
  - display references use canonical format (`ACT-N`, `STP-N.N`, `TSK-N.N.N`, `Q-N`, `PER-CODE`)

### WS8: Add Drift Checks and Verification

**Intent:** Make stale contract artifacts fail during development and CI.

#### Changes

- Add `pnpm generate:contracts`
- Add CI step that runs generation and fails on diff
- Add tests that compare example payloads against:
  - the generated JSON Schema
  - the API create path
- Add one test that ensures the generated skill reference and CLI output mention the same canonical example IDs and field names

#### Optional hardening

- Add a lint rule or grep-based CI check preventing handwritten schema blocks from drifting across skills
- Add a generated-files manifest if more contract artifacts are added later

---

## Recommended File Layout

```text
apps/api/src/contracts/
  create-changeset.contract.ts

apps/api/src/changesets/
  create-changeset-input.util.ts

contracts/
  create-changeset.schema.json

skills/_references/
  create-changeset.md

scripts/
  generate-changeset-contract.ts
```

If Eden later exposes more agent-authored payloads, reuse this pattern under `contracts/` and `skills/_references/`.

---

## Implementation Order

1. WS1: canonical contract module
2. WS2: API refactor to consume contract
3. WS3: generated JSON Schema artifact
4. WS4: generated agent reference file
5. WS7: skill and wizard updates to use the generated artifacts
6. WS5: CLI `changeset schema` command
7. WS6: publish OpenAPI and wire `spec_url`
8. WS8: CI drift checks and verification

This order gives immediate agent value before the broader OpenAPI work lands.

---

## Verification

### Unit-Level

- Contract generation emits deterministic JSON Schema.
- Known valid payloads pass both the schema validator and the API create path.
- Known invalid payloads fail with the expected field paths.
- Known alias/default cases still produce the same warnings as before.

### CLI-Level

- `eden changeset schema --json` prints the generated schema.
- CLI output matches the checked-in artifact exactly in repo mode.

### Skill-Level

- Skills reference the generated file or CLI command, not implementation files.
- No changeset-writing skill contains a long handwritten schema block that can drift independently.

### OpenAPI-Level

- `/openapi.json` exists in local/dev and deployed environments.
- The manifest points to the published spec URL.
- The changeset create request body in OpenAPI uses the generated schema shape.

### Sandbox Regression

1. Run the wizard or synthesis flow on a fresh project.
2. Confirm the agent does not explore controller/service/test files for schema discovery.
3. Confirm the first changeset create attempt uses the sanctioned path.
4. Confirm tasks contain populated acceptance criteria rather than defaulted empty arrays.
5. Confirm changeset creation succeeds and warnings are only emitted when genuinely expected.

---

## Risks & Mitigations

### Risk: OpenAPI becomes another drifting artifact

**Mitigation:** Generate it from the same contract source and fail CI on diff.

### Risk: JSON Schema cannot represent all normalization behavior

**Mitigation:** Treat the contract module, not the JSON Schema file, as the true source of truth. JSON Schema is the structural projection.

### Risk: Skills keep copying old examples inline

**Mitigation:** Replace long schema examples in skills with a short pointer to the generated reference and CLI command. Add CI checks for duplicate schema blocks if needed.

### Risk: CLI schema command and local file diverge

**Mitigation:** In repo mode, have the CLI read the generated artifact directly. Test for exact equality.

### Risk: OpenAPI is too large for practical agent use

**Mitigation:** Keep OpenAPI for platform/tooling value, but make `contracts/create-changeset.schema.json` and `eden changeset schema --json` the preferred agent path.

---

## Decision Summary

Do not add a handwritten schema reference file under skills as the source of truth.

Instead:

- create one canonical contract module in app code
- generate JSON Schema, OpenAPI, and the skill reference from it
- expose the schema through the Eden CLI
- update skills and prompts to use only that narrow path
- enforce freshness in CI

That gives agents an easy contract to load without turning the skills directory into another drifting documentation fork.
