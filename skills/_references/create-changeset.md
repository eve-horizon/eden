<!-- DO NOT EDIT — generated from apps/api/src/contracts/create-changeset.contract.ts -->

# Changeset Create Contract

This file is the agent-readable reference for the `POST /projects/:id/changesets` payload.
If you need the machine-readable schema, run `eden changeset schema --json`
or read `contracts/create-changeset.schema.json`.

## Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | no | Changeset title (auto-generated if omitted) |
| `reasoning` | string | no | Why this changeset is being proposed |
| `source` | string | no | Origin (auto-inferred from agent identity) |
| `source_id` | uuid | no | Ingestion source UUID, if from a document |
| `actor` | string | no | Who created this (auto-inferred) |
| `items` | array | **yes** | Non-empty array of changeset items |

## Supported Entity Types

| Entity Type | Operations |
|-------------|------------|
| `activity` | `create` |
| `persona` | `create` |
| `question` | `create`, `update` |
| `step` | `create` |
| `task` | `create`, `update`, `delete` |

## Display Reference Formats

All display references MUST use uppercase canonical format:

- **activity**: `ACT-{n}`
- **step**: `STP-{a}.{s}`
- **task**: `TSK-{a}.{s}.{t}`
- **persona**: `PER-{CODE}`
- **question**: `Q-{n}`

## Parent References

- `step/create` requires `activity_display_id` pointing to a `activity`
- `task/create` requires `step_display_id` pointing to a `step`

## After State Fields

### activity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **yes** | Activity name (canonical field name) |
| `display_id` | string | no | Display ID in ACT-{n} format |
| `description` | string | no |  |
| `sort_order` | integer | no | Position in the map |

### persona

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **yes** | Persona name |
| `code` | string | no | Short uppercase code (e.g. CUST, DEV) |
| `color` | string | no | Hex color |

### question

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | **yes** | Question text |
| `display_id` | string | no | Display ID in Q-{n} format |
| `priority` | `low` \| `medium` \| `high` | no |  |
| `category` | `requirements` \| `technical` \| `business` \| `ux` \| `risk` | no |  |
| `status` | string | no |  |
| `answer` | string | no | Answer text (for question/update) |

### step

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **yes** | Step name (canonical field name) |
| `display_id` | string | no | Display ID in STP-{a}.{s} format |
| `activity_display_id` | string | **yes** | Parent activity reference (e.g. ACT-1) |
| `activity_id` | string | no | Parent activity UUID (alternative to display ref) |
| `sort_order` | integer | no | Position within the activity |

### task

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | **yes** | Task title (canonical field name) |
| `display_id` | string | no | Display ID in TSK-{a}.{s}.{t} format |
| `step_display_id` | string | **yes** | Parent step reference (e.g. STP-1.1) |
| `persona_code` | string | no | Persona code for this task |
| `user_story` | string | no | User story in "As a ..., I want to ..., so that ..." form |
| `acceptance_criteria` | array | no | Acceptance criteria (2-4 entries, Given/When/Then form) |
| `device` | `desktop` \| `mobile` \| `all` | no | Target device |
| `priority` | `low` \| `medium` \| `high` \| `critical` | no |  |
| `status` | `draft` \| `active` \| `done` | no |  |
| `lifecycle` | `current` \| `future` \| `archived` | no |  |

## Defaults Applied on Create

These fields are auto-defaulted if omitted on `create` operations:

- `task.priority` → `"medium"`
- `task.status` → `"draft"`
- `task.lifecycle` → `"current"`
- `task.device` → `"all"`
- `question.priority` → `"medium"`
- `question.category` → `"requirements"`

## Field Aliases (Legacy → Canonical)

The server accepts legacy field names and rewrites them automatically:

| Legacy | Canonical | Entity Types |
|--------|-----------|--------------|
| `title` | `name` | activity |
| `title` | `name` | step |
| `position` | `sort_order` | activity, step |
| `activity_ref` | `activity_display_id` | step |
| `name` | `title` | task |
| `description` | `user_story` | task |
| `step_ref` | `step_display_id` | task |

