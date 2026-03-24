# Eden Phase 7 — Chat @Mentions & UX Parity

> **Status**: Proposed
> **Date**: 2026-03-20
> **Depends on**: Phase 6c (collaboration and views)
> **Reference**: incept5/eden UX prototype (attachments, guided tour, and PRD parity checks)
> **Estimated effort**: ~2 weeks (3 workstreams, WS2+WS3 can parallel after WS1)
>
> **Delivers**: @mention autocomplete in chat and question inputs, file/voice
> attachments in chat, richer typing indicators, scroll-to-reference navigation,
> a guided walkthrough system, and PRD generation — closing the remaining UX
> parity gaps between the prototype and Eden.

---

## Gap Analysis Summary

| # | Feature | Prototype | Eden | Priority |
|---|---------|-----------|------|----------|
| 1 | **Chat @mentions** — type `@` to reference ACT/STP/TSK by ID or title | Full autocomplete hook + dropdown | Plain text only | P0 |
| 2 | **@mentions in question answers** — same autocomplete in question reply | Reuses `useMentionAutocomplete` | Not present | P0 |
| 3 | **File attachments in chat** — drag-drop + file picker (PDF, Word, audio) | Full implementation | Not present | P1 |
| 4 | **Voice notes** — record audio directly in chat | MediaRecorder integration | Not present | P2 |
| 5 | **Rich typing indicator** — elapsed time, stage phrases, token stats | Full real-time display | Three-dot animation | P1 |
| 6 | **Scroll-to-reference** — click a mention/reference to highlight the entity on the map | `scrollToRef()` with flash animation | Not present | P1 |
| 7 | **Walkthrough / guided tour** — role-specific onboarding with spotlight overlay | Full walkthrough system | Welcome modal only | P2 |
| 8 | **PRD generation** — auto-generate product requirements doc from story map | Modal with regenerate, caching | Not present | P2 |
| 9 | **Clear chat history** — button with confirmation | Present | Not present | P3 |
| 10 | **Chat context building** — smart context injection (map skeleton, keyword matching) | Full implementation | Sends raw message only | P1 |

---

## WS1: Chat @Mention System (P0)

The flagship feature, and should be completed first. When a user types `@` in the chat input or question answer textarea, an autocomplete dropdown appears showing matching activities, steps, and tasks from the current map.

### 1.1 — `useMentionAutocomplete` Hook

Create a reusable hook that can be shared between ChatInput and QuestionModal.

**File:** `apps/web/src/hooks/useMentionAutocomplete.ts`

**Input:** hydrated map data (activities → steps → tasks), textarea ref, optional mention filter config

**Behaviour:**
1. Build a memoized `MentionItem[]` index from map data:
   ```ts
   interface MentionItem {
     type: 'activity' | 'step' | 'task';
     id: string;           // display_id: "ACT-1", "STP-1.2", "TSK-1.2.3"
     title: string;
     parentLabel?: string; // "ACT-1 > STP-1.2" for tasks
   }
   ```
2. On every keystroke, detect `@` trigger:
   - Look backward from cursor for the nearest `@` in the current token
   - Activate only if `@` is at position 0 or preceded by whitespace/punctuation (`\s`, `(`, `[` or newline)
   - Extract query = text between `@` and cursor (single token, no spaces)
3. Filter the index by query (case-insensitive match on `id` or `title`), limit 10 results
4. Sort matches by exact-prefix > partial match > fuzzy match to keep relevance
5. Support multiple mentions within one message.

**Returns:**
- `inputValue` / `setInputValue` — controlled textarea state
- `mentionQuery` — current query string or null
- `filteredMentions` — matching items
- `mentionIndex` — highlighted item index
- `handleInputChange` — wired to textarea onChange
- `handleMentionKeyDown` — intercepts Tab/Enter/Arrow/Escape
- `insertMention(item)` — replaces `@query` with `@${item.id} ` and repositions cursor
- `isMentionOpen` — whether dropdown is visible
- `mentionTriggerRect` — optional rect for popup positioning
- `MentionDropdown` — render-ready dropdown component
- `ariaProps` for keyboard/mouse accessibility where applicable

