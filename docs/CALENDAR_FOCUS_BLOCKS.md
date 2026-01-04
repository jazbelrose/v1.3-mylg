# Calendar — Focus Blocks vs Stacks (Week view)

This note clarifies why the calendar UI can appear to show “two different focus blocks”.
In reality there is **one Focus Block feature**, plus a separate Week-view **Stack tile** concept that can look similar.

## 1) Focus Block (real feature)
A **Focus Block** is an intentional *container task* that groups multiple tasks (“Time Blocks”) under one parent.

### How it’s represented
A task is treated as a Focus Block if either:
- `task.kind === "focus_block"` (**explicit / new shape**), OR
- it has focus children via `focusChildTaskIds` or `focusChecklist` (**legacy-compatible shape**).

Relevant type fields live here:
- `CalendarTask.kind`
- `CalendarTask.focusChildTaskIds`
- `CalendarTask.focusChecklist`

Source of the task type:
- `frontend/src/dashboard/project/features/calendar/utils.ts`

### What the UI shows
Focus Blocks typically show:
- a progress pill like `0/3` (done children / total children)
- a popover section labeled “Time Blocks” listing the child time blocks

Primary render logic (focus-block detection) is in:
- `frontend/src/dashboard/project/features/calendar/components/WeekGrid.tsx`
- `frontend/src/dashboard/project/features/calendar/components/DayGrid.tsx`

## 2) “Legacy Focus Block” (backward compatibility)
Older data may not set `kind: "focus_block"`, but the UI still treats it as a focus block if it has either:
- `focusChildTaskIds: string[]`
- `focusChecklist: Array<{ taskId: string; title: string }>`

This is intentional: it keeps old focus blocks working without migration.

## 3) Week-view Stack tiles (NOT focus blocks)
Week view also renders **Stack tiles** to reduce clutter when items overlap.

### Overlap Stack
An **Overlap Stack** is created when multiple events/tasks overlap in time.
It can show:
- **multiple avatars** (multi-user overlap)
- **one avatar** (single-user overlap)

This is often what looks like a “multi-user focus block” vs a “single-user multitask focus block”.
Those are typically the *same stack type*, just with different participant counts.

The stack creation logic is in:
- `frontend/src/dashboard/project/features/calendar/components/WeekGrid.tsx`

### TaskStack (exists but currently disabled)
There is also a `taskStack` concept (auto-group many tasks for one user), but it is currently disabled in Week view.
If you’re seeing a single-user “multitask-looking” tile, it’s usually the **Overlap Stack** behavior rather than TaskStack.

## Practical “what am I looking at?” checklist

If the popover shows a section titled **“Time Blocks”** and you see a `0/3`-style progress pill, it’s a **Focus Block**.

If the tile looks like a grouped cluster of overlapping items and shows multiple avatars (or behaves like a collapsed group), it’s a **Week-view Stack tile**.

## Related code entry points
- Task type fields: `frontend/src/dashboard/project/features/calendar/utils.ts`
- Week grid rendering + stacks: `frontend/src/dashboard/project/features/calendar/components/WeekGrid.tsx`
- Day grid rendering: `frontend/src/dashboard/project/features/calendar/components/DayGrid.tsx`
- Focus block popover (“Time Blocks”, actions): `frontend/src/dashboard/project/features/calendar/components/CalendarEntryPopover.tsx`
