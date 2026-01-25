import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { X, ExternalLink, AlertCircle, Sparkles, Link2, Unlink2 } from "lucide-react";
import { useOrg } from "@/app/contexts/useOrg";
import HqSelect from "@/hq/components/HqSelect";
import {
  addHqTransactionAllocation,
  fetchHqBudgetLineAllocations,
  fetchHqBudgetLineDrawerData,
  removeHqTransactionAllocation,
  type HqBudgetLineAllocationsResponse,
} from "@/hq/lib/hqApi";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import type { HqTransaction, HqTransactionAllocation } from "@/hq/types";
import styles from "./budget-line-transactions-drawer.module.css";

// Initialize Modal for accessibility
if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export interface BudgetLineTransactionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  budgetItemId: string;
  budgetItemName?: string;
  /** Optional: planned/auto cost total for this line item (qty × unit cost basis). */
  costTargetTotal?: number | null;
  /** Optional: callback to keep Budget table totals in sync. */
  onBudgetItemAllocatedTotalChange?: (budgetItemId: string, allocatedTotal: number) => void;
}

type SuggestionScope = "project" | "unlinked" | "all";

type TxnRow = HqTransaction | (HqBudgetLineAllocationsResponse["transactions"][number] & {
  allocations?: HqTransactionAllocation[];
});

