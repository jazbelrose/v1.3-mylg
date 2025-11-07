import type { TasksOverviewListItem } from "../hooks/useTasksOverview";

export type CompletedRange = "7d" | "30d" | "all";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function filterCompletedTasksByRange(
  tasks: TasksOverviewListItem[],
  range: CompletedRange,
  now: Date = new Date(),
): TasksOverviewListItem[] {
  if (range === "all") {
    return [...tasks];
  }

  const days = range === "7d" ? 7 : 30;
  const upperBound = now.getTime();
  const lowerBound = upperBound - days * DAY_IN_MS;

  return tasks.filter((task) => {
    const reference = task.completedAt ?? task.dueDate;
    if (!reference) {
      return false;
    }
    const time = reference.getTime();
    if (!Number.isFinite(time)) {
      return false;
    }
    return time >= lowerBound && time <= upperBound;
  });
}
