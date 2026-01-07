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
import { isOrgAdmin, useOrg } from "@/app/contexts/useOrg";
import { toast } from "react-toastify";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { deleteHqImportRun, fetchHqSummary, resetHqData } from "@/hq/lib/hqApi";
import "@/dashboard/home/pages/dashboard-styles.css";
import WelcomeHeader from "@/dashboard/home/components/WelcomeHeader";
import HqSelect from "@/hq/components/HqSelect";
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
  const { orgs, activeOrgId, activeOrgRole, setActiveOrgId, isLoading: orgsLoading, createOrg, deleteOrg } = useOrg();
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

  const canOrgAdmin = Boolean(activeOrgId) && isOrgAdmin(activeOrgRole);

  const [isDataLayersOpen, setIsDataLayersOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "remove-csv" | "remove-bank" | "remove-everything">(null);
  const [isShredding, setIsShredding] = useState(false);

  const requestConfirmOrRun = useCallback(
    (action: "remove-csv" | "remove-bank" | "remove-everything", run: () => Promise<void>) => {
      if (isShredding) return;
      if (confirmAction !== action) {
        setConfirmAction(action);
        return;
      }
      void run();
    },
    [confirmAction, isShredding]
  );

  const handleRemoveCsvDatasets = useCallback(async () => {
    if (!activeOrgId) return;
    if (!canOrgAdmin) return;
    if (isShredding) return;

    setIsShredding(true);
    setIsDataLayersOpen(false);
    setConfirmAction(null);

    try {
      const summary = await fetchHqSummary(activeOrgId);
      const runs = Array.isArray(summary.importRuns) ? summary.importRuns : [];
      if (!runs.length) {
        toast.info("No CSV datasets to remove.");
        return;
      }

      for (const r of runs) {
        if (!r?.importRunId) continue;
        await deleteHqImportRun(activeOrgId, r.importRunId);
      }

      toast.success("Removed CSV datasets.");
      window.dispatchEvent(new Event("mylg:hq-refresh"));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not remove CSV datasets.");
    } finally {
      setIsShredding(false);
    }
  }, [activeOrgId, canOrgAdmin, isShredding]);

  const handleRemoveBankTransactions = useCallback(async () => {
    if (!activeOrgId) return;
    if (!canOrgAdmin) return;
    if (isShredding) return;

    setIsShredding(true);
    setIsDataLayersOpen(false);
    setConfirmAction(null);

    try {
      await resetHqData(activeOrgId, "keepAccountsRulesAndImports");
      toast.success("Removed bank-synced transactions.");
      window.dispatchEvent(new Event("mylg:hq-refresh"));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not remove bank-synced transactions.");
    } finally {
      setIsShredding(false);
    }
  }, [activeOrgId, canOrgAdmin, isShredding]);

  const handleRemoveEverything = useCallback(async () => {
    if (!activeOrgId) return;
    if (!canOrgAdmin) return;
    if (isShredding) return;

    setIsShredding(true);
    setIsDataLayersOpen(false);
    setConfirmAction(null);

    try {
      await resetHqData(activeOrgId, "all");
      toast.success("Removed everything.");
      window.dispatchEvent(new Event("mylg:hq-refresh"));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not remove everything.");
    } finally {
      setIsShredding(false);
    }
  }, [activeOrgId, canOrgAdmin, isShredding]);

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
            <div className={styles.orgPickerSelect}>
              <HqSelect
                value={activeOrgId ?? ""}
                onValueChange={(v) => setActiveOrgId(v)}
                disabled={orgsLoading || orgs.length === 0}
                ariaLabel="Organization"
                placeholder={orgs.length ? "Select…" : "No orgs"}
                options={orgs.map((org) => ({ value: org.orgId, label: org.name || org.orgId }))}
              />
            </div>
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

          {canOrgAdmin && activeOrgId ? (
            <DropdownMenu.Root
              open={isDataLayersOpen}
              onOpenChange={(open) => {
                setIsDataLayersOpen(open);
                if (!open) setConfirmAction(null);
              }}
            >
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={styles.orgCreateButton}
                  aria-haspopup="menu"
                  aria-expanded={isDataLayersOpen}
                  disabled={isShredding}
                >
                  Data layers
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className={styles.dataLayersMenu}
                  sideOffset={8}
                  align="end"
                  collisionPadding={12}
                >
                  <DropdownMenu.Label className={styles.dataLayersMenuLabel}>Data layers</DropdownMenu.Label>
                  <div className={styles.dataLayersMenuHint}>
                    Bank connection (account stays) · Imported CSV datasets · Categorization rules
                  </div>
                  <DropdownMenu.Separator className={styles.dataLayersMenuSeparator} />

                  <DropdownMenu.Item asChild>
                    <button
                      type="button"
                      className={[styles.dataLayersMenuItem, styles.dataLayersMenuItemDanger].join(" ")}
                      onClick={() =>
                        requestConfirmOrRun("remove-csv", async () => {
                          await handleRemoveCsvDatasets();
                        })
                      }
                      disabled={isShredding}
                    >
                      <span className={styles.dataLayersMenuItemTitle}>
                        {confirmAction === "remove-csv" ? "Confirm: Remove CSV datasets" : "Remove CSV datasets"}
                      </span>
                      <span className={styles.dataLayersMenuItemDesc}>
                        Deletes imported CSV datasets. Keeps account + bank sync + rules.
                      </span>
                    </button>
                  </DropdownMenu.Item>

                  <DropdownMenu.Item asChild>
                    <button
                      type="button"
                      className={[styles.dataLayersMenuItem, styles.dataLayersMenuItemDanger].join(" ")}
                      onClick={() =>
                        requestConfirmOrRun("remove-bank", async () => {
                          await handleRemoveBankTransactions();
                        })
                      }
                      disabled={isShredding}
                    >
                      <span className={styles.dataLayersMenuItemTitle}>
                        {confirmAction === "remove-bank"
                          ? "Confirm: Remove bank-synced transactions"
                          : "Remove bank-synced transactions"}
                      </span>
                      <span className={styles.dataLayersMenuItemDesc}>
                        Clears only bank-synced transactions. Keeps accounts + rules + CSV imports.
                      </span>
                    </button>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className={styles.dataLayersMenuSeparator} />

                  <DropdownMenu.Item asChild>
                    <button
                      type="button"
                      className={[styles.dataLayersMenuItem, styles.dataLayersMenuItemDanger].join(" ")}
                      onClick={() =>
                        requestConfirmOrRun("remove-everything", async () => {
                          await handleRemoveEverything();
                        })
                      }
                      disabled={isShredding}
                    >
                      <span className={styles.dataLayersMenuItemTitle}>
                        {confirmAction === "remove-everything" ? "Confirm: Remove everything" : "Remove everything"}
                      </span>
                      <span className={styles.dataLayersMenuItemDesc}>Deletes account + all data + rules (rare).</span>
                    </button>
                  </DropdownMenu.Item>

                  {confirmAction ? (
                    <div className={styles.dataLayersMenuHintStrong}>Click the same action again to confirm.</div>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
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
          <div className={styles.orgPickerSelect}>
            <HqSelect
              value={activeOrgId ?? ""}
              onValueChange={(v) => setActiveOrgId(v)}
              disabled={orgsLoading || orgs.length === 0}
              ariaLabel="Organization"
              placeholder={orgs.length ? "Select…" : "No orgs"}
              options={orgs.map((org) => ({ value: org.orgId, label: org.name || org.orgId }))}
            />
          </div>
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
        {canOrgAdmin && activeOrgId ? (
          <DropdownMenu.Root
            open={isDataLayersOpen}
            onOpenChange={(open) => {
              setIsDataLayersOpen(open);
              if (!open) setConfirmAction(null);
            }}
          >
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={styles.orgCreateButton}
                aria-haspopup="menu"
                aria-expanded={isDataLayersOpen}
                disabled={isShredding}
              >
                Data layers
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={styles.dataLayersMenu}
                sideOffset={8}
                align="end"
                collisionPadding={12}
              >
                <DropdownMenu.Label className={styles.dataLayersMenuLabel}>Data layers</DropdownMenu.Label>
                <div className={styles.dataLayersMenuHint}>
                  Bank connection (account stays) · Imported CSV datasets · Categorization rules
                </div>
                <DropdownMenu.Separator className={styles.dataLayersMenuSeparator} />

                <DropdownMenu.Item asChild>
                  <button
                    type="button"
                    className={[styles.dataLayersMenuItem, styles.dataLayersMenuItemDanger].join(" ")}
                    onClick={() =>
                      requestConfirmOrRun("remove-csv", async () => {
                        await handleRemoveCsvDatasets();
                      })
                    }
                    disabled={isShredding}
                  >
                    <span className={styles.dataLayersMenuItemTitle}>
                      {confirmAction === "remove-csv" ? "Confirm: Remove CSV datasets" : "Remove CSV datasets"}
                    </span>
                    <span className={styles.dataLayersMenuItemDesc}>
                      Deletes imported CSV datasets. Keeps account + bank sync + rules.
                    </span>
                  </button>
                </DropdownMenu.Item>

                <DropdownMenu.Item asChild>
                  <button
                    type="button"
                    className={[styles.dataLayersMenuItem, styles.dataLayersMenuItemDanger].join(" ")}
                    onClick={() =>
                      requestConfirmOrRun("remove-bank", async () => {
                        await handleRemoveBankTransactions();
                      })
                    }
                    disabled={isShredding}
                  >
                    <span className={styles.dataLayersMenuItemTitle}>
                      {confirmAction === "remove-bank"
                        ? "Confirm: Remove bank-synced transactions"
                        : "Remove bank-synced transactions"}
                    </span>
                    <span className={styles.dataLayersMenuItemDesc}>
                      Clears only bank-synced transactions. Keeps accounts + rules + CSV imports.
                    </span>
                  </button>
                </DropdownMenu.Item>

                <DropdownMenu.Separator className={styles.dataLayersMenuSeparator} />

                <DropdownMenu.Item asChild>
                  <button
                    type="button"
                    className={[styles.dataLayersMenuItem, styles.dataLayersMenuItemDanger].join(" ")}
                    onClick={() =>
                      requestConfirmOrRun("remove-everything", async () => {
                        await handleRemoveEverything();
                      })
                    }
                    disabled={isShredding}
                  >
                    <span className={styles.dataLayersMenuItemTitle}>
                      {confirmAction === "remove-everything" ? "Confirm: Remove everything" : "Remove everything"}
                    </span>
                    <span className={styles.dataLayersMenuItemDesc}>Deletes account + all data + rules (rare).</span>
                  </button>
                </DropdownMenu.Item>

                {confirmAction ? (
                  <div className={styles.dataLayersMenuHintStrong}>Click the same action again to confirm.</div>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
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
