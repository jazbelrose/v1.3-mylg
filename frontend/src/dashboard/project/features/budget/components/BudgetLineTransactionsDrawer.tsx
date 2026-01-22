import React, { useState, useEffect, useCallback } from "react";
import { X, ExternalLink, AlertCircle } from "lucide-react";
import { useOrg } from "@/app/contexts/useOrg";
import {
  fetchHqBudgetLineAllocations,
  type HqBudgetLineAllocationsResponse,
} from "@/hq/lib/hqApi";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
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
}

const BudgetLineTransactionsDrawer: React.FC<BudgetLineTransactionsDrawerProps> = ({
  isOpen,
  onClose,
  projectId,
  budgetItemId,
  budgetItemName,
}) => {
  const { activeOrgId } = useOrg();
  const [data, setData] = useState<HqBudgetLineAllocationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !activeOrgId || !projectId || !budgetItemId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchHqBudgetLineAllocations(activeOrgId, projectId, budgetItemId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load transactions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeOrgId, projectId, budgetItemId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
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
              Linked Transactions
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
          ) : error ? (
            <div className={styles.errorState}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : !data || data.transactions.length === 0 ? (
            <div className={styles.emptyState}>
              No transactions linked to this budget line yet.
            </div>
          ) : (
            <>
              <div className={styles.summary}>
                <span className={styles.summaryLabel}>Total allocated:</span>
                <span className={styles.summaryValue}>
                  {currency.format(data.totalAllocated)}
                </span>
                <span className={styles.summaryCount}>
                  ({data.transactions.length} transaction
                  {data.transactions.length === 1 ? "" : "s"})
                </span>
              </div>

              <ul className={styles.transactionList}>
                {data.transactions.map((txn) => (
                  <li key={txn.dedupeHash} className={styles.transactionItem}>
                    <div className={styles.txnMain}>
                      <span className={styles.txnVendor}>
                        {txn.vendor || txn.rawDescription || "Transaction"}
                      </span>
                      <span className={styles.txnAmount}>
                        {currency.format(txn.allocatedAmount)}
                      </span>
                    </div>
                    <div className={styles.txnMeta}>
                      <span className={styles.txnDate}>
                        {txn.postedAt ? dateFormatter.format(new Date(txn.postedAt)) : "—"}
                      </span>
                      {txn.categoryId ? (
                        <span className={styles.txnCategory}>
                          {HQ_CATEGORY_LABEL[txn.categoryId] ?? txn.categoryId}
                        </span>
                      ) : null}
                      {txn.amount !== txn.allocatedAmount ? (
                        <span className={styles.txnPartial}>
                          (of {currency.format(Math.abs(txn.amount))} total)
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
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
};

export default BudgetLineTransactionsDrawer;