### 1.2 — Mention Dropdown Component

Rendered inside ChatInput and QuestionModal, positioned above the textarea.

**Markup:**
```
┌─────────────────────────────────────────┐
│ ACT  ACT-1   User Registration   │
│ STP  STP-1.1  Account Creation    ACT-1 │
│ TSK  TSK-1.1.1 Email field   ACT-1>STP-1.1│  ← highlighted
│ ...                                       │
└─────────────────────────────────────────┘
```

**Interactions:**
- `ArrowDown/Up` — cycle highlighted item
- `Tab` or `Enter` — insert highlighted mention
- `Escape` — dismiss dropdown
- Mouse click — insert clicked item
- Mouse hover — update highlight
- `PageUp/PageDown` — jump by 5 entries (optional usability improvement)

**Styling:** Tailwind, matches eden-bg/eden-border palette. Use listbox semantics (`role="listbox"` + `role="option"`). Add focus-visible styles and strong keyboard contrast. Type badges use existing color scheme (indigo=activity, orange=step, emerald=task).

### 1.3 — Integrate into ChatInput

Modify `ChatInput.tsx`:
- Accept `mapData` prop (the hydrated map response)
- Wire `useMentionAutocomplete` to the existing textarea
- Render `MentionDropdown` in a `relative` container above the input
- Intercept `onKeyDown` — if `handleMentionKeyDown` returns true, skip the Enter-to-send logic
- On send, pass the raw text (mentions are plain `@TSK-1.2.3` strings the AI interprets)
- Keep Enter-to-send behavior only when mention dropdown is closed or no match is active

### 1.4 — Integrate into QuestionModal

Modify `QuestionModal.tsx`:
- Wire `useMentionAutocomplete` to the answer textarea
- Render dropdown in the modal body
- Same keyboard/mouse behaviour as chat

### 1.5 — Pass Map Data Through

- `MapPage.tsx` already fetches map data — pass it down to `ChatPanel` → `ChatInput`
- `QuestionModal` already receives map context — thread `mapData` through

### Verification

| # | Criterion | Method |
|---|-----------|--------|
| 1 | Type `@` in chat → dropdown appears with up to 10 items | Manual |
| 2 | Type `@ACT` → filters to activities only | Manual |
| 3 | Type `@reg` → shows items with "reg" in title | Manual |
| 4 | Arrow keys cycle highlight, Tab/Enter inserts `@TSK-1.2.3 ` | Manual |
| 5 | Escape dismisses dropdown without inserting | Manual |
| 6 | Click item in dropdown inserts mention | Manual |
| 7 | Send message with mention → AI receives `@TSK-1.2.3` in text | Check API payload |
| 8 | Same autocomplete works in question answer textarea | Manual |
| 9 | Empty map → `@` shows "No items" or no dropdown | Manual |

---

## WS2: Chat Enrichments (P1)

### 2.1 — File Attachments

**Goal:** Let users attach files (PDF, Word, text, audio) to chat messages for AI ingestion.

**Frontend changes (`ChatInput.tsx`):**
- Add paperclip button next to send button
- Hidden `<input type="file" multiple>` triggered by button click
- Accept: `.pdf,.doc,.docx,.txt,.md,.m4a,.wav,.mp3`
- Drag-and-drop zone on the entire ChatPanel (with visual feedback)
- File preview badges below textarea (name + size + remove button)
- Max 10 files, max 25MB each; cap total at 100MB and block uploads above that
- Add upload validation by MIME type and extension
- Show upload progress and disable send while uploads are pending
- On send, upload files then include references in the message payload

