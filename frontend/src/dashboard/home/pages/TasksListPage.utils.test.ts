import { describe, expect, it } from "vitest";

import type { TasksOverviewListItem } from "../hooks/useTasksOverview";
import { filterCompletedTasksByRange, type CompletedRange } from "./TasksListPage.utils";

function buildTask(id: string, offsetDays: number): TasksOverviewListItem {
  const completedAt = new Date();
  completedAt.setDate(completedAt.getDate() - offsetDays);
  return {
    id,
    taskId: id,
    title: `Task ${id}`,
    status: "done",
    dueDate: completedAt,
    completedAt,
    projectId: "project-1",
    projectName: "Project 1",
    projectColor: "#fff",
    rawTask: { projectId: "project-1" },
  } as TasksOverviewListItem;
}

describe("filterCompletedTasksByRange", () => {
  const tasks = [buildTask("1", 1), buildTask("2", 8), buildTask("3", 20), buildTask("4", 40)];

  const run = (range: CompletedRange) => filterCompletedTasksByRange(tasks, range, new Date());

  it("returns a copy of all tasks when range is all", () => {
    const filtered = run("all");
    expect(filtered).toHaveLength(tasks.length);
    expect(filtered).not.toBe(tasks);
  });

  it("returns tasks completed within the last 7 days", () => {
    const filtered = run("7d");
    const ids = filtered.map((task) => task.id);
    expect(ids).toContain("1");
    expect(ids).not.toContain("2");
  });

  it("returns tasks completed within the last 30 days", () => {
    const filtered = run("30d");
    const ids = filtered.map((task) => task.id);
    expect(ids).toEqual(expect.arrayContaining(["1", "2", "3"]));
    expect(ids).not.toContain("4");
  });
});