## Normalization

- All display references are uppercased and reformatted (e.g. act-1 → ACT-1, task-1.2.3 → TSK-1.2.3)
- String, array of strings, or array of {id?, text, done?} objects are all accepted and normalized to object form
- Derived from name if missing (first letters of words, uppercased)

## Anti-Patterns

| Wrong | Correct | Why |
|-------|---------|-----|
| act-1, activity-1 | ACT-1 | Display references must be uppercase canonical format |
| step-1-1, stp-1-1 | STP-1.1 | Steps use dot separators, not dashes |
| task-1-1-1, tsk-1-1-1 | TSK-1.1.1 | Tasks use dot separators |
| "title" on activity/step | "name" | Activities and steps use "name", not "title" |
| "position" | "sort_order" | Position field is called sort_order |
| "activity_ref" | "activity_display_id" | Use canonical ref field names |
| "step_ref" | "step_display_id" | Use canonical ref field names |
| "name" on task | "title" | Tasks use "title", not "name" |
| "description" on task | "user_story" | Tasks use "user_story", not "description" |
| acceptance_criteria: [] | 2-4 Given/When/Then entries | Empty acceptance criteria is never acceptable |

## Canonical Example

```json
{
  "title": "Initial story map for \"My Project\"",
  "source": "map-generator",
  "items": [
    {
      "entity_type": "persona",
      "operation": "create",
      "display_reference": "PER-CUST",
      "description": "Add persona: Customer",
      "after_state": {
        "name": "Customer",
        "code": "CUST",
        "color": "#3b82f6"
      }
    },
    {
      "entity_type": "activity",
      "operation": "create",
      "display_reference": "ACT-1",
      "description": "Add activity: Onboarding",
      "after_state": {
        "name": "Onboarding",
        "display_id": "ACT-1",
        "sort_order": 1
      }
    },
    {
      "entity_type": "step",
      "operation": "create",
      "display_reference": "STP-1.1",
      "description": "Add step: Registration",
      "after_state": {
        "name": "Registration",
        "display_id": "STP-1.1",
        "activity_display_id": "ACT-1",
        "sort_order": 1
      }
    },
    {
      "entity_type": "task",
      "operation": "create",
      "display_reference": "TSK-1.1.1",
      "description": "Add task: Sign up with email",
      "after_state": {
        "title": "Sign up with email",
        "display_id": "TSK-1.1.1",
        "step_display_id": "STP-1.1",
        "persona_code": "CUST",
        "user_story": "As a Customer, I want to sign up with my email, so that I can access the platform",
        "acceptance_criteria": [
          {
            "id": "AC-1.1.1a",
            "text": "Given I am on the registration page, when I enter a valid email and password, then my account is created"
          },
          {
            "id": "AC-1.1.1b",
            "text": "Given I enter an already-registered email, when I submit, then I see an error message"
          }
        ],
        "device": "all",
        "priority": "high",
        "status": "draft"
      }
    },
    {
      "entity_type": "question",
      "operation": "create",
      "display_reference": "Q-1",
      "description": "Clarifying question",
      "after_state": {
        "question": "Should social login (Google/Apple) be supported at launch?",
        "display_id": "Q-1",
        "priority": "medium",
        "category": "requirements",
        "status": "open"
      }
    }
  ]
}
```

## Rules for Agents

1. If you need the payload shape, read this file.
2. If you need the machine schema, run `eden changeset schema --json`.
3. Do NOT inspect controllers, services, tests, or old temp files to infer the schema.
4. Do NOT read or reuse `/tmp/changeset.json` from earlier jobs.
5. Every `task/create` must include non-empty `acceptance_criteria` (2-4 Given/When/Then entries).
6. Every `task/create` must include `step_display_id`.
7. Every `step/create` must include `activity_display_id`.
