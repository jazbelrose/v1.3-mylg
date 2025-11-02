import React from "react";
import { render, waitFor, within } from "@testing-library/react";

const designerLoadHistory: string[][] = [];
const websocketInstances: WebSocket[] = [];

const deckApiMocks = vi.hoisted(() => {
  const deckPages = [
    { pageId: "pg-1", name: "Intro", sortOrder: 0 },
    { pageId: "pg-2", name: "Details", sortOrder: 1 },
  ];
  return {
    deckPages,
    fetchDeckPagesMock: vi.fn(async () => deckPages),
    createDeckPageMock: vi.fn(async () => ({
      pageId: "pg-new",
      name: "Page 3",
      sortOrder: 2,
    })),
    reorderDeckPagesMock: vi.fn(async () => {}),
  };
});

vi.mock("react-router-dom", () => ({
  __esModule: true,
  useParams: () => ({ projectId: "project-1" }),
  useNavigate: () => vi.fn(),
  useLocation: () => ({
    pathname: "/projects/project-1/editor",
    search: "",
    hash: "",
    state: null,
    key: "test",
  }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/app/contexts/useData", () => ({
  useData: () => ({
    activeProject: { projectId: "project-1", title: "Demo" },
    fetchProjectDetails: vi.fn(),
    setProjects: vi.fn(),
    setSelectedProjects: vi.fn(),
    userId: "user-1",
  }),
}));

vi.mock("@/app/contexts/useSocket", () => ({
  useSocket: () => ({ ws: null }),
}));

vi.mock("@/app/contexts/useAuth", () => ({
  useAuth: () => ({
    getAuthTokens: vi.fn(async () => ({ idToken: "token" })),
  }),
}));

vi.mock("@/shared/utils/secureWebSocketAuth", () => ({
  createSecureWebSocketConnection: vi.fn(async () => {
    const socket = new WebSocket("wss://example");
    websocketInstances.push(socket);
    return socket;
  }),
}));

vi.mock("@/shared/ui/ToastNotifications", () => ({
  notify: vi.fn(),
}));

vi.mock("@/shared/utils/projectUrl", () => ({
  getProjectDashboardPath: (projectId: string, _title: string, suffix = "") =>
    `/projects/${projectId}${suffix}`,
}));

vi.mock("@/dashboard/project/components/Shared/ProjectPageLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

vi.mock("@/dashboard/project/components/Shared/ProjectHeader", () => ({
  __esModule: true,
  default: () => <div data-testid="project-header" />,
}));

vi.mock("@/dashboard/project/components/Shared/QuickLinksComponent", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: React.forwardRef((_, ref) => {
      React.useImperativeHandle(ref, () => ({ openModal: vi.fn() }));
      return <div data-testid="quick-links" />;
    }),
  };
});

vi.mock("@/dashboard/project/components/FileManager/FileManager", () => ({
  __esModule: true,
  default: () => <div data-testid="file-manager" />,
}));

vi.mock("@/dashboard/project/features/editor/components/PreviewDrawer", () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="preview-drawer">{children}</div>
  ),
}));

vi.mock("@/dashboard/project/hooks/useProjectPalette", () => ({
  useProjectPalette: () => ({ primary: "#000000" }),
}));

vi.mock("@/dashboard/project/utils/theme", () => ({
  resolveProjectCoverUrl: () => "cover",
}));

vi.mock("@/dashboard/project/features/editor/components/sheet/SheetEditor", () => {
  const React = require("react");
  const SheetEditor = ({
    pages,
    activePageId,
    layerNodes,
  }: {
    pages: Array<{ id: string; name: string }>;
    activePageId: string;
    layerNodes: {
      canvas: (
        page: { id: string; name: string },
        opts: { isActive: boolean }
      ) => React.ReactNode;
    };
  }) => {
    const activePage = pages.find((page) => page.id === activePageId);
    return (
      <div data-testid="sheet-editor">
        <ul>
          {pages.map((page) => (
            <li key={page.id} data-testid="page-item" data-page-id={page.id}>
              {page.name}
            </li>
          ))}
        </ul>
        {activePage ? (
          <div data-testid="active-layer">
            {layerNodes.canvas(activePage, { isActive: true })}
          </div>
        ) : null}
      </div>
    );
  };
  return { __esModule: true, default: SheetEditor };
});

vi.mock("@/dashboard/project/features/editor/components/canvas/designercomponent", () => {
  const React = require("react");
  const Designer = React.forwardRef((_, ref) => {
    const loadCallsRef = React.useRef<string[]>([]);
    React.useEffect(() => {
      designerLoadHistory.push(loadCallsRef.current);
    }, []);
    React.useImperativeHandle(ref, () => ({
      changeMode: vi.fn(),
      addText: vi.fn(),
      triggerImageUpload: vi.fn(),
      handleColorChange: vi.fn(),
      handleUndo: vi.fn(),
      handleRedo: vi.fn(),
      handleCopy: vi.fn(),
      handlePaste: vi.fn(),
      handleDelete: vi.fn(),
      handleClear: vi.fn(),
      handleSave: vi.fn(),
      getCanvasJson: () => null,
      loadCanvasJson: (json: string) => {
        loadCallsRef.current.push(json);
      },
    }));
    return <div data-testid="designer-component" />;
  });
  Designer.displayName = "DesignerComponentMock";
  return { __esModule: true, default: Designer };
});

vi.mock("@/dashboard/project/features/editor/api/deckPages", () => ({
  fetchDeckPages: deckApiMocks.fetchDeckPagesMock,
  createDeckPage: deckApiMocks.createDeckPageMock,
  reorderDeckPages: deckApiMocks.reorderDeckPagesMock,
}));

const { fetchDeckPagesMock, createDeckPageMock, reorderDeckPagesMock } = deckApiMocks;

import EditorPage from "../editorpage";

describe("EditorPage realtime integration", () => {
  beforeEach(() => {
    fetchDeckPagesMock.mockClear();
    createDeckPageMock.mockClear();
    reorderDeckPagesMock.mockClear();
    designerLoadHistory.length = 0;
    websocketInstances.length = 0;
  });

  it("hydrates deck pages and syncs realtime patches across editors", async () => {
    const { getAllByTestId } = render(
      <>
        <EditorPage />
        <EditorPage />
      </>
    );

    await waitFor(() => {
      expect(fetchDeckPagesMock).toHaveBeenCalledTimes(2);
    });

    const editors = await waitFor(() => {
      const rendered = getAllByTestId("sheet-editor");
      expect(rendered.length).toBe(2);
      return rendered;
    });

    editors.forEach((editor) => {
      const items = within(editor).getAllByTestId("page-item");
      const pageIds = items.map((item) => item.getAttribute("data-page-id"));
      expect(pageIds).toEqual(["pg-1", "pg-2", "super-sheet"]);
    });

    await waitFor(() => {
      expect(websocketInstances.length).toBeGreaterThanOrEqual(2);
    });

    const payload = JSON.stringify({
      action: "deckPatch",
      projectId: "project-1",
      pageId: "pg-1",
      state: { message: "hello" },
    });

    websocketInstances.forEach((socket) => {
      socket.onmessage?.({ data: payload } as MessageEvent);
    });

    await waitFor(() => {
      expect(designerLoadHistory.length).toBeGreaterThanOrEqual(2);
      designerLoadHistory.slice(0, 2).forEach((history) => {
        expect(history).toContain(JSON.stringify({ message: "hello" }));
      });
    });
  });
});
