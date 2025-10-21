import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DashboardNavPanel from "@/shared/ui/DashboardNavPanel";
import NavigationDrawer from "@/shared/ui/NavigationDrawer";
import { useNavCollapsed } from "@/shared/hooks/useNavCollapsed";
import { useUser } from "@/app/contexts/useUser";
import ProjectMessagesThread from "@/dashboard/features/messages/ProjectMessagesThread";
import ChatPanel from "@/dashboard/project/components/Shared/ChatPanel";
import "@/dashboard/home/pages/dashboard-styles.css";
import WelcomeHeader from "@/dashboard/home/components/WelcomeHeader";
import styles from "./HQLayout.module.css";

type HQLayoutProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

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

type ViewportFlags = {
  isDesktop: boolean;
};

const HQ_PROJECT_ID = "ed504178-de7a-41b2-899d-dae2232e4139";
const THREAD_WIDTH = 360;
const FLOATING_STORAGE_KEY = "hqChatPanelFloating";
const HIDDEN_STORAGE_KEY = "hqChatPanelHidden";

const _ProjectMessagesThread =
  ProjectMessagesThread as unknown as React.FC<ProjectMessagesThreadProps>;
const _ChatPanel = ChatPanel as unknown as React.FC<ChatPanelProps>;

function getViewportFlags(): ViewportFlags {
  if (typeof window === "undefined") {
    return { isDesktop: true };
  }

  return { isDesktop: window.innerWidth >= 1024 };
}

const noop = () => {};

