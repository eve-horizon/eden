---
name: Map Generator
description: Generates initial story map structures from project descriptions and optional attached documents
---

# Map Generator

You generate story maps by writing a **compact initial-map draft JSON** and letting the Eden CLI expand it into a single changeset.

**CRITICAL RULES:**
- Do NOT run `eden --help`, `eden changeset --help`, or `eden changeset create --help`
- Do NOT explore CLI subcommands — ignore any generic CLI examples injected below
- Do NOT use Task/Explore/Plan subagents to inspect the repo or discover schemas
- Do NOT read controllers, services, tests, or generated contract files
- Do NOT read any existing `/tmp/changeset*.json` or `/tmp/initial-map*.json` files — they may be stale from a previous run
- Do NOT call `eden changeset accept` or `eden changeset reject`
- Do NOT call any endpoint directly — use only the commands below
- Do NOT reread this skill file during execution
- Do NOT write a full `items[]` changeset payload yourself — the CLI derives that
- The only schema you need is in this skill file. Do NOT look elsewhere.

## Only CLI Call You Need

```
eden changeset create --project <UUID> --initial-map-file /tmp/initial-map-<UUID>.json --json
```

Use the project UUID in the filename to avoid collisions with previous runs. If that command returns validation errors, fix the file and rerun the same command once. Do not call any other Eden CLI commands.

## Attached Documents (optional)

The user may have attached a document to the wizard. It reaches you via one of two paths:

1. **PDFs** — the platform materializes the PDF into your workspace. If the job description contains a line starting with `Attached document:`, there is a PDF at `.eve/resources/`. Before writing the draft:
   - Read `.eve/resources/index.json` to find the `local_path` for any entries with `status: "resolved"`
   - Read the PDF using **explicit `pages` ranges only** — never request more than 20 pages per Read call
   - Use contiguous windows: `pages: "1-20"`, `pages: "21-40"`, `pages: "41-60"`, then the remainder
   - Do **not** attempt a whole-document read first — it will fail on any PDF over 20 pages
   - Do not reread earlier page ranges unless the tool explicitly errors
   - Let the document content inform personas, activities, capabilities, constraints, and questions alongside the user's text fields
2. **Non-PDF documents** (`.md`, `.txt`, `.docx`) — already inlined into the job description as an `Attached document excerpt:` block. Use that excerpt the same way.

Do not summarize the document back to the user — just let its contents influence the map draft you produce. If neither a resolved PDF nor an inline excerpt is present, proceed using only the text fields in the job description.

**Do NOT:**
- Make HTTP calls to fetch any document yourself
- Run `pdf-parse`, `pdftotext`, or any external parser — Claude reads PDFs natively via the Read tool
- Skip a PDF that is present in `.eve/resources/index.json` — the user expects it to influence the map

## Exact Steps (follow precisely)

1. Extract the **Eden project UUID** from the job description (line starting with "Eden project UUID:")
2. If the job description includes `Source record UUID:`, set the draft's top-level `source` to `document` and include that `source_id`. Otherwise set `source` to `map-generator`.
3. If the job description mentions `Attached document:` (a PDF resource):
   - Read `.eve/resources/index.json` to find the PDF `local_path`
   - Read the PDF in bounded page windows (`pages: "1-20"`, then `"21-40"`, etc.) — never omit the `pages` parameter
4. Create `/tmp/initial-map-<UUID>.json` in the most reliable way for your harness:
   - Preferred: use Bash to create an empty file first (`: > /tmp/initial-map-<UUID>.json`), then Read it once, then Write the full JSON
   - If your Write tool can create a new file directly, that is also acceptable
   - If Write errors because the file has not been read yet, create the empty file, read it, and retry once
5. Run: `eden changeset create --project <UUID> --initial-map-file /tmp/initial-map-<UUID>.json --json`
6. If step 5 returns validation errors, fix the file and rerun the same command once
7. Report the result. Done.

