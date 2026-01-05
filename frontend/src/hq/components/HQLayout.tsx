import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import DashboardNavPanel from "@/shared/ui/DashboardNavPanel";
import NavigationDrawer from "@/shared/ui/NavigationDrawer";
import { useNavCollapsed } from "@/shared/hooks/useNavCollapsed";
import { useUser } from "@/app/contexts/useUser";
import "@/dashboard/home/pages/dashboard-styles.css";
import WelcomeHeader from "@/dashboard/home/components/WelcomeHeader";
import styles from "./HQLayout.module.css";

type HQLayoutProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

type ViewportFlags = {
  isDesktop: boolean;
};

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
  const { userName } = useUser();
  const [flags, setFlags] = useState<ViewportFlags>(() => getViewportFlags());
  const [isNavCollapsed, setIsNavCollapsed] = useNavCollapsed("dashboard");
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const rawDrawerId = useId();
  const drawerId = useMemo(
    () => `hq-nav-${rawDrawerId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawDrawerId]
  );
  const mobileWelcomeHeaderRef = useRef<HTMLDivElement | null>(null);

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

  const handleOpenNavigation = () => setIsNavigationOpen(true);
  const handleCloseNavigation = () => setIsNavigationOpen(false);
  const handleToggleCollapse = () => setIsNavCollapsed((previous) => !previous);

  const handleSetActiveView = useCallback((view: string) => {
    void view;
  }, []);

  const pageHeader = (
    <header className={styles.pageHeader}>
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
    <header className={styles.mobilePageHeader}>
      <div className={styles.headingCopy}>
        <h1 className={styles.mobilePageTitle}>{title}</h1>
        {description ? (
          <p className={styles.mobilePageSubtitle}>{description}</p>
        ) : null}
      </div>
      {actions ? <div className={styles.mobileActionsRow}>{actions}</div> : null}
    </header>
  );

  const mobileWelcomeHeader = !flags.isDesktop ? (
    <div ref={mobileWelcomeHeaderRef} className={styles.mobileWelcomeHeader}>
      <WelcomeHeader
        userName={userName}
        setActiveView={handleSetActiveView}
        onToggleNavigation={handleOpenNavigation}
        isNavigationOpen={isNavigationOpen}
        navigationDrawerId={drawerId}
        isDesktopLayout={flags.isDesktop}
        showDesktopGreeting={false}
        showGlobalSearch
        showAvatar
      />
    </div>
  ) : null;

  const desktopWelcomeHeader = flags.isDesktop ? (
    <WelcomeHeader
      userName={userName}
      setActiveView={handleSetActiveView}
      isDesktopLayout={flags.isDesktop}
      showDesktopGreeting
      showGlobalSearch={false}
      showAvatar={false}
    />
  ) : null;

  const mainContent = (
    <main className="dashboard-main">
      {mobileWelcomeHeader}
      <div className={`dashboard-wrapper ${styles.wrapper}`}>
        <div className={styles.headerContainer}>
          {desktopWelcomeHeader}
          {flags.isDesktop ? pageHeader : mobilePageHeader}
        </div>
        <div className={styles.contentArea}>
          <div className={styles.content}>{children}</div>
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
    </>
  );
};

export default HQLayout;
