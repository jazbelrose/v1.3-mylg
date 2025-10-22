import React from "react";
import ProjectMessagesThread from "@/dashboard/features/messages/ProjectMessagesThread";
import DashboardNavPanel from "@/shared/ui/DashboardNavPanel";
import { useNavCollapsed } from "@/shared/hooks/useNavCollapsed";
import WelcomeHeader from "@/dashboard/home/components/WelcomeHeader";
import ChatPanel from "./ChatPanel";
import type { ProjectAccentPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { useData } from "@/app/contexts/useData";
import Spinner from "@/shared/ui/Spinner";

type ProjectPageLayoutProps = {
  projectId?: string;
  header: React.ReactNode;
  children: React.ReactNode;
  theme?: ProjectAccentPalette;
};

// Minimal prop typings for local components (adjust if your real components differ)
type ProjectMessagesThreadProps = {
  projectId: string;
  open: boolean;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  floating: boolean;
  setFloating: (floating: boolean | ((prev: boolean) => boolean)) => void;
  startDrag: (event: React.MouseEvent<HTMLDivElement>) => void;
  headerOffset: number;
  onCloseChat?: () => void;
};

type ChatPanelProps = {
  projectId: string;
  initialFloating?: boolean;
  onFloatingChange?: (floating: boolean) => void;
  openSignal?: number;
  onCloseChat?: () => void;
};

// (If your imported components already export types, remove these lines)
const _ProjectMessagesThread = ProjectMessagesThread as unknown as React.FC<ProjectMessagesThreadProps>;
const _ChatPanel = ChatPanel as unknown as React.FC<ChatPanelProps>;

const MOBILE_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;
const MIN_THREAD_WIDTH = 350;
const MAX_THREAD_WIDTH = 800;

const ProjectPageLayout: React.FC<ProjectPageLayoutProps> = ({
  projectId,
  header,
  children,
  theme,
}) => {
  const projectHeaderRef = React.useRef<HTMLDivElement | null>(null);
  const layoutRef = React.useRef<HTMLDivElement | null>(null);

  const themeStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!theme) return undefined;
    return {
      "--accent": theme.accent,
      "--accent-weak": theme.accentWeak,
      "--accent-strong": theme.accentStrong,
      "--accent-on-color": "#ffffff",
      "--chip-bg": theme.accentWeak,
      "--chip-border": theme.accentStrong,
      "--chip-color": "#ffffff",
      "--chip-dot": theme.accentStrong,
      "--chip-shadow": "0 0 0 1px color-mix(in srgb, var(--accent-strong, #FA3356) 35%, transparent)",
      "--tag-bg": theme.accentWeak,
      "--tag-color": "#ffffff",
      "--tag-border": theme.accentStrong,
      "--tag-shadow": "0 0 0 1px color-mix(in srgb, var(--accent-strong, #FA3356) 25%, transparent)",
      "--progress-accent": theme.accentStrong,
      "--progress-accent-weak": theme.accentWeak,
    } as React.CSSProperties;
  }, [theme]);

  const { activeProject } = useData();
  const activeProjectId = React.useMemo(
    () => (activeProject?.projectId ? String(activeProject.projectId) : null),
    [activeProject?.projectId]
  );
  const safeProjectId = projectId ?? "";
  const isProjectLoading = React.useMemo(
    () => Boolean(projectId && activeProjectId !== projectId),
    [activeProjectId, projectId]
  );
  const shouldShowUnavailableState = React.useMemo(
    () => Boolean(projectId && !isProjectLoading && !activeProjectId),
    [activeProjectId, isProjectLoading, projectId]
  );

  const threadWidth = MIN_THREAD_WIDTH;
  const [headerHeights, setHeaderHeights] = React.useState<{ global: number; project: number }>({
    global: 0,
    project: 0,
  });

  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  const [isDesktop, setIsDesktop] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= DESKTOP_BREAKPOINT : false
  );

  const [floatingThread, setFloatingThread] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem("chatPanelFloating");
      return stored ? stored === "true" : false;
    } catch {
      return false;
    }
  });
  const [chatOpenSignal, setChatOpenSignal] = React.useState<number>(0);
  const [isChatHidden, setIsChatHidden] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem("chatPanelHidden");
      return stored === "true";
    } catch {
      return false;
    }
  });

  const [isNavCollapsed, setIsNavCollapsed] = useNavCollapsed("project");

  // Measure global + project header heights
  React.useLayoutEffect(() => {
    const updateHeights = () => {
      const navBar = document.querySelector<HTMLElement>("header.header .nav-bar");
      const globalHeight = navBar ? navBar.getBoundingClientRect().height : 0;
      const projectHeight = projectHeaderRef.current
        ? projectHeaderRef.current.getBoundingClientRect().height
        : 0;
      setHeaderHeights({ global: globalHeight, project: projectHeight });
    };

    updateHeights();
    window.addEventListener("resize", updateHeights);
    return () => window.removeEventListener("resize", updateHeights);
  }, []);

  // Track mobile state
  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width < MOBILE_BREAKPOINT);
      setIsDesktop(width >= DESKTOP_BREAKPOINT);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Persist floatingThread state
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("chatPanelFloating", floatingThread ? "true" : "false");
    } catch {
      /* ignore write errors */
    }
  }, [floatingThread]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("chatPanelHidden", isChatHidden ? "true" : "false");
    } catch {
      /* ignore write errors */
    }
  }, [isChatHidden]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOpenChat = () => {
      setIsChatHidden(false);
      setFloatingThread((prev) => {
        if (!prev) {
          return true;
        }
        return prev;
      });
      setChatOpenSignal((prev) => prev + 1);
    };

    window.addEventListener("project-open-chat", handleOpenChat);

    return () => {
      window.removeEventListener("project-open-chat", handleOpenChat);
    };
  }, [setFloatingThread, setChatOpenSignal]);

  const handleHideChat = React.useCallback(() => {
    setIsChatHidden(true);
  }, []);

  const handleShowChat = React.useCallback(() => {
    setIsChatHidden(false);
    setChatOpenSignal((prev) => prev + 1);

    if (isMobile) {
      setFloatingThread((prev) => {
        if (prev) {
          return prev;
        }

        return true;
      });
    }
  }, [isMobile, setFloatingThread, setIsChatHidden, setChatOpenSignal]);

  const headerNode = React.useMemo(() => {
    if (React.isValidElement(header)) {
      return React.cloneElement(
        header as React.ReactElement<Record<string, unknown>>,
        {
          onOpenChat: handleShowChat,
          isChatHidden,
        }
      );
    }

    return header;
  }, [header, handleShowChat, isChatHidden]);

  const viewportUnit = React.useMemo(() => {
    if (typeof window === "undefined") {
      return "100vh";
    }

    if ("CSS" in window && window.CSS && typeof window.CSS.supports === "function") {
      return window.CSS.supports("height", "100dvh") ? "100dvh" : "100vh";
    }

    return "100vh";
  }, []);

  const headerOffset = headerHeights.global + headerHeights.project;
  const contentHeight = `calc(${viewportUnit} - ${headerOffset}px)`;

  const layoutStyles = React.useMemo<React.CSSProperties>(
    () => ({
      height: isMobile ? undefined : contentHeight,
      minHeight: isMobile ? contentHeight : 0,
      flexDirection: isMobile ? "column" : "row",
      overflow: isMobile ? "visible" : "hidden",
    }),
    [contentHeight, isMobile]
  );

  const contentContainerStyles = React.useMemo<React.CSSProperties>(
    () => ({
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      overflowY: isMobile ? "visible" : "auto",
      overflowX: "hidden",
    }),
    [isMobile]
  );

  const handleSetActiveView = React.useCallback(() => {}, []);
  const handleToggleNavigationCollapse = React.useCallback(() => {
    setIsNavCollapsed((prev) => !prev);
  }, [setIsNavCollapsed]);

  const loader = (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        minHeight: "40vh",
        padding: "2rem 0",
        width: "100%",
      }}
    >
      <Spinner />
    </div>
  );

  const unavailableState = (
    <div
      style={{
        alignItems: "center",
        color: "var(--text-muted, #6b7280)",
        display: "flex",
        fontSize: "1rem",
        justifyContent: "center",
        minHeight: "40vh",
        padding: "2rem",
        textAlign: "center",
        width: "100%",
      }}
    >
      We're having trouble loading this project right now.
    </div>
  );

  const bodyContent = isProjectLoading
    ? loader
    : shouldShowUnavailableState
    ? unavailableState
    : children;

  const mainContent = (
    <div
      className="dashboard-wrapper active-project-details"
      data-project-theme={theme ? "" : undefined}
      style={themeStyle}
    >
      <div
        ref={projectHeaderRef}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          backgroundColor: "#0c0c0c",
          display: "flex",
          flexDirection: "column",
          
        }}
      >
        <WelcomeHeader isDesktopLayout={isDesktop} showDesktopGreeting={false} />
        {headerNode ? (
          <div style={{ padding: "0" }}>{headerNode}</div>
        ) : null}
      </div>

      <div className="dashboard-layout" ref={layoutRef} style={layoutStyles}>
        <div style={contentContainerStyles}>
          {bodyContent}
        </div>

        {!isChatHidden && !floatingThread && !isMobile && (
          <>


            <div
              style={{
                flex: `0 0 ${threadWidth}px`,
                width: threadWidth,
                minWidth: MIN_THREAD_WIDTH,
                maxWidth: MAX_THREAD_WIDTH,
                height: "100%",
                minHeight: 0,
                marginLeft: "12px",
              }}
            >
              <_ProjectMessagesThread
                projectId={safeProjectId}
                open
                setOpen={(value) => {
                  void value;
                }}
                floating={false}
                setFloating={setFloatingThread}
                startDrag={(event) => {
                  void event;
                }}
                headerOffset={headerHeights.global + headerHeights.project}
                onCloseChat={handleHideChat}
              />
            </div>
          </>
        )}
      </div>

      {floatingThread && !isChatHidden && (
        <_ChatPanel
          projectId={safeProjectId}
          initialFloating
          onFloatingChange={setFloatingThread}
          openSignal={chatOpenSignal}
          onCloseChat={handleHideChat}
        />
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <div className={`dashboard-root${isNavCollapsed ? " dashboard-root--nav-collapsed" : ""}`}>
        <aside>
          <DashboardNavPanel 
            variant="persistent" 
            setActiveView={handleSetActiveView}
            isCollapsed={isNavCollapsed}
            onToggleCollapse={handleToggleNavigationCollapse}
          />
        </aside>
        <main className="dashboard-main">{mainContent}</main>
      </div>
    );
  }

  return mainContent;
};

export default ProjectPageLayout;











