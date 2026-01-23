import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, AlertCircle, Sparkles, Link2, Unlink2 } from "lucide-react";
import { useOrg } from "@/app/contexts/useOrg";
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

  const tokenize = (value: string): string[] =>
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)
      .slice(0, 16);

  const computeSuggestionScore = (
    txn: HqTransaction,
    context: { queryTokens: string[]; remainingTarget: number | null }
  ): { score: number; reasons: string[] } => {
    const absAmount = Math.abs(txn.amount);
    const remainingTarget = context.remainingTarget;
    const amountScore =
      remainingTarget != null && remainingTarget > 0
        ? 1 - Math.min(1, Math.abs(absAmount - remainingTarget) / Math.max(absAmount, remainingTarget, 1))
        : 0.35;

    const hay = `${txn.vendor ?? ""} ${txn.rawDescription ?? ""}`.toLowerCase();
    const tokenMatches = context.queryTokens.filter((t) => hay.includes(t)).length;
    const textScore = context.queryTokens.length ? tokenMatches / context.queryTokens.length : 0;

    const posted = new Date(txn.postedAt);
    const ageDays = Number.isNaN(posted.getTime())
      ? 365
      : Math.max(0, (Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = Math.exp(-ageDays / 35);

    const score = 0.5 * amountScore + 0.3 * textScore + 0.2 * recencyScore;

    const reasons: string[] = [];
    if (textScore >= 0.34) reasons.push("Memo/vendor match");
    if (amountScore >= 0.75) reasons.push("Amount match");
    if (recencyScore >= 0.55) reasons.push("Recent");

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

  const suggestions = (() => {
    if (!candidateTxns.length) return [];
    const queryTokens = tokenize(budgetItemName ?? "");
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
        const { score, reasons } = computeSuggestionScore(txn, { queryTokens, remainingTarget });
        return { txn, score, reasons };
      })
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 12);
  })();

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

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

  const drawerContent = (
    <div
      className={styles.overlay}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div
        className={styles.drawer}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={() => {}}
      >
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h2 id="drawer-title" className={styles.title}>
              Spend · Link transactions
            </h2>
            {budgetItemName ? (
              <span className={styles.subtitle}>{budgetItemName}</span>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </header>

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
              <div className={styles.summary}>
                <span className={styles.summaryLabel}>Allocated:</span>
                <span className={styles.summaryValue}>
                  {currency.format(data?.totalAllocated ?? 0)}
                </span>
                {Number.isFinite(costTargetTotal ?? NaN) && (costTargetTotal ?? 0) > 0 ? (
                  <>
                    <span className={styles.summaryDivider}>·</span>
                    <span className={styles.summaryLabel}>Target:</span>
                    <span className={styles.summaryValue}>{currency.format(costTargetTotal ?? 0)}</span>
                    <span className={styles.summaryDivider}>·</span>
                    <span className={styles.summaryLabel}>Remaining:</span>
                    <span className={styles.summaryValue}>
                      {currency.format(lineRemainingTarget ?? 0)}
                    </span>
                  </>
                ) : null}
              </div>

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
                  <select
                    className={styles.select}
                    value={suggestionScope}
                    onChange={(e) => setSuggestionScope(e.target.value as SuggestionScope)}
                    aria-label="Suggestion scope"
                  >
                    <option value="project">This project</option>
                    <option value="unlinked">Unlinked</option>
                    <option value="all">All</option>
                  </select>
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
    </div>
  );

  // Render in portal to escape stacking contexts and appear above all content
  return createPortal(drawerContent, document.body);
};

export default BudgetLineTransactionsDrawer;
