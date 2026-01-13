import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarTask } from "../utils";
import { CalendarEntryPopover } from "./CalendarEntryPopover";

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

describe("CalendarEntryPopover (GroupStack)", () => {
  it("renders children grouped by user", () => {
    const anchor = document.createElement("div");
    document.body.appendChild(anchor);

    const groupStack = makeTask({
      id: "gs1",
      kind: "group_stack",
      title: "Group Stack",
      assignedTo: "Bob__userB",
      assigneeIds: ["Bob__userB", "Alice__userA"],
      source: {
        projectId: "p1",
        taskId: "gs1",
        kind: "group_stack",
        assigneeId: "Bob__userB",
        assigneeIds: ["Bob__userB", "Alice__userA"],
      } as any,
    });

    const childA = makeTask({
      id: "a1",
      title: "A time block",
      start: "05:00",
      end: "06:00",
      assignedTo: "Alice__userA",
      source: { projectId: "p1", taskId: "a1", assigneeId: "Alice__userA" } as any,
      focusBlockId: "gs1",
    });
    const childB = makeTask({
      id: "b1",
      title: "B time block",
      start: "07:00",
      end: "08:00",
      assignedTo: "Bob__userB",
      source: { projectId: "p1", taskId: "b1", assigneeId: "Bob__userB" } as any,
      focusBlockId: "gs1",
    });

    render(
      <CalendarEntryPopover
        anchorElement={anchor}
        entryType="task"
        entry={groupStack}
        selectedCount={1}
        teamMembers={[
          { userId: "userA", firstName: "Alice", lastName: "Alpha", thumbnail: null },
          { userId: "userB", firstName: "Bob", lastName: "Beta", thumbnail: null },
        ]}
        focusChildren={[childA, childB]}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    const aliceHeading = screen.getByText("Alice Alpha");
    const aliceSection = aliceHeading.closest(".calendar-entry-popover__children-section");
    expect(aliceSection).not.toBeNull();
    expect(within(aliceSection as HTMLElement).getByText("A time block")).toBeInTheDocument();

    const bobHeading = screen.getByText("Bob Beta");
    const bobSection = bobHeading.closest(".calendar-entry-popover__children-section");
    expect(bobSection).not.toBeNull();
    expect(within(bobSection as HTMLElement).getByText("B time block")).toBeInTheDocument();

    expect(screen.queryByText("Unassigned")).toBeNull();
  });
});

