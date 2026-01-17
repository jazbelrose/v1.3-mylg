import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Mock child components to keep mount minimal
vi.mock("@/dashboard/project/components", () => ({
  ProjectPageLayout: ({
    children,
    header,
  }: {
    children: React.ReactNode;
    header?: React.ReactNode;
  }) => (
    <div data-testid="project-layout">
      {header}
      {children}
    </div>
  ),
  ProjectHeader: () => <div data-testid="project-header" />,
  QuickLinksComponent: React.forwardRef((_props: unknown, ref) => <div ref={ref} />),
  FileManager: () => <div data-testid="file-manager" />,
  // export types if necessary
}));

// Mock Calendar surface to avoid internal complexities
vi.mock("./components/CalendarSurface", () => ({
  __esModule: true,
  default: () => <div data-testid="calendar-surface" />,
}));

// Mock hooks and API dependencies
vi.mock("@/app/contexts/useData", () => ({
  useData: () => ({
    activeProject: null,
    setActiveProject: vi.fn(),
    fetchProjectDetails: vi.fn(),
    setProjects: vi.fn(),
    setSelectedProjects: vi.fn(),
    userId: "test-user",
    isAdmin: false,
  }),
}));

vi.mock("@/app/contexts/SocketContext", () => ({
  useSocket: () => ({ ws: null }),
}));

vi.mock("@/dashboard/project/components/Shared/projectHeaderState/useTeamMembers", () => ({
  useTeamMembers: () => [],
}));

vi.mock("@/shared/utils/api", () => ({
  fetchTasks: () => Promise.resolve([]),
  fetchEvents: () => Promise.resolve([]),
  createEvent: () => Promise.resolve({}),
  updateEvent: () => Promise.resolve({}),
  deleteEvent: () => Promise.resolve({}),
  requestTaskReview: () => Promise.resolve({}),
  approveTask: () => Promise.resolve({}),
}));

// Mock react-router-dom hooks
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ projectId: "test-project" }),
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: "/dashboard/projects/test-project/calendar" }),
  };
});

describe("CalendarPage", () => {
  test("renders without throwing", async () => {
    // import after mocks are set up
    const { default: CalendarPage } = await vi.importActual(
      "@/dashboard/project/features/calendar/calendar",
    );
    render(<CalendarPage />);
    expect(screen.getByTestId("project-layout")).toBeInTheDocument();
    expect(screen.getByTestId("project-header")).toBeInTheDocument();
    expect(screen.getByTestId("calendar-surface")).toBeInTheDocument();
  });
});
