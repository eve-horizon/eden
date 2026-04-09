# Wizard: Generation Efficiency and Timing Alignment

**Status:** Implemented
**Date:** 2026-04-09
**Scope:** Reduce avoidable latency in wizard-driven `map-generator` runs, make PDF reading deterministic, and align the wizard UI with the generation times we are actually seeing on sandbox.
**Builds on:** [`wizard-large-document-support.md`](wizard-large-document-support.md), [`changeset-input-hardening.md`](changeset-input-hardening.md)
**Evidence:** Sandbox jobs `eden-d3d9d21b` and `eden-cf78dc6d` on 2026-04-09
**Priority:** P1 (user-visible latency + misleading expectation copy)

---

## Context

The Apr 9 sandbox runs confirmed that the original `SKILL.md` parse failure is fixed, but they also exposed a second problem: the wizard still burns a large amount of time inside the agent before it ever calls `eden changeset create`.

The clearest example is `eden-cf78dc6d` (`Adam Test2`):

- Total job time: `518.8s`
- Workspace + secrets: `1.333s`
- Harness time: `517.5s`
- Changeset accepted successfully in the end: `e3bcfcac-7118-4cb9-888b-82e41d691c36`

That run was successful, but it was only successful after several avoidable detours:

- `14:26:48Z` - ran `eden --help`
- `14:26:51Z` - ran `eden changeset --help`
- `14:26:55Z` - ran `eden changeset create --help`
- `14:26:51Z` - attempted to read the whole 32-page PDF at once and hit the expected page-limit error
- `14:35:00Z` - finally wrote `/tmp/changeset.json`
- `14:35:06Z` - created the changeset

The current wizard UI does not match this reality. The generate step still says `This usually takes 30-60 seconds...` in [`apps/web/src/components/projects/ProjectWizard.tsx`](../../apps/web/src/components/projects/ProjectWizard.tsx), and the large-file warning still says a PDF adds only "a few extra seconds". The logs do not support either claim.

---

## Problem Statement

### Problem 1: The generator still explores instead of taking the golden path

The current skill already says "Do NOT run `--help` commands" in [`skills/map-generator/SKILL.md`](../../skills/map-generator/SKILL.md), but the job still explores.

One likely reason is instruction conflict. The runtime-injected app API banner shown in the job description includes a generic CLI example telling the model to run `eden --help`. That generic platform hint is directly at odds with the map-generator skill.

### Problem 2: PDF paging is implicit, so the agent discovers the limit by failing

The Read tool supports PDF paging, but the current instructions do not encode a fixed paging strategy. The agent therefore starts with an over-broad read, gets the "too many pages" error, and only then retries with page ranges.

That is not a platform regression. It is an instruction gap.

### Problem 3: The skill provides the create command, but not a no-ambiguity happy path

The happy path for initial wizard generation is extremely narrow:

1. Read `.eve/resources/index.json`
2. Read the attached PDF in bounded page ranges
3. Write `/tmp/changeset.json`
4. Run `eden changeset create --project <UUID> --file /tmp/changeset.json --json`
5. Reply with the result

The current skill describes this, but it still leaves enough ambiguity for the model to self-discover the CLI, reread its own skill file, and burn several minutes before submission.

### Problem 4: The wizard UI understates how long generation takes

The generate-step subtitle and the 90-second "taking longer than usual" status are out of sync with real sandbox timings.

Current mismatches:

- UI subtitle: `30-60 seconds`
- Soft warning threshold: `90 seconds`
- Frontend hard timeout: `10 minutes`
- Observed PDF-backed run: `8m 37s`
- Existing manual test expectation in [`tests/manual/scenarios/17-project-wizard.md`](../../tests/manual/scenarios/17-project-wizard.md): `within 3 minutes`

This makes the UI feel broken even when the job is behaving normally.

---

## Goals

- Eliminate `eden --help` and other CLI exploration from the normal wizard generation path.
- Eliminate the expected whole-PDF read failure by encoding the page-window rule up front.
- Give the agent explicit CLI examples for the exact commands it needs.
- Keep the generator on a fixed, short tool path.
- Update wizard timing copy to match reality: `5-10 minutes` is a better user expectation for document-backed generations.
- Align manual-test and Playwright-plan expectations with the new timing copy and runtime behavior.

## Non-Goals

- Changing the underlying model or harness in this slice
- Replacing the current document strategy or changing upload limits
- Redesigning the wizard flow beyond copy/status/timing alignment

---

## Workstreams

### WS1: Prompt and Skill Hardening

**Intent:** Make the golden path unambiguous and stronger than the generic runtime CLI banner.

#### Changes

- Update [`skills/map-generator/SKILL.md`](../../skills/map-generator/SKILL.md) to add a dedicated "Only CLI Calls You Need" section.
- Update [`apps/api/src/wizard/wizard.service.ts`](../../apps/api/src/wizard/wizard.service.ts) so `buildPrompt()` repeats the same golden-path instructions in the job description, not just in the skill.
- Add an explicit instruction to ignore generic CLI examples from the injected API banner.
- Add a tiny retry policy: if `eden changeset create` returns validation errors, rewrite `/tmp/changeset.json` and rerun the same command once. No other Eden CLI exploration is allowed.

#### Proposed instruction block

