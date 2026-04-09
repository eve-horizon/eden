---
name: Map Generator
description: Generates initial story map structures from project descriptions and optional attached documents
---

# Map Generator

You generate story maps by creating a **single changeset** via the Eden CLI.

**CRITICAL RULES:**
- Do NOT run `eden --help`, `eden changeset --help`, or `eden changeset create --help`
- Do NOT explore CLI subcommands — ignore any generic CLI examples injected below
- Do NOT call `eden changeset accept` or `eden changeset reject`
- Do NOT call any endpoint directly — use only the commands below
- Do NOT reread this skill file during execution

## Only CLI Call You Need

```
eden changeset create --project <UUID> --file /tmp/changeset.json --json
```

If that command returns validation errors, fix `/tmp/changeset.json` and rerun the same command once. Do not call any other Eden CLI commands.

## Attached Documents (optional)

The user may have attached a document to the wizard. It reaches you via one of two paths:

1. **PDFs** — the platform materializes the PDF into your workspace. If the job description contains a line starting with `Attached document:`, there is a PDF at `.eve/resources/`. Before writing the changeset:
   - Read `.eve/resources/index.json` to find the `local_path` for any entries with `status: "resolved"`
   - Read the PDF using **explicit `pages` ranges only** — never request more than 20 pages per Read call
   - Use contiguous windows: `pages: "1-20"`, `pages: "21-40"`, `pages: "41-60"`, then the remainder
   - Do **not** attempt a whole-document read first — it will fail on any PDF over 20 pages
   - Do not reread earlier page ranges unless the tool explicitly errors
   - Let the document content inform personas, activities, capabilities, constraints, and questions alongside the user's text fields
2. **Non-PDF documents** (`.md`, `.txt`, `.docx`) — already inlined into the job description as an `Attached document excerpt:` block. Use that excerpt the same way.

Do not summarize the document back to the user — just let its contents influence the changeset you produce. If neither a resolved PDF nor an inline excerpt is present, proceed using only the text fields in the job description.

**Do NOT:**
- Make HTTP calls to fetch any document yourself
- Run `pdf-parse`, `pdftotext`, or any external parser — Claude reads PDFs natively via the Read tool
- Skip a PDF that is present in `.eve/resources/index.json` — the user expects it to influence the map

## Exact Steps (follow precisely)

1. Extract the **Eden project UUID** from the job description (line starting with "Eden project UUID:")
2. If the job description mentions `Attached document:` (a PDF resource):
   - Read `.eve/resources/index.json` to find the PDF `local_path`
   - Read the PDF in bounded page windows (`pages: "1-20"`, then `"21-40"`, etc.) — never omit the `pages` parameter
3. Write the changeset JSON to `/tmp/changeset.json` using the Write tool (NOT Bash heredoc)
4. Run: `eden changeset create --project <UUID> --file /tmp/changeset.json --json`
5. If step 4 returns validation errors, fix `/tmp/changeset.json` and rerun the same command once
6. Report the result. Done.

**Minimum: 3 tool calls (Write, Bash, final reply). With an attached PDF: 5 tool calls (Read index.json, Read the PDF, Write, Bash, final reply).** Do not add extra steps beyond this.

## Changeset JSON Format

```json
{
  "title": "Initial story map for \"<project name>\"",
  "source": "map-generator",
  "items": [
    ...personas first, then activities, then steps, then tasks, then questions...
  ]
}
```

## Pre-Submit Checklist

Before calling `eden changeset create`, verify all of the following:

- `title` exists and is non-empty
- `source` is set to `map-generator`
- `items` exists and `items.length > 0`
- Every item has `entity_type` and `operation`
- Every `display_reference` uses uppercase canonical format: `ACT-{n}`, `STP-{a}.{s}`, `TSK-{a}.{s}.{t}`, `PER-{CODE}`, `Q-{n}`
- Every `after_state.display_id` matches the item's `display_reference`
- Activities use `name` (not `title`) and `sort_order` (not `position`)
- Steps include `activity_display_id` with uppercase `ACT-` prefix
- Tasks include `step_display_id` with uppercase `STP-` prefix
- Every `task/create` item includes a non-empty `title`

## Anti-Patterns (NEVER use these)

| Wrong | Correct |
|-------|---------|
| `act-1`, `activity-1` | `ACT-1` |
| `step-1-1`, `stp-1-1` | `STP-1.1` |
| `task-1-1-1`, `tsk-1-1-1` | `TSK-1.1.1` |
| `"title"` on activity/step | `"name"` |
| `"position"` | `"sort_order"` |
| `"activity_ref"` | `"activity_display_id"` |
| `"step_ref"` | `"step_display_id"` |
| `"name"` on task | `"title"` |
| `"description"` on task | `"user_story"` |

### Persona: `{"entity_type":"persona","operation":"create","display_reference":"PER-{code}","description":"Add persona: {name}","after_state":{"name":"...","code":"...","color":"#3b82f6"}}`

Colors: `#3b82f6` `#ef4444` `#10b981` `#f59e0b` `#8b5cf6` `#ec4899`

### Activity: `{"entity_type":"activity","operation":"create","display_reference":"ACT-{n}","description":"Add activity: {name}","after_state":{"name":"...","display_id":"ACT-{n}","sort_order":{n}}}`

### Step: `{"entity_type":"step","operation":"create","display_reference":"STP-{a}.{s}","description":"Add step: {name}","after_state":{"name":"...","display_id":"STP-{a}.{s}","activity_display_id":"ACT-{a}","sort_order":{s}}}`

### Task: `{"entity_type":"task","operation":"create","display_reference":"TSK-{a}.{s}.{t}","description":"Add task: {title}","after_state":{"title":"...","display_id":"TSK-{a}.{s}.{t}","step_display_id":"STP-{a}.{s}","persona_code":"...","user_story":"As a ..., I want to ..., so that ...","acceptance_criteria":[{"id":"AC-{a}.{s}.{t}a","text":"Given ... when ... then ..."}],"device":"all","priority":"high","status":"draft"}}`

### Question: `{"entity_type":"question","operation":"create","display_reference":"Q-{n}","description":"Clarifying question","after_state":{"question":"...","display_id":"Q-{n}","priority":"medium","category":"requirements","status":"open"}}`

## Quantities

- **Personas:** 3-5
- **Activities:** 4-6
- **Steps:** 2-3 per activity
- **Tasks:** 2-3 per step
- **Acceptance criteria:** 2-4 per task, written in Given/When/Then form
- **Questions:** 5-10

Every task must include:
- A concise user story
- A `device` value of `desktop`, `mobile`, or `all` (use `all` unless the context clearly demands otherwise)
- Acceptance criteria rich enough that the expanded story-map card is useful without manual rewriting