const HQLayout: React.FC<HQLayoutProps> = ({
  title,
  description,
  actions,
  children,
}) => {
  const { isAdmin, userName } = useUser();
  const [flags, setFlags] = useState<ViewportFlags>(() => getViewportFlags());
  const [isNavCollapsed, setIsNavCollapsed] = useNavCollapsed("dashboard");
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const rawDrawerId = useId();
  const drawerId = useMemo(
    () => `hq-nav-${rawDrawerId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawDrawerId]
  );
  const pageHeaderRef = useRef<HTMLElement | null>(null);
  const [headerOffset, setHeaderOffset] = useState<number>(0);
  const mobileWelcomeHeaderRef = useRef<HTMLDivElement | null>(null);
  const [floatingThread, setFloatingThread] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(FLOATING_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [chatOpenSignal, setChatOpenSignal] = useState<number>(0);
  const [isChatHidden, setIsChatHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(HIDDEN_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleResize = () => setFlags(getViewportFlags());
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const { body } = document;
    if (!body) return;
    body.classList.add("hq-hide-marketing-nav");
    return () => {
      body.classList.remove("hq-hide-marketing-nav");
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        FLOATING_STORAGE_KEY,
        floatingThread ? "true" : "false"
      );
    } catch {
      /* ignore */
    }
  }, [floatingThread]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(HIDDEN_STORAGE_KEY, isChatHidden ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [isChatHidden]);

  const updateHeaderOffset = useCallback(() => {
    if (typeof window === "undefined") return;
    const navBar = document.querySelector(
      "header.header .nav-bar"
    ) as HTMLElement | null;
    const globalHeight = navBar ? navBar.getBoundingClientRect().height : 0;
    const localHeight = pageHeaderRef.current
      ? pageHeaderRef.current.getBoundingClientRect().height
      : 0;
    const welcomeHeight = mobileWelcomeHeaderRef.current
      ? mobileWelcomeHeaderRef.current.getBoundingClientRect().height
      : 0;
    setHeaderOffset(globalHeight + localHeight + welcomeHeight);
  }, []);

  useLayoutEffect(() => {
    updateHeaderOffset();
    window.addEventListener("resize", updateHeaderOffset);
    return () => window.removeEventListener("resize", updateHeaderOffset);
  }, [updateHeaderOffset]);

  useEffect(() => {
    updateHeaderOffset();
  }, [
    updateHeaderOffset,
    flags.isDesktop,
    isNavCollapsed,
    title,
    description,
    actions,
    userName,
  ]);

  const handleShowChat = useCallback(() => {
    setIsChatHidden(false);
    setFloatingThread(true);
    setChatOpenSignal((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOpenChatEvent = () => {
      if (!isAdmin) return;
      handleShowChat();
    };

    window.addEventListener("hq-open-chat", handleOpenChatEvent);
    return () => window.removeEventListener("hq-open-chat", handleOpenChatEvent);
  }, [handleShowChat, isAdmin]);

  const handleOpenNavigation = () => setIsNavigationOpen(true);
  const handleCloseNavigation = () => setIsNavigationOpen(false);
  const handleToggleCollapse = () => setIsNavCollapsed((previous) => !previous);

  const handleHideChat = useCallback(() => {
    setIsChatHidden(true);
  }, []);

  const handleSetActiveView = useCallback((view: string) => {
    void view;
  }, []);

  const pageHeader = (
    <header
      ref={pageHeaderRef}
      className={`${styles.pageHeader} welcome-header-desktop`}
    >
      <div className={styles.pageHeading}>
        <div className={styles.headingCopy}>
          <h1 className={styles.pageTitle}>{title}</h1>
          {description ? (
            <p className={styles.pageSubtitle}>{description}</p>
          ) : null}
        </div>
        {actions ? <div className={styles.actionsRow}>{actions}</div> : null}
      </div>
    </header>
  );

  const mobilePageHeader = (
    <header
      ref={pageHeaderRef}
      className={`${styles.mobilePageHeader} welcome-header-desktop`}
    >
      <div className={styles.headingCopy}>
        <h1 className={styles.mobilePageTitle}>{title}</h1>
        {description ? (
          <p className={styles.mobilePageSubtitle}>{description}</p>
        ) : null}
      </div>
      {actions ? <div className={styles.mobileActionsRow}>{actions}</div> : null}
    </header>
  );

  const noopSetOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      void value;
    },
    []
  );

  const noopStartDrag = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    void event;
  }, []);

  const shouldRenderDockedThread =
    isAdmin && !isChatHidden && !floatingThread && flags.isDesktop;

  const shouldRenderFloatingPanel =
    isAdmin && !isChatHidden && (floatingThread || !flags.isDesktop);

  const mobileWelcomeHeader = !flags.isDesktop ? (
    <div ref={mobileWelcomeHeaderRef} className={styles.mobileWelcomeHeader}>
      <WelcomeHeader
        userName={userName}
        setActiveView={handleSetActiveView}
        onToggleNavigation={handleOpenNavigation}
        isNavigationOpen={isNavigationOpen}
        navigationDrawerId={drawerId}
        isDesktopLayout={flags.isDesktop}
      />
    </div>
  ) : null;

  const mainContent = (
    <main className="dashboard-main">
      {mobileWelcomeHeader}
      <div className={`dashboard-wrapper ${styles.wrapper}`}>
        {flags.isDesktop ? pageHeader : mobilePageHeader}
        <div className={styles.contentArea}>
          <div className={styles.content}>{children}</div>
          {shouldRenderDockedThread ? (
            <div
              className={styles.threadColumn}
              style={{ width: THREAD_WIDTH, flexBasis: THREAD_WIDTH }}
            >
              <_ProjectMessagesThread
                projectId={HQ_PROJECT_ID}
                open
                setOpen={noopSetOpen}
                floating={false}
                setFloating={setFloatingThread}
                startDrag={noopStartDrag}
                headerOffset={headerOffset}
                onCloseChat={handleHideChat}
              />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );

  if (flags.isDesktop) {
    return (
      <div
        className={`dashboard-root${
          isNavCollapsed ? " dashboard-root--nav-collapsed" : ""
        }`}
      >
        <aside>
          <DashboardNavPanel
            variant="persistent"
            setActiveView={noop}
            isCollapsed={isNavCollapsed}
            onToggleCollapse={handleToggleCollapse}
          />
        </aside>
        {mainContent}
        {shouldRenderFloatingPanel ? (
          <_ChatPanel
            projectId={HQ_PROJECT_ID}
            initialFloating
            onFloatingChange={setFloatingThread}
            openSignal={chatOpenSignal}
            onCloseChat={handleHideChat}
          />
        ) : null}
        {isAdmin && isChatHidden ? (
          <button
            type="button"
            className={styles.chatReopenButton}
            onClick={handleShowChat}
          >
            Open HQ messages
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <NavigationDrawer
        open={isNavigationOpen}
        onClose={handleCloseNavigation}
        setActiveView={noop}
        drawerId={drawerId}
      />
      {mainContent}
      {shouldRenderFloatingPanel ? (
        <_ChatPanel
          projectId={HQ_PROJECT_ID}
          initialFloating
          onFloatingChange={setFloatingThread}
          openSignal={chatOpenSignal}
          onCloseChat={handleHideChat}
        />
      ) : null}
      {isAdmin && isChatHidden ? (
        <button
          type="button"
          className={styles.chatReopenButton}
          onClick={handleShowChat}
        >
          Open HQ messages
        </button>
      ) : null}
    </>
  );
};

export default HQLayout;