**API changes (`chat.controller.ts`):**
- New endpoint: `POST /projects/:projectId/chat/threads/:threadId/attachments`
- Accepts multipart form data
- Validate extension + MIME type server-side, reject invalid files explicitly
- Forwards files to Eve Gateway if available, otherwise persists in project document sources and returns stable references
- Returns attachment metadata (id, name, type, size, sourceType)

**Fallback:** If backend attachment support is not available end-to-end, implement a temporary TXT/MD-only upload path and create a follow-up ticket for full media support.

### 2.2 — Rich Typing Indicator

Replace the three-dot animation with a richer display when waiting for AI response.

**`TypingIndicator.tsx` changes:**
- Accept `startTime` prop
- Show elapsed time: "Eve is thinking... 12s"
- Rotate through contextual phrases: "Analyzing map...", "Considering changes...", "Drafting response..."
- If streaming metadata available (future), show token counts

### 2.3 — Scroll-to-Reference

When a chat message or question contains a reference (`ACT-1`, `STP-1.2`, `TSK-1.2.3`, optional `Q-<id>`), make it clickable.

**`ChatMessage.tsx` changes:**
- Parse message text for display_id patterns: `/\b(ACT|STP|TSK|Q)-[\d.]+\b/g`
- Render matches as styled links (eden-accent color, underline)
- On click, dispatch a typed `scrollToRef` custom event payload with the display_id
- Avoid linking IDs that are clearly part of URLs or code blocks (best-effort)

**`StoryMap.tsx` changes:**
- Listen for `scrollToRef` custom events (or accept via callback prop)
- Resolve the DOM node by `[data-display-id]`, with a fallback to parent map rows
- Scroll into view with `behavior: 'smooth'` and `block: 'center'`
- Apply a brief flash animation (pulse border or background highlight for 1.5s), then clear after timeout

**`TaskCard.tsx` / `ActivityRow.tsx` / `StepHeader.tsx` changes:**
- Add `data-display-id={display_id}` attribute to root element

### 2.4 — Chat Context Building

Currently Eden sends raw user text to Eve. The prototype builds richer context and should avoid uncontrolled token growth.

**`ChatPanel.tsx` changes:**
- Before sending, analyze the message:
  - If modification intent detected (`/\b(add|create|remove|delete|change|modify|update|move)\b/i`), include map skeleton + linked entity neighborhood
  - If question-related, include relevant questions
  - Always include last 5 messages as conversation history
- Format context as a system preamble prepended to the user message (or sent as metadata)
- Add a context-size cap (e.g., 4KB) and include a `chatContextVersion` flag for experimentation/rollback

### 2.5 — Clear Chat History

- Add "Clear history" button in ChatPanel header (trash icon)
- Confirmation dialog: "Clear all messages in this thread?"
- On confirm, create a new thread (preferred: server-side thread reset endpoint if available, otherwise local reset + new thread id)
- Preserve unsent draft and show a neutral rollback path (discard local-only draft only)

### Verification

| # | Criterion | Method |
|---|-----------|--------|
| 1 | Attach PDF via button → file badge appears → sends with message | Manual |
| 2 | Drag file onto chat → drop zone highlights → file attaches | Manual |
| 3 | Typing indicator shows elapsed time while waiting | Manual |
| 4 | `TSK-1.2.3` in AI response is a clickable link | Manual |
| 5 | Click reference link → map scrolls to task with flash highlight | Manual |
| 6 | Ask "add a task to ACT-1" → AI receives map context | Check API payload |
| 7 | Clear history → messages reset, new thread created | Manual |

---

## WS3: Guided Tour & PRD Generation (P2)

### 3.1 — Walkthrough System

A spotlight-based guided tour that introduces new users to Eden's key features.

**New files:**
- `apps/web/src/components/walkthrough/WalkthroughOverlay.tsx`
- `apps/web/src/components/walkthrough/WalkthroughTooltip.tsx`
- `apps/web/src/context/WalkthroughContext.tsx`
- `apps/web/src/data/walkthrough-steps.ts`

