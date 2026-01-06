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
import { useOrg } from "@/app/contexts/useOrg";
import { toast } from "react-toastify";
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
  const { userName, isAdmin } = useUser();
  const { orgs, activeOrgId, setActiveOrgId, isLoading: orgsLoading, createOrg, deleteOrg } = useOrg();
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

  const handleCreateOrg = useCallback(async () => {
    const name = window.prompt("Organization name?");
    if (!name) return;
    try {
      await createOrg(name);
      toast.success("Organization created.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not create organization.");
    }
  }, [createOrg]);

  const activeOrgName = useMemo(() => {
    const match = orgs.find((org) => org.orgId === activeOrgId);
    return match?.name || match?.orgId || null;
  }, [activeOrgId, orgs]);

  const handleDeleteOrg = useCallback(async () => {
    if (!activeOrgId) return;
    const label = activeOrgName ? `"${activeOrgName}"` : activeOrgId;
    const ok = window.confirm(`Delete org ${label}? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteOrg(activeOrgId);
      toast.success("Organization deleted.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not delete organization.");
    }
  }, [activeOrgId, activeOrgName, deleteOrg]);

  const pageHeader = (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeading}>
        <div className={styles.headingCopy}>
          <h1 className={styles.pageTitle}>{title}</h1>
          {description ? (
            <p className={styles.pageSubtitle}>{description}</p>
          ) : null}
        </div>
        <div className={styles.actionsRow}>
          <label className={styles.orgPicker} aria-label="Organization">
            <span className={styles.orgPickerLabel}>Org</span>
            <select
              className={styles.orgPickerSelect}
              value={activeOrgId ?? ""}
              onChange={(e) => setActiveOrgId(e.target.value)}
              disabled={orgsLoading || orgs.length === 0}
            >
              {orgs.length === 0 ? <option value="">No orgs</option> : null}
              {orgs.map((org) => (
                <option key={org.orgId} value={org.orgId}>
                  {org.name || org.orgId}
                </option>
              ))}
            </select>
          </label>
          {isAdmin ? (
            <button type="button" className={styles.orgCreateButton} onClick={handleCreateOrg}>
              Create org
            </button>
          ) : null}
          {isAdmin && activeOrgId ? (
            <button type="button" className={styles.orgCreateButton} onClick={handleDeleteOrg}>
              Delete org
            </button>
          ) : null}
          {actions ? <div className={styles.actionSlot}>{actions}</div> : null}
        </div>
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
      <div className={styles.mobileActionsRow}>
        <label className={styles.orgPicker} aria-label="Organization">
          <span className={styles.orgPickerLabel}>Org</span>
          <select
            className={styles.orgPickerSelect}
            value={activeOrgId ?? ""}
            onChange={(e) => setActiveOrgId(e.target.value)}
            disabled={orgsLoading || orgs.length === 0}
          >
            {orgs.length === 0 ? <option value="">No orgs</option> : null}
            {orgs.map((org) => (
              <option key={org.orgId} value={org.orgId}>
                {org.name || org.orgId}
              </option>
            ))}
          </select>
        </label>
        {isAdmin ? (
          <button type="button" className={styles.orgCreateButton} onClick={handleCreateOrg}>
            Create org
          </button>
        ) : null}
        {isAdmin && activeOrgId ? (
          <button type="button" className={styles.orgCreateButton} onClick={handleDeleteOrg}>
            Delete org
          </button>
        ) : null}
        {actions ? <div className={styles.actionSlot}>{actions}</div> : null}
      </div>
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