const BudgetLineTransactionsDrawer: React.FC<BudgetLineTransactionsDrawerProps> = ({
  isOpen,
  onClose,
  projectId,
  budgetItemId,
  budgetItemName,
  costTargetTotal = null,
  onBudgetItemAllocatedTotalChange,
}) => {
  const { activeOrgId } = useOrg();
  const [data, setData] = useState<HqBudgetLineAllocationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingByTxn, setSavingByTxn] = useState<Record<string, boolean>>({});
  const [draftAmountByTxn, setDraftAmountByTxn] = useState<Record<string, string>>({});

  const [suggestionScope, setSuggestionScope] = useState<SuggestionScope>("project");
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [candidateTxns, setCandidateTxns] = useState<HqTransaction[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const safeParseAmount = (value: string): number | null => {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return null;
    if (num < 0) return null;
    return Math.round(num * 100) / 100;
  };

  const sumAllocations = (allocations?: HqTransactionAllocation[]): number => {
    if (!Array.isArray(allocations)) return 0;
    return allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  };

  const getTxnUnallocated = (txn: TxnRow): number | null => {
    const absAmount = Math.abs(Number((txn as { amount: number }).amount) || 0);
    const allocations = (txn as { allocations?: HqTransactionAllocation[] }).allocations;
    if (!Array.isArray(allocations)) return null;
    const allocated = sumAllocations(allocations);
    return Math.max(0, Math.round((absAmount - allocated) * 100) / 100);
  };

  const getLineRemainingTarget = (): number | null => {
    if (!Number.isFinite(costTargetTotal ?? NaN) || (costTargetTotal ?? 0) <= 0) return null;
    const allocated = data?.totalAllocated ?? 0;
    return Math.max(0, Math.round(((costTargetTotal ?? 0) - allocated) * 100) / 100);
  };

  const formatTxnLabel = (txn: { vendor?: string; rawDescription?: string }): string => {
    const vendor = txn.vendor?.trim();
    const memo = txn.rawDescription?.trim();
    return vendor || memo || "Transaction";
  };

  const formatDate = (value?: string): string => {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : dateFormatter.format(d);
  };

  /** Tokenizes a string for fuzzy matching - extracts meaningful words */
  const tokenize = (value: string): string[] =>
    value
      .toLowerCase()
      .replace(/['']/g, "") // normalize apostrophes
      .split(/[^a-z0-9]+/g)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2) // allow 2-char tokens for abbreviations
      .slice(0, 24);

  /** Normalizes vendor/company names for matching (removes common suffixes) */
  const normalizeVendorName = (name: string): string =>
    name
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|co|corp|company|stores?|shop|market)\b\.?/gi, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();

  /**
   * Patterns for personal recurring expenses that should be deprioritized.
   * These rarely belong to project budgets unless explicitly searched.
   */
  const PERSONAL_EXPENSE_PATTERNS = [
    // Car payments & leases
    /\b(car\s*payment|auto\s*payment|vehicle\s*payment|lease\s*payment)\b/i,
    /\b(toyota|honda|ford|chevrolet|chevy|nissan|hyundai|kia|bmw|mercedes|audi|lexus|acura|mazda|subaru|volkswagen|vw)\s*(financial|motor|credit|lease|finance)\b/i,
    /\b(ally\s*(auto|financial)|capital\s*one\s*auto|chase\s*auto|wells\s*fargo\s*auto)\b/i,
    // Insurance
    /\b(insurance|insur|ins)\s*(payment|premium|pmt)?\b/i,
    /\b(geico|progressive|state\s*farm|allstate|liberty\s*mutual|farmers|usaa|nationwide|travelers|american\s*family|esurance|metlife\s*auto)\b/i,
    /\b(auto\s*ins|car\s*ins|vehicle\s*ins)\b/i,
    // Utilities & recurring personal
    /\b(electric\s*bill|gas\s*bill|water\s*bill|utility\s*bill|phone\s*bill|cell\s*bill|cable\s*bill|internet\s*bill)\b/i,
    /\b(mortgage|rent\s*payment|hoa\s*fee|property\s*tax)\b/i,
    // Subscriptions & memberships
    /\b(netflix|hulu|spotify|apple\s*music|disney\+?|hbo|amazon\s*prime|gym\s*membership|planet\s*fitness|la\s*fitness)\b/i,
  ];

  /** Check if transaction looks like a personal recurring expense */
  const isPersonalRecurringExpense = (txn: HqTransaction): boolean => {
    const hay = `${txn.vendor ?? ""} ${txn.rawDescription ?? ""} ${txn.normalizedDescription ?? ""}`.toLowerCase();
    return PERSONAL_EXPENSE_PATTERNS.some((pattern) => pattern.test(hay));
  };

  /**
   * Enhanced suggestion scoring algorithm.
   * Weights:
   * - 45% amount match (with bonus for exact/near-exact)
   * - 35% text/vendor match (tokens from line name + search query)
   * - 20% recency
   */
  const computeSuggestionScore = (
    txn: HqTransaction,
    context: {
      queryTokens: string[];
      remainingTarget: number | null;
      lineNameNormalized?: string;
    }
  ): { score: number; reasons: string[] } => {
    const absAmount = Math.abs(txn.amount);
    const remainingTarget = context.remainingTarget;
    const reasons: string[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // 1. AMOUNT SCORE (45% weight) - with bonus for exact/near-exact matches
    // ─────────────────────────────────────────────────────────────────────────
    let amountScore = 0.35; // default when no target
    let exactAmountMatch = false;

    if (remainingTarget != null && remainingTarget > 0) {
      const diff = Math.abs(absAmount - remainingTarget);
      const maxVal = Math.max(absAmount, remainingTarget, 1);
      const percentDiff = diff / maxVal;

      // Exact match (within $0.02 or 0.5%)
      if (diff <= 0.02 || percentDiff <= 0.005) {
        amountScore = 1.0;
        exactAmountMatch = true;
        reasons.push("Exact match");
      }
      // Near-exact match (within 2%)
      else if (percentDiff <= 0.02) {
        amountScore = 0.95;
        reasons.push("Amount match");
      }
      // Close match (within 10%)
      else if (percentDiff <= 0.10) {
        amountScore = 0.85 - percentDiff * 2;
        reasons.push("Amount match");
      }
      // Standard decay
      else {
        amountScore = Math.max(0, 1 - percentDiff);
        if (amountScore >= 0.75) reasons.push("Similar amount");
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. TEXT/VENDOR SCORE (35% weight) - multi-signal matching
    // ─────────────────────────────────────────────────────────────────────────
    const txnVendor = txn.vendor ?? "";
    const txnMemo = txn.rawDescription ?? "";
    const txnNormalized = txn.normalizedDescription ?? "";
    const txnVendorKey = txn.vendorKey ?? "";
    const hay = `${txnVendor} ${txnMemo} ${txnNormalized}`.toLowerCase();
    const hayTokens = tokenize(hay);

    let textScore = 0;
    let vendorKeyMatch = false;

    // 2a. Check vendorKey match against line name (strongest signal)
    if (txnVendorKey && context.lineNameNormalized) {
      const normalizedVendorKey = normalizeVendorName(txnVendorKey);
      if (
        normalizedVendorKey.includes(context.lineNameNormalized) ||
        context.lineNameNormalized.includes(normalizedVendorKey)
      ) {
        textScore = 0.9;
        vendorKeyMatch = true;
        if (!reasons.includes("Vendor match")) reasons.push("Vendor match");
      }
    }

    // 2b. Token matching (line name + search query tokens)
    if (!vendorKeyMatch && context.queryTokens.length > 0) {
      // Count how many query tokens appear in transaction
      const matchedTokens = context.queryTokens.filter((qt) => {
        // Check substring match
        if (hay.includes(qt)) return true;
        // Check if any hay token starts with query token (prefix match)
        return hayTokens.some((ht) => ht.startsWith(qt) || qt.startsWith(ht));
      });

      const matchRatio = matchedTokens.length / context.queryTokens.length;
      textScore = Math.max(textScore, matchRatio);

      if (matchRatio >= 0.5 && !reasons.some((r) => r.includes("match"))) {
        reasons.push("Memo/vendor match");
      }
    }

    // 2c. Fallback: check if vendor name contains significant budget line words
    if (textScore < 0.3 && txnVendor && context.lineNameNormalized) {
      const normalizedTxnVendor = normalizeVendorName(txnVendor);
      if (
        normalizedTxnVendor.includes(context.lineNameNormalized) ||
        context.lineNameNormalized.includes(normalizedTxnVendor)
      ) {
        textScore = Math.max(textScore, 0.7);
        if (!reasons.some((r) => r.includes("match"))) reasons.push("Vendor match");
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. RECENCY SCORE (20% weight) - exponential decay ~35 days half-life
    // ─────────────────────────────────────────────────────────────────────────
    const posted = new Date(txn.postedAt);
    const ageDays = Number.isNaN(posted.getTime())
      ? 365
      : Math.max(0, (Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = Math.exp(-ageDays / 35);
    if (recencyScore >= 0.55 && !reasons.includes("Recent")) reasons.push("Recent");

    // ─────────────────────────────────────────────────────────────────────────
    // FINAL SCORE with bonus multipliers and penalties
    // ─────────────────────────────────────────────────────────────────────────
    let score = 0.45 * amountScore + 0.35 * textScore + 0.2 * recencyScore;

    // Bonus: exact amount + any text match = push to top
    if (exactAmountMatch && textScore >= 0.3) {
      score = Math.min(1.0, score * 1.15);
    }

    // Bonus: vendor key match = significant boost
    if (vendorKeyMatch) {
      score = Math.min(1.0, score * 1.1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PENALTY: Personal recurring expenses (car payments, insurance, etc.)
    // Unless user is explicitly searching for them (textScore high), heavily penalize
    // ─────────────────────────────────────────────────────────────────────────
    if (isPersonalRecurringExpense(txn) && textScore < 0.5) {
      // Heavy penalty: push these to the bottom of suggestions
      score = score * 0.15;
      // Remove any positive reason chips since this is likely not relevant
      reasons.length = 0;
      reasons.push("Personal expense");
    }

    return { score, reasons };
  };

  // Use ref for callback to avoid infinite re-render loops
  const onAllocatedChangeRef = useRef(onBudgetItemAllocatedTotalChange);
  onAllocatedChangeRef.current = onBudgetItemAllocatedTotalChange;

  const refreshLinked = useCallback(async () => {
    if (!activeOrgId || !projectId || !budgetItemId) return;
    const res = await fetchHqBudgetLineAllocations(activeOrgId, projectId, budgetItemId);
    setData(res);
    onAllocatedChangeRef.current?.(budgetItemId, res.totalAllocated);
  }, [activeOrgId, projectId, budgetItemId]);

  // Track last fetched scope/query to avoid refetching when only allocations change
  const lastFetchParams = useRef<{ scope: SuggestionScope; query: string } | null>(null);

  // Debounce the suggestion query to avoid excessive API calls while typing
  const [debouncedQuery, setDebouncedQuery] = useState(suggestionQuery);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(suggestionQuery), 300);
    return () => clearTimeout(timer);
  }, [suggestionQuery]);

  // Single batched fetch for both allocations and suggestions
  useEffect(() => {
    if (!isOpen || !activeOrgId || !projectId || !budgetItemId) {
      setData(null);
      setLoadError(null);
      setActionError(null);
      setDraftAmountByTxn({});
      setSavingByTxn({});
      setCandidateTxns([]);
      setSuggestionsError(null);
      lastFetchParams.current = null;
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setSuggestionsLoading(true);
    setLoadError(null);
    setActionError(null);
    setSuggestionsError(null);

    fetchHqBudgetLineDrawerData({
      orgId: activeOrgId,
      projectId,
      budgetItemId,
      suggestionScope,
      suggestionQuery: debouncedQuery.trim() || undefined,
      suggestionsDays: 180,
      suggestionsLimit: 200,
      signal: controller.signal,
    })
      .then((res) => {
        if (cancelled) return;
        // Set allocations data
        setData(res.allocations);
        onAllocatedChangeRef.current?.(budgetItemId, res.allocations.totalAllocated);
        // Set suggestions data
        setCandidateTxns(res.suggestions.transactions ?? []);
        lastFetchParams.current = { scope: suggestionScope, query: debouncedQuery };
      })
      .catch((err) => {
        if (cancelled) return;
        if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Failed to load data";
        setLoadError(msg);
        setSuggestionsError(msg);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setSuggestionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, activeOrgId, projectId, budgetItemId, suggestionScope, debouncedQuery]);

  useEffect(() => {
    if (!isOpen || !data?.transactions?.length) return;
    setDraftAmountByTxn((prev) => {
      const next = { ...prev };
      for (const txn of data.transactions) {
        if (next[txn.dedupeHash] == null) {
          next[txn.dedupeHash] = String(Math.round((txn.allocatedAmount || 0) * 100) / 100);
        }
      }
      return next;
    });
  }, [isOpen, data?.transactions]);

  const suggestions = useMemo(() => {
    if (!candidateTxns.length) return [];

    // Combine budget line name tokens with search query tokens for matching
    const lineNameTokens = tokenize(budgetItemName ?? "");
    const searchTokens = tokenize(suggestionQuery);
    const queryTokens = [...new Set([...lineNameTokens, ...searchTokens])];
    const lineNameNormalized = normalizeVendorName(budgetItemName ?? "");

    const remainingTarget = getLineRemainingTarget();
    const linkedSet = new Set(
      (data?.transactions ?? []).map((t) => `${t.dedupeHash}:${projectId}:${budgetItemId}`)
    );

    const scored = candidateTxns
      .filter((txn) => txn && txn.dedupeHash)
      .filter((txn) => txn.direction === "out")
      .filter((txn) => !txn.isInternalTransfer)
      .filter((txn) => {
        const allocations = Array.isArray(txn.allocations) ? txn.allocations : [];
        const hasThisAlloc = allocations.some(
          (a) => a.projectId === projectId && a.budgetItemId === budgetItemId
        );
        if (hasThisAlloc) return false;
        if (linkedSet.has(`${txn.dedupeHash}:${projectId}:${budgetItemId}`)) return false;
        const unallocated = getTxnUnallocated(txn);
        return unallocated == null ? true : unallocated > 0.01;
      })
      .map((txn) => {
        const { score, reasons } = computeSuggestionScore(txn, {
          queryTokens,
          remainingTarget,
          lineNameNormalized: lineNameNormalized || undefined,
        });
        return { txn, score, reasons };
      })
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 12);
  }, [candidateTxns, budgetItemName, suggestionQuery, data?.transactions, projectId, budgetItemId, costTargetTotal]);

  useEffect(() => {
    if (!isOpen || !suggestions.length) return;
    const remainingTarget = getLineRemainingTarget();
    setDraftAmountByTxn((prev) => {
      const next = { ...prev };
      for (const { txn } of suggestions) {
        if (next[txn.dedupeHash] != null) continue;
        const unallocated = getTxnUnallocated(txn);
        const desired =
          remainingTarget != null && remainingTarget > 0
            ? Math.min(unallocated ?? Math.abs(txn.amount), remainingTarget)
            : Math.min(unallocated ?? Math.abs(txn.amount), Math.abs(txn.amount));
        next[txn.dedupeHash] = String(Math.max(0, Math.round(desired * 100) / 100));
      }
      return next;
    });
  }, [isOpen, suggestions]);

  const lineRemainingTarget = getLineRemainingTarget();

  const handleSaveAllocation = async (txn: { dedupeHash: string; amount: number }) => {
    if (!activeOrgId) return;
    const key = txn.dedupeHash;
    const parsed = safeParseAmount(draftAmountByTxn[key] ?? "");
    if (parsed == null) {
      setActionError("Enter a valid allocation amount");
      return;
    }

    setSavingByTxn((prev) => ({ ...prev, [key]: true }));
    setActionError(null);
    try {
      await addHqTransactionAllocation(activeOrgId, key, {
        projectId,
        budgetItemId,
        amount: parsed,
      });
      await refreshLinked();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save allocation");
    } finally {
      setSavingByTxn((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleRemoveAllocation = async (dedupeHash: string) => {
    if (!activeOrgId) return;
    setSavingByTxn((prev) => ({ ...prev, [dedupeHash]: true }));
    setActionError(null);
    try {
      await removeHqTransactionAllocation(activeOrgId, dedupeHash, budgetItemId);
      await refreshLinked();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove allocation");
    } finally {
      setSavingByTxn((prev) => ({ ...prev, [dedupeHash]: false }));
    }
  };

  // Determine allocation status for styling
  const allocatedAmount = data?.totalAllocated ?? 0;
  const isFullyAllocated = lineRemainingTarget !== null && lineRemainingTarget <= 0.01;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Spend - Link transactions"
      className={styles.modal}
      overlayClassName={styles.overlay}
    >
      <div className={styles.container}>
        <header className={styles.header}>
          <h2 id="drawer-title" className={styles.title}>
            Spend · Link transactions
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        {/* Sticky Context Card - Budget Line Item being edited */}
        <div className={styles.stickyContext}>
          <div className={styles.contextCard}>
            <div className={styles.contextCardHeader}>
              <div className={styles.contextCardMeta}>
                <span className={styles.contextCardId}>{budgetItemId.replace("LINE-", "").slice(0, 12)}</span>
                {budgetItemName ? (
                  <span className={styles.contextCardTitle}>{budgetItemName}</span>
                ) : (
                  <span className={styles.contextCardTitle}>Budget Line Item</span>
                )}
              </div>
              {Number.isFinite(costTargetTotal ?? NaN) && (costTargetTotal ?? 0) > 0 ? (
                <div className={styles.contextCardMetrics}>
                  <div className={styles.contextCardMetric}>
                    <span className={styles.contextCardMetricLabel}>Target</span>
                    <span className={styles.contextCardMetricValue}>{currency.format(costTargetTotal ?? 0)}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Allocation Status Bar */}
            <div className={styles.allocationBar}>
              <div className={styles.allocationStat}>
                <span className={styles.allocationStatLabel}>Allocated:</span>
                <span className={`${styles.allocationStatValue} ${isFullyAllocated ? styles.full : styles.allocated}`}>
                  {currency.format(allocatedAmount)}
                </span>
              </div>
              {Number.isFinite(costTargetTotal ?? NaN) && (costTargetTotal ?? 0) > 0 ? (
                <>
                  <span className={styles.allocationDivider}>·</span>
                  <div className={styles.allocationStat}>
                    <span className={styles.allocationStatLabel}>Target:</span>
                    <span className={styles.allocationStatValue}>{currency.format(costTargetTotal ?? 0)}</span>
                  </div>
                  <span className={styles.allocationDivider}>·</span>
                  <div className={styles.allocationStat}>
                    <span className={styles.allocationStatLabel}>Remaining:</span>
                    <span className={`${styles.allocationStatValue} ${isFullyAllocated ? styles.full : styles.remaining}`}>
                      {currency.format(lineRemainingTarget ?? 0)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loadingState}>Loading transactions…</div>
          ) : loadError ? (
            <div className={styles.errorState}>
              <AlertCircle size={18} />
              <span>{loadError}</span>
            </div>
          ) : (
            <>
              {actionError ? (
                <div className={styles.errorState} style={{ justifyContent: "flex-start" }}>
                  <AlertCircle size={18} />
                  <span>{actionError}</span>
                </div>
              ) : null}

              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>
                    <Link2 size={14} />
                    Linked
                  </span>
                  <span className={styles.sectionHint}>
                    {data?.transactions?.length ?? 0} txn
                    {(data?.transactions?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>

                {!data || data.transactions.length === 0 ? (
                  <div className={styles.emptyState}>No transactions linked to this line yet.</div>
                ) : (
                  <ul className={styles.transactionList}>
                    {data.transactions.map((txn) => {
                      const absAmount = Math.abs(txn.amount);
                      const unallocated = getTxnUnallocated(txn);
                      return (
                        <li key={txn.dedupeHash} className={styles.transactionItem}>
                          <div className={styles.txnMain}>
                            <span className={styles.txnVendor}>{formatTxnLabel(txn)}</span>
                            <span className={styles.txnAmount}>{currency.format(txn.allocatedAmount)}</span>
                          </div>
                          <div className={styles.txnMeta}>
                            <span className={styles.txnDate}>{formatDate(txn.postedAt)}</span>
                            {txn.categoryId ? (
                              <span className={styles.txnCategory}>
                                {HQ_CATEGORY_LABEL[txn.categoryId] ?? txn.categoryId}
                              </span>
                            ) : null}
                            {txn.amount !== txn.allocatedAmount ? (
                              <span className={styles.txnPartial}>
                                (of {currency.format(absAmount)} total)
                              </span>
                            ) : null}
                            {unallocated != null ? (
                              <span className={styles.txnUnallocated}>
                                Unallocated {currency.format(unallocated)}
                              </span>
                            ) : null}
                          </div>

                          <div className={styles.txnActions}>
                            <input
                              className={styles.amountInput}
                              inputMode="decimal"
                              type="number"
                              step="0.01"
                              min="0"
                              max={String(absAmount)}
                              value={draftAmountByTxn[txn.dedupeHash] ?? ""}
                              onChange={(e) =>
                                setDraftAmountByTxn((prev) => ({
                                  ...prev,
                                  [txn.dedupeHash]: e.target.value,
                                }))
                              }
                              aria-label="Allocated amount"
                            />
                            <button
                              type="button"
                              className={styles.primaryButton}
                              onClick={() => handleSaveAllocation(txn)}
                              disabled={Boolean(savingByTxn[txn.dedupeHash])}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className={styles.dangerButton}
                              onClick={() => handleRemoveAllocation(txn.dedupeHash)}
                              disabled={Boolean(savingByTxn[txn.dedupeHash])}
                            >
                              <Unlink2 size={14} />
                              Unlink
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>
                    <Sparkles size={14} />
                    Suggested
                  </span>
                </div>

                <div className={styles.suggestionControls}>
                  <HqSelect
                    value={suggestionScope}
                    onValueChange={(val) => setSuggestionScope(val as SuggestionScope)}
                    options={[
                      { value: "project", label: "This project" },
                      { value: "unlinked", label: "Unlinked" },
                      { value: "all", label: "All transactions" },
                    ]}
                    ariaLabel="Suggestion scope"
                    className={styles.scopeSelect}
                  />
                  <input
                    className={styles.searchInput}
                    type="text"
                    value={suggestionQuery}
                    onChange={(e) => setSuggestionQuery(e.target.value)}
                    placeholder="Search vendor or memo…"
                    aria-label="Search transactions"
                  />
                </div>

                {suggestionsLoading ? (
                  <div className={styles.loadingState}>Finding relevant transactions…</div>
                ) : suggestionsError ? (
                  <div className={styles.errorState}>
                    <AlertCircle size={18} />
                    <span>{suggestionsError}</span>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className={styles.emptyState}>No suggestions yet.</div>
                ) : (
                  <ul className={styles.transactionList}>
                    {suggestions.map(({ txn, reasons }) => {
                      const absAmount = Math.abs(txn.amount);
                      const unallocated = getTxnUnallocated(txn);
                      const draft = draftAmountByTxn[txn.dedupeHash] ?? "";
                      const parsedDraft = safeParseAmount(draft);
                      const canAllocate = parsedDraft != null && parsedDraft > 0;
                      return (
                        <li key={txn.dedupeHash} className={styles.transactionItem}>
                          <div className={styles.txnMain}>
                            <span className={styles.txnVendor}>{formatTxnLabel(txn)}</span>
                            <span className={styles.txnAmount}>{currency.format(absAmount)}</span>
                          </div>
                          <div className={styles.txnMeta}>
                            <span className={styles.txnDate}>{formatDate(txn.postedAt)}</span>
                            {txn.categoryId ? (
                              <span className={styles.txnCategory}>
                                {HQ_CATEGORY_LABEL[txn.categoryId] ?? txn.categoryId}
                              </span>
                            ) : null}
                            {unallocated != null ? (
                              <span className={styles.txnUnallocated}>
                                Unallocated {currency.format(unallocated)}
                              </span>
                            ) : null}
                            {reasons.length ? (
                              <span className={styles.reasonChips}>
                                {reasons.slice(0, 2).map((r) => (
                                  <span key={r} className={styles.reasonChip}>
                                    {r}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </div>

                          <div className={styles.txnActions}>
                            <input
                              className={styles.amountInput}
                              inputMode="decimal"
                              type="number"
                              step="0.01"
                              min="0"
                              max={String(absAmount)}
                              value={draft}
                              onChange={(e) =>
                                setDraftAmountByTxn((prev) => ({
                                  ...prev,
                                  [txn.dedupeHash]: e.target.value,
                                }))
                              }
                              aria-label="Allocation amount"
                            />
                            <button
                              type="button"
                              className={styles.primaryButton}
                              onClick={() => handleSaveAllocation(txn)}
                              disabled={!canAllocate || Boolean(savingByTxn[txn.dedupeHash])}
                            >
                              <Link2 size={14} />
                              Allocate
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <footer className={styles.footer}>
          <a
            href="/dashboard/hq/transactions"
            className={styles.viewAllLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            View all in HQ
            <ExternalLink size={14} />
          </a>
        </footer>
      </div>
    </Modal>
  );
};

export default BudgetLineTransactionsDrawer;
