import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import DashboardNavPanel from "./DashboardNavPanel";

vi.mock("@/dashboard/home/components/GlobalSearch", () => ({
  __esModule: true,
  default: ({ className = "", autoFocus = false }: { className?: string; autoFocus?: boolean }) => (
    <div>
      <input
        data-testid="global-search-input"
        className={`global-search-input ${className}`.trim()}
        autoFocus={autoFocus}
      />
    </div>
  ),
}));

vi.mock("@/shared/ui/ModalWithStack", () => ({
  __esModule: true,
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    (isOpen ? <div data-testid="search-modal">{children}</div> : null),
}));

vi.mock("./useDashboardNavigation", () => ({
  __esModule: true,
  default: () => ({
    navItems: [],
    bottomItems: [],
    settingsNavItem: null,
  }),
}));

vi.mock("@/app/contexts/useData", () => ({
  useData: () => ({
    userData: {
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
    },
  }),
}));

vi.mock("@/app/contexts/OnlineStatusContext", () => ({
  useOnlineStatus: () => ({
    isOnline: () => false,
  }),
}));

vi.mock("@/shared/utils/api", () => ({
  getFileUrl: (value: string) => value,
}));

describe("DashboardNavPanel keyboard shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the search modal when pressing Ctrl+F", async () => {
    render(
      <MemoryRouter>
        <DashboardNavPanel setActiveView={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("search-modal")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f", ctrlKey: true });

    const input = await screen.findByTestId("global-search-input");
    expect(screen.getByTestId("search-modal")).toBeInTheDocument();

    await waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  it("opens the search modal when pressing Cmd+F", async () => {
    render(
      <MemoryRouter>
        <DashboardNavPanel setActiveView={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.keyDown(window, { key: "F", metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId("search-modal")).toBeInTheDocument();
    });
  });
});
