# Expert Panel Review UX

> **Status**: Proposed
> **Date**: 2026-04-10
> **Author**: Adam / Codex
> **Scope**: Define the user-facing role of the expert panel in Eden, when reviews should run, and how review results should appear in the product.
> **Related**:
> - `docs/plans/phase-3-intelligence.md`
> - `docs/plans/manual-test-scenarios.md`
> - `docs/plans/dashboard-app.md`

## Problem

The expert panel exists as a core capability, but its place in the user
journey is still easy to misread.

If the panel is treated as:

- a hidden background behavior, users will not understand when or why it ran
- the default response to every interaction, it will feel slow and heavy
- just another chat answer, its output will not feel durable or actionable

Eden needs a clearer product contract: what the expert panel is for, when it
should run, and how its output becomes visible and useful to the user.

## Decision Summary

The expert panel should be framed as a deliberate **requirements review**
stage.

- It is not the default path for simple chat interactions
- It is not a hidden internal mechanic that runs without visible trace
- It is the product's structured way to challenge, de-risk, and strengthen a
  body of requirements before the team commits to building

From the user perspective:

- **Chat** is how they ask for a review
- **Reviews** is where the durable review artifact lives
- **Changes** is where proposed map edits from the review are approved
- **Q&A** is where unresolved issues and follow-up questions accumulate

## Product Role

The expert panel answers a different question from map chat or ingestion.

- **Ingestion** asks: "What requirements can we extract from this material?"
- **Map chat** asks: "What should I add or change in the story map?"
- **Expert panel** asks: "Is this body of requirements complete, coherent,
  feasible, testable, and ready enough to proceed?"

This matters because the panel is not just another authoring tool. It is a
review and challenge function.

## User Mental Model

The intended mental model is:

1. Capture and structure information
2. Build or refine the map
3. Run an expert review when the material is substantial enough
4. Read the synthesis and expert opinions
5. Decide what to change
6. Review and accept the resulting changeset
7. Continue with questions, revisions, or handoff

The panel therefore sits between "we have something meaningful" and "we are
ready to act on it."

## When Review Should Happen

The panel should run at moments of meaningful evaluation, not as a reflex.

### Good Trigger Points

- After initial seeding plus a first usable story map
- After a major PRD, proposal, or set of source documents has been ingested
- After a substantial map revision that changes scope or direction
- Before MVP scope freeze
- Before engineering handoff or release planning
- When a PM explicitly asks "What are we missing?", "What are the risks?",
  or "Are we ready to build?"

### Poor Trigger Points

- Simple fact lookup in chat
- Small map edits like renaming or adding one step
- Tiny clarifications that do not materially change the requirements picture
- Very early project setup where there is not yet enough substance to review
- Every document upload by default, regardless of size or significance

## Triggering Model

The primary model should be **explicit invocation**.

Users should deliberately ask for an expert review via chat or a dedicated UI
action such as `Run Expert Review`.

Automatic triggering can still exist, but only as a secondary convenience
layer with strict thresholds. A reasonable product rule would be:

- large or substantial source material may auto-suggest review
- users can always explicitly request a full review
- small or lightweight inputs stay on the solo coordinator path

This keeps the system legible. Users should feel that a review happened
because the product recognized a meaningful review moment, not because the
system behaved unpredictably.

## End-to-End User Flow

### 1. User initiates review

The user starts from the map or source context and asks for a review.

Examples:

- "Please do a full expert panel review of this requirements summary"
- "What are we missing before MVP?"
- "Review this map for feasibility, UX risk, and testing gaps"

### 2. Coordinator triages

The coordinator decides whether the request needs the full panel or can be
handled directly.

- Simple request: respond inline, no panel
- Substantial review request: prepare the review brief and dispatch the panel

### 3. Review becomes visibly in progress

If the full panel is invoked, the user should see a visible state change:

- chat message or status banner: `Expert review in progress`
- review artifact created with status `in_progress`
- optional progress language such as `7 experts reviewing in parallel`

The user should never have to infer that a review is happening from silence.

### 4. Panel completes

When complete, the user receives:

- an executive synthesis in the chat thread
- a persistent review record in **Reviews**
- individual expert opinions grouped by domain

### 5. Review drives action

If the panel identifies concrete map updates, the coordinator may create a
changeset.

