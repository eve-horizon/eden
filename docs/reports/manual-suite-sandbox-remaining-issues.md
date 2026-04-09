# Manual Suite Sandbox: Remaining Issues and Platform Leverage

**Date:** 2026-04-09  
**Scope:** Remaining issues after running `tests/manual/README.md` against Eden sandbox using the `eden` CLI and `dev-browser`, as of Git SHA `33d8ad0`.

## Executive Summary

The sandbox manual suite is in much better shape than the initial pass:

- Scenario 10 (chat-driven map editing) is clean.
- Scenario 12 (alignment after changeset accept) is clean.
- Scenario 11 (question evolution) now works functionally and creates draft changesets, but its triage step still emits one early log error.

What remains falls into three buckets:

1. **Platform-primary issues** where a platform/runtime change would directly reduce failures or dirty logs.
2. **Mixed issues** where the repo/app likely still needs changes, but platform changes would make failures easier to avoid or diagnose.
3. **Repo/app-only issues** where the right fix is in Eden or the CLI, not the platform.

This report excludes already-closed verification bugs (`eden-1ai5`, `eden-2iq4`, `eden-qw5f`, `eden-7vhe`) and excludes broader parity/backlog work (`eden-gtjy`, `eden-1p1u`, `eden-19tg`, `eden-tuco`, `eden-5bm`, `eden-gcox`) that are not current manual-suite blockers.

## Issue Assessment

| Issue | Scenario / Area | Current State | Would a Platform Change Help? | Why |
|---|---|---|---|---|
| `eden-3m6n` Sandbox Claude agent runs still omit project skills | Cross-cutting | Sandbox Claude jobs still initialize with generic built-in skills only; this likely explains why agents drift before they pick up repo-local guidance | **Yes, primary** | This is fundamentally a runtime skill-installation / skill-exposure problem. Repo prompt tuning helps only after the wrong runtime context is already in place |
| `eden-n255` Question-triage emits missing-file errors before classification | Scenario 11 | `question-triage` now returns the correct `needs_changes` result, but jobs `eden-bd0532bf.1` and `eden-1f6060e9.1` still emit `File does not exist` before settling down | **Yes, probably** | The repo-side prompt was tightened repeatedly and the error still appears. Reliable skill loading, or a stronger platform-provided workflow-input contract, would likely prevent the initial blind file probe |
| `eden-g7qs` Sandbox chat delivery fails with no active provider instance for `api:eden-web` | Scenario 09 | Coordinator can run, but outbound delivery to the Eden thread fails with `No active provider instance for api:eden-web` | **Yes, primary** | This looks like gateway/provider-instance lifecycle or routing state, not an Eden app bug |
| `eden-7ned` Ingestion confirm leaves source stuck in `processing` with no sandbox job attached | Scenario 08 | Confirming a source moves it to processing, but no usable workflow/job link appears and no ingestion result arrives | **Yes, secondarily** | Root cause may still be in Eden's trigger path, but platform changes around event delivery visibility, trigger diagnostics, and source/job correlation would help a lot |
| `eden-48g0` Extraction pipeline probes 404 endpoints and stalls | Scenario 08 | Extraction job `eden-410d3984.1` materializes the document but then wastes turns probing bad endpoints and does not complete promptly | **Yes, secondarily** | This is mostly a skill/workflow discipline problem, but platform-level step scoping and tighter API/tool exposure would reduce the chance of exploratory thrash |
| `eden-r1bk` Releases UI omits assigned tasks | Scenario 07 | API/CLI show release-linked tasks, but the Releases page shows `0` tasks | **No** | This is an Eden web/API mapping bug |
| `eden-mgwh` Invalid changeset payload returns `500` instead of structured `400` | Scenario 04 | Malformed changeset create still returns a generic internal error instead of `invalid_changeset` | **No** | This is Eden API validation/error-shaping work |
| `eden-w4di` CLI crashes on empty success bodies | Scenario 03 | CLI still assumes every successful response has JSON and can throw on empty bodies | **No** | This is a client robustness issue in the Eden CLI |
| `eden-6ihh` Remaining CLI command-surface gaps for full manual-suite coverage | Suite-wide | Many gaps were closed during this verification run, but the bead remains open as a mop-up task | **No** | This is repo-side CLI product work, not a platform concern |

## Detailed Notes

### `eden-3m6n` — Sandbox runtime still does not reliably expose project skills

This is the most important remaining platform-shaped issue.

Evidence:

- The runtime init logs for recent sandbox jobs still show only generic built-in skills in the Claude session bootstrap.
- This behavior originally surfaced in map-chat, but the same pattern still appears in later sandbox agent jobs.

Why platform change helps:

