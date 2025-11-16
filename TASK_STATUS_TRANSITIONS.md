# Task Status Transition Behavior

## PATCH Handler Restrictions

The generic PATCH endpoint (`/projects/{projectId}/tasks/{taskId}`) has strict restrictions on status transitions:

### Blocked Transitions (via PATCH)
- `in_review` ← Any status
- `needs_changes` ← Any status
- `done` ← Any status
- `archived` ← Any status

> **Reminder:** Do **not** use the generic PATCH endpoint to move a task into
> `in_review`, `needs_changes`, `done`, or `archived`. Those transitions must go
> through the dedicated review/archive endpoints defined below.

### Allowed Transitions (via PATCH)
- `in_progress` ← `todo`, `needs_changes`, `in_progress`

### Authorization for PATCH status changes
Only admins, assignees, or the task creator can move a task to `in_progress`.

### Error Messages
- `"Status transition requires a dedicated endpoint"` - for blocked transitions
- `"Unsupported status transition"` - for any other status change attempt
- `"Invalid status transition"` - when trying to move from an invalid current state

## Dedicated Endpoints

All other status transitions must use specific endpoints:

### Request Review
- **Endpoint**: `POST /projects/{projectId}/tasks/{taskId}/review/request`
- **Function**: `requestTaskReview(projectId, taskId, { note?, reviewerId? })`
- **Transitions**: `todo` → `in_review`, `in_progress` → `in_review`, `needs_changes` → `in_review`

### Approve Task
- **Endpoint**: `POST /projects/{projectId}/tasks/{taskId}/review/approve`
- **Function**: `approveTask(projectId, taskId, { note? })`
- **Transitions**: `in_review` → `done`

### Request Changes
- **Endpoint**: `POST /projects/{projectId}/tasks/{taskId}/review/request_changes`
- **Function**: `requestTaskChanges(projectId, taskId, { note? })`
- **Transitions**: `in_review` → `needs_changes`

### Archive Task
- **Endpoint**: `POST /projects/{projectId}/tasks/{taskId}/archive`
- **Function**: `archiveTask(projectId, taskId)`
- **Transitions**: `done` → `archived`

### Unarchive Task
- **Endpoint**: `POST /projects/{projectId}/tasks/{taskId}/unarchive`
- **Function**: `unarchiveTask(projectId, taskId)`
- **Transitions**: `archived` → `done`

## Full Allowed Transitions (from tasksDal.mjs)

```javascript
const allowedTransitions = {
  todo: ["in_progress", "in_review"],
  in_progress: ["in_review"],
  in_review: ["done", "needs_changes"],
  needs_changes: ["in_progress", "in_review"],
  done: ["archived", "needs_changes"],
  archived: ["done"],
};
```

## Key Points

1. **PATCH is for field updates only** - use dedicated endpoints for status transitions
2. **No cross-project moves** - tasks cannot be moved between projects via API
3. **Server-side enforcement** - all transitions are validated server-side
4. **Role-based permissions** - only authorized users can trigger certain transitions

## Frontend Implementation

The frontend correctly implements this workflow in most places:

- **Button text is context-aware**: Shows "Done" for reviewers/admins, "Submit for review" for assignees
- **Proper API calls**: Uses `approveTask()` for reviewers, `requestTaskReview()` for assignees
- **Error handling**: Now includes user-visible error messages and proper state management

### UI Improvements Made

✅ **Added toast notifications** for success/error feedback  
✅ **Proper error messages** for different failure scenarios (403, 409, etc.)  
✅ **Loading state management** - buttons reset on error  
✅ **Context-aware messaging** - different success messages for assignees vs reviewers  

### Remaining Issues

⚠️ **Calendar component** still uses old `updateTask()` directly and will fail for assignees  
⚠️ **QuickCreateTaskModal** allows status changes that may be blocked by PATCH restrictions  

### Error Messages Now Shown

- **Success**: "Task marked as done!" or "Task submitted for review!"
- **403 Forbidden**: "You don't have permission to perform this action."
- **409 Conflict**: "Task is not in the correct state for this action."
- **Other errors**: "Failed to update task. Please try again."</content>
<parameter name="filePath">d:\MYLG\App\v1.3-mylg\TASK_STATUS_TRANSITIONS.md