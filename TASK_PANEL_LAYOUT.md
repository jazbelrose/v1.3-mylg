# Task Details Panel - Layout Structure

## Desktop Layout (≥1024px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Map Layer (Full Screen)                         │
│                                                                         │
│  ┌──────────────────────┐                    ┌─────────────────────┐   │
│  │  Task List Drawer    │                    │  Details Panel      │   │
│  │  (Left Side)         │                    │  (Right Side)       │   │
│  │  30-34vw width       │                    │  42vw width         │   │
│  │                      │                    │                     │   │
│  │  [All tasks header]  │                    │  [X] Task Details   │   │
│  │  [Filters & Search]  │                    │                     │   │
│  │                      │                    │  Project: [Select]  │   │
│  │  ┌────────────────┐  │                    │  Title: [Input]     │   │
│  │  │ Task Item      │  │                    │  Status: [Select]   │   │
│  │  │ ⚫ Active       │  │     MAP VISIBLE    │  Due: [Date]        │   │
│  │  └────────────────┘  │     IN BETWEEN     │  Location: [Input]  │   │
│  │  ┌────────────────┐  │                    │  Notes: [Textarea]  │   │
│  │  │ Task Item      │  │                    │                     │   │
│  │  └────────────────┘  │                    │  [Delete] [Save]    │   │
│  │  ┌────────────────┐  │                    │                     │   │
│  │  │ Task Item      │  │                    │                     │   │
│  │  └────────────────┘  │                    │                     │   │
│  │                      │                    │                     │   │
│  └──────────────────────┘                    └─────────────────────┘   │
│                                                                         │
│         [Map markers and active task card shown in center]             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### When Details Panel Opens:
1. Task drawer SHRINKS from 34vw → 30vw
2. Details panel SLIDES IN from right (42vw)
3. Map remains visible in the middle
4. Total: ~72vw occupied, ~28vw for map visibility

### Animation:
- Panel slides with spring physics (stiffness: 380, damping: 38)
- Smooth 300-400ms transition
- Task drawer width animates simultaneously

---

## Mobile Layout (<1024px)

```
┌─────────────────────────────────────────┐
│          Map Layer (Full Screen)        │
│                                         │
│      [Map with task markers]            │
│                                         │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Bottom Sheet / Drawer            │  │
│  │  ═══ (drag handle)                │  │
│  │                                   │  │
│  │  All tasks                        │  │
│  │  [Filters] [Search]               │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Task Item [Edit] button     │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘

When [Edit] clicked → MODAL OPENS:

┌─────────────────────────────────────────┐
│  ████████████████████████████████████   │ ← Dark overlay
│  ████████████████████████████████████   │
│  ┌───────────────────────────────────┐  │
│  │  ═══ (drag to dismiss)            │  │
│  │  Edit Task                        │  │
│  │                                   │  │
│  │  Project: [Select]                │  │
│  │  Title: [Input]                   │  │
│  │  Status: [Select]                 │  │
│  │  ...                              │  │
│  │                                   │  │
│  │  [Delete] [Save]                  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Mobile Behavior:
- KEEPS original modal pattern (familiar UX)
- Swipe down to dismiss
- Full overlay backdrop
- Bottom sheet style with rounded top corners

---

## Key Differences: Desktop vs Mobile

| Feature | Desktop (≥1024px) | Mobile (<1024px) |
|---------|-------------------|------------------|
| **Edit UI** | Right-side panel | Modal overlay |
| **Dismissal** | X button in header | Swipe down / backdrop |
| **Context** | List + map visible | Modal only (overlay) |
| **Animation** | Slide from right | Slide from bottom |
| **Layout** | Side-by-side | Stacked layers |
| **Map Visibility** | Always visible | Hidden by modal |

---

## Component Structure

```
GlobalTaskDrawer
├─ Overlay (fixed full screen)
│  ├─ Map Layer
│  │  └─ MapComponent with markers
│  │
│  ├─ Task List Drawer (left side on desktop)
│  │  ├─ Header + Actions
│  │  ├─ Filters & Search
│  │  └─ Task List Items
│  │
│  └─ Details Panel (desktop only, conditional)
│     └─ QuickCreateTaskModal (embedMode=true)
│        ├─ Close button (X)
│        ├─ Form fields
│        └─ Actions
│
└─ QuickCreateTaskModal (mobile only, portal)
   └─ Overlay + Modal with drag handle
```

---

## State Management

```typescript
// Desktop panel state
const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
const [detailsTask, setDetailsTask] = useState<Task | null>(null);

// Mobile modal state (preserved)
const [quickCreateOpen, setQuickCreateOpen] = useState(false);
const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

// Responsive detection
const [isDesktop, setIsDesktop] = useState(false); // ≥1024px

// Logic
handleTaskEdit = (task) => {
  if (isDesktop) {
    setDetailsTask(task);
    setDetailsPanelOpen(true);
  } else {
    setTaskToEdit(task);
    setQuickCreateOpen(true);
  }
}
```