That changeset is a separate artifact from the review:

- **Review** = judgment, synthesis, critique, recommendations
- **Changeset** = proposed structural edits to the map

The user reads the review, then decides whether to approve the proposed
changes.

### 6. Follow-up loop

A completed review may lead to:

- accepted changes in the map
- new cross-cutting questions
- another iteration of source capture or clarification
- a decision that the project is ready for build handoff

## How The Review Should Be Visible

For the panel to feel real to end users, it must appear as a first-class
product object, not just as background agent behavior.

### Visible Artifacts

- A named **Reviews** area in navigation
- A review card with title, status, date, and expert count
- Expandable synthesis content
- Individual expert opinions with clear domain labels
- Links from the review to any resulting changeset or questions

### Visible Entry Points

- Chat request
- Dedicated `Run Expert Review` action from the map
- Potentially a similar action from a source detail view after ingestion

### Visible Status

- `pending`
- `in_progress`
- `complete`

### Visible Outcomes

- Executive synthesis
- Domain-specific opinions
- Recommended actions
- Optional changeset to review
- Follow-up questions if gaps or conflicts remain

## Current Product State

Today, the product already has the beginnings of this model:

- chat is the main way to trigger review
- the app has a dedicated **Reviews** page
- the reviews UI shows synthesis, status, expert count, and expert opinions
- chat can link users into the changeset review flow

However, the UX contract is still incomplete.

### Current Strengths

- The review result is durable, not ephemeral
- The review has its own navigation surface
- The changeset review flow is already distinct from the review itself

### Current Gaps

- There is no first-class `Run Expert Review` action in the map UI
- Review progress is not yet prominent enough while the panel is running
- Chat surfaces changesets more directly than reviews
- The product does not yet strongly explain when a user should use review
  versus simple chat or ingestion

## Recommended UX Additions

### 1. Add a First-Class Review Trigger

Add `Run Expert Review` to the main map toolbar or adjacent controls.

This should open chat prefilled with a review-oriented prompt or directly
launch the review flow with current project context.

### 2. Show Review Progress In-Context

When a panel review starts:

- show a non-blocking progress state in chat
- create the review card immediately with `in_progress`
- optionally show a small badge or notification in the Reviews nav item

### 3. Link Review, Changeset, and Questions

A completed review should link clearly to:

- any proposed changeset
- any created cross-cutting questions
- relevant map entities if the review is tied to specific areas

### 4. Distinguish Review From Editing

The UI should make it obvious that:

- asking for review is evaluative
- accepting a changeset is a separate approval act
- reading a review does not itself change the map

### 5. Make Review History Useful

Reviews should act as an audit trail of requirements quality decisions, not
just a dump of AI output.

Each review should help answer:

- what was reviewed
- when it was reviewed
- who or what triggered it
- what the major findings were
- what changed as a result

## Recommended Information Architecture

The user-facing structure should be:

- **Map**: the current structured requirements state
- **Sources**: the upstream material that informs the map
- **Reviews**: expert evaluation of that state
- **Changes**: proposed edits derived from AI workflows, including reviews
- **Q&A**: unresolved questions and assumptions

This keeps the panel understandable: it is a review layer over the map and
sources, not a competing workspace.

## Success Criteria

This UX is successful when:

- users can predict when the panel will run
- users can deliberately invoke the panel without knowing special chat syntax
- users can see that a review is in progress
- users can find completed reviews later without opening old chat threads
- users can distinguish between review output and map changes
- users can trace a path from review findings to accepted changes or open
  questions

## Open Product Decisions

The following still need explicit product choices:

1. Should the panel only run on explicit request, or also auto-run on
   sufficiently large documents?
2. Who can invoke a review: owner only, editor and owner, or any project
   member?
3. Should users be able to request a full panel or a narrower domain review
   such as only technical + QA?
4. Should review artifacts always create changesets when actions are obvious,
   or only when the user asks for recommended edits?
5. Should a major accepted changeset automatically prompt a fresh review?

## Recommended Default Position

If the team wants a simple default:

- explicit review request is primary
- auto-review is limited to large or clearly substantial inputs
- review results always create a durable review artifact
- review may create a changeset, but never silently mutate the map

That gives Eden a clean, defensible UX:

**capture first, review at the right moments, then approve changes with human
control.**
