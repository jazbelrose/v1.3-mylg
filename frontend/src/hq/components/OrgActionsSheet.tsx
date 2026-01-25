import React, { useCallback } from "react";
import { MessageCircle, FolderOpen, Download, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/shared/components/BottomSheet";
import styles from "./OrgActionsSheet.module.css";

type OrgActionsSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  orgName: string;
  orgs: { orgId: string; name?: string }[];
  activeOrgId: string | null;
  onOrgChange: (orgId: string) => void;
  onOpenChat: () => void;
  onOpenFiles: () => void;
  onExportCsv: () => void;
  onExportBundle: () => void;
  isExporting?: boolean;
};

/**
 * Mobile-only org actions sheet.
 * Shows safe actions: switch org, chat, files, export.
 * NO destructive actions (shred, delete, import) on mobile.
 */
const OrgActionsSheet: React.FC<OrgActionsSheetProps> = ({
  isOpen,
  onClose,
  orgName,
  orgs,
  activeOrgId,
  onOrgChange,
  onOpenChat,
  onOpenFiles,
  onExportCsv,
  onExportBundle,
  isExporting = false,
}) => {
  const handleSelectOrg = useCallback(
    (orgId: string) => {
      onOrgChange(orgId);
      onClose();
    },
    [onOrgChange, onClose]
  );

  const handleAction = useCallback(
    (action: () => void) => {
      action();
      onClose();
    },
    [onClose]
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[60]}
      header={
        <div className={styles.header}>
          <h2 className={styles.title}>{orgName || "Organization"}</h2>
        </div>
      }
    >
      <div className={styles.body}>
        {/* Quick actions */}
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Quick actions</div>
          <div className={styles.actionList}>
            <button
              type="button"
              className={styles.actionItem}
              onClick={() => handleAction(onOpenChat)}
            >
              <MessageCircle size={20} className={styles.actionIcon} />
              <span className={styles.actionLabel}>Chat</span>
              <ChevronRight size={18} className={styles.actionChevron} />
            </button>
            <button
              type="button"
              className={styles.actionItem}
              onClick={() => handleAction(onOpenFiles)}
            >
              <FolderOpen size={20} className={styles.actionIcon} />
              <span className={styles.actionLabel}>Files</span>
              <ChevronRight size={18} className={styles.actionChevron} />
            </button>
          </div>
        </section>

        {/* Export */}
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Export</div>
          <div className={styles.actionList}>
            <button
              type="button"
              className={styles.actionItem}
              onClick={() => handleAction(onExportCsv)}
              disabled={isExporting}
            >
              <Download size={20} className={styles.actionIcon} />
              <span className={styles.actionLabel}>Export CSV</span>
              <ChevronRight size={18} className={styles.actionChevron} />
            </button>
            <button
              type="button"
              className={styles.actionItem}
              onClick={() => handleAction(onExportBundle)}
              disabled={isExporting}
            >
              <Download size={20} className={styles.actionIcon} />
              <span className={styles.actionLabel}>Export Backup</span>
              <ChevronRight size={18} className={styles.actionChevron} />
            </button>
          </div>
        </section>

        {/* Switch org */}
        {orgs.length > 1 && (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Switch organization</div>
            <div className={styles.orgList}>
              {orgs.map((org) => (
                <button
                  key={org.orgId}
                  type="button"
                  className={styles.orgItem}
                  data-active={org.orgId === activeOrgId}
                  onClick={() => handleSelectOrg(org.orgId)}
                >
                  <span className={styles.orgName}>{org.name || org.orgId}</span>
                  {org.orgId === activeOrgId && (
                    <span className={styles.orgCheck}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </BottomSheet>
  );
};

export default OrgActionsSheet;
