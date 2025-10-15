import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import TasksComponent from "./TasksComponent";

const fetchTasksMock = vi.fn();
const quickCreateMock = vi.fn();
const taskDrawerMock = vi.fn();

defineMocks();

function defineMocks() {
  vi.mock("@/shared/utils/api", () => ({
    __esModule: true,
    fetchTasks: (...args: unknown[]) => fetchTasksMock(...args),
  }));

  vi.mock("@/dashboard/home/components/QuickCreateTaskModal", () => ({
    __esModule: true,
    default: (props: unknown) => {
      quickCreateMock(props);
      return null;
    },
  }));

  vi.mock("./components/TaskDrawer", () => ({
    __esModule: true,
    default: (props: unknown) => {
      taskDrawerMock(props);
      return null;
    },
  }));
}

describe("TasksComponent", () => {
  beforeEach(() => {
    fetchTasksMock.mockReset();
    quickCreateMock.mockClear();
    taskDrawerMock.mockClear();
    fetchTasksMock.mockResolvedValue([]);
  });

  test("fetches tasks for the provided project", async () => {
    render(<TasksComponent projectId="project-123" projectName="Alpha" />);

    await waitFor(() => {
      expect(fetchTasksMock).toHaveBeenCalledWith("project-123");
    });
  });

  test("renders an empty state when there are no tasks", async () => {
    render(<TasksComponent projectId="project-123" projectName="Alpha" />);

    expect(
      await screen.findByText(/No tasks yet\. Create one to get started\./i),
    ).toBeInTheDocument();
  });

  test("displays tasks returned from the API", async () => {
    fetchTasksMock.mockResolvedValue([
      {
        projectId: "project-123",
        taskId: "task-1",
        title: "Lighting Design",
        status: "todo",
        dueDate: "2024-01-15",
      },
      {
        projectId: "project-123",
        taskId: "task-2",
        title: "Site walk",
        status: "in_progress",
      },
    ]);

    render(<TasksComponent projectId="project-123" projectName="Alpha" />);

    expect(await screen.findByText("Lighting Design")).toBeInTheDocument();
    expect(await screen.findByText("Site walk")).toBeInTheDocument();
    expect(await screen.findAllByText(/todo|in progress/i)).toHaveLength(2);
  });

  test("opens the quick create modal when clicking New task", async () => {
    render(<TasksComponent projectId="project-123" projectName="Alpha" />);

    const newTaskButton = await screen.findByRole("button", { name: /new task/i });
    quickCreateMock.mockClear();
    await userEvent.click(newTaskButton);

    await waitFor(() => {
      const lastCall = quickCreateMock.mock.calls.at(-1);
      expect(lastCall?.[0]).toMatchObject({ open: true });
    });
  });

  test("opens the map drawer when clicking Open map view", async () => {
    render(<TasksComponent projectId="project-123" projectName="Alpha" />);

    const mapButton = await screen.findByRole("button", { name: /open map view/i });
    taskDrawerMock.mockClear();
    await userEvent.click(mapButton);

    await waitFor(() => {
      const lastCall = taskDrawerMock.mock.calls.at(-1);
      expect(lastCall?.[0]).toMatchObject({ open: true });
    });
  });
});
