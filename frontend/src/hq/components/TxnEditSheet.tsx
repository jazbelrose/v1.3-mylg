/**
 * TxnEditSheet - Mobile bottom sheet for editing transactions
 * =============================================================================
 * Mobile-optimized version of TxnModalApply with full feature parity:
 * - Transaction summary card
 * - Category, Payment Type, Recurring commitment editing
 * - Similar transactions with select all/none
 * - Find similar search functionality
 * =============================================================================
 */
import React from "react";
import { toast } from "react-toastify";
import { Search, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/shared/components/BottomSheet/BottomSheet";
import { useSocket } from "@/app/contexts/useSocket";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import {
  applyHqTransactionsBulk,
  fetchHqSummary,
  fetchHqTransactions,
  fetchHqVendorMatches,
} from "@/hq/lib/hqApi";
import { hydrateHqState, readHqState, useHqStore } from "@/hq/lib/hqStore";
import { sendHqUpdated } from "@/hq/lib/hqWebSocket";
import type { HqCategoryId, HqPaymentType, HqTransaction } from "@/hq/types";
import styles from "./TxnEditSheet.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function txnTitle(txn: HqTransaction) {
  return txn.vendor || txn.counterparty || txn.rawDescription;
}

function txnSearchHaystack(txn: HqTransaction) {
  return [txnTitle(txn), txn.rawDescription, txn.normalizedDescription]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

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

function getMatchReason(source: HqTransaction, match: HqTransaction): string | null {
  const reasons: string[] = [];
  if (source.vendorKey && match.vendorKey && source.vendorKey === match.vendorKey) {
    reasons.push("Same vendor");
  }
  if (source.amount === match.amount) {
    reasons.push("same amount");
  } else if (Math.abs(source.amount - match.amount) <= 1) {
    reasons.push("similar amount");
  }
  const sourceDir = source.amount < 0 ? "out" : "in";
  const matchDir = match.amount < 0 ? "out" : "in";
  if (sourceDir === matchDir && !reasons.includes("same amount") && !reasons.includes("similar amount")) {
    reasons.push(`flow ${sourceDir}`);
  }
  if (reasons.length === 0) return null;
  const first = reasons[0].charAt(0).toUpperCase() + reasons[0].slice(1);
  return [first, ...reasons.slice(1)].join(" + ");
}

const PAYMENT_TYPE_OPTIONS: Array<{ value: HqPaymentType; label: string }> = [
  { value: "card_purchase", label: "Card purchase" },
  { value: "transfer", label: "Transfer" },
  { value: "zelle", label: "Zelle" },
  { value: "wire", label: "Wire" },
  { value: "deposit", label: "Deposit" },
  { value: "fee", label: "Fee" },
  { value: "unknown", label: "Unknown" },
];

const CATEGORY_OPTIONS: Array<{ value: HqCategoryId; label: string }> = Object.entries(HQ_CATEGORY_LABEL).map(
  ([value, label]) => ({ value: value as HqCategoryId, label })
);

const MIN_AUTO_SUGGESTIONS = 5;

interface TxnEditSheetProps {
  orgId: string;
  isOpen: boolean;
  txn: HqTransaction | null;
  onClose: () => void;
  onSaved?: () => void;
  from?: string;
  to?: string;
  /** If provided, sheet is in batch mode editing multiple transactions */
  batchHashes?: string[];
}

export default function TxnEditSheet({
  orgId,
  isOpen,
  txn,
  onClose,
  onSaved,
  from,
  to,
  batchHashes,
}: TxnEditSheetProps) {
  const { ws } = useSocket();
  const [categoryId, setCategoryId] = React.useState<HqCategoryId | "OTHER" | "MIXED">("OTHER");
  const [paymentType, setPaymentType] = React.useState<HqPaymentType | "MIXED">("unknown");
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [isRecurringMixed, setIsRecurringMixed] = React.useState(false);
  const [isWorking, setIsWorking] = React.useState(false);

  // Similar transactions state
  const [similar, setSimilar] = React.useState<HqTransaction[]>([]);
  const [similarUnavailable, setSimilarUnavailable] = React.useState(false);
  const [selectedSimilar, setSelectedSimilar] = React.useState<Record<string, true>>({});

  // Find similar search state
  const [addMoreSearch, setAddMoreSearch] = React.useState("");
  const [showFindSimilar, setShowFindSimilar] = React.useState(false);
  // Similar section collapsed by default
  const [isSimilarExpanded, setIsSimilarExpanded] = React.useState(false);

  // View state for drill-down pickers
  const [viewMode, setViewMode] = React.useState<"main" | "category" | "payment">("main");
  const [searchQuery, setSearchQuery] = React.useState("");

  const isBatchMode = Boolean(batchHashes && batchHashes.length > 1);
  const batchCount = batchHashes?.length ?? 0;

  const accounts = useHqStore(orgId, (s) => s.accounts);

  // Load similar transactions when sheet opens
  React.useEffect(() => {
    if (!isOpen || !txn) return;

    setCategoryId((txn.categoryId && txn.categoryId !== "OTHER" ? txn.categoryId : "OTHER") as HqCategoryId | "OTHER");
    const nextPaymentType = (txn.paymentType || (txn.type === "recurring" ? "unknown" : txn.type) || "unknown") as HqPaymentType;
    setPaymentType(nextPaymentType);
    setIsRecurring(Boolean(txn.isRecurring));
    setIsRecurringMixed(false);
    setSelectedSimilar({});
    setAddMoreSearch(String(txn.vendor || txn.counterparty || ""));
    setViewMode("main");
    setSearchQuery("");
    setShowFindSimilar(false);

    let cancelled = false;
    setIsWorking(true);
    setSimilarUnavailable(false);

    void (async () => {
      try {
        const vendorKey = String(txn.vendorKey || "").trim();
        if (!vendorKey) {
          if (!cancelled) {
            setSimilar([]);
            setSelectedSimilar({});
            setSimilarUnavailable(true);
            setShowFindSimilar(true);
          }
          return;
        }

        const res = await fetchHqVendorMatches(orgId, {
          vendorKey,
          from,
          to,
          includeCategorized: true,
          limit: 30,
        });
        if (cancelled) return;

        const matches = Array.isArray(res.matches) ? res.matches : [];
        const filtered = matches.filter((m) => m.dedupeHash !== txn.dedupeHash);
        setSimilar(filtered);
        setSelectedSimilar(() => {
          const next: Record<string, true> = {};
          for (const m of filtered) {
            if (m?.dedupeHash) next[m.dedupeHash] = true;
          }
          return next;
        });
        // Show find similar if not enough auto matches
        if (filtered.length < MIN_AUTO_SUGGESTIONS) {
          setShowFindSimilar(true);
        }
      } catch (err) {
        console.error(err);
        toast.error("Could not load similar transactions.");
      } finally {
        if (!cancelled) setIsWorking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [from, isOpen, orgId, to, txn]);

  // Batch mode reset
  React.useEffect(() => {
    if (!isOpen || !isBatchMode) return;
    setCategoryId("MIXED");
    setPaymentType("MIXED");
    setIsRecurringMixed(true);
    setSimilar([]);
    setSelectedSimilar({});
    setViewMode("main");
  }, [isOpen, isBatchMode]);

  const handleSelectAll = React.useCallback(() => {
    setSelectedSimilar(() => {
      const next: Record<string, true> = {};
      for (const t of similar) {
        if (t?.dedupeHash) next[t.dedupeHash] = true;
      }
      return next;
    });
  }, [similar]);

  const handleSelectNone = React.useCallback(() => {
    setSelectedSimilar({});
  }, []);

  const toggleSelected = React.useCallback((dedupeHash: string, checked: boolean) => {
    setSelectedSimilar((prev) => {
      const next = { ...prev };
      if (checked) next[dedupeHash] = true;
      else delete next[dedupeHash];
      return next;
    });
  }, []);

  const handleFindSimilar = React.useCallback(async () => {
    if (!txn) return;

    setIsWorking(true);
    try {
      const res = await fetchHqTransactions({
        orgId,
        limit: 500,
      });

      const all = Array.isArray(res.transactions) ? res.transactions : [];
      const term = addMoreSearch.trim().toLowerCase();

      const existing = new Set<string>([txn.dedupeHash, ...similar.map((s) => s.dedupeHash)].filter(Boolean));
      const added: HqTransaction[] = [];
      for (const t of all) {
        if (!t?.dedupeHash) continue;
        if (existing.has(t.dedupeHash)) continue;
        if (term && !txnSearchHaystack(t).includes(term)) continue;
        added.push(t);
        existing.add(t.dedupeHash);
        if (added.length >= 50) break;
      }

      if (added.length === 0) {
        toast.info("No additional matches found.");
        return;
      }

      setSimilar((prev) => [...prev, ...added]);
      setSelectedSimilar((prev) => {
        const next = { ...prev };
        for (const t of added) {
          if (t?.dedupeHash) next[t.dedupeHash] = true;
        }
        return next;
      });
      toast.success(`Found ${added.length} more transaction${added.length === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      toast.error("Could not load more candidates.");
    } finally {
      setIsWorking(false);
    }
  }, [addMoreSearch, orgId, similar, txn]);

  const handleSave = React.useCallback(async () => {
    if (!txn && !isBatchMode) return;

    const nextCategoryId = categoryId !== "MIXED" ? String(categoryId || "OTHER") : undefined;
    const nextPaymentType = paymentType !== "MIXED" ? String(paymentType || "unknown") : undefined;

    let dedupeHashes: string[];
    if (isBatchMode && batchHashes) {
      dedupeHashes = batchHashes;
    } else if (txn) {
      // Single mode with similar transactions
      const selected = similar.map((t) => t.dedupeHash).filter((dh) => Boolean(dh) && Boolean(selectedSimilar[String(dh)]));
      dedupeHashes = [txn.dedupeHash, ...selected].filter(Boolean) as string[];
    } else {
      return;
    }

    const unique = Array.from(new Set(dedupeHashes)).slice(0, 60);

    setIsWorking(true);
    try {
      const payload: {
        dedupeHashes: string[];
        categoryId?: string;
        paymentType?: string;
        type?: string;
        isRecurring?: boolean;
      } = { dedupeHashes: unique };

      if (nextCategoryId) payload.categoryId = nextCategoryId;
      if (nextPaymentType) {
        payload.paymentType = nextPaymentType;
        payload.type = nextPaymentType;
      }
      if (!isRecurringMixed) payload.isRecurring = isRecurring;

      const res = await applyHqTransactionsBulk(orgId, payload);

      // Refresh local cache
      const summary = await fetchHqSummary(orgId);
      const txnsRes = await fetchHqTransactions({ orgId, limit: 500 });
      const prev = readHqState(orgId);
      hydrateHqState(orgId, {
        ...prev,
        accounts: summary.accounts,
        importRuns: summary.importRuns,
        transactions: txnsRes.transactions,
        categoryRules: Array.isArray(summary.categoryRules) ? summary.categoryRules : prev.categoryRules,
        cashOnHandAggregate: typeof summary.cashOnHandAggregate === "number" ? summary.cashOnHandAggregate : null,
        missingAnchorAccountIds: Array.isArray(summary.missingAnchorAccountIds) ? summary.missingAnchorAccountIds : [],
      });

      toast.success(`Saved ${res.updated} transaction${res.updated === 1 ? "" : "s"}.`);
      sendHqUpdated(ws, orgId, "transaction");
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Could not save changes.");
    } finally {
      setIsWorking(false);
    }
  }, [batchHashes, categoryId, isBatchMode, isRecurring, isRecurringMixed, onClose, onSaved, orgId, paymentType, selectedSimilar, similar, txn, ws]);

  const title = txn ? txnTitle(txn) : "Transaction";
  const accountLabel = txn?.accountId
    ? (accounts.find((a) => a.accountId === txn.accountId)?.name ??
        accounts.find((a) => a.accountId === txn.accountId)?.accountName ??
        txn.accountId)
    : "Account";

  const selectedSimilarCount = Object.keys(selectedSimilar).length;
  const saveCount = isBatchMode ? batchCount : 1 + selectedSimilarCount;

  // Filtered options for pickers
  const filteredCategories = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return CATEGORY_OPTIONS.slice(0, 15);
    return CATEGORY_OPTIONS.filter((c) => c.label.toLowerCase().includes(query)).slice(0, 15);
  }, [searchQuery]);

  const filteredPaymentTypes = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return PAYMENT_TYPE_OPTIONS;
    return PAYMENT_TYPE_OPTIONS.filter((p) => p.label.toLowerCase().includes(query));
  }, [searchQuery]);

  // Render main edit view
  const renderMainView = () => (
    <>
      {/* Transaction summary card */}
      {!isBatchMode && txn ? (
        <div className={styles.txnCard}>
          <div className={styles.txnMain}>
            <div className={styles.txnTitle}>{title}</div>
            <div className={styles.txnMeta}>
              <span>{formatDate(txn.postedAt)}</span>
              <span>·</span>
              <span>{accountLabel}</span>
              <span>·</span>
              <span>{txn.amount < 0 ? "Flow Out" : "Flow In"}</span>
            </div>
          </div>
          <div className={`${styles.txnAmount} ${txn.amount < 0 ? styles.out : styles.in}`}>
            {txn.amount < 0 ? "-" : "+"}
            {currency.format(Math.abs(txn.amount))}
          </div>
        </div>
      ) : isBatchMode ? (
        <div className={styles.batchBadge}>
          Editing {batchCount} transactions
        </div>
      ) : null}

      {/* Edit fields */}
      <div className={styles.sectionLabel}>EDITS</div>
      <div className={styles.fieldGroup}>
        {/* Category */}
        <button
          type="button"
          className={styles.fieldRow}
          onClick={() => {
            setViewMode("category");
            setSearchQuery("");
          }}
          disabled={isWorking}
        >
          <span className={styles.fieldLabel}>Category</span>
          <span className={styles.fieldValue}>
            {categoryId === "MIXED" ? (
              <span className={styles.mixedValue}>Mixed</span>
            ) : (
              HQ_CATEGORY_LABEL[categoryId as HqCategoryId] || "Other"
            )}
          </span>
          <ChevronRight size={18} className={styles.fieldChevron} />
        </button>

        {/* Payment Type */}
        <button
          type="button"
          className={styles.fieldRow}
          onClick={() => {
            setViewMode("payment");
            setSearchQuery("");
          }}
          disabled={isWorking}
        >
          <span className={styles.fieldLabel}>Payment Type</span>
          <span className={styles.fieldValue}>
            {paymentType === "MIXED" ? (
              <span className={styles.mixedValue}>Mixed</span>
            ) : (
              PAYMENT_TYPE_OPTIONS.find((p) => p.value === paymentType)?.label || "Unknown"
            )}
          </span>
          <ChevronRight size={18} className={styles.fieldChevron} />
        </button>

        {/* Recurring toggle */}
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.fieldLabel}>
              Recurring commitment
              {isRecurringMixed ? <span className={styles.mixedHint}> (Mixed)</span> : null}
            </span>
            <span className={styles.toggleHint}>Counts toward burn/runway</span>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => {
                setIsRecurring(e.target.checked);
                setIsRecurringMixed(false);
              }}
              disabled={isWorking}
            />
            <span className={styles.toggleTrack} />
          </label>
        </div>
      </div>

      {/* Similar Transactions - only in single mode, collapsed by default */}
      {!isBatchMode && (
        <>
          <button
            type="button"
            className={styles.similarHeaderBtn}
            onClick={() => setIsSimilarExpanded((p) => !p)}
          >
            <span className={styles.sectionLabel}>SIMILAR TRANSACTIONS</span>
            <span className={styles.similarCount}>
              ({similar.length})
              <ChevronRight
                size={16}
                className={`${styles.expandChevron} ${isSimilarExpanded ? styles.expandChevronOpen : ""}`}
              />
            </span>
          </button>

          {isSimilarExpanded && (
            <>
              {similar.length > 0 && (
                <div className={styles.selectActions}>
                  <button type="button" className={styles.linkButton} onClick={handleSelectAll} disabled={isWorking}>
                    Select all
                  </button>
                  <button type="button" className={styles.linkButton} onClick={handleSelectNone} disabled={isWorking}>
                    Select none
                  </button>
                </div>
              )}

              {/* Find Similar search */}
              {showFindSimilar && (
                <div className={styles.findSimilar}>
                  <div className={styles.findSimilarTitle}>Find similar</div>
                  <div className={styles.findSimilarRow}>
                    <input
                      type="text"
                      className={styles.findSimilarInput}
                      placeholder="Search vendor / memo"
                      value={addMoreSearch}
                      onChange={(e) => setAddMoreSearch(e.target.value)}
                      disabled={isWorking}
                    />
                    <button
                      type="button"
                      className={styles.findSimilarBtn}
                      onClick={() => void handleFindSimilar()}
                      disabled={isWorking || !txn}
                    >
                      <Search size={16} />
                      Search
                    </button>
                  </div>
                </div>
              )}

              {/* Similar list or empty state */}
              {similarUnavailable && similar.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>Similar transactions unavailable</div>
                  <div className={styles.emptyHint}>No vendor key found. Use "Find similar" above.</div>
                </div>
              ) : similar.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>No similar transactions found</div>
                  <div className={styles.emptyHint}>Try searching with "Find similar" above.</div>
                </div>
              ) : (
                <div className={styles.similarList}>
                  {similar.map((t) => {
                    const matchReason = txn ? getMatchReason(txn, t) : null;
                    const isSelected = Boolean(t?.dedupeHash && selectedSimilar[String(t.dedupeHash)]);
                    return (
                      <div
                        key={t.dedupeHash}
                        className={`${styles.similarRow} ${isSelected ? styles.similarRowSelected : ""}`}
                        onClick={() => {
                          if (t?.dedupeHash) toggleSelected(String(t.dedupeHash), !isSelected);
                        }}
                      >
                        <div className={styles.similarCheck}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (t?.dedupeHash) toggleSelected(String(t.dedupeHash), e.target.checked);
                            }}
                            disabled={isWorking}
                          />
                        </div>
                        <div className={styles.similarMain}>
                          <div className={styles.similarName}>{txnTitle(t)}</div>
                          <div className={styles.similarMeta}>
                            <span>{formatDate(t.postedAt)}</span>
                            <span>·</span>
                            <span>{HQ_CATEGORY_LABEL[(t.categoryId || "OTHER") as HqCategoryId]}</span>
                            {t.isRecurring ? (
                              <>
                                <span>·</span>
                                <span>Recurring</span>
                              </>
                            ) : null}
                          </div>
                          {matchReason ? (
                            <div className={styles.matchReason}>{matchReason}</div>
                          ) : null}
                        </div>
                        <div className={`${styles.similarAmt} ${t.amount < 0 ? styles.out : styles.in}`}>
                          {t.amount < 0 ? "-" : "+"}
                          {currency.format(Math.abs(t.amount))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!showFindSimilar && similar.length > 0 && (
                <button
                  type="button"
                  className={styles.showFindBtn}
                  onClick={() => setShowFindSimilar(true)}
                >
                  Find more similar…
                </button>
              )}
            </>
          )}
        </>
      )}
    </>
  );

  // Render category picker view
  const renderCategoryView = () => (
    <>
      <div className={styles.subHeader}>
        <button type="button" className={styles.backButton} onClick={() => setViewMode("main")}>
          ← Back
        </button>
        <span className={styles.subTitle}>Category</span>
      </div>

      <div className={styles.searchWrapper}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search categories…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      <div className={styles.optionsList}>
        {filteredCategories.map((cat) => (
          <button
            key={cat.value}
            type="button"
            className={`${styles.optionRow} ${categoryId === cat.value ? styles.optionSelected : ""}`}
            onClick={() => {
              setCategoryId(cat.value);
              setViewMode("main");
            }}
          >
            <span>{cat.label}</span>
            {categoryId === cat.value ? <span className={styles.checkmark}>✓</span> : null}
          </button>
        ))}
      </div>
    </>
  );

  // Render payment type picker view
  const renderPaymentView = () => (
    <>
      <div className={styles.subHeader}>
        <button type="button" className={styles.backButton} onClick={() => setViewMode("main")}>
          ← Back
        </button>
        <span className={styles.subTitle}>Payment Type</span>
      </div>

      <div className={styles.optionsList}>
        {filteredPaymentTypes.map((pt) => (
          <button
            key={pt.value}
            type="button"
            className={`${styles.optionRow} ${paymentType === pt.value ? styles.optionSelected : ""}`}
            onClick={() => {
              setPaymentType(pt.value);
              setViewMode("main");
            }}
          >
            <span>{pt.label}</span>
            {paymentType === pt.value ? <span className={styles.checkmark}>✓</span> : null}
          </button>
        ))}
      </div>
    </>
  );

  // Footer with Save/Cancel
  const footer = viewMode === "main" ? (
    <div className={styles.footer}>
      {!isBatchMode && selectedSimilarCount > 0 && (
        <div className={styles.saveHint}>
          These edits will update {saveCount} transaction{saveCount === 1 ? "" : "s"}
        </div>
      )}
      <div className={styles.footerButtons}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onClose}
          disabled={isWorking}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={isWorking || (!txn && !isBatchMode)}
        >
          {isWorking ? "Saving…" : `Save${saveCount > 1 ? ` (${saveCount})` : ""}`}
        </button>
      </div>
    </div>
  ) : undefined;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={viewMode === "main" ? "Edit Transaction" : undefined}
      snapPoints={[85, 95]}
      initialSnap={0}
      footer={footer}
      ariaLabel="Edit transaction"
    >
      <div className={styles.content}>
        {viewMode === "main" && renderMainView()}
        {viewMode === "category" && renderCategoryView()}
        {viewMode === "payment" && renderPaymentView()}
      </div>
    </BottomSheet>
  );
}
