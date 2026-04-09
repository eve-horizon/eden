# Changeset Shape Canonicalization

**Status:** Plan
**Date:** 2026-04-09
**Scope:** Eliminate the dual-format gap between what agents emit and what the apply path resolves
**Supersedes:** None (complements `changeset-input-hardening.md` which covers envelope validation)

---

## Context

On 2026-04-08, sandbox wizard job `eden-530d0eeb` generated a story map that was saved as a draft changeset but failed on accept. The job log shows the agent emitting legacy shapes:

```json
{
  "entity_type": "activity",
  "operation": "create",
  "display_reference": "act-1",
  "after_state": { "title": "Account Setup", "position": 1 }
}
```

The canonical format prescribed by `skills/map-generator/SKILL.md` is:

```json
{
  "entity_type": "activity",
  "operation": "create",
  "display_reference": "ACT-1",
  "after_state": { "name": "Account Setup", "display_id": "ACT-1", "sort_order": 1 }
}
```

Two mismatched contracts are in play:

1. **Generator vs. skill spec.** The live runtime follows an older prompt path. It emits lowercase refs (`act-1`, `step-1-1`), wrong field names (`title` instead of `name`, `position` instead of `sort_order`), and missing `display_id` in `after_state`.

2. **API create vs. API apply.** The create path (`create-changeset-input.util.ts`) is permissive enough to store these items as a draft. The apply path (`changesets.service.ts`) does case-sensitive `display_id` lookups and strict field reads — so `"act-1"` never resolves and `"position"` is silently ignored (defaults to 0).

The result: changesets that save fine but fail on accept, which is the worst failure mode. The user sees a changeset, tries to accept it, and gets cryptic resolution errors.

---

## 5 Whys

1. Changeset accept failed because `display_id "act-1" not found in project`.
2. `act-1` wasn't found because the apply path does case-sensitive exact match against `ACT-1`.
3. The display_id was `act-1` because the generator emitted a legacy reference format.
4. The generator emitted legacy format because its runtime loaded an older skill/prompt path.
5. The API accepted the legacy format on create because normalization doesn't canonicalize display references or field names.

Root cause: **there is no single enforcement point** for the canonical shape. The skill prescribes it, but neither the API create path nor the apply path normalizes deviations — they just fail late with different symptoms.

---

## Design Principle

**One canonical format. One enforcement point. Zero late failures.**

The API normalization layer (`create-changeset-input.util.ts`) is the single enforcement point. It must canonicalize every item to the format the apply path expects, regardless of what the agent emits. The skill is the guide; the API is the law.

If an item can be unambiguously translated to canonical form, translate it. If it cannot, reject it at create time with a 400 — never let it reach the apply path.

---

## The Canonical Format

### Display References

| Entity   | Format        | Example     | Case  |
|----------|---------------|-------------|-------|
| Persona  | `PER-{CODE}`  | `PER-PM`    | Upper |
| Activity | `ACT-{n}`     | `ACT-1`     | Upper |
| Step     | `STP-{a}.{s}` | `STP-1.2`   | Upper |
| Task     | `TSK-{a}.{s}.{t}` | `TSK-1.2.3` | Upper |
| Question | `Q-{n}`       | `Q-1`       | Upper |

### Field Names per Entity (after_state)

| Entity   | Canonical Fields |
|----------|-----------------|
| Activity | `name`, `display_id`, `sort_order` |
| Step     | `name`, `display_id`, `sort_order`, `activity_display_id` |
| Task     | `title`, `display_id`, `step_display_id`, `persona_code`, `user_story`, `acceptance_criteria`, `device`, `priority`, `status` |
| Persona  | `name`, `code`, `color` |
| Question | `question`, `display_id`, `priority`, `category`, `status` |

### Parent References

| Entity | Canonical parent field | Accepted aliases (normalized away) |
|--------|----------------------|-------------------------------------|
| Step   | `activity_display_id` | `activity_ref`, `activity_id` (UUID passthrough) |
| Task   | `step_display_id`     | `step_ref` |

---

## Workstreams

### WS1: Display Reference Canonicalization

**Where:** `create-changeset-input.util.ts`, in `normalizeAfterState()` or a new `canonicalizeItem()` pass.

**Transforms:**