**How it works:**
1. `WalkthroughContext` manages: `isActive`, `currentStep`, `steps[]`, `start()`, `next()`, `skip()`
2. Steps define a `targetSelector` (CSS selector), `title`, `description`, and `placement` (top/bottom/left/right)
3. `WalkthroughOverlay` renders a dark backdrop with a cutout around the target element
4. `WalkthroughTooltip` renders beside the cutout with step content + Previous/Next/Skip buttons
5. Step counter shows "Step 3 of 8"
6. Add reduced-motion support (`prefers-reduced-motion`) and skip non-focusable targets

**Tour steps (initial set):**
1. Story map grid — "This is your story map. Activities are columns, steps are rows."
2. Task card — "Click a card to expand details, user stories, and acceptance criteria."
3. Persona tabs — "Switch between persona views to see role-specific journeys."
4. Filter dropdown — "Filter by activity, role, or status."
5. Chat panel — "Ask Eve to modify the map. Use @mentions to reference specific items."
6. Questions panel — "Track open questions and evolve the map from answers."
7. Search bar — "Search across all activities, steps, tasks, and questions."
8. Drag and drop — "Drag cards to reorder. Drag between steps to move tasks."

**Triggers:**
- Auto-show on first visit (store flag in localStorage)
- "Start Tour" button in user menu / help dropdown
- Optional query param trigger (e.g. `?tour=1`) for demos/support
- Role-specific variations in future (PM sees wizard step, BA sees different emphasis)

### 3.2 — PRD Generation

Auto-generate a product requirements document from the current story map.

**New endpoint:** `POST /projects/:projectId/export/prd`
- Serializes the full map (activities → steps → tasks with user stories + acceptance criteria)
- Sends to Eve agent with a PRD generation prompt and current map version
- Returns markdown PRD
- Cache result in project metadata with map-version invalidation key (regenerate if map changed)

**New component:** `apps/web/src/components/export/PRDModal.tsx`
- Button in map toolbar: "Generate PRD"
- Modal shows loading state → rendered markdown
- "Regenerate" button (with "Are you sure?" since it's AI-generated)
- Show if cached PRD is stale vs current map version
- "Copy to clipboard" and "Download as .md" buttons
- Shows generation timestamp

### Verification

| # | Criterion | Method |
|---|-----------|--------|
| 1 | First visit → tour starts automatically | Manual (clear localStorage) |
| 2 | Tour highlights each element in sequence | Manual |
| 3 | Skip button ends tour immediately | Manual |
| 4 | "Start Tour" from menu re-triggers tour | Manual |
| 5 | Generate PRD → modal shows formatted document | Manual |
| 6 | Regenerate → new PRD replaces old one | Manual |

---

## Implementation Order

```
Week 1:
  WS1 (Chat @mentions)          ████████████████████  ← ship first, highest value
    1.1 useMentionAutocomplete hook
    1.2 MentionDropdown component
    1.3 Integrate into ChatInput
    1.4 Integrate into QuestionModal
    1.5 Thread map data through

Week 1-2 (parallel):
  WS2 (Chat enrichments)        ████████████████████
    2.1 File attachments
    2.2 Rich typing indicator
    2.3 Scroll-to-reference
    2.4 Chat context building
    2.5 Clear chat history

Week 2:
  WS3 (Tour + PRD)              ████████████████████
    3.1 Walkthrough system
    3.2 PRD generation
```

---

## Out of Scope

These prototype features already exist in Eden or aren't needed:

- **Drag-and-drop** — Already implemented via `useDragDrop` hook
- **Inline editing** — Already implemented via `InlineEdit` component
- **Activity filter bar** — Already implemented in Phase 6 filter dropdown
- **MiniMap** — Already implemented
- **Notification bell** — Already implemented
- **Search bar** — Already implemented
- **Changeset review** — Already implemented
- **Voice notes (P2)** — Deferred; file attachments cover audio upload
- **Local LM Studio settings** — Eden uses Eve platform agents, not local inference
