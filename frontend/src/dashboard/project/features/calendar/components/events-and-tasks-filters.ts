export type EventFilter = "all" | "upcoming" | "past";
export type TaskFilter = "all" | "open" | "completed";

export const DEFAULT_EVENT_FILTER: EventFilter = "upcoming";
export const DEFAULT_TASK_FILTER: TaskFilter = "open";

export const EVENT_FILTER_LABELS: Record<EventFilter, string> = {
  all: "All events",
  upcoming: "Upcoming events",
  past: "Past events",
};

export const EVENT_FILTER_SUMMARY: Record<EventFilter, string> = {
  all: "All events",
  upcoming: "Upcoming",
  past: "Past",
};

export const TASK_FILTER_LABELS: Record<TaskFilter, string> = {
  all: "All tasks",
  open: "Open tasks",
  completed: "Completed tasks",
};

export const TASK_FILTER_SUMMARY: Record<TaskFilter, string> = {
  all: "All tasks",
  open: "Open",
  completed: "Completed",
};