- The repo already includes the local skills pack and sandbox was repeatedly synced after those changes.
- If the runtime does not mount or expose project skills consistently, repo-local agent guidance becomes unreliable by definition.

Best platform fix:

- Make project skillpack installation deterministic for sandbox jobs.
- If skill installation fails, fail the job loudly rather than silently falling back to built-ins.
- Surface loaded project skills explicitly in job metadata so this is easy to verify.

### `eden-n255` — Question-triage is functionally correct but still dirties logs

Current behavior:

- `question-triage` now classifies correctly and unblocks `question-agent`.
- Example: job `eden-1f6060e9.1` returned `needs_changes` for `Q-10`, and `eden-1f6060e9.2` successfully created draft changeset `e867891e-dc6a-4d71-b7c5-d7bc2565e1d2`.
- But the triage log still contains an early `File does not exist` error before it reads the repo workflow/skill context.

Why platform change helps:

- The repo prompt was tightened to say: use `eden question show`, do not read repo files, do not use Python, do not inspect the map.
- Despite that, the first move is still an invalid file read.
- That suggests the agent is starting from weak or delayed repo-local context.

Best platform fix:

- Deliver workflow payload to the agent in a strongly-typed way so it does not need to infer or grope for files.
- Ensure project skills are available from turn 0.
- Consider a platform option to pin an agent to an explicit “CLI-only / no repo read” policy for simple classification steps.

### `eden-g7qs` — Chat delivery failure is platform-native

Current behavior:

- Scenario 09 created outbound messages whose delivery status was `failed`.
- Failure text: `No active provider instance for api:eden-web`.

Why platform change helps:

- Eden is not choosing the provider instance here; the gateway/provider layer is.
- The problem is not that the agent response is bad. The response cannot be delivered to the thread target.

Best platform fix:

- Make provider-instance registration more reliable for sandbox.
- Add a direct diagnostic command or clearer job/thread status surface for provider resolution failures.

### `eden-7ned` and `eden-48g0` — Ingestion pipeline still needs both repo work and better platform visibility

Two distinct problems remain in Scenario 08:

1. `eden-7ned`: source confirmation can leave the source in `processing` without a visible attached sandbox job.
2. `eden-48g0`: when extraction does run, the extraction agent can still waste time probing irrelevant endpoints and stall.

Why platform change helps:

- Better event/trigger observability would make `eden-7ned` much easier to isolate.
- Better step-level tool/API scoping would reduce the chance that extraction agents wander off-path.

Why platform change is not sufficient:

- Eden still needs repo/app-side work on the trigger path and extraction discipline.

Best platform fixes:

- First-class event-to-job correlation in workflow diagnostics.
- Step-level `with_apis` or tighter runtime scoping so simple extraction steps do not see more tooling than they need.

### `eden-r1bk`, `eden-mgwh`, `eden-w4di`, `eden-6ihh` — These are repo/app issues

These issues do not need platform changes:

- `eden-r1bk`: Releases page is rendering the wrong task count despite correct underlying data.
- `eden-mgwh`: Changeset validation should return a structured client error, not a generic server error.
- `eden-w4di`: The CLI needs to tolerate empty success bodies.
- `eden-6ihh`: Remaining CLI feature coverage is ordinary product/implementation work.

Platform improvements might make debugging nicer, but they would not meaningfully change the root cause or the right place to fix the issue.

## Recommended Platform Work

If platform time is available, these changes would have the highest leverage on the remaining sandbox verification issues:

1. **Deterministic project skill loading in sandbox agent runtime**
   - Directly addresses `eden-3m6n`
   - Likely reduces or eliminates `eden-n255`
   - Would make repo-local agent behavior testable and predictable

2. **Structured workflow-input delivery to agents**
   - Give each step a strongly-typed payload or mounted input file with a stable path
   - Reduces “search for the question/workflow file” behavior in simple agents like `question-triage`

3. **Better workflow/event observability**
   - Directly helps `eden-7ned`
   - Should show: event emitted, trigger matched, workflow job created, record/job linkage updated

4. **Gateway/provider diagnostics for chat delivery**
   - Directly helps `eden-g7qs`
   - Should expose why a provider instance is missing and how to recover it

5. **Optional step-level tool/API narrowing**
   - Would help `eden-48g0`
   - Lets simple steps avoid irrelevant APIs and reduces exploratory agent behavior

## Bottom Line

The remaining manual-suite issues are no longer dominated by bad Eden CLI shapes; that class of problem is largely fixed. The main remaining platform-shaped gap is **sandbox agent runtime behavior**, especially **skill loading** and **early-step workflow context**. Everything else is either:

- a mixed problem where platform observability/scoping would help but Eden still needs code changes, or
- a straightforward repo/app bug that should be fixed in Eden or the CLI.
