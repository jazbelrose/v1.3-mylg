import { describe, expect, it } from "vitest";
import type { CalendarTask } from "../utils";
import { getBestAssigneeTokensByUserId, shouldConvertToGroupStack } from "./groupStack";

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

describe("groupStack helpers", () => {
  it("detects cross-user FocusBlock attach should convert", () => {
    const focusBlock = makeTask({
      id: "fb1",
      kind: "focus_block",
      assignedTo: "Bob__userB",
      source: { projectId: "p1", taskId: "fb1", assigneeId: "Bob__userB", kind: "focus_block" } as any,
    });
    const dragged = makeTask({
      id: "t1",
      assignedTo: "Alice__userA",
      source: { projectId: "p1", taskId: "t1", assigneeId: "Alice__userA" } as any,
    });

    expect(shouldConvertToGroupStack({ container: focusBlock, dragged })).toBe(true);
  });

  it("builds a unique member list and preserves tokens", () => {
    const focusBlock = makeTask({
      id: "fb1",
      kind: "focus_block",
      assignedTo: "Bob__userB",
      source: { projectId: "p1", taskId: "fb1", assigneeId: "Bob__userB", kind: "focus_block" } as any,
    });
    const childB = makeTask({
      id: "b1",
      assignedTo: "Bob__userB",
      source: { projectId: "p1", taskId: "b1", assigneeId: "Bob__userB" } as any,
    });
    const draggedA = makeTask({
      id: "a1",
      assignedTo: "Alice__userA",
      source: { projectId: "p1", taskId: "a1", assigneeId: "Alice__userA" } as any,
    });

    const members = getBestAssigneeTokensByUserId([focusBlock, childB, draggedA]);
    expect(members).toEqual(expect.arrayContaining(["Bob__userB", "Alice__userA"]));
    expect(new Set(members).size).toBe(members.length);
  });
});

