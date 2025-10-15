import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";

import { ProjectsFilterMenu } from "./ProjectsFilterMenu";
import type { DropdownHelpers } from "./hooks/useDropdown";
import type { SortOption } from "./hooks/useProjectFilters";
import type { DropdownOption } from "./hooks/useDropdown";
import "@testing-library/jest-dom";

const createDropdownStub = <T,>(): DropdownHelpers<T> => ({
  dropdownRef: createRef<HTMLDivElement>(),
  isOpen: false,
  open: vi.fn(),
  close: vi.fn(),
  toggle: vi.fn(),
  listId: "list-id",
  activeOptionId: undefined,
  highlightIndex: -1,
  handleTriggerKeyDown: vi.fn(),
  getOptionRenderState: vi.fn((option: DropdownOption<T>, index: number) => ({
    id: `option-${index}`,
    isSelected: false,
    isActive: false,
  })),
  getOptionButtonProps: vi.fn(() => ({
    type: "button" as const,
    onClick: vi.fn(),
    onMouseEnter: vi.fn(),
    onFocus: vi.fn(),
  })),
});

describe("ProjectsFilterMenu", () => {
  it("renders scope toggle and triggers toggle handler", () => {
    const toggleFilters = vi.fn();
    const statusDropdown = createDropdownStub<string>();
    const sortDropdown = createDropdownStub<SortOption>();

    render(
      <ProjectsFilterMenu
        filtersOpen={false}
        filtersRef={createRef<HTMLDivElement>()}
        filtersId="filters"
        scope="recents"
        onScopeChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
        toggleFilters={toggleFilters}
        statusOptions={[{ value: "", label: "All statuses" }]}
        statusTriggerLabel="All statuses"
        statusDropdown={statusDropdown}
        showStatusDropdown={false}
        sortOptions={[{ value: "dateNewest", label: "Date (Newest)" }]}
        sortTriggerLabel="Date (Newest)"
        sortDropdown={sortDropdown}
      />
    );

    const scopeButton = screen.getByRole("button", { name: /recents/i });
    fireEvent.click(scopeButton);
    expect(toggleFilters).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows dropdown options when open", () => {
    const statusDropdown = createDropdownStub<string>();
    statusDropdown.isOpen = true;
    statusDropdown.getOptionRenderState = vi.fn((option, index) => ({
      id: `status-${index}`,
      isSelected: index === 0,
      isActive: index === 0,
    }));
    statusDropdown.getOptionButtonProps = vi.fn(() => ({
      type: "button" as const,
      onClick: vi.fn(),
      onMouseEnter: vi.fn(),
      onFocus: vi.fn(),
    }));

    const sortDropdown = createDropdownStub<SortOption>();
    sortDropdown.isOpen = true;
    sortDropdown.getOptionRenderState = vi.fn((option, index) => ({
      id: `sort-${index}`,
      isSelected: index === 0,
      isActive: index === 0,
    }));
    sortDropdown.getOptionButtonProps = vi.fn(() => ({
      type: "button" as const,
      onClick: vi.fn(),
      onMouseEnter: vi.fn(),
      onFocus: vi.fn(),
    }));

    render(
      <ProjectsFilterMenu
        filtersOpen
        filtersRef={createRef<HTMLDivElement>()}
        filtersId="filters"
        scope="all"
        onScopeChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
        toggleFilters={vi.fn()}
        statusOptions={[
          { value: "", label: "All statuses" },
          { value: "active", label: "active" },
        ]}
        statusTriggerLabel="All statuses"
        statusDropdown={statusDropdown}
        showStatusDropdown
        sortOptions={[
          { value: "dateNewest", label: "Date (Newest)" },
          { value: "titleAsc", label: "Title (A-Z)" },
        ]}
        sortTriggerLabel="Date (Newest)"
        sortDropdown={sortDropdown}
      />
    );

    expect(screen.getByRole("menu")).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(4);
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("Title (A-Z)")).toBeInTheDocument();
  });

  it("supports custom labels and hides the scope selector when disabled", () => {
    const statusDropdown = createDropdownStub<string>();
    const sortDropdown = createDropdownStub<SortOption>();

    render(
      <ProjectsFilterMenu
        filtersOpen
        filtersRef={createRef<HTMLDivElement>()}
        filtersId="filters"
        scope="all"
        onScopeChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
        toggleFilters={vi.fn()}
        statusOptions={[{ value: "", label: "All statuses" }]}
        statusTriggerLabel="All statuses"
        statusDropdown={statusDropdown}
        showStatusDropdown={false}
        sortOptions={[{ value: "dateNewest", label: "Date (Newest)" }]}
        sortTriggerLabel="Date (Newest)"
        sortDropdown={sortDropdown}
        triggerLabel="Filter"
        showScopeSelector={false}
        popoverAlign="start"
      />
    );

    expect(screen.getByRole("button", { name: /filter/i })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /scope/i })).not.toBeInTheDocument();
  });
});









