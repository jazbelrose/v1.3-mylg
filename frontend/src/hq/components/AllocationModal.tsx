import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import Modal from "@/shared/ui/ModalWithStack";
import { useSocket } from "@/app/contexts/useSocket";
import { addHqTransactionAllocation, removeHqTransactionAllocation } from "@/hq/lib/hqApi";
import {
  addTransactionAllocation,
  removeTransactionAllocation,
  getTransactionAllocatedTotal,
  getTransactionUnallocatedAmount,
} from "@/hq/lib/hqStore";
import { sendHqUpdated } from "@/hq/lib/hqWebSocket";
import type { HqTransaction, HqTransactionAllocation } from "@/hq/types";
import { parseBudget } from "@/shared/utils/budgetUtils";
import { fetchProjectsFromApi, fetchBudgetItems } from "@/shared/utils/api";
import { useAuth } from "@/app/contexts/useAuth";
import styles from "./AllocationModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type Project = {
  projectId: string;
  name: string;
  color?: string;
};

type BudgetLineItem = {
  budgetItemId: string;
  description: string;
  category: string;
  areaGroup?: string;
  itemBudgetedCost?: number | string;
  itemActualCost?: number | string;
};

type Props = {
  orgId: string;
  isOpen: boolean;
  txn: HqTransaction | null;
  onRequestClose: () => void;
  onSaved?: () => void;
};

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

