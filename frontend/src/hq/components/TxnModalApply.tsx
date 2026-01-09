import React from "react";
import { toast } from "react-toastify";
import Modal from "@/shared/ui/ModalWithStack";
import { HQ_CATEGORIES, HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import { applyHqTransactionsBulk, fetchHqSummary, fetchHqTransactions, fetchHqVendorMatches } from "@/hq/lib/hqApi";
import { getVendorKeyForTxn } from "@/hq/lib/vendorNormalization";
import { hydrateHqState, readHqState } from "@/hq/lib/hqStore";
import type { HqCategoryId, HqTransaction, HqTransactionType } from "@/hq/types";
import HqSelect from "@/hq/components/HqSelect";
import styles from "./TxnModalApply.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type Props = {
  orgId: string;
  isOpen: boolean;
  txn: HqTransaction | null;
  onRequestClose: () => void;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function txnTitle(txn: HqTransaction) {
  return txn.vendor || txn.counterparty || txn.rawDescription;
}

const TYPE_OPTIONS: Array<{ value: HqTransactionType; label: string }> = [
  { value: "card_purchase", label: "Card purchase" },
  { value: "recurring", label: "Recurring" },
  { value: "transfer", label: "Transfer" },
  { value: "zelle", label: "Zelle" },
  { value: "wire", label: "Wire" },
  { value: "deposit", label: "Deposit" },
  { value: "fee", label: "Fee" },
  { value: "unknown", label: "Unknown" },
];

const TxnModalApply: React.FC<Props> = ({ orgId, isOpen, txn, onRequestClose }) => {
  const [categoryId, setCategoryId] = React.useState<HqCategoryId | "OTHER">("OTHER");
  const [type, setType] = React.useState<HqTransactionType>("unknown");
  const [isWorking, setIsWorking] = React.useState(false);
  const [similar, setSimilar] = React.useState<HqTransaction[]>([]);

  React.useEffect(() => {
    if (!isOpen || !txn) return;

    setCategoryId((txn.categoryId && txn.categoryId !== "OTHER" ? txn.categoryId : "OTHER") as HqCategoryId | "OTHER");
    setType((txn.type || "unknown") as HqTransactionType);

    let cancelled = false;
    setIsWorking(true);
    void (async () => {
      try {
        const { vendorKey } = getVendorKeyForTxn(txn);
        if (!vendorKey || vendorKey === "unknown") {
          if (!cancelled) setSimilar([]);
          return;
        }

        const res = await fetchHqVendorMatches(orgId, {
          vendorKey,
          includeCategorized: true,
          limit: 30,
        });
        if (cancelled) return;

        const matches = Array.isArray(res.matches) ? res.matches : [];
        // Keep stable ordering; exclude the selected txn if it appears in the matches.
        const filtered = matches.filter((m) => m.dedupeHash !== txn.dedupeHash);
        setSimilar(filtered);
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
  }, [isOpen, orgId, txn]);

  const handleApply = React.useCallback(async () => {
    if (!txn) return;

    const nextCategoryId = String(categoryId || "OTHER");
    const nextType = String(type || "unknown");

    const dedupeHashes = [txn.dedupeHash, ...similar.map((t) => t.dedupeHash)].filter(Boolean);
    const unique = Array.from(new Set(dedupeHashes)).slice(0, 60);

    setIsWorking(true);
    try {
      const res = await applyHqTransactionsBulk(orgId, {
        dedupeHashes: unique,
        categoryId: nextCategoryId,
        type: nextType,
      });

      // Refresh local cache from server so HQ pages stay consistent.
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

      toast.success(`Applied to ${res.updated} transaction${res.updated === 1 ? "" : "s"}.`);
      onRequestClose();
    } catch (err) {
      console.error(err);
      toast.error("Could not apply changes.");
    } finally {
      setIsWorking(false);
    }
  }, [categoryId, onRequestClose, orgId, similar, txn, type]);

  const title = txn ? txnTitle(txn) : "Transaction";
  const accountLabel = txn?.accountId ? txn.accountId : "Account";

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Apply to transaction"
      closeTimeoutMS={200}
      className={styles.modalContent}
      overlayClassName={styles.modalOverlay}
    >
      <div className={styles.header}
      >
        <div>
          <div className={styles.title}>Apply</div>
          <div className={styles.subtitle}>{title}</div>
        </div>
        <button type="button" className={styles.closeButton} onClick={onRequestClose} aria-label="Close">
          ×
        </button>
      </div>

      {txn ? (
        <div className={styles.body}>
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span>{txn.postedAt}</span>
              <span>·</span>
              <span>{accountLabel}</span>
            </div>
            <div className={styles.amount}>
              {txn.amount < 0 ? "-" : "+"}
              {currency.format(Math.abs(txn.amount))}
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.control}>
              <div className={styles.controlLabel}>Category</div>
              <HqSelect
                className={styles.select}
                value={String(categoryId)}
                disabled={isWorking}
                onValueChange={(v) => setCategoryId(v as HqCategoryId)}
                ariaLabel="Select category"
                options={HQ_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
              />
            </div>

            <div className={styles.control}>
              <div className={styles.controlLabel}>Type</div>
              <HqSelect
                className={styles.select}
                value={type}
                disabled={isWorking}
                onValueChange={(v) => setType(v as HqTransactionType)}
                ariaLabel="Select type"
                options={TYPE_OPTIONS}
              />
            </div>
          </div>

          <div className={styles.similarHeader}>
            <div className={styles.similarTitle}>Similar</div>
            <div className={styles.similarMeta}>{similar.length} shown</div>
          </div>

          {similar.length === 0 ? (
            <div className={styles.emptyState}>No similar transactions found.</div>
          ) : (
            <div className={styles.similarList} role="region" aria-label="Similar transactions">
              {similar.map((t) => (
                <div key={t.dedupeHash} className={styles.similarRow}>
                  <div className={styles.similarMain}>
                    <div className={styles.similarName}>{txnTitle(t)}</div>
                    <div className={styles.similarMetaRow}>
                      <span>{t.postedAt}</span>
                      <span>·</span>
                      <span>{HQ_CATEGORY_LABEL[(t.categoryId || "OTHER") as HqCategoryId]}</span>
                      <span>·</span>
                      <span>{t.type}</span>
                    </div>
                  </div>
                  <div className={styles.similarAmt}>
                    {t.amount < 0 ? "-" : "+"}
                    {currency.format(Math.abs(t.amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className={styles.footer}>
        <button type="button" className={styles.secondaryButton} onClick={onRequestClose} disabled={isWorking}>
          Cancel
        </button>
        <button type="button" className={styles.primaryButton} onClick={() => void handleApply()} disabled={isWorking || !txn}>
          Apply
        </button>
      </div>
    </Modal>
  );
};

export default TxnModalApply;
