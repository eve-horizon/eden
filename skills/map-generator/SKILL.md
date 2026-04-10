---
name: Map Generator
description: Generates initial story map structures from project descriptions and optional attached documents
---

# Map Generator

You generate story maps by creating a **single changeset** via the Eden CLI.

**CRITICAL RULES:**
- Do NOT run `eden --help`, `eden changeset --help`, or `eden changeset create --help`
- Do NOT explore CLI subcommands — ignore any generic CLI examples injected below
- Do NOT spawn subagents to explore the codebase, read source code, or find schemas
- Do NOT read any existing `/tmp/changeset*.json` files — they may be stale from a previous run
- Do NOT call `eden changeset accept` or `eden changeset reject`
- Do NOT call any endpoint directly — use only the commands below
- Do NOT reread this skill file during execution
- The schema you need is in this skill file and `skills/_references/create-changeset.md`. Do NOT look elsewhere.

## Only CLI Call You Need

```
eden changeset create --project <UUID> --file /tmp/changeset-<UUID>.json --json
```

Use the project UUID in the filename to avoid collisions with previous runs. If that command returns validation errors, fix the file and rerun the same command once. Do not call any other Eden CLI commands.

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
2. Read `skills/_references/create-changeset.md` to load the changeset payload contract (field names, per-entity shapes, canonical example)
3. If the job description mentions `Attached document:` (a PDF resource):
   - Read `.eve/resources/index.json` to find the PDF `local_path`
   - Read the PDF in bounded page windows (`pages: "1-20"`, then `"21-40"`, etc.) — never omit the `pages` parameter
4. Write the changeset JSON to `/tmp/changeset-<UUID>.json` using the Write tool (NOT Bash heredoc)
5. Run: `eden changeset create --project <UUID> --file /tmp/changeset-<UUID>.json --json`
6. If step 5 returns validation errors, fix the file and rerun the same command once
7. Report the result. Done.

**Minimum: 4 tool calls (Read contract, Write, Bash, final reply). With an attached PDF: 6 tool calls (Read contract, Read index.json, Read the PDF, Write, Bash, final reply).** Do not add extra steps beyond this.

## Changeset JSON Format

For the full payload contract (field names, entity types, display reference format, per-entity field definitions, and the canonical example), read `skills/_references/create-changeset.md`.

If you need the machine schema, run `eden changeset schema --json`.

Do not inspect controllers, services, tests, or old temp files to infer the schema.

## Pre-Submit Checklist

All field names and formats are defined in `skills/_references/create-changeset.md`. The checklist below is a quick verification overlay.

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
- Every `task/create` item includes a non-empty `acceptance_criteria` array (2-4 entries, Given/When/Then)
- Every `task/create` item includes a `persona_code`

## Anti-Patterns

See the Anti-Patterns table in `skills/_references/create-changeset.md`. The reference file lists every wrong-vs-correct field name and display reference format.

## Per-Entity Templates

See `skills/_references/create-changeset.md` for per-entity field definitions and the canonical example.

Persona colors: `#3b82f6` `#ef4444` `#10b981` `#f59e0b` `#8b5cf6` `#ec4899`

## Quantities

- **Personas:** 3-5
- **Activities:** 4-6
- **Steps:** 2-3 per activity
- **Tasks:** 2-3 per step
- **Acceptance criteria:** 2-4 per task, written in Given/When/Then form
- **Questions:** 5-10

Every task MUST include ALL of these — omitting any is a generation failure:
- A concise `user_story` in "As a ..., I want to ..., so that ..." form
- A `device` value of `desktop`, `mobile`, or `all` (use `all` unless the context clearly demands otherwise)
- A `persona_code` matching one of the personas created above
- A non-empty `acceptance_criteria` array with 2-4 entries in `{"id":"AC-{a}.{s}.{t}a","text":"Given ... when ... then ..."}` form

**CRITICAL:** Empty `acceptance_criteria: []` is NEVER acceptable. Every task must have at least 2 Given/When/Then criteria. The story-map cards are useless without them.
