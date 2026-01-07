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
import { FaExclamationTriangle } from "react-icons/fa";
import { deleteHqImportRun, fetchHqSummary, resetHqData } from "@/hq/lib/hqApi";
import "@/dashboard/home/pages/dashboard-styles.css";
import WelcomeHeader from "@/dashboard/home/components/WelcomeHeader";
import Modal from "@/shared/ui/ModalWithStack";
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const rootElement = document.getElementById("root");
    if (rootElement) {
      Modal.setAppElement(rootElement);
    } else {
      Modal.setAppElement("body");
    }
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

  const [isShredMenuOpen, setIsShredMenuOpen] = useState(false);
  const [isShredding, setIsShredding] = useState(false);

  type ShredConfirmAction = null | "remove-csv" | "remove-bank" | "remove-everything";
  const [confirmAction, setConfirmAction] = useState<ShredConfirmAction>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isWhatStaysOpen, setIsWhatStaysOpen] = useState(false);

  const desktopGreetingMessage = useMemo(() => {
    if (!flags.isDesktop) return null;

    const rawName = (userName || "User").trim();
    const firstToken = rawName.split(/\s+/)[0] || "User";
    const normalizedFirstName = firstToken
      ? firstToken.charAt(0).toUpperCase() + firstToken.slice(1)
      : "User";

    const hour = new Date().getHours();
    let baseGreeting = "Good evening";
    if (hour < 12) baseGreeting = "Good morning";
    else if (hour < 18) baseGreeting = "Good afternoon";

    return `${baseGreeting}, ${normalizedFirstName}!`;
  }, [flags.isDesktop, userName]);

  const handleRemoveCsvDatasets = useCallback(async () => {
    if (!activeOrgId) return;
    if (!canOrgAdmin) return;
    if (isShredding) return;

    setIsShredding(true);
    setIsShredMenuOpen(false);

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
    setIsShredMenuOpen(false);

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
    setIsShredMenuOpen(false);

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

  const closeConfirm = useCallback(() => {
    setConfirmAction(null);
    setConfirmText("");
  }, []);

  const confirmTitle = useMemo(() => {
    if (confirmAction === "remove-csv") return "Shred CSV imports?";
    if (confirmAction === "remove-bank") return "Shred bank transactions?";
    if (confirmAction === "remove-everything") return "Shred everything?";
    return "";
  }, [confirmAction]);

  const confirmPrimaryLabel = useMemo(() => {
    if (confirmAction === "remove-csv") return "Shred CSV imports";
    if (confirmAction === "remove-bank") return "Shred bank transactions";
    if (confirmAction === "remove-everything") return "Shred everything";
    return "";
  }, [confirmAction]);

  const isShredEverythingEnabled = confirmAction === "remove-everything" && confirmText.trim().toUpperCase() === "SHRED";

  const pageHeader = (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeading}>
        <div className={styles.headingCopy}>
          <h1 className={styles.pageTitle}>{title}</h1>
          {description ? <p className={styles.pageSubtitle}>{description}</p> : null}
        </div>

        <div className={styles.headerRightStack}>
          {desktopGreetingMessage ? (
            <div className={styles.pageGreeting} aria-live="polite">
              {desktopGreetingMessage}
            </div>
          ) : null}

          <div className={styles.actionsRow}>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={[styles.orgCreateButton, styles.orgDropdownTrigger].join(" ")}
                  aria-haspopup="menu"
                  disabled={orgsLoading}
                >
                  <span className={styles.orgDropdownPrefix}>Org:</span>
                  <span className={styles.orgDropdownValue}>{activeOrgName ?? (orgs.length ? "Select…" : "No orgs")}</span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className={styles.orgMenu}
                  sideOffset={8}
                  align="end"
                  collisionPadding={12}
                >
                  <DropdownMenu.Label className={styles.orgMenuLabel}>Org</DropdownMenu.Label>
                  <DropdownMenu.Separator className={styles.orgMenuSeparator} />

                  {orgs.length ? (
                    <DropdownMenu.RadioGroup
                      value={activeOrgId ?? ""}
                      onValueChange={(v) => setActiveOrgId(v)}
                    >
                      {orgs.map((org) => (
                        <DropdownMenu.RadioItem
                          key={org.orgId}
                          value={org.orgId}
                          className={styles.orgMenuRadioItem}
                        >
                          <span className={styles.orgMenuRadioLabel}>{org.name || org.orgId}</span>
                          <DropdownMenu.ItemIndicator className={styles.orgMenuRadioIndicator}>
                            ✓
                          </DropdownMenu.ItemIndicator>
                        </DropdownMenu.RadioItem>
                      ))}
                    </DropdownMenu.RadioGroup>
                  ) : (
                    <div className={styles.orgMenuHint}>No orgs yet.</div>
                  )}

                  {isAdmin ? (
                    <>
                      <DropdownMenu.Separator className={styles.orgMenuSeparator} />
                      <DropdownMenu.Item asChild>
                        <button type="button" className={styles.orgMenuItem} onClick={handleCreateOrg}>
                          Create org…
                        </button>
                      </DropdownMenu.Item>
                      {activeOrgId ? (
                        <>
                          <DropdownMenu.Separator className={styles.orgMenuSeparator} />
                          <DropdownMenu.Item asChild>
                            <button
                              type="button"
                              className={[styles.orgMenuItem, styles.orgMenuItemDanger].join(" ")}
                              onClick={handleDeleteOrg}
                            >
                              Delete org…
                            </button>
                          </DropdownMenu.Item>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {canOrgAdmin && activeOrgId ? (
              <DropdownMenu.Root
                open={isShredMenuOpen}
                onOpenChange={(open) => {
                  setIsShredMenuOpen(open);
                }}
              >
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className={styles.orgCreateButton}
                    aria-haspopup="menu"
                    aria-expanded={isShredMenuOpen}
                    disabled={isShredding}
                  >
                    Shred data
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className={styles.dataLayersMenu}
                    sideOffset={8}
                    align="end"
                    collisionPadding={12}
                  >
                    <DropdownMenu.Label className={styles.dataLayersMenuLabel}>Shred data</DropdownMenu.Label>
                    <div className={styles.dataLayersMenuHint}>Choose what to delete. Accounts stay unless you pick the full reset.</div>
                    <DropdownMenu.Separator className={styles.dataLayersMenuSeparator} />

                    <div className={styles.dataLayersMenuItems}>
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          className={styles.dataLayersMenuItem}
                          onClick={() => {
                            setIsShredMenuOpen(false);
                            setConfirmAction("remove-csv");
                          }}
                          disabled={isShredding}
                        >
                          <span className={styles.dataLayersMenuItemTitle}>Shred CSV imports</span>
                          <span className={styles.dataLayersMenuItemDesc}>
                            Deletes imported CSV rows. Keeps accounts + bank sync + rules.
                          </span>
                        </button>
                      </DropdownMenu.Item>

                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          className={styles.dataLayersMenuItem}
                          onClick={() => {
                            setIsShredMenuOpen(false);
                            setConfirmAction("remove-bank");
                          }}
                          disabled={isShredding}
                        >
                          <span className={styles.dataLayersMenuItemTitle}>Shred bank transactions</span>
                          <span className={styles.dataLayersMenuItemDesc}>
                            Deletes bank-synced rows. Keeps accounts + rules + CSV imports.
                          </span>
                        </button>
                      </DropdownMenu.Item>
                    </div>

                    <DropdownMenu.Separator className={styles.dataLayersMenuSeparator} />
                    <div className={styles.dataLayersDangerZoneLabel}>Danger zone</div>
                    <div className={styles.dataLayersDangerZoneSpacer} />

                    <DropdownMenu.Item asChild>
                      <button
                        type="button"
                        className={[styles.dataLayersMenuItem, styles.dataLayersMenuItemDanger].join(" ")}
                        onClick={() => {
                          setIsShredMenuOpen(false);
                          setConfirmAction("remove-everything");
                        }}
                        disabled={isShredding}
                      >
                        <span className={styles.dataLayersMenuItemTitle}>
                          <span className={styles.dataLayersDangerTitleRow}>
                            <FaExclamationTriangle className={styles.dataLayersDangerIcon} aria-hidden="true" />
                            Shred everything
                          </span>
                        </span>
                        <span className={styles.dataLayersMenuItemDesc}>Deletes accounts + all transactions + rules. Irreversible.</span>
                      </button>
                    </DropdownMenu.Item>

                    <button
                      type="button"
                      className={styles.dataLayersFooterLink}
                      onClick={() => {
                        setIsShredMenuOpen(false);
                        setIsWhatStaysOpen(true);
                      }}
                    >
                      Learn what stays
                    </button>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : null}
            {actions ? <div className={styles.actionSlot}>{actions}</div> : null}
          </div>
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
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={[styles.orgCreateButton, styles.orgDropdownTrigger].join(" ")}
              aria-haspopup="menu"
              disabled={orgsLoading}
            >
              <span className={styles.orgDropdownPrefix}>Org:</span>
              <span className={styles.orgDropdownValue}>{activeOrgName ?? (orgs.length ? "Select…" : "No orgs")}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={styles.orgMenu}
              sideOffset={8}
              align="end"
              collisionPadding={12}
            >
              <DropdownMenu.Label className={styles.orgMenuLabel}>Org</DropdownMenu.Label>
              <DropdownMenu.Separator className={styles.orgMenuSeparator} />

              {orgs.length ? (
                <DropdownMenu.RadioGroup
                  value={activeOrgId ?? ""}
                  onValueChange={(v) => setActiveOrgId(v)}
                >
                  {orgs.map((org) => (
                    <DropdownMenu.RadioItem
                      key={org.orgId}
                      value={org.orgId}
                      className={styles.orgMenuRadioItem}
                    >
                      <span className={styles.orgMenuRadioLabel}>{org.name || org.orgId}</span>
                      <DropdownMenu.ItemIndicator className={styles.orgMenuRadioIndicator}>
                        ✓
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              ) : (
                <div className={styles.orgMenuHint}>No orgs yet.</div>
              )}

              {isAdmin ? (
                <>
                  <DropdownMenu.Separator className={styles.orgMenuSeparator} />
                  <DropdownMenu.Item asChild>
                    <button type="button" className={styles.orgMenuItem} onClick={handleCreateOrg}>
                      Create org…
                    </button>
                  </DropdownMenu.Item>
                  {activeOrgId ? (
                    <>
                      <DropdownMenu.Separator className={styles.orgMenuSeparator} />
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          className={[styles.orgMenuItem, styles.orgMenuItemDanger].join(" ")}
                          onClick={handleDeleteOrg}
                        >
                          Delete org…
                        </button>
                      </DropdownMenu.Item>
                    </>
                  ) : null}
                </>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {canOrgAdmin && activeOrgId ? (
          <DropdownMenu.Root
            open={isShredMenuOpen}
            onOpenChange={(open) => {
              setIsShredMenuOpen(open);
            }}
          >
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={styles.orgCreateButton}
                aria-haspopup="menu"
                aria-expanded={isShredMenuOpen}
                disabled={isShredding}
              >
                Shred data
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={styles.dataLayersMenu}
                sideOffset={8}
                align="end"
                collisionPadding={12}
              >
                <DropdownMenu.Label className={styles.dataLayersMenuLabel}>Shred data</DropdownMenu.Label>
                <div className={styles.dataLayersMenuHint}>Choose what to delete. Accounts stay unless you pick the full reset.</div>
                <DropdownMenu.Separator className={styles.dataLayersMenuSeparator} />

                <div className={styles.dataLayersMenuItems}>
                  <DropdownMenu.Item asChild>
                    <button
                      type="button"
                      className={styles.dataLayersMenuItem}
                      onClick={() => {
                        setIsShredMenuOpen(false);
                        setConfirmAction("remove-csv");
                      }}
                      disabled={isShredding}
                    >
                      <span className={styles.dataLayersMenuItemTitle}>Shred CSV imports</span>
                      <span className={styles.dataLayersMenuItemDesc}>
                        Deletes imported CSV rows. Keeps accounts + bank sync + rules.
                      </span>
                    </button>
                  </DropdownMenu.Item>

                  <DropdownMenu.Item asChild>
                    <button
                      type="button"
                      className={styles.dataLayersMenuItem}
                      onClick={() => {
                        setIsShredMenuOpen(false);
                        setConfirmAction("remove-bank");
                      }}
                      disabled={isShredding}
                    >
                      <span className={styles.dataLayersMenuItemTitle}>Shred bank transactions</span>
                      <span className={styles.dataLayersMenuItemDesc}>
                        Deletes bank-synced rows. Keeps accounts + rules + CSV imports.
                      </span>
                    </button>
                  </DropdownMenu.Item>
                </div>

                <DropdownMenu.Separator className={styles.dataLayersMenuSeparator} />
                <div className={styles.dataLayersDangerZoneLabel}>Danger zone</div>
                <div className={styles.dataLayersDangerZoneSpacer} />

                <DropdownMenu.Item asChild>
                  <button
                    type="button"
                    className={[styles.dataLayersMenuItem, styles.dataLayersMenuItemDanger].join(" ")}
                    onClick={() => {
                      setIsShredMenuOpen(false);
                      setConfirmAction("remove-everything");
                    }}
                    disabled={isShredding}
                  >
                    <span className={styles.dataLayersMenuItemTitle}>
                      <span className={styles.dataLayersDangerTitleRow}>
                        <FaExclamationTriangle className={styles.dataLayersDangerIcon} aria-hidden="true" />
                        Shred everything
                      </span>
                    </span>
                    <span className={styles.dataLayersMenuItemDesc}>Deletes accounts + all transactions + rules. Irreversible.</span>
                  </button>
                </DropdownMenu.Item>

                <button
                  type="button"
                  className={styles.dataLayersFooterLink}
                  onClick={() => {
                    setIsShredMenuOpen(false);
                    setIsWhatStaysOpen(true);
                  }}
                >
                  Learn what stays
                </button>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
        {actions ? <div className={styles.actionSlot}>{actions}</div> : null}
      </div>
    </header>
  );

  const shredConfirmModal = (
    <Modal
      isOpen={confirmAction !== null}
      onRequestClose={closeConfirm}
      contentLabel={confirmTitle || "Confirm shred"}
      className={styles.modalContent}
      overlayClassName={styles.modalOverlay}
      shouldCloseOnOverlayClick={!isShredding}
      shouldCloseOnEsc={!isShredding}
    >
      <div className={styles.modal}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{confirmTitle}</h2>
        </header>

        {confirmAction === "remove-csv" ? (
          <div className={styles.modalBody}>
            <p className={styles.modalBodyText}>This deletes imported CSV rows.</p>
            <div className={styles.modalChecklistTitle}>Keeps:</div>
            <ul className={styles.modalChecklist}>
              <li>Accounts</li>
              <li>Bank sync</li>
              <li>Rules</li>
            </ul>
          </div>
        ) : null}

        {confirmAction === "remove-bank" ? (
          <div className={styles.modalBody}>
            <p className={styles.modalBodyText}>This deletes bank-synced rows.</p>
            <div className={styles.modalChecklistTitle}>Keeps:</div>
            <ul className={styles.modalChecklist}>
              <li>Accounts</li>
              <li>Rules</li>
              <li>CSV imports</li>
            </ul>
          </div>
        ) : null}

        {confirmAction === "remove-everything" ? (
          <div className={styles.modalBody}>
            <p className={styles.modalBodyText}>This is irreversible. Type SHRED to enable the button.</p>
            <div className={styles.modalChecklistTitle}>Will remove:</div>
            <ul className={styles.modalChecklist}>
              <li>Accounts</li>
              <li>Bank transactions</li>
              <li>CSV imports</li>
              <li>Rules</li>
            </ul>
            <label className={styles.modalField}>
              <span className={styles.modalFieldLabel}>Type SHRED</span>
              <input
                className={styles.modalInput}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="SHRED"
                autoComplete="off"
                disabled={isShredding}
              />
            </label>
          </div>
        ) : null}

        <div className={styles.modalActions}>
          <button type="button" className={styles.modalSecondaryButton} onClick={closeConfirm} disabled={isShredding}>
            Cancel
          </button>
          <button
            type="button"
            className={
              confirmAction === "remove-everything"
                ? styles.modalDangerButton
                : styles.modalPrimaryButton
            }
            onClick={async () => {
              if (confirmAction === "remove-csv") {
                closeConfirm();
                await handleRemoveCsvDatasets();
                return;
              }
              if (confirmAction === "remove-bank") {
                closeConfirm();
                await handleRemoveBankTransactions();
                return;
              }
              if (confirmAction === "remove-everything") {
                if (!isShredEverythingEnabled) return;
                closeConfirm();
                await handleRemoveEverything();
              }
            }}
            disabled={
              isShredding ||
              confirmAction === null ||
              (confirmAction === "remove-everything" && !isShredEverythingEnabled)
            }
          >
            {confirmPrimaryLabel}
          </button>
        </div>
      </div>
    </Modal>
  );

  const whatStaysModal = (
    <Modal
      isOpen={isWhatStaysOpen}
      onRequestClose={() => setIsWhatStaysOpen(false)}
      contentLabel="What stays"
      className={styles.modalContent}
      overlayClassName={styles.modalOverlay}
    >
      <div className={styles.modal}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>What stays</h2>
        </header>
        <div className={styles.modalBody}>
          <div className={styles.modalChecklistTitle}>Shred CSV imports keeps:</div>
          <ul className={styles.modalChecklist}>
            <li>Accounts</li>
            <li>Bank sync</li>
            <li>Rules</li>
          </ul>
          <div className={styles.modalChecklistTitle}>Shred bank transactions keeps:</div>
          <ul className={styles.modalChecklist}>
            <li>Accounts</li>
            <li>Rules</li>
            <li>CSV imports</li>
          </ul>
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.modalPrimaryButton} onClick={() => setIsWhatStaysOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </Modal>
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

  const mainContent = (
    <main className="dashboard-main">
      {mobileWelcomeHeader}
      <div className={`dashboard-wrapper ${styles.wrapper}`}>
        {shredConfirmModal}
        {whatStaysModal}
        <div className={styles.headerContainer}>
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
