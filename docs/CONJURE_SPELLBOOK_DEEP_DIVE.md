# Conjure & Spellbook Features — Complete Deep Dive

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Entry Points](#entry-points)
4. [Generation Pipeline](#generation-pipeline)
5. [Data Sources](#data-sources)
6. [Budget Variants](#budget-variants)
7. [Apply Flow](#apply-flow)
8. [UI Components](#ui-components)
9. [Database Schema](#database-schema)
10. [Example Flows](#example-flows)
11. [Current Limitations](#current-limitations)
12. [Summary](#summary)

---

## Overview

**Conjure & Spellbook** is a sophisticated AI-assisted planning system that transforms a simple scope description (plain text) into a fully structured budget, timeline, and task plan in one click.

### Key Facts
- ✅ **No LLM APIs** in current MVP (uses heuristic parsing & regex inference)
- ✅ **Fast, deterministic, cost-free** generation
- ✅ **Professional, production-ready** output
- ✅ **Budget ↔ Task ↔ Calendar** fully linked
- ✅ **5 competing budget variants** (lean → aggressive-margin)
- ✅ **Work coverage tracking** per budget line per stage

---

## Architecture

### High-Level Data Flow

```
User Input (Text)
        ↓
    [Parsing]
        ↓
  [Infer Parameters: crew, days, drape, uplights, markup, contingency]
        ↓
  [Build Budget Variants (5 competing models)]
        ↓
  [User Selects Variant]
        ↓
  [Generate Focus Blocks & Task Lifecycle]
        ↓
  [Create Budget Items → Tasks → Calendar → Links]
        ↓
  [Project is "conjured": ready to execute]
```

### System Layers

| Layer | Files | Purpose |
|---|---|---|
| **UI Modal** | `BudgetSpellbookModal.tsx` | User input, preview, variant selection |
| **Parsing** | `budgetSpellbook.ts` | Extract parameters via regex |
| **Generation** | `budgetSpellbook.ts` | Build 5 budget variants |
| **Planning** | `planDraft.ts` | Create focus blocks & task templates |
| **Application** | `BudgetPage.tsx` | Create items in DB, emit WebSocket updates |
| **API** | `api.ts` | Calls to `/projects`, `/tasks`, DynamoDB |

---

## Entry Points

### 1. Budget Spellbook
- **Location**: Budget tab → "Spellbook" button
- **Default Outputs**: ✅ Budget only
- **Use Case**: User wants structured line items only
- **File**: [BudgetSpellbookModal.tsx](../../frontend/src/dashboard/project/features/budget/components/BudgetSpellbookModal.tsx)

### 2. Task Spellbook
- **Location**: Calendar tab → "Spellbook" button
- **Default Outputs**: ✅ Calendar Plan ✅ Tasks
- **Use Case**: User wants to plan timeline & workflow
- **File**: [BudgetSpellbookModal.tsx](../../frontend/src/dashboard/project/features/budget/components/BudgetSpellbookModal.tsx) (same modal, different context)

### 3. Conjure Plan
- **Location**: Overview banner (bottom-right corner)
- **Default Outputs**: ✅ Budget ✅ Calendar Plan ✅ Links
- **Use Case**: "Silicon Valley magic"—full project birth in one click
- **File**: [ProjectPoster.tsx](../../frontend/src/dashboard/project/features/overview/components/ProjectPoster.tsx#L311-L325)

---

## Generation Pipeline

### Phase 1: Input Parsing

**File**: [budgetSpellbook.ts](../../frontend/src/dashboard/project/features/budget/lib/budgetSpellbook.ts#L110-L180)

**Input**: Any text—scope notes, run-of-show, emails, shopping lists, PDFs (copy-pasted)

**Function**: `parseBudgetSpellbookInput(input: string): BudgetSpellbookParseResult`

#### A. Shopping List Extraction
```typescript
const fragments = splitToFragments(normalized)
  .filter((line) => line.length >= 3)
  .slice(0, 80);  // Up to 80 fragments as rough line candidates
```

#### B. Inference Heuristics (Regex Patterns)

| Parameter | Regex | Example | Fallback |
|---|---|---|---|
| **Install Days** | `\b(\d+)\s*(?:days?)\s*(?:install\|setup\|load.?in)` | "2 days install" | 1 day |
| **Crew Count** | `\b(\d{1,2})\s*(?:crew\|hands\|techs?)` | "8 crew" | 4–6 (smart default) |
| **Drape Footage** | `pipe\s*&\s*drape.*?(\d{2,5})\s*(?:'\|ft)` | "drape 200'" | 0 (none) |
| **Uplights** | `(\d{1,2})\s*(?:uplights?\|uplight)` | "12 uplights" | 0 |
| **Markup %** | `(\d{1,2})\s*%.*?(?:markup\|margin)` | "25% markup" | null (user sets) |
| **Contingency %** | `(\d{1,2})\s*%.*?contingency` | "10% contingency" | null (user sets) |
| **Event Type** | `/\b(scenic\|graphic\|av\|travel\|truck)\b/i` | "scenic + drape" | boolean flags |

**Output**: `BudgetSpellbookParseResult`
```typescript
{
  input: string;                           // normalized user text
  inferred: {
    installDays: number | null;            // 1–30
    markupTarget: number | null;           // 0.0–2.0
    contingencyPct: number | null;         // 0.0–1.0
    crewCount: number | null;              // 1–50
    drapeFeet: number | null;              // 0–5000
    uplightCount: number | null;           // 0–500
    hasScenic: boolean;
    hasGraphics: boolean;
    hasAv: boolean;
    hasTravel: boolean;
    hasTrucking: boolean;
  };
  shoppingList: string[];                  // up to 80 fragments
}
```

---

### Phase 2: Budget Line Generation

**File**: [budgetSpellbook.ts](../../frontend/src/dashboard/project/features/budget/lib/budgetSpellbook.ts#L350–750)

**Function**: `buildBudgetSpellbookVariants(parseResult, options): BudgetSpellbookVariant[]`

Once parsed, the system builds **up to 5 competing budget variants** simultaneously.

#### Variant Types

| ID | Label | Markup | Contingency | Detail | Best For |
|---|---|---|---|---|---|
| **lean** | Lean (essentials only) | 15% | 0% | Minimal | Cost-sensitive, internal-only |
| **producer-standard** | Producer-Standard (default) | 25% | 10% | Balanced | **Most events** ← recommended |
| **vendor-ready** | Vendor-Ready (detailed breakdown) | 25% | 10% | Maximum | Send to subvendors for pricing |
| **client-facing** | Client-Facing (summary groups) | 25% | 10% | Grouped | Invoice presentation |
| **ops-ready** | Ops-Ready (cost-focused) | 20% | 5% | Cost detail | Operations planning |
| **aggressive-margin** | Aggressive Margin (high margin) | 35% | 15% | Summary | Premium/complex events |

#### Line Item Generation Logic

**For each shopping list fragment:**

1. **Classify** into category
   - Categories: LABOR, FABRICATION, GRAPHICS, RENTALS, AUDIO-VISUAL, LIGHTING, TRAVEL, TRUCKING, PERMITS-INSURANCE, PARKING-FUEL-TOLLS, PRODUCTION-MGMT, CONTINGENCY-MISC, DECOR, DESIGN

2. **Estimate** quantity & unit cost using:
   - Inferred parameters (crewCount, installDays, drapeFeet, etc.)
   - Hardcoded defaults (crew rates, per-unit costs)
   - Cost lookup (based on category)

3. **Apply markup** (default 25% or extracted from text)

4. **Allocate to groups**
   - Area Group: SHOP, VENUE, TRAVEL, PRE-PRO
   - Invoice Group: PRODUCTION, VENDORS, CLIENT REIMBURSABLE

#### Cost Estimation Model (Defaults)

```typescript
const baseDefaults = {
  internalCrewDayRate: 520,        // $/day
  outsourcedCrewDayRate: 650,      // $/day (if crew model = "outsourced")
  leadDayRate: 780,                // $/day
  pmDayRate: 850,                  // $/day
  drapeFeetCost: 6,                // $/foot
  uplightCost: 85,                 // $/unit
};

// Inferred from user input
installDays: 1–30;
crewCount: 1–50;
drapeFeet: 0–5000;
uplightCount: 0–500;
```

#### Example Generation

**Input**: `"MB2 Tahoe, scenic + drape + labor, 2 days install, 25% markup, 8 crew"`

**Parsed**:
```
inferred: {
  installDays: 2,
  crewCount: 8,
  drapeFeet: null,
  markupTarget: 0.25,
  hasScenic: true
}
```

**Generated Lines** (producer-standard):
```
[
  {
    category: "LABOR",
    description: "Crew (8×2 days)",
    quantity: 16,
    unit: "day-units",
    itemBudgetedCost: 520,
    itemMarkUp: 0.25,
    itemFinalCost: 16 × 520 × 1.25 = $10,400
  },
  {
    category: "FABRICATION",
    description: "Scenic build",
    quantity: 1,
    unit: "lot",
    itemBudgetedCost: 2500,
    itemMarkUp: 0.25,
    itemFinalCost: 1 × 2500 × 1.25 = $3,125
  },
  {
    category: "RENTALS",
    description: "Pipe & drape",
    quantity: 1,
    unit: "lot",
    itemBudgetedCost: 1200,
    itemMarkUp: 0.25,
    itemFinalCost: 1 × 1200 × 1.25 = $1,500
  },
  {
    category: "CONTINGENCY-MISC",
    description: "CONTINGENCY",
    quantity: 1,
    unit: "lot",
    itemBudgetedCost: 1502,  // (10,400 + 3,125 + 1,500) × 10%
    itemMarkUp: 0,
    itemFinalCost: $1,502.50
  }
]

Total Budgeted: $15,025
Total Final (with markup): $18,775.50
Effective Markup: 25%
```

#### Line Item Structure

```typescript
type BudgetSpellbookLineDraft = {
  id: string;                    // draft ID (used for mapping to DB IDs later)
  category: string;              // LABOR, RENTALS, GRAPHICS, etc.
  description: string;           // user-visible name
  quantity: number;              // count of units
  unit: string;                  // "days", "feet", "units", "lot"
  itemBudgetedCost: number;      // base cost per unit
  itemMarkUp: number;            // 0.25 = 25%
  areaGroup: "SHOP" | "VENUE" | "TRAVEL" | "PRE-PRO";
  invoiceGroup: "PRODUCTION" | "VENDORS" | "CLIENT REIMBURSABLE";
  packageLabel?: string;         // e.g., "Contingency", "Summary"
  meta?: {
    source?: "inferred" | "shopping-list" | "defaults";
    confidence?: 0–1;            // 0.3–0.9
  };
};
```

---

### Phase 3: Task & Calendar Generation

**File**: [planDraft.ts](../../frontend/src/dashboard/project/features/budget/lib/planDraft.ts#L115–300)

**Function**: `buildPlanDraft(budgetLines, assumptions): PlanDraft`

Once budget lines are selected, **tasks are auto-generated per category lifecycle** and **scheduled into focus blocks** (calendar sprints).

#### Lifecycle Templates (Category → Task Stages)

**RENTALS / AV / LIGHTING**
```
QUOTE → PROCURE → INSTALL → STRIKE → INVOICE
D-14 (prepro) → D-14 (prepro) → D0 (show) → D+1 (strike) → D+1 (strike)
```

**SCENIC / FABRICATION / DECOR**
```
BUILD → INSTALL → STRIKE → INVOICE
D-7 (build) → D0 (show) → D+1 (strike) → D+1 (strike)
```

**GRAPHICS / SIGNAGE / PRINT**
```
QUOTE → BUILD/PRINT → PACK+CONFIRMATIONS → INSTALL → INVOICE
D-14 (prepro) → D-7 (build) → D-2 (pack) → D0 (show) → D+1 (strike)
```

**PERMITS / INSURANCE**
```
PROCURE → INVOICE
D-14 (prepro) → D+1 (strike)
```

**FEES / TAX / CONTINGENCY / MARKUP**
```
NO TASKS (accounting-only lines)
```

#### Focus Block Windows (Calendar Anchors)

Anchored to **Event Day (D0)** and **Strike Day (D+1)**:

| Block | Date | Default Time | Purpose |
|---|---|---|---|
| **Pre-Pro Sprint** | D-14 | 09:00–17:00 | Quotes, orders, planning |
| **Build Sprint** | D-7 | 09:00–17:00 | Fabrication, print production |
| **Packing Sprint** | D-2 | 09:00–17:00 | Confirmations, pack lists |
| **Show Day** | D0 | user-configurable | Load-in + live event |
| **Strike/Returns** | D+1 | 09:00–17:00 | Teardown, vendor returns |

#### Task Packing (Fit tasks into focus blocks)

Each task is assigned a **planned duration** (20–120 minutes, user-configurable) and packed into its focus block using `packTasksIntoFocusBlock`:
- Distributes tasks evenly within block time window
- Respects min/max task duration constraints
- Maintains logical sequence (QUOTE → PROCURE → BUILD → INSTALL → STRIKE → INVOICE)

#### PlanDraft Output

```typescript
type PlanDraft = {
  assumptions: PlanDraftAssumptionChip[];    // event date, window, task durations
  warnings: Array<{ code: string; message: string }>;
  focusBlocks: PlanDraftFocusBlock[];        // 5 calendar blocks
  tasks: PlanDraftTaskItem[];                // all generated tasks
};

type PlanDraftFocusBlock = {
  key: "prepro" | "build" | "pack" | "show" | "strike";
  draftId: string;
  title: string;
  dateIso: string;                          // YYYY-MM-DD
  startLocalTime: string;                   // HH:MM
  endLocalTime: string;                     // HH:MM
};

type PlanDraftTaskItem = {
  id: string;
  title: string;                            // e.g., "Quote: Pipe & Drape"
  dateIso: string;                          // YYYY-MM-DD
  focusBlockDraftId: string;                // which block to attach to
  order: number;                            // sequence within block
  plannedMinutes?: number;                  // 20–120
  budgetLineDraftId: string;                // link back to budget line
  linkType: "quote" | "procure" | "build" | "install" | "strike" | "invoice";
};
```

---

## Data Sources

### Where Do Budget Numbers Come From?

#### Labor Costs
| Type | Rate | Calculation | Example |
|---|---|---|---|
| **Internal Crew** | $520/day | crewCount × installDays × 520 | 8 crew × 2 days × $520 = $8,320 |
| **Outsourced Crew** | $650/day | crewCount × installDays × 650 | 8 crew × 2 days × $650 = $10,400 |
| **Lead** | $780/day | installDays × 780 | 2 days × $780 = $1,560 |
| **PM** | $850/day | installDays × 850 | 2 days × $850 = $1,700 |

#### Material Costs
| Item | Cost | Calculation | Example |
|---|---|---|---|
| **Pipe & Drape** | $6/foot | drapeFeet × 6 | 200 ft × $6 = $1,200 |
| **Uplights** | $85/unit | uplightCount × 85 | 12 × $85 = $1,020 |
| **Scenic/Fab** | $1,500–$5,000 | Base + adjustments | ~$2,500 |

#### Markup & Contingency
| Item | Default | Range | Calculation |
|---|---|---|---|
| **Markup** | 25% | 15–35% | subtotal × markup% |
| **Contingency** | 10% | 0–15% | subtotal × contingency% |

#### Hardcoded Defaults

```typescript
// In baseDefaults()
const internalCrewDayRate = 520;
const outsourcedCrewDayRate = 650;
const leadDayRate = 780;
const pmDayRate = 850;
const drapeFeetCost = 6;
const uplightCost = 85;
```

### What's NOT Estimated (Future Roadmap)

❌ **No LLM Integration** (Bedrock/Claude) in current MVP
- No AI-driven cost estimation
- No vendor database lookup
- No venue-based pricing adjustments (NYC vs. LA)
- No historical project cost analysis
- No automatic shipping calculations

---

## Budget Variants

When user pastes scope, **all 5 variants are built simultaneously**, each with different cost strategies. User picks one via radio button.

### Variant Comparison Table

| Aspect | Lean | Producer-Std | Vendor-Ready | Client-Facing | Ops-Ready | Aggressive |
|---|---|---|---|---|---|---|
| **Markup** | 15% | 25% | 25% | 25% | 20% | 35% |
| **Contingency** | 0% | 10% | 10% | 10% | 5% | 15% |
| **Detail Level** | Minimal | Balanced | Maximum | Summary | Cost-focused | Summary |
| **Line Count** | ~8–12 | ~12–18 | ~25–35 | ~6–10 | ~15–20 | ~8–12 |
| **Use Case** | Internal budget | **Default** | Vendor RFQ | Invoice | Ops planning | Premium events |
| **Total Markup Effect** | 15% | ~36% | ~38% | ~36% | ~27% | ~51% |

### How Variants Differ

**Input**: `"2-day scenic build, 8 crew, $2500 fab, 25% markup"`

| Variant | Labor | Scenic | Total Budgeted | Total Final | Effective Markup |
|---|---|---|---|---|---|
| **lean** | $8,320 | $2,500 | $10,820 | $10,820 | 0% (no contingency) |
| **producer-std** | $8,320 | $2,500 | $10,820 | $13,525 | 25% |
| **vendor-ready** | $8,320 | $2,500 + detail | $11,500 | $14,375 | ~25% |
| **client-facing** | $8,320 | $2,500 | $10,820 | $13,525 | 25% (grouped) |
| **ops-ready** | $8,320 | $2,500 | $10,820 | $12,968 | 20% |
| **aggressive** | $8,320 | $2,500 | $10,820 | $16,730 | 35% |

**User selects one** → that variant's lines are applied to the budget.

---

## Apply Flow

**File**: [BudgetPage.tsx](../../frontend/src/dashboard/project/features/budget/pages/BudgetPage.tsx#L650–850)

When user clicks **Apply**:

### Step 1: Create/Update Budget Lines

```
FOR each draft line in selected variant:
  1. Check if similar line exists (Jaccard similarity ≥ 72%)
  2. IF merge mode + match found:
     → UPDATE existing line with draft values
  3. ELSE:
     → CREATE new line with UUID, elementKey, elementId
  4. Map draftId → created budgetItemId (for later task linking)
```

**Similarity Matching** (for merge mode):
- Compare category + description tokens
- Jaccard similarity = intersection / union of tokens
- If ≥ 72% match, merge instead of duplicate

### Step 2: Create Focus Blocks (if Calendar Plan enabled)

```
FOR each focus block in plan (Prepro, Build, Pack, Show, Strike):
  1. CREATE task with:
     - kind = "focus_block"
     - title = "Pre-Pro Sprint", "Build Sprint", etc.
     - durationMinutes = window end time - start time
     - startAt = dateIso + startLocalTime
     - endAt = dateIso + endLocalTime
  2. Map blockDraftId → created taskId
```

**Example**:
```
Pre-Pro Sprint (Jan 6, 2026)
- durationMinutes: 480 (9:00 AM to 5:00 PM)
- startAt: 2026-01-06T09:00:00
- endAt: 2026-01-06T17:00:00
```

### Step 3: Create Child Tasks (if Calendar Plan enabled)

```
FOR each task in plan:
  1. Resolve budgetItemId from draftIdToBudgetItemId map
  2. IF links enabled:
     → set primaryBudgetLineItemId + budgetLinkType
  3. Add to childPayloadsByFocusId[focusBlockTaskId]
```

### Step 4: Attach Tasks to Focus Blocks

```
FOR each focus block:
  1. CREATE all child tasks via createTasksBulk(projectId, children)
  2. UPDATE focus block with:
     - focusChildTaskIds = [taskId1, taskId2, ...]
     - focusChecklist = [{ taskId, title }, ...]
```

### Step 5: Create Standalone Tasks (not in blocks)

```
IF any tasks don't fit in blocks:
  createTasksBulk(projectId, standalonePayloads)
```

### Final Result

After apply:
- ✅ Budget header updated with totals
- ✅ Line items created/updated
- ✅ Focus blocks created as container tasks
- ✅ Child tasks created under each block
- ✅ Task ↔ Budget links established
- ✅ WebSocket notifications sent to all connected users
- ✅ Project is "conjured" and ready to execute

---

## UI Components

### Main Modal: BudgetSpellbookModal

**File**: [BudgetSpellbookModal.tsx](../../frontend/src/dashboard/project/features/budget/components/BudgetSpellbookModal.tsx)

#### Layout

```
┌─────────────────────────────────────────────────────┐
│  Budget Spellbook                            [X]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [LEFT PANE]              │  [RIGHT PANE]         │
│  ─────────────────────────┼──────────────────────  │
│                           │                        │
│  Paste Input              │ ✅ Budget              │
│  ┌──────────────────────┐ │ ✅ Calendar Plan      │
│  │ Paste anything...    │ │ ✅ Links              │
│  │ scope, run-of-show.. │ │ ─────────────────     │
│  │                      │ │                        │
│  │                      │ │ [Budget] Plan Assumptions
│  │                      │ │                        │
│  │                      │ │ Category Breakdown    │
│  │                      │ │ ┌─ LABOR   $10,400    │
│  │                      │ │ ├─ SCENIC  $3,125     │
│  │                      │ │ ├─ RENTALS $1,500     │
│  │                      │ │ └─ CONTING $1,502     │
│  │                      │ │ ─────────────────     │
│  │                      │ │ Totals:               │
│  │                      │ │ Budgeted: $15,025     │
│  │                      │ │ Final:    $18,775     │
│  │                      │ │ Markup:   25%         │
│  │                      │ │ ─────────────────     │
│  │ N notes • M items    │ │ [Variants]            │
│  └──────────────────────┘ │ ◉ Producer-Standard   │
│                           │ ○ Lean                │
│                           │ ○ Vendor-Ready        │
│                           │ ○ Client-Facing       │
│                           │ ○ Ops-Ready           │
│                           │ ○ Aggressive-Margin   │
│                           │ ─────────────────     │
│                           │ [Apply]               │
│                           │                        │
└─────────────────────────────────────────────────────┘
```

#### Left Pane: Input
- Textarea for scope/run-of-show/notes
- Real-time parsing updates fragment count
- Auto-focus on modal open

#### Right Pane: Preview Tabs

**Tab 1: Budget**
- Totals cards (Budgeted, Final, Effective Markup)
- Category breakdown bar chart
- Line items table (preview)

**Tab 2: Plan** *(only if Calendar Plan output enabled)*
- Animated "conjure" preview (phases 0→1→2)
- Focus block timeline visualization
- Task list packed into blocks
- Warnings/validation messages

**Tab 3: Assumptions**
- Event date input (YYYY-MM-DD, required for scheduling)
- Focus Block window (balanced, compact, extended)
- Min task minutes (default: 20m)
- Max task minutes (default: 120m)
- Load-in/strike duration controls
- Crew call time
- Venue hours
- Markup % (editable)
- Contingency % (editable)
- Confidence indicators (dots) on each chip

#### Outputs Row
```
✅ Budget    ✅ Calendar Plan    ✅ Links
```
- All toggles by entry point
- Constraint: Event date required if Calendar Plan or Links enabled
- Tooltip on disabled Apply button if constraints unmet

#### Variants Rail
- 5 buttons (lean, producer-standard, vendor-ready, client-facing, ops-ready, aggressive-margin)
- Selected variant's lines appear in Budget preview
- Hint text under each variant label

#### Apply Button
- Disabled until: meaningful text (≥3 chars) + event date (if required)
- Apply mode: "add" | "merge" | "replace"
- Loading spinner during apply
- Success toast after apply

---

## Database Schema

### Budget Line Item (`BudgetItem`)

```typescript
{
  budgetItemId: string;                       // LINE-{uuid}
  projectId: string;
  budgetId: string;                           // e.g., "budget-{projectId}"
  
  // Header flag (only header row)
  isHeader?: boolean;                         // true only for budget header
  
  // Line item fields
  category: string;                           // LABOR, RENTALS, GRAPHICS, FABRICATION, etc.
  description: string;                        // user-visible name
  quantity: number;                           // count
  unit: string;                               // "days", "feet", "units", "lot", "hours"
  
  // Cost tracking
  itemBudgetedCost: number;                   // base cost per unit
  itemMarkUp: number;                         // 0.25 = 25%
  itemFinalCost: number;                      // qty × cost × (1 + markup)
  itemActualCost?: number;                    // cost incurred
  itemReconciledCost?: number;                // final negotiated cost
  
  // Grouping
  areaGroup: string;                          // SHOP, VENUE, TRAVEL, PRE-PRO
  invoiceGroup: string;                       // PRODUCTION, VENDORS, CLIENT REIMBURSABLE
  
  // Display
  elementKey: string;                         // unique display key (L1, L2, etc.)
  elementId: string;                          // category-specific ID (LABOR-001)
  paymentStatus?: string;                     // UNPAID, PARTIAL, PAID
  paymentTerms?: string;                      // NET 30, etc.
  
  // Versioning
  revision: number;                           // budget revision number
  
  // Metadata
  createdAt?: string;                         // ISO timestamp
  updatedAt?: string;                         // ISO timestamp
}
```

### Task (`Task`)

```typescript
{
  projectId: string;
  taskId: string;
  
  // Content
  title: string;
  description?: string;
  
  // Status & Type
  status: "todo" | "in_progress" | "done" | "archived";
  kind: "task" | "focus_block";
  cluster?: string;                           // e.g., "Plan" for conjured blocks
  
  // Budget Links
  primaryBudgetLineItemId?: string;           // primary link to budget item
  budgetLinkType?: "quote" | "procure" | "build" | "install" | "strike" | "invoice";
  budgetLinks?: Array<{                       // secondary links
    budgetLineItemId: string;
    budgetLinkType?: string;
  }>;
  
  // Focus Block Hierarchy (for calendar plan)
  focusBlockId?: string;                      // parent focus block ID (if child)
  focusChildTaskIds?: string[];               // children (if focus block)
  focusChecklist?: Array<{                    // checklist items
    taskId: string;
    title: string;
    completed?: boolean;
  }>;
  
  // Scheduling
  dueDate: string;                            // YYYY-MM-DD
  dueAt: string;                              // YYYY-MM-DD (same as dueDate for now)
  startAt?: string;                           // ISO timestamp (if scheduled)
  endAt?: string;                             // ISO timestamp (if scheduled)
  durationMinutes?: number;                   // total duration
  plannedMinutes?: number;                    // planned effort
  
  // Other
  order?: number;                             // sequence within container
  assignee?: string;                          // user ID
  tags?: string[];
  
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}
```

---

## Example Flows

### Example 1: Complete Conjure Plan (Overview)

**User Action**: Clicks "Conjure Plan" on Overview banner

**Input Text**:
```
Event in Denver, 2-day scenic + drape install, 8 crew, 25% markup, 10% contingency
Event date: Jan 20, 2026
```

**System Processing**:

#### Parse
```
installDays: 2
crewCount: 8
markupTarget: 0.25
contingencyPct: 0.10
hasScenic: true
```

#### Generate Budget (producer-standard)
```
LINE 1: Crew labor (16 day-units)
  qty: 16, unit: "days", cost: $520/day, markup: 25%
  → Final: 16 × 520 × 1.25 = $10,400

LINE 2: Scenic build
  qty: 1, unit: "lot", cost: $2,500, markup: 25%
  → Final: 1 × 2,500 × 1.25 = $3,125

LINE 3: Pipe & drape (200 ft assumed)
  qty: 200, unit: "feet", cost: $6/ft, markup: 25%
  → Final: 200 × 6 × 1.25 = $1,500

Subtotal: $15,025
Contingency (10%): $1,502.50
TOTAL FINAL: $16,527.50
Effective Markup: 25%
```

#### Generate Tasks & Calendar
```
Focus Block 1: Pre-Pro Sprint (Jan 6, 09:00–17:00)
  - Task: Quote Scenic
  - Task: Quote Drape
  - Task: Procure Drape

Focus Block 2: Build Sprint (Jan 13, 09:00–17:00)
  - Task: Build Scenic
  - Task: Build Drape

Focus Block 3: Packing Sprint (Jan 18, 09:00–17:00)
  - Task: Pack + Confirmations

Focus Block 4: Show Day (Jan 20, load-in window)
  - Task: Install Scenic
  - Task: Install Drape
  - Task: Load-in crew

Focus Block 5: Strike/Returns (Jan 21, 09:00–17:00)
  - Task: Strike Scenic
  - Task: Strike Drape
  - Task: Return rentals
  - Task: Invoice
```

#### Create Links
```
Quote Scenic → LINE-{uuid-1} (linkType: "quote")
Build Scenic → LINE-{uuid-1} (linkType: "build")
Install Scenic → LINE-{uuid-1} (linkType: "install")
Strike Scenic → LINE-{uuid-1} (linkType: "strike")

Quote Drape → LINE-{uuid-2} (linkType: "quote")
Procure Drape → LINE-{uuid-2} (linkType: "procure")
Install Drape → LINE-{uuid-2} (linkType: "install")
Strike Drape → LINE-{uuid-2} (linkType: "strike")
```

**Result**: Project is fully "conjured" with:
- ✅ 3 budget line items
- ✅ 5 focus blocks (calendar)
- ✅ 11 tasks (all linked to budget items)
- ✅ Ready to execute

### Example 2: Budget Spellbook Only (Tab)

**User Action**: Clicks "Spellbook" on Budget tab

**Input Text**:
```
Signage + branding: 2 AV screens, 5 uplights, designer 3 days
Add 30% markup
```

**System Processing**:

#### Parse
```
uplightCount: 5
hasAv: true
hasGraphics: true
crewCount: null (no crew mentioned)
installDays: 3
markupTarget: 0.30
contingencyPct: null (no contingency)
```

#### Generate Budget Variants
```
Producer-Standard variant:
  - AV Screens (2 units): 2 × $400 × 1.30 = $1,040
  - Uplights (5 units): 5 × $85 × 1.30 = $552.50
  - Designer (3 days): 3 × $780 × 1.30 = $3,042
  - Markup (30% of $1,400): $420
  TOTAL: $5,054.50

Lean variant:
  - Same, no markup → $3,880
  
Aggressive-margin variant:
  - 35% markup + 15% contingency
  TOTAL: $6,850+
```

**User Selects**: Producer-Standard

**User Clicks**: Apply

**Result**: Budget lines created, no tasks (because Calendar Plan not enabled)

---

## Current Limitations

### What's Implemented ✅

- ✅ Regex inference (installDays, crewCount, drapeFeet, uplights, markup, contingency)
- ✅ Hardcoded cost defaults (crew rates, drape cost, uplight cost)
- ✅ Category classification (heuristic pattern matching)
- ✅ Markup & contingency allocation
- ✅ Lifecycle task templates (QUOTE→PROCURE→BUILD→INSTALL→STRIKE→INVOICE)
- ✅ Focus block scheduling (D-14 through D+1)
- ✅ Focus block packing (distribute tasks into time windows)
- ✅ Budget↔Task linking (primaryBudgetLineItemId + budgetLinkType)
- ✅ 5 competing budget variants
- ✅ Work coverage tracking (per budget item per stage)

### What's NOT Yet Implemented ❌

- ❌ **Claude/Bedrock LLM integration** (for intelligent cost estimation, category inference)
- ❌ **Venue-based cost adjustments** (NYC vs. LA pricing multipliers)
- ❌ **Vendor database** (historical costs from past projects)
- ❌ **Automatic shipping/travel cost calculation**
- ❌ **AI task title generation** (currently uses templated "[ACTION]: [ITEM]")
- ❌ **Real-time cost validation** against historical projects
- ❌ **Client-specific rate cards** (different pricing for different clients)

---

## Summary

| Aspect | Current Approach | Status |
|---|---|---|
| **Data Input** | User-pasted text (scope/run-of-show/emails) | ✅ Live |
| **Cost Source** | Hardcoded defaults + regex inference | ✅ Live |
| **Category Detection** | Regex pattern matching | ✅ Live |
| **Budget Generation** | 5 competing variant builders | ✅ Live |
| **Task Generation** | Lifecycle templates (per category) | ✅ Live |
| **Scheduling** | Focus block anchors (D-14 to D+1) | ✅ Live |
| **Linking** | Budget item ↔ task (primary + secondary) | ✅ Live |
| **LLM Integration** | None (future roadmap) | ❌ Not in MVP |
| **Work Coverage** | Tracked per budget item per stage | ✅ Live |
| **Risk Badges** | At-risk (quotes pending), ready (install done) | ✅ Live |

### Key Takeaway

**Conjure & Spellbook is a fast, deterministic, zero-cost system that transforms a simple text description into a fully-structured, production-ready project plan—complete with budget, tasks, calendar, and links—using only regex inference and hardcoded cost models.** No AI APIs required (yet). It's built to be shipped, iterated on, and enhanced with LLM intelligence in future PRs.

---

## File References

| File | Purpose |
|---|---|
| [BudgetSpellbookModal.tsx](../../frontend/src/dashboard/project/features/budget/components/BudgetSpellbookModal.tsx) | Main modal UI |
| [budgetSpellbook.ts](../../frontend/src/dashboard/project/features/budget/lib/budgetSpellbook.ts) | Parsing + variant generation |
| [planDraft.ts](../../frontend/src/dashboard/project/features/budget/lib/planDraft.ts) | Task + calendar generation |
| [BudgetPage.tsx](../../frontend/src/dashboard/project/features/budget/pages/BudgetPage.tsx#L650–850) | Apply logic + DB creation |
| [ProjectPoster.tsx](../../frontend/src/dashboard/project/features/overview/components/ProjectPoster.tsx#L311-L325) | Conjure Plan CTA |
| [budgetUtils.ts](../../frontend/src/shared/utils/budgetUtils.ts) | Budget helpers |
| [budgetTaskLinks.ts](../../frontend/src/shared/utils/budgetTaskLinks.ts) | Budget↔Task linking utilities |

---

## Related Docs

- [CODEX_HANDOFF_SPELLBOOK_MAGIC.md](./CODEX_HANDOFF_SPELLBOOK_MAGIC.md) — Original design doc
- [SLIDES_ARCHITECTURE.txt](../SLIDES_ARCHITECTURE.txt) — Collaboration architecture
- [CAPABILITY_AUDIT_AND_MARKETING_REFACTOR.md](../CAPABILITY_AUDIT_AND_MARKETING_REFACTOR.md) — Feature marketing

---

**Last Updated**: January 18, 2026
**Status**: Production MVP
**Contributors**: Conjure & Spellbook team
