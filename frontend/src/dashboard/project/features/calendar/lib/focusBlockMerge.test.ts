import { describe, expect, it } from "vitest";
import type { CalendarTask } from "../utils";
import { buildGroupStackFromTwoFocusBlocks } from "./focusBlockMerge";

const makeTask = (overrides: Partial<CalendarTask> & { id: string }): CalendarTask => {
  const base: CalendarTask = {
    id: overrides.id,
    title: "Untitled",
    due: "2026-01-01",
    start: "09:00",
    end: "10:00",
    source: {
      projectId: "p1",
      taskId: overrides.id,
      title: overrides.title ?? "Untitled",
    } as any,
  };
  return { ...base, ...overrides };
};

const resolveId = (task: CalendarTask): string | null => {
  const source = task.source as any;
  const stable = typeof source?.taskId === "string" ? source.taskId.trim() : "";
  const local = typeof task.id === "string" ? task.id.trim() : "";
  return stable || local || null;
};

describe("focus block merge -> group stack plan", () => {
  it("flattens focus blocks to leaf tasks (never includes container ids)", () => {
    const src = makeTask({
      id: "fb_src",
      kind: "focus_block",
      assignedTo: "Alice__userA",
      focusChildTaskIds: ["t_a", "fb_nested"],
      source: { projectId: "p1", taskId: "fb_src", kind: "focus_block", assigneeId: "Alice__userA" } as any,
    });
    const dst = makeTask({
      id: "fb_dst",
      kind: "focus_block",
      assignedTo: "Bob__userB",
      focusChildTaskIds: ["t_b"],
      source: { projectId: "p1", taskId: "fb_dst", kind: "focus_block", assigneeId: "Bob__userB" } as any,
    });

    const nested = makeTask({
      id: "fb_nested",
      kind: "focus_block",
      assignedTo: "Bob__userB",
      focusChildTaskIds: ["t_nested"],
      source: { projectId: "p1", taskId: "fb_nested", kind: "focus_block", assigneeId: "Bob__userB" } as any,
    });

    const tA = makeTask({
      id: "t_a",
      title: "Alpha",
      start: "06:00",
      end: "07:00",
      source: { projectId: "p1", taskId: "t_a", assigneeId: null } as any,
    });
    const tB = makeTask({
      id: "t_b",
      title: "Beta",
      start: "08:00",
      end: "09:00",
      assignedTo: "Bob__userB",
      source: { projectId: "p1", taskId: "t_b", assigneeId: "Bob__userB" } as any,
    });
    const tNested = makeTask({
      id: "t_nested",
      title: "Nested",
      start: "07:30",
      end: "08:00",
      source: { projectId: "p1", taskId: "t_nested" } as any,
    });

    const allTasks = [src, dst, nested, tA, tB, tNested];
    const taskById = new Map(allTasks.map((t) => [resolveId(t)!, t]));

    const plan = buildGroupStackFromTwoFocusBlocks({
      src,
      dst,
      dstId: "fb_dst",
      allTasks,
      taskById,
      resolveId,
    });

    expect(plan.leafTaskIds).toEqual(["t_a", "t_nested", "t_b"]);
    expect(plan.leafTaskIds).not.toContain("fb_src");
    expect(plan.leafTaskIds).not.toContain("fb_dst");
    expect(plan.leafTaskIds).not.toContain("fb_nested");
  });

  it("defaults missing assignees to the focus-block owner and includes both owners in participants", () => {
    const src = makeTask({
      id: "fb_src",
      kind: "focus_block",
      assignedTo: "Alice__userA",
      focusChildTaskIds: ["t_a"],
      source: { projectId: "p1", taskId: "fb_src", kind: "focus_block", assigneeId: "Alice__userA" } as any,
    });
    const dst = makeTask({
      id: "fb_dst",
      kind: "focus_block",
      assignedTo: "Bob__userB",
      focusChildTaskIds: ["t_b"],
      source: { projectId: "p1", taskId: "fb_dst", kind: "focus_block", assigneeId: "Bob__userB" } as any,
    });
    const unassignedLeaf = makeTask({
      id: "t_a",
      title: "Needs owner",
      source: { projectId: "p1", taskId: "t_a", assigneeId: null } as any,
    });
    const assignedLeaf = makeTask({
      id: "t_b",
      title: "Already owned",
      assignedTo: "Bob__userB",
      source: { projectId: "p1", taskId: "t_b", assigneeId: "Bob__userB" } as any,
    });

    const allTasks = [src, dst, unassignedLeaf, assignedLeaf];
    const taskById = new Map(allTasks.map((t) => [resolveId(t)!, t]));

    const plan = buildGroupStackFromTwoFocusBlocks({
      src,
      dst,
      dstId: "fb_dst",
      allTasks,
      taskById,
      resolveId,
    });

    expect(plan.participants).toEqual(expect.arrayContaining(["Alice__userA", "Bob__userB"]));

    const updateForA = plan.childUpdates.find((u) => u.taskId === "t_a");
    expect(updateForA?.fields.focusBlockId).toBe("fb_dst");
    expect(updateForA?.fields.assigneeId).toBe("Alice__userA");

    const updateForB = plan.childUpdates.find((u) => u.taskId === "t_b");
    expect(updateForB?.fields.assigneeId).toBeUndefined();
  });
});

