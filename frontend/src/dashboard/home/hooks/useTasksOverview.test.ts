import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { useTasksOverview } from "./useTasksOverview";
import { useData } from "@/app/contexts/useData";
import { fetchTasks } from "@/shared/utils/api";
import type { Project } from "@/app/contexts/DataProvider";

vi.mock("@/app/contexts/useData", () => ({
  useData: vi.fn(),
}));

vi.mock("@/shared/utils/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/utils/api")>(
    "@/shared/utils/api",
  );
  return {
    ...actual,
    fetchTasks: vi.fn(),
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

describe("useTasksOverview", () => {
  const mockUseData = vi.mocked(useData);
  const mockFetchTasks = vi.mocked(fetchTasks);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts tasks completed this week using completion timestamps", async () => {
    const project: Project = { projectId: "project-1", title: "Project" };
    mockUseData.mockReturnValue({ projects: [project] } as unknown as ReturnType<typeof useData>);

    const now = new Date();
    const recentIso = now.toISOString();

    mockFetchTasks.mockResolvedValue([
      {
        id: "task-no-due",
        title: "No due date task",
        status: "done",
        completedAt: recentIso,
      },
      {
        id: "task-old-due",
        title: "Old due task",
        status: "done",
        dueDate: "2020-01-01",
        updatedAt: recentIso,
      },
    ]);

    const { result } = renderHook(() => useTasksOverview());

    await waitFor(() => {
      expect(result.current.completedThisWeek).toHaveLength(2);
    });

    const titles = result.current.completedThisWeek.map((task) => task.title);
    expect(titles).toContain("No due date task");
    expect(titles).toContain("Old due task");
    expect(result.current.stats.completed).toBe(2);
  });
});
