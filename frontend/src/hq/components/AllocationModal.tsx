import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "react-toastify";
import Modal from "@/shared/ui/ModalWithStack";
import { useSocket } from "@/app/contexts/useSocket";
import { addHqTransactionAllocation, removeHqTransactionAllocation } from "@/hq/lib/hqApi";
import {
  addTransactionAllocation,
  removeTransactionAllocation,
} from "@/hq/lib/hqStore";
import { sendHqUpdated } from "@/hq/lib/hqWebSocket";
import type { HqTransaction, HqTransactionAllocation } from "@/hq/types";
import { parseBudget } from "@/shared/utils/budgetUtils";
import {
  fetchProjectsFromApi,
  fetchBudgetItems,
  fetchBudgetHeaders,
  fetchBudgetItemById,
  updateBudgetItem,
  uploadFile,
  getFileUrl,
  type Project as ApiProject,
  type BudgetHeader,
  type BudgetLine,
  type BudgetItem,
} from "@/shared/utils/api";
import { useAuth } from "@/app/contexts/useAuth";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import { ChevronDown, ChevronRight, X, Plus, Check, Paperclip, Image as ImageIcon } from "lucide-react";
import styles from "./AllocationModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type Project = {
  projectId: string;
  name: string;
  color?: string;
  thumbnails?: string[];
};

type BudgetLineItem = {
  budgetItemId: string;
  description: string;
  category: string;
  areaGroup?: string;
  itemBudgetedCost?: number | string;
  itemActualCost?: number | string;
};

type BudgetRevision = {
  revision: number;
  revisionName?: string | null;
  budgetId: string;
};

// Budget attachment type (matches Budget feature)
type BudgetAttachment = {
  id: string;
  fileName: string;
  mimeType?: string;
  url: string;
  uploadedAt?: string;
  size?: number;
};

// Enriched allocation with full budget line details
type EnrichedAllocation = HqTransactionAllocation & {
  // Budget line details (fetched)
  description?: string;
  category?: string;
  areaGroup?: string;
  revision?: number;
  attachments?: BudgetAttachment[];
  itemBudgetedCost?: number | string;
  itemActualCost?: number | string;
  // Loading/error state per allocation
  isLoading?: boolean;
  loadError?: string;
};

// Pending allocation before save
type PendingAllocation = {
  budgetItemId: string;
  projectId: string;
  projectName: string;
  budgetLineDescription: string;
  category?: string;
  areaGroup?: string;
  amount: number;
  revision: number;
};

