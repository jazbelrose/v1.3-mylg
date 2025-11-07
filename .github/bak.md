Keep (MVP)

Status flow: todo → in_review → done/needs_changes → archived

Endpoints: review/request, review/approve, review/request_changes, archive, unarchive

UI: “Completed” (with 7d | 30d | All), Submit for review, Approve/Request changes, Archive/Unarchive

Notifs: only for review actions (request/approve/changes)

Defer (cut for simplicity)

New GSI (statusSortGSI) → use existing queries for now

Bulk archive ops & perf tests

WebSocket dedupe/advanced formatting for review notifs (basic is fine)

Full E2E/load tests (add later)

Minimal changes to implement

Data (DDB):

Add: status, completedAt, reviewerId, reviewRequestedAt, reviewedAt, reviewNote, needsChangesNote, archived (or just use status='archived'), archivedAt, archivedById

Optional: statusSortKey = "${status}##${dueDate ?? 'no-due'}##${taskId}" (compute, no GSI yet)

One-time backfill: set archived=false, fill completedAt where status='done'

Backend (routes & guards):

POST /projects/:pid/tasks/:tid/review/request → in_review (+ reviewerId?, reviewRequestedAt)

POST …/review/approve → done (+ completedAt, reviewedAt)

POST …/review/request_changes → needs_changes (+ needsChangesNote, reviewedAt)

POST …/archive → status='archived' (+ archived*)

POST …/unarchive → status='done' (or last active status)

Keep PATCH for non-status fields; reject status in generic patch

Emit simple notifications on the three review endpoints only

Frontend (tiny swaps):

Rename “Completed this week” → Completed + pills 7d | 30d | All

Assignee button → Submit for review (calls review/request)

Reviewer/Admin: Approve / Request changes

Overflow on done: Archive / in archived list: Unarchive

Add Show: Active | Archived | All toggle; default excludes archived

Allowed transitions (shared):

type S='todo'|'in_progress'|'in_review'|'needs_changes'|'done'|'archived';
const allowed: Record<S,S[]> = {
  todo:['in_progress','in_review'],
  in_progress:['in_review'],
  in_review:['done','needs_changes'],
  needs_changes:['in_progress','in_review'],
  done:['archived','needs_changes'],
  archived:['done'],
};


API wrappers (drop-in):

export const requestTaskReview = (p,t,b)=>apiFetch('POST',`/projects/${p}/tasks/${t}/review/request`,b);
export const approveTask       = (p,t,b)=>apiFetch('POST',`/projects/${p}/tasks/${t}/review/approve`,b);
export const requestTaskChanges= (p,t,b)=>apiFetch('POST',`/projects/${p}/tasks/${t}/review/request_changes`,b);
export const archiveTask       = (p,t)  =>apiFetch('POST',`/projects/${p}/tasks/${t}/archive`);
export const unarchiveTask     = (p,t)  =>apiFetch('POST',`/projects/${p}/tasks/${t}/unarchive`);