const AllocationModal: React.FC<Props> = ({
  orgId,
  isOpen,
  txn,
  onRequestClose,
  onSaved,
}) => {
  const { ws } = useSocket();
  const { userId } = useAuth();

  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetLineItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Computed values
  const txnAmount = useMemo(() => Math.abs(txn?.amount || 0), [txn]);
  const allocatedTotal = useMemo(() => (txn ? getTransactionAllocatedTotal(txn) : 0), [txn]);
  const unallocatedAmount = useMemo(() => (txn ? getTransactionUnallocatedAmount(txn) : 0), [txn]);
  const existingAllocations = useMemo(() => txn?.allocations || [], [txn]);

  // Load projects on open
  useEffect(() => {
    if (!isOpen || !userId) return;

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const result = await fetchProjectsFromApi(userId);
        if (!cancelled) {
          // Filter to projects in this org if orgId is available
          const filtered = orgId
            ? result.filter((p) => p.orgId === orgId || !p.orgId)
            : result;
          setProjects(
            filtered.map((p) => ({
              projectId: String(p.projectId || ""),
              name: String(p.name || p.projectName || "Untitled"),
              color: p.color ? String(p.color) : undefined,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load projects", err);
        if (!cancelled) {
          toast.error("Failed to load projects");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, orgId]);

  // Load budget items when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setBudgetItems([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        // Fetch budget items for the selected project
        const items = await fetchBudgetItems(selectedProjectId);
        if (!cancelled) {
          setBudgetItems(
            (items || [])
              .filter((item) => {
                const id = String(item.budgetItemId || "");
                return id.startsWith("LINE-");
              })
              .map((item) => ({
                budgetItemId: String(item.budgetItemId || ""),
                description: String(item.description || ""),
                category: String(item.category || ""),
                areaGroup: item.areaGroup ? String(item.areaGroup) : undefined,
                itemBudgetedCost: item.itemBudgetedCost as number | string | undefined,
                itemActualCost: item.itemActualCost as number | string | undefined,
              }))
          );
        }
      } catch (err) {
        console.error("Failed to load budget items", err);
        if (!cancelled) {
          toast.error("Failed to load budget items");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && txn) {
      setSelectedProjectId("");
      setSelectedBudgetItemId("");
      setAmount(unallocatedAmount.toFixed(2));
      setSearchQuery("");
    }
  }, [isOpen, txn, unallocatedAmount]);

  // Filter budget items by search
  const filteredBudgetItems = useMemo(() => {
    if (!searchQuery.trim()) return budgetItems;
    const q = searchQuery.toLowerCase();
    return budgetItems.filter(
      (item) =>
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.areaGroup && item.areaGroup.toLowerCase().includes(q))
    );
  }, [budgetItems, searchQuery]);

  const handleSave = useCallback(async () => {
    if (!txn || !selectedProjectId || !selectedBudgetItemId) {
      toast.error("Please select a project and budget line");
      return;
    }

    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (amountNum > unallocatedAmount + 0.01) {
      toast.error("Amount exceeds unallocated balance");
      return;
    }

    setIsSaving(true);

    try {
      // Optimistic update
      addTransactionAllocation(orgId, txn.dedupeHash, {
        budgetItemId: selectedBudgetItemId,
        projectId: selectedProjectId,
        amount: amountNum,
      });

      // API call
      await addHqTransactionAllocation(orgId, txn.dedupeHash, {
        budgetItemId: selectedBudgetItemId,
        projectId: selectedProjectId,
        amount: amountNum,
      });

      // Notify via WebSocket
      if (ws) {
        sendHqUpdated(ws, orgId, "transaction", txn.dedupeHash);
      }

      toast.success("Allocation saved");
      onSaved?.();
      onRequestClose();
    } catch (err) {
      console.error("Failed to save allocation", err);
      toast.error("Failed to save allocation");
      // Rollback optimistic update
      removeTransactionAllocation(orgId, txn.dedupeHash, selectedBudgetItemId);
    } finally {
      setIsSaving(false);
    }
  }, [
    txn,
    selectedProjectId,
    selectedBudgetItemId,
    amount,
    unallocatedAmount,
    orgId,
    ws,
    onSaved,
    onRequestClose,
  ]);

  const handleRemoveAllocation = useCallback(
    async (allocation: HqTransactionAllocation) => {
      if (!txn) return;

      setIsSaving(true);

      try {
        // Optimistic update
        removeTransactionAllocation(orgId, txn.dedupeHash, allocation.budgetItemId);

        // API call
        await removeHqTransactionAllocation(orgId, txn.dedupeHash, allocation.budgetItemId);

        // Notify via WebSocket
        if (ws) {
          sendHqUpdated(ws, orgId, "transaction", txn.dedupeHash);
        }

        toast.success("Allocation removed");
        onSaved?.();
      } catch (err) {
        console.error("Failed to remove allocation", err);
        toast.error("Failed to remove allocation");
        // Rollback optimistic update
        addTransactionAllocation(orgId, txn.dedupeHash, allocation);
      } finally {
        setIsSaving(false);
      }
    },
    [txn, orgId, ws, onSaved]
  );

  if (!txn) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Allocate Transaction to Budget"
      className={styles.modal}
      overlayClassName={styles.overlay}
    >
      <div className={styles.container}>
        <header className={styles.header}>
          <h2 className={styles.title}>Link to Budget</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onRequestClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className={styles.body}>
          {/* Transaction summary */}
          <div className={styles.txnSummary}>
            <div className={styles.txnVendor}>
              {txn.vendor || txn.counterparty || txn.rawDescription}
            </div>
            <div className={styles.txnDetails}>
              <span className={styles.txnDate}>{formatDate(txn.postedAt)}</span>
              <span className={styles.txnAmount}>{currency.format(txnAmount)}</span>
            </div>
            <div className={styles.allocationStatus}>
              <span>Allocated: {currency.format(allocatedTotal)}</span>
              <span className={styles.separator}>•</span>
              <span>Remaining: {currency.format(unallocatedAmount)}</span>
            </div>
          </div>

          {/* Existing allocations */}
          {existingAllocations.length > 0 && (
            <div className={styles.existingAllocations}>
              <h3 className={styles.sectionTitle}>Current Allocations</h3>
              <div className={styles.allocationsList}>
                {existingAllocations.map((alloc) => (
                  <div key={alloc.budgetItemId} className={styles.allocationItem}>
                    <div className={styles.allocationInfo}>
                      <span className={styles.allocationProject}>
                        {projects.find((p) => p.projectId === alloc.projectId)?.name ||
                          alloc.projectId}
                      </span>
                      <span className={styles.allocationAmount}>
                        {currency.format(alloc.amount)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => handleRemoveAllocation(alloc)}
                      disabled={isSaving}
                      aria-label="Remove allocation"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add new allocation */}
          {unallocatedAmount > 0.01 && (
            <div className={styles.newAllocation}>
              <h3 className={styles.sectionTitle}>Add Allocation</h3>

              {/* Project selector */}
              <div className={styles.field}>
                <label className={styles.label}>Project</label>
                <select
                  className={styles.select}
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    setSelectedBudgetItemId("");
                  }}
                  disabled={isLoading}
                >
                  <option value="">Select project...</option>
                  {projects.map((project) => (
                    <option key={project.projectId} value={project.projectId}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Budget line selector */}
              {selectedProjectId && (
                <div className={styles.field}>
                  <label className={styles.label}>Budget Line</label>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search budget lines..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className={styles.budgetLinesList}>
                    {isLoading ? (
                      <div className={styles.loading}>Loading...</div>
                    ) : filteredBudgetItems.length === 0 ? (
                      <div className={styles.empty}>No budget lines found</div>
                    ) : (
                      filteredBudgetItems.map((item) => (
                        <button
                          key={item.budgetItemId}
                          type="button"
                          className={`${styles.budgetLineItem} ${
                            selectedBudgetItemId === item.budgetItemId
                              ? styles.selected
                              : ""
                          }`}
                          onClick={() => setSelectedBudgetItemId(item.budgetItemId)}
                        >
                          <div className={styles.budgetLineInfo}>
                            <span className={styles.budgetLineDescription}>
                              {item.description}
                            </span>
                            <span className={styles.budgetLineCategory}>
                              {item.category}
                              {item.areaGroup && ` • ${item.areaGroup}`}
                            </span>
                          </div>
                          <div className={styles.budgetLineCost}>
                            {currency.format(parseBudget(item.itemBudgetedCost))}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Amount input */}
              {selectedBudgetItemId && (
                <div className={styles.field}>
                  <label className={styles.label}>Amount to Allocate</label>
                  <div className={styles.amountInputWrapper}>
                    <span className={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      className={styles.amountInput}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min={0}
                      max={unallocatedAmount}
                      step={0.01}
                    />
                    <button
                      type="button"
                      className={styles.maxButton}
                      onClick={() => setAmount(unallocatedAmount.toFixed(2))}
                    >
                      Max
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onRequestClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={
              isSaving ||
              !selectedProjectId ||
              !selectedBudgetItemId ||
              !amount ||
              parseFloat(amount) <= 0
            }
          >
            {isSaving ? "Saving..." : "Save Allocation"}
          </button>
        </footer>
      </div>
    </Modal>
  );
};

export default AllocationModal;
