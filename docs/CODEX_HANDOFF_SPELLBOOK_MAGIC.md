# CODEX_HANDOFF — Spellbook Magic (Scope → Budget + Plan + Links)

## Goal
Make Spellbook feel like **one incantation → the whole project appears**:

- **Budget** line items created
- **Tasks** created
- **Calendar plan** populated through **event day + strike**
- **Links** created so every task is attached to a budget item with a `linkType`
- Result: user can immediately **export invoice** and run the project—no manual stitching

Keep **Budget Spellbook** and **Task Spellbook** separate (two buttons stay), but powered by one shared **PlanDraft** engine.

---

## Entry points (buttons)
### Keep existing buttons (no changes)
- **Budget tab:** `Spellbook` → Budget Spellbook
- **Calendar tab:** `Spellbook` → Task Spellbook

### Add one new CTA (Overview)
- **Overview banner bottom-right:** `Conjure Plan`
  - Opens the same Spellbook modal in **Project Plan mode**
  - Defaults outputs ON: ✅ Budget ✅ Calendar Plan ✅ Links

Rationale: “mode = where you are,” while Overview becomes the **Silicon Valley magic** entry point.

---

## The “Spellbook Magic” UI

## One modal. Three outputs. One preview.
**Keep existing Spellbook modal chrome**, but add a premium **AI Plan** preview.

### Modal layout
**Left pane**
- Paste input (scope blurb / run-of-show / shopping list / notes)

**Right pane**
- Preview tabs:
  - **Budget** (existing preview)
  - **Plan** (timeline + scheduled blocks + sequenced tasks)
  - **Assumptions** (editable chips that reflow plan instantly)

### Outputs row (must feel magical, not like settings)
A single “Outputs” row:
- ✅ **Budget**
- ✅ **Calendar Plan**
- ✅ **Links**

Defaults by entry point:
- **Overview (Conjure Plan):** Budget ON, Calendar Plan ON, Links ON
- **Budget tab:** Budget ON; Calendar Plan/Links suggested (Calendar Plan ON if event date exists/selected)
- **Calendar tab:** Tasks/Time blocks ON; Budget optional later

### AI-feel assumption chips (fast + confident)
At top of Plan preview:
- Event date (required to schedule)
- Load-in duration (default 4h)
- Strike duration (default 4h)
- Crew call time (default 9:00 AM)
- Venue hours (default 10–6)
- Markup / contingency (if included)

Each chip has a tiny confidence dot + “why” tooltip.
Edits should update preview immediately (budget totals + schedule).

---

## Micro-interactions that sell the “oh my god” feeling

### 1) Animated “conjure” preview
When the Plan preview generates:
1) Budget lines **appear**
2) Tasks **stitch into a timeline**
3) Links **light up** between tasks and budget lines

This is the “how did they think of that?” moment.

### 2) Coverage meter on every budget line item
On each budget row (and/or Work panel header), show:
**Work coverage: Quote ✅ Procure ⏳ Build ⏳ Install ⏳ Invoice ⏳**

- Missing step is clickable → **one-click create task** for that stage (linked + typed)
- Makes budget feel operational, not accounting

### 3) Risk / readiness badges
Surface high-signal production states:
- **At risk:** Quotes not complete (5)
- **Ready to invoice:** Install done (12)

Badges must deep-link to the filtered tasks / Work panel view.

---

## Shared engine: PlanDraft (preview-first, apply atomically)
Do not progressively create partial state. Generate a single draft → preview → apply.

### PlanDraft shape (frontend MVP)
- `budgetDraftItems[]`
- `taskDraftItems[]`
- `calendarBlockDrafts[]` (focus blocks / time blocks)
- `links[]` (task ↔ budget with linkType)
- `assumptions[]`, `warnings[]`

### Apply flow (atomic)
1) Create budget items
2) Create tasks
3) Create calendar blocks / scheduled tasks
4) Create links (or set primary fields if using Task.primary storage)

After apply:
- Budget rows show `Work • N` immediately
- Calendar shows the generated blocks/tasks immediately
- Task popover shows **Cost** already attached + correct `linkType`

---

## Scheduling model (so calendar looks “produced”)
Anchor to **Event Day (D0)** and schedule through **Strike (D+1)**.

### Milestones (relative offsets)
- D-14: quotes start
- D-10: orders placed
- D-7: build/print starts
- D-2: confirmations + pack list
- D-1: load truck / preflight
- D0: load-in + live
- D+1: strike + returns
- (Optional later) D+3 vendor invoices, D+5 client invoice

### Create 3–4 big blocks (premium look)
- **Pre-Pro Sprint** (D-14, default 10:00–12:00)
- **Build / Print Sprint** (D-7, default 10:00–12:00)
- **Show Day** (D0, load-in window + live window)
- **Strike / Returns** (D+1, default 10:00–12:00)

Attach tasks by `linkType`:
- QUOTE → Pre-Pro
- BUILD/PRINT → Build Sprint
- INSTALL → Show Day
- STRIKE → Strike/Returns
- INVOICE → post (optional)

If your calendar model doesn’t support focus blocks yet, generate normal scheduled tasks in those windows.

---

## Task generation templates (MVP)
Generate tasks per **budget line item category** (or heuristics from title/flags).

### Category → lifecycle tasks
**Rentals / AV**
- QUOTE → PROCURE → INSTALL → STRIKE → INVOICE

**Scenic / Fabrication**
- (QUOTE optional) → BUILD → INSTALL → (STRIKE optional) → INVOICE

**Graphics / Print**
- QUOTE → BUILD/PRINT → INSTALL → (STRIKE optional) → INVOICE

**Permits / Insurance**
- PROCURE → INVOICE

**Fees / Tax / CC fee / Markup / Contingency**
- **No tasks by default** (avoid forcing tasks on pure accounting lines)

### Task fields
Each generated task:
- `title` (templated)
- `budgetItemId` (primary link)
- `budgetLinkType` (QUOTE/PROCURE/BUILD/INSTALL/STRIKE/INVOICE)
- `status` = TODO
- optional `assignee` = null
- scheduled start/end if Plan enabled + event date provided

---

## Data model note (current MVP storage)
You currently store primary link on Task (e.g., `budgetItemId` + `budgetLinkType`) plus optional secondary links.
This is fine for MVP; PlanDraft should target these same fields.

(Do not add a join table in this PR unless needed—keep it shippable.)

---

## PR plan (Codex)
### PR1 — Ship “Conjure Plan” (Budget Spellbook → full plan)
- Add Overview CTA: `Conjure Plan`
- Add Outputs row + Event Date + chips
- Add Plan preview tab + conjure animation
- Generate tasks + schedule + links from Budget Spellbook
- Apply creates: budget items + tasks + calendar blocks + links
- Budget rows show Work counts + coverage meter (at least skeleton, clickable missing step)

### PR2 — Task Spellbook → optional Budget suggestions (later)
- Only show if cost language detected
- Propose line items (prices blank if unknown)
- Apply creates budget + links

---

## Acceptance criteria
- Paste scope + pick event date → Apply
- Budget lines created
- Calendar populated through **strike**
- Tasks are linked to costs (task popover shows Cost row set)
- Budget rows show **Work coverage** with one-click missing-step creation
- Risks/readiness badges exist and link to correct filtered views
- Fees/tax/contingency/markup lines generate **no tasks** by default