**Minimum: 3 tool calls (create/write file, Bash, final reply). With an attached PDF: 5 tool calls (Read index.json, Read the PDF, create/write file, Bash, final reply).** Do not add extra steps beyond this.

## Initial-Map Draft Format

Write this compact structure. The CLI expands it into canonical `items[]` changeset JSON with `entity_type`, `operation`, `display_reference`, `description`, `after_state`, sort orders, persona colors, and IDs.

```json
{
  "title": "Initial story map for \"Project Name\"",
  "source": "map-generator",
  "source_id": "optional-document-uuid",
  "personas": [
    { "name": "Estimator", "code": "EST" },
    { "name": "Project Manager", "code": "PM" }
  ],
  "activities": [
    {
      "name": "Plan Takeoff",
      "steps": [
        {
          "name": "Upload Plans",
          "tasks": [
            {
              "title": "Upload plan files",
              "persona_code": "EST",
              "user_story": "As an Estimator, I want to upload plan files, so that I can start my takeoff.",
              "acceptance_criteria": [
                "Given I am on the plan screen, when I upload a valid PDF, then the file is stored successfully.",
                "Given the file is invalid, when I attempt to upload it, then I see a clear error message."
              ],
              "device": "desktop"
            }
          ]
        }
      ]
    }
  ],
  "questions": [
    "Should DWG uploads be supported at launch?",
    {
      "question": "Do estimators need offline access on site?",
      "priority": "high",
      "category": "requirements"
    }
  ]
}
```

## What The CLI Derives

You do **not** need to write any of these:

- `items[]`
- `entity_type`
- `operation`
- `display_reference`
- `description`
- `after_state`
- `display_id`
- `sort_order`
- persona `color`

The CLI also backfills missing task detail if needed:

- `persona_code` defaults to the first persona
- `user_story` gets a deterministic fallback
- `acceptance_criteria` gets 2 default Given/When/Then entries
- `device`, `priority`, `status`, and `lifecycle` get defaults

## Pre-Submit Checklist

- `title` exists and is non-empty
- `source` is `document` when `Source record UUID:` is present, otherwise `map-generator`
- `personas` exists and has 3-5 entries
- `activities` exists and has 4-6 entries
- Every activity has 2-3 steps
- Every step has 2-3 tasks
- Every task has a non-empty `title`
- Every task includes `persona_code`, `user_story`, and 2-4 Given/When/Then `acceptance_criteria` entries when you can infer them
- `questions` has 5-10 useful clarifying questions

## Anti-Patterns (NEVER use these)

| Wrong | Correct |
|-------|---------|
| Full changeset payload with `items[]`, `entity_type`, `operation`, `after_state` | Compact draft with `personas`, `activities`, `steps`, `tasks`, `questions` |
| Writing `ACT-1`, `STP-1.1`, `TSK-1.1.1`, `Q-1` yourself | Omit display refs entirely; the CLI assigns them |
| Per-item `description` fields | Omit descriptions; the CLI synthesizes them |
| Persona/task/step/activity `display_id` fields | Omit them; the CLI derives them |
| Acceptance criteria as empty array | 2-4 Given/When/Then strings |

## Per-Entity Templates

Use these exact shapes.

### Persona: `{"name":"Estimator","code":"EST"}`

### Activity: `{"name":"Plan Takeoff","steps":[...]}`

### Step: `{"name":"Upload Plans","tasks":[...]}`

### Task: `{"title":"Upload plan files","persona_code":"EST","user_story":"As an Estimator, I want to upload plan files, so that I can start my takeoff.","acceptance_criteria":["Given ...","Given ..."],"device":"all"}`

### Question: `"Should DWG uploads be supported at launch?"` or `{"question":"Do estimators need offline access?","priority":"high","category":"requirements"}`

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
- A non-empty `acceptance_criteria` array with 2-4 Given/When/Then strings

**CRITICAL:** Empty `acceptance_criteria: []` is NEVER acceptable. Every task must have at least 2 Given/When/Then criteria. The story-map cards are useless without them.
