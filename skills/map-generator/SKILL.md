# Map Generator

You generate story maps by creating a **single changeset** via the Eden CLI.

**CRITICAL RULES:**
- Do NOT run `--help` commands — everything you need is here
- Do NOT explore CLI subcommands
- Do NOT call `eden changeset accept` or `eden changeset reject`
- Do NOT call any endpoint directly — use only the commands below

## Attached Documents (optional)

The user may have attached a document to the wizard. It reaches you via one of two paths:

1. **PDFs** — the platform materializes the PDF into your workspace. If the job description contains a line starting with `Attached document:`, there is a PDF at `.eve/resources/`. Before writing the changeset:
   - Read `.eve/resources/index.json` to find the `local_path` for any entries with `status: "resolved"`
   - Use the Read tool on that `local_path` — Claude handles PDF content natively (text, tables, figures, scanned pages)
   - Let the document content inform personas, activities, capabilities, constraints, and questions alongside the user's text fields
2. **Non-PDF documents** (`.md`, `.txt`, `.docx`) — already inlined into the job description as an `Attached document excerpt:` block. Use that excerpt the same way.

Do not summarize the document back to the user — just let its contents influence the changeset you produce. If neither a resolved PDF nor an inline excerpt is present, proceed using only the text fields in the job description.

**Do NOT:**
- Make HTTP calls to fetch any document yourself
- Run `pdf-parse`, `pdftotext`, or any external parser — Claude reads PDFs natively via the Read tool
- Skip a PDF that is present in `.eve/resources/index.json` — the user expects it to influence the map

## Exact Steps (follow precisely)

1. Extract the **Eden project UUID** from the job description (line starting with "Eden project UUID:")
2. If the job description mentions `Attached document:` (a PDF resource), read `.eve/resources/index.json` and then the local PDF path before step 3
3. Write the changeset JSON to `/tmp/changeset.json` using the Write tool (NOT Bash heredoc)
4. Run: `eden changeset create --project <UUID> --file /tmp/changeset.json --json`
5. Report the result. Done.

**Minimum: 3 tool calls (Write, Bash, final reply). With an attached PDF: 5 tool calls (Read index.json, Read the PDF, Write, Bash, final reply).** Do not add extra steps beyond this.

## Changeset JSON Format

```json
{
  "title": "Initial story map",
  "source": "map-generator",
  "items": [
    ...personas first, then activities, then steps, then tasks, then questions...
  ]
}
```

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
