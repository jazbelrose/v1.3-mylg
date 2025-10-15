import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import ProjectsTable from "./ProjectsTable";
import type { ProjectWithMeta } from "../utils/types";
import type { UserLite } from "@/app/contexts/DataProvider";
import "@testing-library/jest-dom";

const createProject = (overrides: Partial<ProjectWithMeta> = {}): ProjectWithMeta => ({
  projectId: "project-1",
  title: "Example Project",
  status: "active",
  finishline: "2024-06-15",
  thumbnails: [],
  team: [{ userId: "user-1" }],
  unreadCount: 2,
  dateCreated: "2024-05-01",
  _activity: Date.now(),
  _created: Date.now(),
  ...overrides,
});

describe("ProjectsTable", () => {
  const usersById = new Map<string, UserLite>([
    [
      "user-1",
      {
        userId: "user-1",
        firstName: "Pat",
        lastName: "Manager",
        email: "pat@example.com",
      } as UserLite,
    ],
  ]);

  it("renders error state", () => {
    render(
      <ProjectsTable
        projects={[]}
        isLoading={false}
        projectsError
        onOpenProject={vi.fn()}
        onImageError={vi.fn()}
        imgError={{}}
        usersById={usersById}
      />
    );

    expect(screen.getByText(/failed to load projects/i)).toBeInTheDocument();
  });

  it("shows loading placeholder", () => {
    render(
      <ProjectsTable
        projects={[]}
        isLoading
        projectsError={false}
        onOpenProject={vi.fn()}
        onImageError={vi.fn()}
        imgError={{}}
        usersById={usersById}
      />
    );

    // Check that skeleton is rendered when loading
    const skeleton = document.querySelector('[aria-hidden="true"]');
    expect(skeleton).toBeInTheDocument();
  });

  it("renders project rows and handles activation", () => {
    const onOpenProject = vi.fn();
    const project = createProject({ projectId: "project-123", title: "Launch Plan" });

    render(
      <ProjectsTable
        projects={[project]}
        isLoading={false}
        projectsError={false}
        onOpenProject={onOpenProject}
        onImageError={vi.fn()}
        imgError={{}}
        usersById={usersById}
      />
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Launch Plan")).toBeInTheDocument();
    expect(screen.getByText("Pat Manager")).toBeInTheDocument();

    const row = screen.getByRole("row", { name: /open project launch plan/i });
    fireEvent.click(row);
    expect(onOpenProject).toHaveBeenCalledWith("project-123");
  });
});