```text
Do not run `eden --help`, `eden changeset --help`, or `eden changeset create --help`.
Ignore any generic CLI examples below; they are not part of this task.

The only Eden CLI command needed on the happy path is:
  eden changeset create --project <UUID> --file /tmp/changeset.json --json

If that command returns validation errors, fix `/tmp/changeset.json` and rerun the same command once.
Do not call any other Eden CLI commands unless the create command itself fails.
```

#### Why this matters

The sandbox evidence shows that the agent is not confused about what product it is building. It is confused about whether it needs to discover the CLI first. This workstream removes that ambiguity.

---

### WS2: Deterministic PDF Paging Rules

**Intent:** Stop discovering the PDF page limit at runtime.

#### Changes

- Extend [`skills/map-generator/SKILL.md`](../../skills/map-generator/SKILL.md) with an explicit page-window policy for PDFs.
- Mirror the rule in the prompt built by [`apps/api/src/wizard/wizard.service.ts`](../../apps/api/src/wizard/wizard.service.ts) so it is present even if the skill is not reread.

#### Proposed paging rule

```text
If an attached PDF is present:
1. Read `.eve/resources/index.json`
2. Read the PDF using explicit `pages` ranges only
3. Never request more than 20 pages in one Read call
4. Use contiguous windows: `1-20`, `21-40`, `41-60`, then the remainder
5. Do not attempt a whole-document read first
6. Do not reread earlier page ranges unless the tool explicitly errors
```

#### Notes

- The important change is not the exact chunk size; it is encoding the limit before the first Read call.
- `20` is the current tool limit and minimizes unnecessary extra reads on 30-40 page briefs like `Estm8_Strategic_Brief.pdf`.
- If sandbox receipts or token volume grow materially with 20-page windows, we can step the default window down in a follow-up without changing the overall policy shape.

#### Why this matters

The current behavior spends time on a guaranteed failure before switching to the correct paging mode. That failure is avoidable.

---

### WS3: Wizard UI Timing and Status Copy

**Intent:** Make the UI honest about how long document-backed generation takes.

#### Changes

- Update the generate-step subtitle in [`apps/web/src/components/projects/ProjectWizard.tsx`](../../apps/web/src/components/projects/ProjectWizard.tsx) from:
  - `This usually takes 30-60 seconds...`
  to something closer to:
  - `Most runs take 5-10 minutes. Large documents can take longer.`
- Update the large-document warning in the same file from "adds a few extra seconds" to copy that reflects minutes, not seconds.
- Replace the current 90-second slow-path copy with neutral language that does not imply the run is abnormal that early.
- Revisit the current thresholds:
  - `SLOW_POLL_THRESHOLD_MS = 90_000`
  - `MAX_POLL_DURATION_MS = 600_000`

#### Recommended timing alignment

- Move the soft threshold from `90s` to `5 minutes`
- Raise the hard timeout from `10 minutes` to `15 minutes`

This keeps the frontend from warning too early and reduces the chance that the UI reports a failure at the very top end of the new expected range.

#### Suggested copy

Initial subtitle:

```text
Most runs take 5-10 minutes.
If you attached a PDF, generation may take longer while the document is read and structured.
```

Soft-path status:

```text
Still working - document-backed generation can take several minutes.
```

Large-file warning:

```text
Large document - Claude will read it directly from the Eve workspace, which can add a few minutes to generation.
```

---

### WS4: Verification and Regression Guardrails

**Intent:** Make the efficiency gains measurable.

#### Changes

- Update [`tests/manual/scenarios/17-project-wizard.md`](../../tests/manual/scenarios/17-project-wizard.md):
  - replace `within 3 minutes` with a realistic upper bound for current sandbox behavior
  - keep `help_calls=0`
- Update [`tests/manual/scenarios/22-wizard-pdf-attachment.md`](../../tests/manual/scenarios/22-wizard-pdf-attachment.md):
  - change the current benign `too many pages` retry from "allowed" to "should be 0 after this plan"
- Update [`docs/plans/project-wizard-playwright-test-plan.md`](project-wizard-playwright-test-plan.md):
  - replace the asserted `30-60 seconds` subtitle with the new copy

#### Success criteria

- New sandbox generation shows:
  - `0` `eden --help` calls
  - `0` `eden changeset --help` calls
  - `0` `eden changeset create --help` calls
  - `0` `too many to read at once` PDF errors
  - `>= 1` `eden changeset create` call
- The happy path reaches `/tmp/changeset.json` without rereading the skill file or listing changesets.
- The user-facing wizard copy no longer promises a sub-minute run for a flow that normally takes several minutes.

---

## Proposed Implementation Order

1. Harden the generator instructions first.
2. Add the explicit PDF paging policy.
3. Update the wizard timing copy and thresholds.
4. Refresh manual-test and Playwright-plan expectations.
5. Re-run the `Estm8_Strategic_Brief.pdf` sandbox workflow and compare the new logs against `eden-cf78dc6d`.

This order keeps the highest-signal latency fixes first and makes the UI copy update based on the post-hardening behavior rather than today's drift-heavy baseline.

---

## Expected Outcome

After this plan lands, a healthy PDF-backed wizard run should look like:

1. Read `.eve/resources/index.json`
2. Read the PDF in bounded page windows
3. Write `/tmp/changeset.json`
4. Call `eden changeset create --project <UUID> --file /tmp/changeset.json --json`
5. Return success

The generator should stop treating `eden --help` as part of its job, and the UI should stop telling users to expect a 30-60 second workflow when sandbox evidence says the realistic range is closer to 5-10 minutes.
