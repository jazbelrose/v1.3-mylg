import React from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import type { HqRecurringCommitmentsResponse } from "@/hq/lib/hqApi";
import type { HqTransaction } from "@/hq/types";
import styles from "./RecurringSeriesModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type RecurringItem = HqRecurringCommitmentsResponse["items"][number];

type Props = {
  isOpen: boolean;
  series: RecurringItem | null;
  transactions: HqTransaction[];
  canAdmin?: boolean;
  onRequestClose: () => void;
  onViewTransactions?: (series: RecurringItem) => void;
  onOpenTxn?: (txn: HqTransaction) => void;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const RecurringSeriesModal: React.FC<Props> = ({
  isOpen,
  series,
  transactions,
  canAdmin,
  onRequestClose,
  onViewTransactions,
  onOpenTxn,
}) => {
  const matches = React.useMemo(() => {
    if (!series) return [];

    const vendorKey = String(series.vendorKey || "").trim();
    if (!vendorKey) return [];

    return [...transactions]
      .filter((t) => String(t.vendorKey || "").trim() === vendorKey)
      .filter((t) => !t.isInternalTransfer)
      .sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")))
      .slice(0, 25);
  }, [series, transactions]);

  const title = series?.label ? String(series.label) : "Recurring";

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Recurring details"
      closeTimeoutMS={200}
      className={{
        base: styles.modalContent,
        afterOpen: styles.modalContentAfterOpen,
        beforeClose: styles.modalContentBeforeClose,
      }}
      overlayClassName={{
        base: styles.modalOverlay,
        afterOpen: styles.modalOverlayAfterOpen,
        beforeClose: styles.modalOverlayBeforeClose,
      }}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.title} data-testid="recurring-series-title">
            {title}
          </div>
          <div className={styles.subtitle}>
            {series?.categoryId && series.categoryId !== "OTHER" ? (
              <span>{HQ_CATEGORY_LABEL[series.categoryId as keyof typeof HQ_CATEGORY_LABEL] || series.categoryId}</span>
            ) : (
              <span>Recurring commitment</span>
            )}
            {typeof series?.amountMonthly === "number" ? <span>· {currency.format(series.amountMonthly)}/mo</span> : null}
          </div>
        </div>

        <button type="button" className={styles.closeButton} onClick={onRequestClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.body}>
        {series ? (
          <div className={styles.kvGrid}>
            <div className={styles.kv}>
              <div className={styles.k}>Series key</div>
              <div className={styles.v}>{series.seriesKey}</div>
            </div>
            <div className={styles.kv}>
              <div className={styles.k}>Vendor key</div>
              <div className={styles.v}>{series.vendorKey}</div>
            </div>
          </div>
        ) : null}

        <div className={styles.sectionTitle}>Recent matching transactions</div>
        {matches.length === 0 ? (
          <div className={styles.emptyState}>No matching transactions found in your local cache yet.</div>
        ) : (
          <div className={styles.txnList} role="list">
            {matches.map((t) => (
              <button
                key={t.dedupeHash}
                type="button"
                className={styles.txnRow}
                onClick={() => {
                  if (!canAdmin || !onOpenTxn) return;
                  onOpenTxn(t);
                }}
                disabled={!canAdmin || !onOpenTxn}
              >
                <span className={styles.txnLeft}>
                  <span className={styles.txnVendor}>{t.vendor || t.counterparty || t.rawDescription}</span>
                  <span className={styles.txnMeta}>
                    <span>{t.postedAt}</span>
                    {t.accountId ? <span>· {t.accountId}</span> : null}
                  </span>
                </span>
                <span className={styles.txnAmount} data-dir={t.direction === "out" ? "out" : "in"}>
                  {t.direction === "out" ? "-" : "+"}
                  {currency.format(Math.abs(t.amount))}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.secondaryButton} onClick={onRequestClose}>
          Close
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            if (!series || !onViewTransactions) return;
            onViewTransactions(series);
          }}
          disabled={!series || !onViewTransactions}
        >
          View in Transactions
        </button>
      </div>
    </Modal>
  );
};

export default RecurringSeriesModal;
