import React, { useState, useEffect, useMemo, useCallback } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { fetchHqTransactions } from "@/hq/lib/hqApi";
import type { HqTransaction, HqTransactionAllocation } from "@/hq/types";
import type { Project } from "@/shared/utils/api";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import { ExternalLink, Link2 } from "lucide-react";
import styles from "./ProjectAllocationsModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

type AllocationWithTxn = {
  txn: HqTransaction;
  allocation: HqTransactionAllocation;
};

type Props = {
  orgId: string;
  projectId: string;
  project?: Project | null;
  isOpen: boolean;
  onRequestClose: () => void;
  onOpenProject?: (projectId: string) => void;
  onManageAllocation?: (txn: HqTransaction) => void;
};

const ProjectAllocationsModal: React.FC<Props> = ({
  orgId,
  projectId,
  project,
  isOpen,
  onRequestClose,
  onOpenProject,
  onManageAllocation,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [allocations, setAllocations] = useState<AllocationWithTxn[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load all transactions linked to this project
  useEffect(() => {
    if (!isOpen || !projectId || !orgId) {
      setAllocations([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        // Fetch all transactions linked to this project
        const res = await fetchHqTransactions({
          orgId,
          projectFilter: projectId,
          limit: 500,
          sortKey: "date",
          sortDir: "desc",
        });

        if (cancelled) return;

        // Extract allocations for this specific project from each transaction
        const allAllocations: AllocationWithTxn[] = [];
        for (const txn of res.transactions || []) {
          const txnAllocations = txn.allocations || [];
          for (const alloc of txnAllocations) {
            if (alloc.projectId === projectId) {
              allAllocations.push({ txn, allocation: alloc });
            }
          }
        }

        setAllocations(allAllocations);
      } catch (err) {
        console.error("Failed to load project allocations", err);
        if (!cancelled) {
          setError("Failed to load allocations");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, orgId]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalAllocated = 0;
    let txnCount = 0;
    const seenTxns = new Set<string>();

    for (const { txn, allocation } of allocations) {
      totalAllocated += allocation.amount || 0;
      if (!seenTxns.has(txn.dedupeHash)) {
        seenTxns.add(txn.dedupeHash);
        txnCount++;
      }
    }

    return { totalAllocated, txnCount };
  }, [allocations]);

  const projectName = project?.title || projectId.slice(0, 8);

  const handleManageClick = useCallback(
    (txn: HqTransaction) => {
      if (onManageAllocation) {
        onManageAllocation(txn);
        onRequestClose();
      }
    },
    [onManageAllocation, onRequestClose]
  );

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Project Allocations"
      className={styles.modal}
      overlayClassName={styles.overlay}
    >
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <ProjectAvatar
              thumb={project?.thumbnails?.[0]}
              name={projectName}
              className={styles.projectAvatar}
            />
            <div className={styles.headerInfo}>
              <h2 className={styles.title}>Allocations</h2>
              <span className={styles.projectName}>{projectName}</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onRequestClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Total Allocated</span>
            <span className={styles.summaryValue}>
              {currency.format(totals.totalAllocated)}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Transactions</span>
            <span className={styles.summaryValue}>{totals.txnCount}</span>
          </div>
        </div>

        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loading}>Loading allocations...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : allocations.length === 0 ? (
            <div className={styles.empty}>
              No transactions allocated to this project yet.
            </div>
          ) : (
            <div className={styles.allocationsList}>
              {allocations.map(({ txn, allocation }, index) => (
                <div
                  key={`${txn.dedupeHash}-${allocation.budgetItemId}-${index}`}
                  className={styles.allocationItem}
                >
                  <div className={styles.allocationMain}>
                    <div className={styles.txnVendor}>
                      {txn.vendor || txn.counterparty || txn.rawDescription}
                    </div>
                    <div className={styles.txnMeta}>
                      <span className={styles.txnDate}>
                        {formatDate(txn.postedAt)}
                      </span>
                      <span className={styles.txnAmount}>
                        {currency.format(Math.abs(txn.amount))}
                      </span>
                    </div>
                  </div>
                  <div className={styles.allocationDetails}>
                    <span className={styles.allocatedAmount}>
                      {currency.format(allocation.amount)}
                    </span>
                    {onManageAllocation && (
                      <button
                        type="button"
                        className={styles.manageButton}
                        onClick={() => handleManageClick(txn)}
                        title="Manage allocation"
                      >
                        <Link2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          {onOpenProject && (
            <button
              type="button"
              className={styles.openProjectButton}
              onClick={() => onOpenProject(projectId)}
            >
              <ExternalLink size={14} />
              Open Project
            </button>
          )}
          <button
            type="button"
            className={styles.closeButtonSecondary}
            onClick={onRequestClose}
          >
            Close
          </button>
        </footer>
      </div>
    </Modal>
  );
};

export default ProjectAllocationsModal;