| Input pattern | Canonical output | Notes |
|---------------|-----------------|-------|
| `act-1`, `Act-1`, `ACT-1` | `ACT-1` | Case-insensitive prefix match + uppercase |
| `step-1-1`, `stp-1.1`, `STP-1.1` | `STP-1.1` | Normalize separators: `-` between numbers → `.` |
| `task-1-1-1`, `tsk-1.1.1` | `TSK-1.1.1` | Same separator normalization |
| `per-pm`, `PER-pm` | `PER-PM` | Uppercase code portion |
| `q-1`, `Q-1` | `Q-1` | Uppercase prefix |

**Algorithm:**

```
canonicalizeDisplayRef(raw: string, entityType: string): string
  1. Trim whitespace
  2. Match known prefix patterns (case-insensitive):
     /^(act|activity)[-_]?(\d+)$/i         → ACT-{n}
     /^(stp|step)[-_]?(\d+)[-._](\d+)$/i   → STP-{a}.{s}
     /^(tsk|task)[-_]?(\d+)[-._](\d+)[-._](\d+)$/i → TSK-{a}.{s}.{t}
     /^(per|persona)[-_]?(.+)$/i            → PER-{CODE.toUpperCase()}
     /^q[-_]?(\d+)$/i                       → Q-{n}
  3. If no pattern matches, uppercase the entire string
  4. Apply to both item.display_reference AND after_state.display_id
```

**Emit warning** when normalization changes the value (so we can track how often agents deviate).

---

### WS2: Field Name Aliasing

**Where:** `create-changeset-input.util.ts`, within the entity-specific normalization blocks.

**Transforms:**

| Entity   | Legacy field → Canonical field | Notes |
|----------|-------------------------------|-------|
| Activity | `title` → `name` | Only if `name` not already set |
| Activity | `position` → `sort_order` | Only if `sort_order` not already set |
| Step     | `title` → `name` | Only if `name` not already set |
| Step     | `position` → `sort_order` | Only if `sort_order` not already set |
| Step     | `activity_ref` → `activity_display_id` | Already partially handled; formalize |
| Task     | `name` → `title` | Only if `title` not already set |
| Task     | `step_ref` → `step_display_id` | Already partially handled; formalize |
| Task     | `description` → `user_story` | Only if `user_story` not already set |

**Delete legacy fields** after copying to canonical, so downstream code never sees them.

**Emit warning** for each alias applied.

---

### WS3: Parent Reference Canonicalization

**Where:** Same normalization pass in `create-changeset-input.util.ts`.

After field aliasing, canonicalize the values of parent reference fields:

1. `activity_display_id` — run through `canonicalizeDisplayRef(value, 'activity')`
2. `step_display_id` — run through `canonicalizeDisplayRef(value, 'step')`
3. `persona_code` — uppercase

This ensures that even if an agent writes `activity_display_id: "act-1"`, it becomes `"ACT-1"` before storage.

---

### WS4: Apply-Path Case-Insensitive Fallback (Safety Net)

**Where:** `changesets.service.ts`, `resolveEntityByDisplayRef()`.

Even with create-time canonicalization, add a case-insensitive fallback to the resolution query for defense in depth:

```sql
-- Primary: exact match (fast, indexed)
SELECT id FROM ${table} WHERE display_id = $1 AND project_id = $2

-- Fallback: case-insensitive (only if exact match returns 0 rows)
SELECT id FROM ${table} WHERE upper(display_id) = upper($1) AND project_id = $2 LIMIT 1
```

Log a warning when the fallback matches — it means normalization missed something or an older changeset predates the normalization layer.

This is a safety net, not the primary fix. The normalization layer is the primary fix.

---

### WS5: Skill Reinforcement

**Where:** `skills/map-generator/SKILL.md`

The skill already prescribes the canonical format. Reinforce with:

1. **Explicit anti-patterns section:**
   ```
   NEVER use: act-1, step-1-1, task-1-1-1, position, activity_ref
   ALWAYS use: ACT-1, STP-1.1, TSK-1.1.1, sort_order, activity_display_id
   ```

2. **Pre-submit validation checklist update:**
   - Every `display_reference` matches `/^(ACT|STP|TSK|PER|Q)-/`
   - Every `after_state.display_id` matches `display_reference`
   - Activities use `name` not `title`, `sort_order` not `position`
   - Steps include `activity_display_id` (not `activity_ref`)
   - Tasks include `step_display_id` (not `step_ref`)

3. **Remove any mention of legacy field names** from examples or commentary that could be interpreted as acceptable alternatives.

---

## Implementation Order

