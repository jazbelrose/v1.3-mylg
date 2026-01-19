# Task Status Transition Behavior

## PATCH Handler Restrictions

The generic PATCH endpoint (`/projects/{projectId}/tasks/{taskId}`) has strict restrictions on status transitions:

### Blocked Transitions (via PATCH)
- `in_review` ← Any status
- `needs_changes` ← Any status
- `done` ← Any status

Do **not** use the generic PATCH endpoint to move a task into `in_review`, `needs_changes`, or `done`. Those transitions must go through the dedicated review endpoints below.

### Allowed Transitions (via PATCH)
- `in_progress` ← `todo`, `needs_changes`, `in_progress`

### Authorization for PATCH status changes
Only admins, assignees, or the task creator can move a task to `in_progress`.

### Error Messages
- `"Status transition requires a dedicated endpoint"` - blocked transitions
- `"Unsupported status transition"` - any other disallowed status change attempt
- `"Invalid status transition"` - invalid current-state → next-state attempt

## Dedicated Endpoints

### Review Transition (Unified)
- **Endpoint**: `POST /projects/{projectId}/tasks/{taskId}/review-transition`
- **Function**: `reviewTransitionTask(projectId, taskId, { action, note?, reviewerId? })`
- **Actions**:
  - `submit_for_review`: moves task into `in_review` and appends to `thread[]`
  - `request_changes`: moves task into `needs_changes` (requires `note`) and appends to `thread[]`
  - `approve`: keeps task `in_review` but sets `reviewState = "approved"` (optional `note`) and appends to `thread[]`
  - `mark_done`: moves task into `done` (optional `note`) and appends to `thread[]` (admins can mark done even if not already `in_review`)

### Role Permissions (Review)
- `submit_for_review`: assignee, creator, or admin
- `request_changes`: admin only
- `approve`: admin only
- `mark_done`: admin only (works even when not already `in_review`)

## Viewing Completed Tasks

Completed tasks remain in `done` status. Use the **Sweep Done** feature in the calendar view to hide completed items from the current view without changing task history. This is a view operation, not a workflow state change.

## Full Allowed Transitions (from `tasksDal.mjs`)

```js
const allowedTransitions = {
  todo: ["in_progress", "in_review"],
  in_progress: ["in_review"],
  in_review: ["done", "needs_changes"],
  needs_changes: ["in_progress", "in_review"],
  done: ["needs_changes"],
};
```
