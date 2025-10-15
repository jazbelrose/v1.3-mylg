import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ProjectsIconsStrip } from "./ProjectsIconsStrip";
import type { ProjectLike } from "@/dashboard/home/hooks/useProjectKpis";
import "@testing-library/jest-dom";

describe("ProjectsIconsStrip", () => {
  const createProjects = (count: number): ProjectLike[] =>
    Array.from({ length: count }, (_, index) => ({
      projectId: `project-${index + 1}`,
      title: `Project ${index + 1}`,
      thumbnails: [],
    })) as ProjectLike[];

  it("calls onOpenProject when an icon is clicked", () => {
    const onOpenProject = vi.fn();

    render(
      <ProjectsIconsStrip
        projects={createProjects(2)}
        imgError={{}}
        onImageError={vi.fn()}
        onOpenProject={onOpenProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /project 1/i }));
    expect(onOpenProject).toHaveBeenCalledWith("project-1");
  });

  it("shows a badge when more projects are available", () => {
    render(
      <ProjectsIconsStrip
        projects={createProjects(9)}
        imgError={{}}
        onImageError={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );

    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});