type Props = {
  orgId: string;
  isOpen: boolean;
  txn: HqTransaction | null;
  onRequestClose: () => void;
  onSaved?: (dedupeHash: string, allocations: HqTransactionAllocation[]) => void;
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
  const [revisions, setRevisions] = useState<BudgetRevision[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetLineItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingAllocations, setPendingAllocations] = useState<PendingAllocation[]>([]);
  const [pendingRemovals, setPendingRemovals] = useState<string[]>([]); // budgetItemIds to remove

  // Enriched allocations with budget line details
  const [enrichedAllocations, setEnrichedAllocations] = useState<EnrichedAllocation[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
  // File upload state
  const [uploadingForItemId, setUploadingForItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  // Filter projects by search
  const filteredProjects = useMemo(() => {
    if (!projectSearchQuery.trim()) return projects;
    const q = projectSearchQuery.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearchQuery]);

  // Computed values
  const txnAmount = useMemo(() => Math.abs(txn?.amount || 0), [txn]);
  const existingAllocations = useMemo(() => txn?.allocations || [], [txn]);
  
  // Allocations still active (existing minus pending removals)
  const activeExistingAllocations = useMemo(
    () => enrichedAllocations.filter((a) => !pendingRemovals.includes(a.budgetItemId)),
    [enrichedAllocations, pendingRemovals]
  );

  const allocatedTotal = useMemo(() => {
    const existingSum = activeExistingAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
    const pendingSum = pendingAllocations.reduce((sum, a) => sum + a.amount, 0);
    return existingSum + pendingSum;
  }, [activeExistingAllocations, pendingAllocations]);
  const unallocatedAmount = useMemo(
    () => Math.max(0, txnAmount - allocatedTotal),
    [txnAmount, allocatedTotal]
  );

  // Fetch budget line details for existing allocations
  useEffect(() => {
    if (!isOpen || existingAllocations.length === 0) {
      setEnrichedAllocations([]);
      return;
    }

    let cancelled = false;
    setIsLoadingDetails(true);

    const fetchDetails = async () => {
      const enriched: EnrichedAllocation[] = await Promise.all(
        existingAllocations.map(async (alloc) => {
          try {
            const budgetItem = await fetchBudgetItemById(alloc.budgetItemId);
            if (cancelled) return alloc as EnrichedAllocation;
            
            if (budgetItem) {
              const record = budgetItem as unknown as Record<string, unknown>;
              return {
                ...alloc,
                description: typeof record.description === "string" ? record.description : undefined,
                category: typeof record.category === "string" ? record.category : undefined,
                areaGroup: typeof record.areaGroup === "string" ? record.areaGroup : undefined,
                revision: typeof record.revision === "number" ? record.revision : undefined,
                attachments: Array.isArray(record.attachments) ? record.attachments as BudgetAttachment[] : [],
                itemBudgetedCost: record.itemBudgetedCost as number | string | undefined,
                itemActualCost: record.itemActualCost as number | string | undefined,
                isLoading: false,
              };
            }
            return { ...alloc, isLoading: false };
          } catch (err) {
            console.error(`Failed to fetch budget item ${alloc.budgetItemId}`, err);
            return { ...alloc, isLoading: false, loadError: "Failed to load" };
          }
        })
      );

      if (!cancelled) {
        setEnrichedAllocations(enriched);
        setIsLoadingDetails(false);
      }
    };

    void fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [isOpen, existingAllocations]);


  // Load projects on open
  useEffect(() => {
    if (!isOpen || !userId) return;

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const result = await fetchProjectsFromApi(userId);
        if (!cancelled) {
          const filtered = orgId
            ? result.filter((p: ApiProject) => p.orgId === orgId || !p.orgId)
            : result;
          setProjects(
            filtered.map((p: ApiProject) => ({
              projectId: String(p.projectId || ""),
              name: String(p.title || p.name || "Untitled"),
              color: p.color ? String(p.color) : undefined,
              thumbnails: Array.isArray(p.thumbnails) ? p.thumbnails : undefined,
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

  // Load budget revisions when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setRevisions([]);
      setSelectedRevision(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const headers = await fetchBudgetHeaders(selectedProjectId);
        if (!cancelled) {
          // Extract unique revisions from headers
          const revMap = new Map<number, BudgetRevision>();
          headers.forEach((h: BudgetHeader) => {
            const rev = h.revision ?? 1;
            if (!revMap.has(rev)) {
              revMap.set(rev, {
                revision: rev,
                revisionName: h.revisionName,
                budgetId: h.budgetId || "",
              });
            }
          });
          const revList = Array.from(revMap.values()).sort((a, b) => b.revision - a.revision);
          setRevisions(revList);
          // Auto-select latest revision
          if (revList.length > 0) {
            setSelectedRevision(revList[0].revision);
          }
        }
      } catch (err) {
        console.error("Failed to load budget revisions", err);
        if (!cancelled) {
          toast.error("Failed to load budget revisions");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  // Load budget items when revision changes
  useEffect(() => {
    if (!selectedProjectId || selectedRevision === null) {
      setBudgetItems([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        // Find budgetId from the selected revision
        const revInfo = revisions.find((r) => r.revision === selectedRevision);
        const budgetId = revInfo?.budgetId || selectedProjectId;

        const items = await fetchBudgetItems(budgetId, selectedRevision);
        if (!cancelled) {
          setBudgetItems(
            (items || [])
              .filter((item: BudgetLine) => {
                const id = String(item.budgetItemId || "");
                return id.startsWith("LINE-");
              })
              .map((item: BudgetLine) => ({
                budgetItemId: String(item.budgetItemId || ""),
                description: String((item as Record<string, unknown>).description || ""),
                category: String((item as Record<string, unknown>).category || ""),
                areaGroup: (item as Record<string, unknown>).areaGroup
                  ? String((item as Record<string, unknown>).areaGroup)
                  : undefined,
                itemBudgetedCost: (item as Record<string, unknown>).itemBudgetedCost as
                  | number
                  | string
                  | undefined,
                itemActualCost: (item as Record<string, unknown>).itemActualCost as
                  | number
                  | string
                  | undefined,
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
  }, [selectedProjectId, selectedRevision, revisions]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && txn) {
      setSelectedProjectId("");
      setSelectedRevision(null);
      setSelectedBudgetItemId("");
      setAmount("");
      setProjectSearchQuery("");
      setSearchQuery("");
      setPendingAllocations([]);
      setPendingRemovals([]);
    }
  }, [isOpen, txn]);

  // Computed: modal title based on state
  const modalTitle = useMemo(() => {
    if (enrichedAllocations.length > 0 || pendingAllocations.length > 0) {
      return "Manage Allocations";
    }
    return "Link to Budget";
  }, [enrichedAllocations.length, pendingAllocations.length]);

  // Computed: has changes to save
  const hasChanges = pendingAllocations.length > 0 || pendingRemovals.length > 0;

  // Computed: save button text
  const saveButtonText = useMemo(() => {
    if (isSaving) return "Saving...";
    if (!hasChanges) return "Close";
    const adds = pendingAllocations.length;
    const removes = pendingRemovals.length;
    if (adds > 0 && removes > 0) {
      return `Save Changes (+${adds}, -${removes})`;
    }
    if (adds > 0) {
      return `Save ${adds} Allocation${adds !== 1 ? "s" : ""}`;
    }
    if (removes > 0) {
      return `Remove ${removes} Allocation${removes !== 1 ? "s" : ""}`;
    }
    return "Save";
  }, [isSaving, hasChanges, pendingAllocations.length, pendingRemovals.length]);

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

  // Add a pending allocation
  const handleAddPending = useCallback(() => {
    if (!selectedProjectId || !selectedBudgetItemId || selectedRevision === null) {
      toast.error("Please select a project, revision, and budget line");
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

    // Check if already added
    if (pendingAllocations.some((p) => p.budgetItemId === selectedBudgetItemId)) {
      toast.error("This budget line is already added");
      return;
    }

    const project = projects.find((p) => p.projectId === selectedProjectId);
    const budgetLine = budgetItems.find((b) => b.budgetItemId === selectedBudgetItemId);

    setPendingAllocations((prev) => [
      ...prev,
      {
        budgetItemId: selectedBudgetItemId,
        projectId: selectedProjectId,
        projectName: project?.name || selectedProjectId,
        budgetLineDescription: budgetLine?.description || selectedBudgetItemId,
        category: budgetLine?.category,
        areaGroup: budgetLine?.areaGroup,
        amount: amountNum,
        revision: selectedRevision,
      },
    ]);

    // Reset selection for next addition
    setSelectedBudgetItemId("");
    setAmount(Math.max(0, unallocatedAmount - amountNum).toFixed(2));
  }, [
    selectedProjectId,
    selectedBudgetItemId,
    selectedRevision,
    amount,
    unallocatedAmount,
    pendingAllocations,
    projects,
    budgetItems,
  ]);

  const handleRemovePending = useCallback((budgetItemId: string) => {
    setPendingAllocations((prev) => prev.filter((p) => p.budgetItemId !== budgetItemId));
  }, []);

  const handleSaveAll = useCallback(async () => {
    if (!txn) return;

    // If no changes, just close
    if (!hasChanges) {
      onRequestClose();
      return;
    }

    setIsSaving(true);

    try {
      // Process removals first
      for (const budgetItemId of pendingRemovals) {
        const existing = existingAllocations.find((a) => a.budgetItemId === budgetItemId);
        if (existing) {
          removeTransactionAllocation(orgId, txn.dedupeHash, budgetItemId);
          await removeHqTransactionAllocation(orgId, txn.dedupeHash, budgetItemId);
        }
      }

      // Process additions
      for (const alloc of pendingAllocations) {
        addTransactionAllocation(orgId, txn.dedupeHash, {
          budgetItemId: alloc.budgetItemId,
          projectId: alloc.projectId,
          amount: alloc.amount,
        });

        await addHqTransactionAllocation(orgId, txn.dedupeHash, {
          budgetItemId: alloc.budgetItemId,
          projectId: alloc.projectId,
          amount: alloc.amount,
        });
      }

      // Notify via WebSocket
      if (ws) {
        sendHqUpdated(ws, orgId, "transaction", txn.dedupeHash);
      }

      const changes = [];
      if (pendingAllocations.length > 0) changes.push(`added ${pendingAllocations.length}`);
      if (pendingRemovals.length > 0) changes.push(`removed ${pendingRemovals.length}`);
      toast.success(`Allocations updated (${changes.join(", ")})`);
      
      // Compute the final allocations after all changes
      const now = new Date().toISOString();
      const finalAllocations: HqTransactionAllocation[] = [
        // Keep existing allocations that weren't removed
        ...existingAllocations.filter((a) => !pendingRemovals.includes(a.budgetItemId)),
        // Add new pending allocations (convert to HqTransactionAllocation format)
        ...pendingAllocations.map((a) => ({
          budgetItemId: a.budgetItemId,
          projectId: a.projectId,
          amount: a.amount,
          allocatedAt: now,
          allocatedBy: userId,
        })),
      ];
      
      onSaved?.(txn.dedupeHash, finalAllocations);
      onRequestClose();
    } catch (err) {
      console.error("Failed to save allocations", err);
      toast.error("Failed to save allocations");
      // Note: partial rollback is complex; user can retry
    } finally {
      setIsSaving(false);
    }
  }, [txn, hasChanges, pendingRemovals, pendingAllocations, existingAllocations, orgId, ws, onSaved, onRequestClose, userId]);

  // Queue an existing allocation for removal (don't delete immediately)
  const handleQueueRemoval = useCallback((allocation: HqTransactionAllocation) => {
    setPendingRemovals((prev) => [...prev, allocation.budgetItemId]);
  }, []);

  // Undo a pending removal
  const handleUndoRemoval = useCallback((budgetItemId: string) => {
    setPendingRemovals((prev) => prev.filter((id) => id !== budgetItemId));
  }, []);

  // Handle file upload for a budget line
  const handleAddFileClick = useCallback((budgetItemId: string) => {
    uploadTargetRef.current = budgetItemId;
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const targetItemId = uploadTargetRef.current;
    
    if (!files || files.length === 0 || !targetItemId) {
      uploadTargetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Find the enriched allocation to get projectId
    const alloc = enrichedAllocations.find((a) => a.budgetItemId === targetItemId);
    if (!alloc) {
      toast.error("Could not find allocation");
      uploadTargetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadingForItemId(targetItemId);

    try {
      const newAttachments: BudgetAttachment[] = [];

      for (const file of Array.from(files)) {
        // Only allow JPEG/PNG/PDF
        const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
        if (!allowedTypes.includes(file.type.toLowerCase())) {
          toast.warning(`Skipped "${file.name}" - only JPEG, PNG, or PDF allowed`);
          continue;
        }

        try {
          const uploadedUrl = await uploadFile(file);
          newAttachments.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            fileName: file.name,
            mimeType: file.type,
            url: uploadedUrl,
            uploadedAt: new Date().toISOString(),
            size: file.size,
          });
        } catch (err) {
          console.error("Failed to upload file", err);
          toast.error(`Failed to upload "${file.name}"`);
        }
      }

      if (newAttachments.length > 0) {
        // Update the budget line with new attachments
        const existingAttachments = alloc.attachments || [];
        const updatedAttachments = [...existingAttachments, ...newAttachments];

        await updateBudgetItem(alloc.projectId, targetItemId, {
          attachments: updatedAttachments,
        } as Partial<BudgetItem>);

        // Update local state
        setEnrichedAllocations((prev) =>
          prev.map((a) =>
            a.budgetItemId === targetItemId
              ? { ...a, attachments: updatedAttachments }
              : a
          )
        );

        toast.success(`Added ${newAttachments.length} file${newAttachments.length > 1 ? "s" : ""}`);
      }
    } catch (err) {
      console.error("Failed to update budget line attachments", err);
      toast.error("Failed to save attachments to budget line");
    } finally {
      setUploadingForItemId(null);
      uploadTargetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [enrichedAllocations]);

  // Set default amount when budget line selected
  useEffect(() => {
    if (selectedBudgetItemId && !amount) {
      setAmount(unallocatedAmount.toFixed(2));
    }
  }, [selectedBudgetItemId, unallocatedAmount, amount]);

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
          <h2 className={styles.title}>{modalTitle}</h2>
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
              {allocatedTotal > txnAmount + 0.01 ? (
                <span className={styles.overWarning}>
                  Over by {currency.format(allocatedTotal - txnAmount)}
                </span>
              ) : allocatedTotal >= txnAmount - 0.01 ? (
                <span className={styles.fullyAllocated}>Fully allocated</span>
              ) : (
                <span>Remaining: {currency.format(unallocatedAmount)}</span>
              )}
            </div>
          </div>

          {/* Existing allocations (enriched with budget line details) */}
          {enrichedAllocations.length > 0 && (
            <div className={styles.existingAllocations}>
              <h3 className={styles.sectionTitle}>
                Linked Allocations
                {isLoadingDetails && <span className={styles.loadingDots}>...</span>}
              </h3>
              <div className={styles.allocationsList}>
                {enrichedAllocations.map((alloc) => {
                  const proj = projects.find((p) => p.projectId === alloc.projectId);
                  const isMarkedForRemoval = pendingRemovals.includes(alloc.budgetItemId);
                  const isUploading = uploadingForItemId === alloc.budgetItemId;
                  const attachmentCount = alloc.attachments?.length || 0;
                  
                  // Build category path (e.g., "FABRICATION → POLY")
                  const categoryPath = [alloc.category, alloc.areaGroup]
                    .filter(Boolean)
                    .join(" → ");

                  return (
                    <div
                      key={alloc.budgetItemId}
                      className={`${styles.allocationItemRich} ${isMarkedForRemoval ? styles.markedForRemoval : ""}`}
                    >
                      <div className={styles.allocationHeader}>
                        <div className={styles.allocationProjectRow}>
                          <ProjectAvatar
                            thumb={proj?.thumbnails?.[0]}
                            name={proj?.name || ""}
                            radius={6}
                            className={styles.miniAvatar}
                          />
                          <span className={styles.allocationProject}>
                            {proj?.name || alloc.projectId}
                          </span>
                          {alloc.revision != null && (
                            <span className={styles.revisionBadge}>Rev {alloc.revision}</span>
                          )}
                          {isMarkedForRemoval && (
                            <span className={styles.removalBadge}>Will be removed</span>
                          )}
                        </div>
                        <div className={styles.allocationActions}>
                          {!isMarkedForRemoval && (
                            <button
                              type="button"
                              className={styles.addFileButton}
                              onClick={() => handleAddFileClick(alloc.budgetItemId)}
                              disabled={isSaving || isUploading}
                              aria-label="Add file to budget line"
                              title="Add invoice/receipt"
                            >
                              {isUploading ? (
                                <span className={styles.uploadingSpinner} />
                              ) : (
                                <Paperclip size={14} />
                              )}
                            </button>
                          )}
                          {isMarkedForRemoval ? (
                            <button
                              type="button"
                              className={styles.undoButton}
                              onClick={() => handleUndoRemoval(alloc.budgetItemId)}
                              disabled={isSaving}
                              aria-label="Undo removal"
                            >
                              Undo
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => handleQueueRemoval(alloc)}
                              disabled={isSaving}
                              aria-label="Remove allocation"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className={styles.allocationBody}>
                        <div className={styles.allocationLineInfo}>
                          <span className={styles.allocationLineDesc}>
                            {alloc.description || alloc.budgetItemId.replace("LINE-", "").slice(0, 20) + "..."}
                          </span>
                          {categoryPath && (
                            <span className={styles.allocationCategory}>{categoryPath}</span>
                          )}
                        </div>
                        <span className={styles.allocationAmount}>
                          {currency.format(alloc.amount)}
                        </span>
                      </div>

                      {/* Attachments preview */}
                      {attachmentCount > 0 && (
                        <div className={styles.attachmentsRow}>
                          <div className={styles.attachmentThumbs}>
                            {(alloc.attachments || []).slice(0, 4).map((att) => {
                              const isPdf = att.mimeType?.includes("pdf");
                              const thumbUrl = isPdf ? null : getFileUrl(att.url);
                              return (
                                <div key={att.id} className={styles.attachmentThumb} title={att.fileName}>
                                  {thumbUrl ? (
                                    <img src={thumbUrl} alt={att.fileName} />
                                  ) : (
                                    <div className={styles.pdfThumb}>PDF</div>
                                  )}
                                </div>
                              );
                            })}
                            {attachmentCount > 4 && (
                              <div className={styles.attachmentMore}>+{attachmentCount - 4}</div>
                            )}
                          </div>
                          <span className={styles.attachmentCount}>
                            <ImageIcon size={12} />
                            {attachmentCount}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending allocations */}
          {pendingAllocations.length > 0 && (
            <div className={styles.pendingAllocations}>
              <h3 className={styles.sectionTitle}>Pending Allocations</h3>
              <div className={styles.allocationsList}>
                {pendingAllocations.map((alloc) => {
                  const categoryPath = [alloc.category, alloc.areaGroup]
                    .filter(Boolean)
                    .join(" → ");
                  return (
                    <div key={alloc.budgetItemId} className={styles.allocationItemRich}>
                      <div className={styles.allocationHeader}>
                        <div className={styles.allocationProjectRow}>
                          <span className={styles.allocationProject}>{alloc.projectName}</span>
                          <span className={styles.revisionBadge}>Rev {alloc.revision}</span>
                        </div>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => handleRemovePending(alloc.budgetItemId)}
                          disabled={isSaving}
                          aria-label="Remove pending allocation"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className={styles.allocationBody}>
                        <div className={styles.allocationLineInfo}>
                          <span className={styles.allocationLineDesc}>
                            {alloc.budgetLineDescription}
                          </span>
                          {categoryPath && (
                            <span className={styles.allocationCategory}>{categoryPath}</span>
                          )}
                        </div>
                        <span className={styles.allocationAmount}>
                          {currency.format(alloc.amount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add new allocation */}
          {unallocatedAmount > 0.01 && (
            <div className={styles.newAllocation}>
              <h3 className={styles.sectionTitle}>Add Allocation</h3>

              {/* Project selector with avatars */}
              <div className={styles.field}>
                <label className={styles.label}>Project</label>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search projects..."
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                />
                <div className={styles.projectList}>
                  {isLoading && projects.length === 0 ? (
                    <div className={styles.loading}>Loading projects...</div>
                  ) : filteredProjects.length === 0 ? (
                    <div className={styles.empty}>
                      {projects.length === 0 ? "No projects found" : "No matching projects"}
                    </div>
                  ) : (
                    filteredProjects.map((project) => (
                      <button
                        key={project.projectId}
                        type="button"
                        className={`${styles.projectItem} ${
                          selectedProjectId === project.projectId ? styles.projectSelected : ""
                        }`}
                        onClick={() => {
                          setSelectedProjectId(project.projectId);
                          setSelectedRevision(null);
                          setSelectedBudgetItemId("");
                          setBudgetItems([]);
                        }}
                      >
                        <ProjectAvatar
                          thumb={project.thumbnails?.[0]}
                          name={project.name}
                          radius={8}
                          className={styles.projectAvatar}
                        />
                        <span className={styles.projectName}>{project.name}</span>
                        {selectedProjectId === project.projectId ? (
                          <ChevronDown size={16} className={styles.projectChevron} />
                        ) : (
                          <ChevronRight size={16} className={styles.projectChevron} />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Revision selector */}
              {selectedProjectId && revisions.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.label}>Budget Revision</label>
                  <div className={styles.revisionList}>
                    {revisions.map((rev) => (
                      <button
                        key={rev.revision}
                        type="button"
                        className={`${styles.revisionItem} ${
                          selectedRevision === rev.revision ? styles.revisionSelected : ""
                        }`}
                        onClick={() => {
                          setSelectedRevision(rev.revision);
                          setSelectedBudgetItemId("");
                        }}
                      >
                        <span className={styles.revisionNumber}>Rev {rev.revision}</span>
                        {rev.revisionName && (
                          <span className={styles.revisionName}>{rev.revisionName}</span>
                        )}
                        {selectedRevision === rev.revision && (
                          <Check size={14} className={styles.revisionCheck} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Budget line selector */}
              {selectedProjectId && selectedRevision !== null && (
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
                      filteredBudgetItems.map((item) => {
                        const alreadyPending = pendingAllocations.some(
                          (p) => p.budgetItemId === item.budgetItemId
                        );
                        const alreadyAllocated = existingAllocations.some(
                          (a) => a.budgetItemId === item.budgetItemId
                        );
                        return (
                          <button
                            key={item.budgetItemId}
                            type="button"
                            className={`${styles.budgetLineItem} ${
                              selectedBudgetItemId === item.budgetItemId ? styles.selected : ""
                            } ${alreadyPending || alreadyAllocated ? styles.disabled : ""}`}
                            onClick={() => {
                              if (!alreadyPending && !alreadyAllocated) {
                                setSelectedBudgetItemId(item.budgetItemId);
                                setAmount(unallocatedAmount.toFixed(2));
                              }
                            }}
                            disabled={alreadyPending || alreadyAllocated}
                          >
                            <div className={styles.budgetLineInfo}>
                              <span className={styles.budgetLineDescription}>
                                {item.description}
                                {alreadyPending && (
                                  <span className={styles.pendingTag}> (pending)</span>
                                )}
                                {alreadyAllocated && (
                                  <span className={styles.allocatedTag}> (linked)</span>
                                )}
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
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Amount input and Add button */}
              {selectedBudgetItemId && (
                <div className={styles.amountRow}>
                  <div className={styles.amountField}>
                    <label className={styles.label}>Amount</label>
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
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={handleAddPending}
                    disabled={!amount || parseFloat(amount) <= 0}
                  >
                    <Plus size={16} />
                    Add
                  </button>
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
            className={hasChanges ? styles.saveButton : styles.closeButtonSecondary}
            onClick={handleSaveAll}
            disabled={isSaving}
          >
            {saveButtonText}
          </button>
        </footer>
      </div>

      {/* Hidden file input for attachment uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg,application/pdf"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />
    </Modal>
  );
};

export default AllocationModal;