```
1. WS2: Field name aliasing          (lowest risk, highest immediate value)
2. WS1: Display reference canon.     (core fix)
3. WS3: Parent reference canon.      (depends on WS1)
4. WS5: Skill reinforcement          (prompt-side, parallel with 1-3)
5. WS4: Apply-path fallback          (safety net, last)
```

WS1-3 are all in `create-changeset-input.util.ts` and should ship as one commit. WS4 is in `changesets.service.ts` and is a separate, smaller change. WS5 is a skill edit.

---

## Verification

### Unit-Level (API tests)

| Test | Input | Expected Output |
|------|-------|-----------------|
| Legacy activity ref | `display_reference: "act-1"` | Normalized to `"ACT-1"`, warning emitted |
| Legacy step ref | `display_reference: "step-2-3"` | Normalized to `"STP-2.3"`, warning emitted |
| Legacy field `title` on activity | `after_state: { title: "X" }` | `after_state.name = "X"`, `title` removed |
| Legacy field `position` on step | `after_state: { position: 3 }` | `after_state.sort_order = 3`, `position` removed |
| Canonical format passthrough | `display_reference: "ACT-1"` | No change, no warning |
| Mixed case parent ref | `activity_display_id: "act-1"` | Canonicalized to `"ACT-1"` |
| Already-correct parent ref | `activity_display_id: "ACT-1"` | No change |

### Sandbox E2E

1. Create a fresh project via the wizard.
2. Wait for `map-generator` job to complete.
3. Inspect the draft changeset items via `eden changeset show`:
   - All `display_reference` values match `/^(ACT|STP|TSK|PER|Q)-/`
   - All activity items use `name` and `sort_order` in `after_state`
   - All step items include `activity_display_id` with uppercase `ACT-` prefix
   - All task items include `step_display_id` with uppercase `STP-` prefix
4. Accept the changeset via `eden changeset accept`.
5. Verify the map loads with correct structure:
   - `eden map show` returns activities, steps, and tasks with correct display IDs
   - No "not found" resolution errors in API logs
6. If any warnings were emitted during normalization, inspect them to confirm the generator is still emitting legacy shapes (indicates skill/runtime sync needed).

### Regression Guard

Add a changeset creation test fixture with intentionally legacy-shaped items. Assert:
- Changeset creates successfully (200)
- Warnings array is non-empty (normalization applied)
- Changeset accept succeeds (all references resolve)
- Created entities have canonical display IDs

---

## Risks & Mitigations

### Risk: Over-normalization corrupts intentional values

**Mitigation:** Only canonicalize fields that match known legacy patterns. Unknown formats pass through unchanged and fail at validation (which is the existing behavior, so no regression).

### Risk: Normalization hides persistent agent regressions

**Mitigation:** Every normalization emits a warning. Track warning frequency in logs. If a generator consistently triggers warnings, it means the runtime skill is stale — that's a deployment issue, not a normalization issue.

### Risk: Apply-path fallback masks index misses

**Mitigation:** The fallback logs a warning and is explicitly a safety net. If it fires, it indicates either a pre-normalization changeset or a bug in normalization — both are worth investigating.

### Risk: Existing draft changesets with legacy shapes

**Mitigation:** The apply-path fallback (WS4) handles these. They'll resolve via case-insensitive lookup and log a warning. No backfill migration needed.

---

## Success Criteria

- Zero "display_id not found" errors on changeset accept for wizard-generated maps.
- All display references stored in changesets match the canonical prefix pattern.
- Legacy field names (`title` on activities, `position` on steps) are never persisted in `after_state`.
- The apply path resolves all references without the case-insensitive fallback (i.e., normalization handles everything, fallback fires zero times for new changesets).
- Sandbox wizard flow succeeds end-to-end: create project → generate map → accept changeset → map renders.

---

## References

- [create-changeset-input.util.ts](../../apps/api/src/changesets/create-changeset-input.util.ts) — Normalization layer (WS1-3 target)
- [changesets.service.ts](../../apps/api/src/changesets/changesets.service.ts) — Apply path (WS4 target)
- [skills/map-generator/SKILL.md](../../skills/map-generator/SKILL.md) — Canonical format spec (WS5 target)
- [changeset-input-hardening.md](./changeset-input-hardening.md) — Companion plan (envelope validation)
- [wizard-generation-efficiency-and-timing.md](./wizard-generation-efficiency-and-timing.md) — Generator timing constraints
