import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useProjectFilters } from "./useProjectFilters";
import type { ProjectLike } from "@/dashboard/home/hooks/useProjectKpis";

describe("useProjectFilters", () => {
  const projects: ProjectLike[] = [
    {
      projectId: "alpha",
      title: "Alpha Roadmap",
      status: "Active",
      updatedAt: "2024-06-01T00:00:00Z",
      dateCreated: "2024-03-01T00:00:00Z",
    },
    {
      projectId: "beta",
      title: "Beta Launch",
      status: "Archived",
      updatedAt: "2024-06-05T00:00:00Z",
      dateCreated: "2024-04-01T00:00:00Z",
    },
    {
      projectId: "gamma",
      title: "Gamma Planning",
      status: "Active",
      updatedAt: "2024-05-28T00:00:00Z",
      dateCreated: "2024-05-01T00:00:00Z",
    },
  ] as ProjectLike[];

  it("limits recents by activity timestamp", () => {
    const { result } = renderHook(() =>
      useProjectFilters({ projects, recentsLimit: 2 })
    );

    expect(result.current.filteredProjects).toHaveLength(2);
    expect(result.current.filteredProjects[0]?.projectId).toBe("gamma");
  });

  it("filters projects by query and scope", () => {
    const { result } = renderHook(() =>
      useProjectFilters({ projects, recentsLimit: 2 })
    );

    act(() => {
      result.current.setQuery("gamma");
    });

    expect(result.current.filteredProjects).toHaveLength(1);
    expect(result.current.filteredProjects[0]?.projectId).toBe("gamma");

    act(() => {
      result.current.setScope("all");
      result.current.setQuery("");
    });

    expect(result.current.filteredProjects).toHaveLength(3);
  });

  it("exposes normalized status options and selection", () => {
    const { result } = renderHook(() =>
      useProjectFilters({ projects, recentsLimit: 3 })
    );

    expect(result.current.statusOptions.map((option) => option.label)).toEqual([
      "All statuses",
      "active",
      "archived",
    ]);

    act(() => {
      const option = result.current.statusOptions[1];
      result.current
        .statusDropdown
        .getOptionButtonProps(option, 1)
        .onClick();
    });

    expect(result.current.filteredProjects.every((project) => project.status === "Active")).toBe(true);
  });

  it("supports custom defaults and matchers", () => {
    const customProjects: ProjectLike[] = [
      {
        projectId: "custom-1",
        title: "Custom",
        description: "Important milestone",
        status: "Active",
        dateCreated: "2024-01-01T00:00:00Z",
      },
      {
        projectId: "custom-2",
        title: "Sample",
        description: "Contains hidden text",
        status: "75%",
        dateCreated: "2024-01-02T00:00:00Z",
      },
    ];

    const { result } = renderHook(() =>
      useProjectFilters({
        projects: customProjects,
        recentsLimit: 5,
        defaultScope: "all",
        defaultSortOption: "titleAsc",
        queryMatcher: (project, normalizedQuery) => {
          const title = (project.title || "").toLowerCase();
          const description = (project.description || "").toLowerCase();
          return title.includes(normalizedQuery) || description.includes(normalizedQuery);
        },
        statusFilterPredicate: (status) => status !== "75%",
      })
    );

    expect(result.current.scope).toBe("all");
    expect(result.current.statusOptions.map((option) => option.value)).toEqual(["", "active"]);

    act(() => {
      result.current.setQuery("hidden");
    });

    expect(result.current.filteredProjects).toHaveLength(1);
    expect(result.current.filteredProjects[0]?.projectId).toBe("custom-2");
  });
});












