import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import DashboardNavPanel from "@/shared/ui/DashboardNavPanel";
import NavigationDrawer from "@/shared/ui/NavigationDrawer";
import AppHeaderCard from "@/shared/ui/AppHeaderCard";
import { useNavCollapsed } from "@/shared/hooks/useNavCollapsed";
import { useIsMobile } from "@/shared/hooks/useBreakpoints";
import { useUser } from "@/app/contexts/useUser";
import { isOrgAdmin, useOrg } from "@/app/contexts/useOrg";
import { toast } from "react-toastify";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FaExclamationTriangle, FaTrash } from "react-icons/fa";
import { Download, Upload, MessageCircle, FolderOpen, ChevronDown } from "lucide-react";
import { deleteHqImportRun, downloadHqBundle, downloadHqCsv, fetchHqSummary, resetHqData } from "@/hq/lib/hqApi";
import ImportBundleModal from "@/hq/components/ImportBundleModal";
import OrgActionsSheet from "@/hq/components/OrgActionsSheet";
import "@/dashboard/home/pages/dashboard-styles.css";
import Modal from "@/shared/ui/ModalWithStack";
import HeaderShell from "@/shared/ui/HeaderShell";
import styles from "./HQLayout.module.css";

type HQLayoutProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Optional right panel (e.g., docked chat) rendered inside contentArea flex */
  rightPanel?: React.ReactNode;
  /** Optional: open chat panel (for mobile org sheet) */
  onOpenChat?: () => void;
  /** Optional: open files overlay (for mobile org sheet) */
  onOpenFiles?: () => void;
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
  rightPanel,
  onOpenChat,
  onOpenFiles,
}) => {
  const { isAdmin } = useUser();
  const { orgs, activeOrgId, activeOrgRole, setActiveOrgId, isLoading: orgsLoading, createOrg, deleteOrg } = useOrg();
  const [flags, setFlags] = useState<ViewportFlags>(() => getViewportFlags());
  const isMobile = useIsMobile();
  const [isNavCollapsed, setIsNavCollapsed] = useNavCollapsed("dashboard");
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [isOrgSheetOpen, setIsOrgSheetOpen] = useState(false);
  const rawDrawerId = useId();
  const drawerId = useMemo(
    () => `hq-nav-${rawDrawerId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawDrawerId]
  );

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

  // Export/Import state
  const [isExporting, setIsExporting] = useState(false);
  const [showImportBundle, setShowImportBundle] = useState(false);

  const handleExportCsv = useCallback(async () => {
    if (!activeOrgId || isExporting) return;
    setIsExporting(true);
    setIsShredMenuOpen(false);
    try {
      await downloadHqCsv(activeOrgId);
      toast.success("CSV exported!");
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [activeOrgId, isExporting]);

  const handleExportBundle = useCallback(async () => {
    if (!activeOrgId || isExporting) return;
    setIsExporting(true);
    setIsShredMenuOpen(false);
    try {
      await downloadHqBundle(activeOrgId);
      toast.success("Backup exported!");
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [activeOrgId, isExporting]);

  const handleOpenImportBundle = useCallback(() => {
    setIsShredMenuOpen(false);
    setShowImportBundle(true);
  }, []);

  type ShredConfirmAction = null | "remove-csv" | "remove-bank" | "remove-everything";
  const [confirmAction, setConfirmAction] = useState<ShredConfirmAction>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isWhatStaysOpen, setIsWhatStaysOpen] = useState(false);

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

  const orgDropdown = (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={[styles.orgCreateButton, styles.orgDropdownTrigger].join(" ")}
          aria-haspopup="menu"
          aria-label="Switch organization"
          title="Switch org"
          disabled={orgsLoading}
        >
          <span className={styles.orgDropdownValue}>{activeOrgName ?? (orgs.length ? "Select…" : "No orgs")}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.orgMenu} sideOffset={8} align="start" collisionPadding={12}>
          <DropdownMenu.Label className={styles.orgMenuLabel}>Org</DropdownMenu.Label>
          <DropdownMenu.Separator className={styles.orgMenuSeparator} />

          {orgs.length ? (
            <DropdownMenu.RadioGroup value={activeOrgId ?? ""} onValueChange={(v) => setActiveOrgId(v)}>
              {orgs.map((org) => (
                <DropdownMenu.RadioItem key={org.orgId} value={org.orgId} className={styles.orgMenuRadioItem}>
                  <span className={styles.orgMenuRadioLabel}>{org.name || org.orgId}</span>
                  <DropdownMenu.ItemIndicator className={styles.orgMenuRadioIndicator}>✓</DropdownMenu.ItemIndicator>
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
                      <FaTrash className={styles.orgMenuItemIcon} aria-hidden="true" />
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
  );

  const pageHeader = (
    <HeaderShell
      title={
        <span className={styles.pageTitleRow}>
          <span className={styles.pageTitleText}>{title}</span>
          {orgDropdown}
        </span>
      }
      subtitle={description}
      actions={
        <div className={styles.actionsRow} aria-label="HQ header actions">
          {actions ? <div className={styles.actionSlot}>{actions}</div> : null}

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
                  className={[styles.orgCreateButton, styles.kebabButton].join(" ")}
                  aria-haspopup="menu"
                  aria-expanded={isShredMenuOpen}
                  aria-label="More actions"
                  title="More actions"
                  disabled={isShredding}
                >
                  …
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content className={styles.dataLayersMenu} sideOffset={8} align="end" collisionPadding={12}>
                  {/* Export & Backup section */}
                  <DropdownMenu.Label className={styles.dataLayersMenuLabel}>Export & Backup</DropdownMenu.Label>
                  <div className={styles.dataLayersMenuItems}>
                    <DropdownMenu.Item asChild>
                      <button
                        type="button"
                        className={styles.dataLayersMenuItem}
                        onClick={handleExportCsv}
                        disabled={isExporting}
                      >
                        <span className={styles.dataLayersMenuItemTitle}>
                          <Download size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                          Export CSV
                        </span>
                        <span className={styles.dataLayersMenuItemDesc}>
                          Download transactions as a spreadsheet.
                        </span>
                      </button>
                    </DropdownMenu.Item>

                    <DropdownMenu.Item asChild>
                      <button
                        type="button"
                        className={styles.dataLayersMenuItem}
                        onClick={handleExportBundle}
                        disabled={isExporting}
                      >
                        <span className={styles.dataLayersMenuItemTitle}>
                          <Download size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                          Export Backup (.memry.json)
                        </span>
                        <span className={styles.dataLayersMenuItemDesc}>
                          Full backup with categories, rules & accounts.
                        </span>
                      </button>
                    </DropdownMenu.Item>

                    <DropdownMenu.Item asChild>
                      <button
                        type="button"
                        className={styles.dataLayersMenuItem}
                        onClick={handleOpenImportBundle}
                      >
                        <span className={styles.dataLayersMenuItemTitle}>
                          <Upload size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                          Import Backup
                        </span>
                        <span className={styles.dataLayersMenuItemDesc}>
                          Restore from a .memry.json backup file.
                        </span>
                      </button>
                    </DropdownMenu.Item>
                  </div>

                  <DropdownMenu.Separator className={styles.dataLayersMenuSeparator} />

                  {/* Shred section */}
                  <DropdownMenu.Label className={styles.dataLayersMenuLabel}>Data layers</DropdownMenu.Label>
                  <div className={styles.dataLayersMenuHint}>
                    Choose what to delete. Accounts stay unless you pick the full reset.
                  </div>
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
                      <span className={styles.dataLayersMenuItemDesc}>
                        Deletes accounts + all transactions + rules. Irreversible.
                      </span>
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
        </div>
      }
    />
  );

  // New mobile header: title + org pill on left, actions on right
  const mobilePageHeader = (
    <header className={styles.mobilePageHeader}>
      <div className={styles.mobileTitleRow}>
        <h1 className={styles.mobilePageTitle}>{title}</h1>
        <button
          type="button"
          className={styles.mobileOrgPill}
          onClick={() => setIsOrgSheetOpen(true)}
          disabled={orgsLoading}
          aria-label="Organization actions"
        >
          <span className={styles.mobileOrgPillName}>
            {activeOrgName ?? (orgs.length ? "Select…" : "No org")}
          </span>
          <ChevronDown size={12} className={styles.mobileOrgPillChevron} />
        </button>
      </div>
      {/* Actions slot for page-specific controls (e.g., Select/Done) */}
      {actions ? <div className={styles.mobileHeaderActions}>{actions}</div> : null}
    </header>
  );

  // Legacy mobile header for non-sheet pages (keeping for backwards compat if needed)
  const legacyMobilePageHeader = (
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
              aria-label="Switch organization"
              title="Switch org"
              disabled={orgsLoading}
            >
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
                          <FaTrash className={styles.orgMenuItemIcon} aria-hidden="true" />
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
        {actions ? <div className={styles.actionSlot}>{actions}</div> : null}

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
                className={[styles.orgCreateButton, styles.kebabButton].join(" ")}
                aria-haspopup="menu"
                aria-expanded={isShredMenuOpen}
                aria-label="More actions"
                title="More actions"
                disabled={isShredding}
              >
                …
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content className={styles.dataLayersMenu} sideOffset={8} align="end" collisionPadding={12}>
                <DropdownMenu.Label className={styles.dataLayersMenuLabel}>Data layers</DropdownMenu.Label>
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

  // Mobile org actions sheet (safe actions only - no destructive)
  const orgActionsSheet = isMobile && activeOrgId ? (
    <OrgActionsSheet
      isOpen={isOrgSheetOpen}
      onClose={() => setIsOrgSheetOpen(false)}
      orgName={activeOrgName || ""}
      orgs={orgs}
      activeOrgId={activeOrgId}
      onOrgChange={setActiveOrgId}
      onOpenChat={onOpenChat}
      onOpenFiles={onOpenFiles}
      onExportCsv={handleExportCsv}
      onExportBundle={handleExportBundle}
      isExporting={isExporting}
    />
  ) : null;

  const mainContent = (
    <main className="dashboard-main">
      <AppHeaderCard
        leftMode="menu"
        onLeftAction={handleOpenNavigation}
        navigationDrawerId={drawerId}
        isNavigationOpen={isNavigationOpen}
        centerMode="search"
        title={title}
      />
      <div className={`dashboard-wrapper ${styles.wrapper}`}>
        {shredConfirmModal}
        {whatStaysModal}
        {orgActionsSheet}
        {activeOrgId && (
          <ImportBundleModal
            orgId={activeOrgId}
            isOpen={showImportBundle}
            onRequestClose={() => setShowImportBundle(false)}
          />
        )}
        <div className={styles.headerContainer}>
          {flags.isDesktop ? pageHeader : mobilePageHeader}
        </div>
        <div className={styles.contentArea}>
          <div className={styles.content}>{children}</div>
          {rightPanel}
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
