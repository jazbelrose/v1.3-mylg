import React from "react";
import { toast } from "react-toastify";
import Modal from "@/shared/ui/ModalWithStack";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import { applyHqTransactionsBulk, fetchHqSummary, fetchHqTransactions, fetchHqVendorMatches } from "@/hq/lib/hqApi";
import { hydrateHqState, readHqState, useHqStore } from "@/hq/lib/hqStore";
import type { HqCategoryId, HqTransaction, HqTransactionType } from "@/hq/types";
import HqSelect from "@/hq/components/HqSelect";
import HqCategoryPicker from "@/hq/components/HqCategoryPicker";
import styles from "./TxnModalApply.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type Props = {
  orgId: string;
  isOpen: boolean;
  txn: HqTransaction | null;
  onRequestClose: () => void;
  from?: string;
  to?: string;
};

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

const MIN_AUTO_SUGGESTIONS = 5;

const TxnModalApply: React.FC<Props> = ({ orgId, isOpen, txn, onRequestClose, from, to }) => {
  const [categoryId, setCategoryId] = React.useState<HqCategoryId | "OTHER">("OTHER");
  const [type, setType] = React.useState<HqTransactionType>("unknown");
  const [isWorking, setIsWorking] = React.useState(false);
  const [similar, setSimilar] = React.useState<HqTransaction[]>([]);
  const [similarUnavailable, setSimilarUnavailable] = React.useState(false);
  const [selectedSimilar, setSelectedSimilar] = React.useState<Record<string, true>>({});

  const accounts = useHqStore(orgId, (s) => s.accounts);

  const [addMoreSearch, setAddMoreSearch] = React.useState("");
  const [addMoreFrom, setAddMoreFrom] = React.useState<string>("");
  const [addMoreTo, setAddMoreTo] = React.useState<string>("");
  const [addMoreAccountId, setAddMoreAccountId] = React.useState<string>("all");
  const [addMoreType, setAddMoreType] = React.useState<"all" | HqTransactionType>("all");

  React.useEffect(() => {
    if (!isOpen || !txn) return;

    setCategoryId((txn.categoryId && txn.categoryId !== "OTHER" ? txn.categoryId : "OTHER") as HqCategoryId | "OTHER");
    setType((txn.type || "unknown") as HqTransactionType);
    setSelectedSimilar({});
    setAddMoreSearch(String(txn.vendor || txn.counterparty || ""));
    setAddMoreFrom(from || "");
    setAddMoreTo(to || "");
    setAddMoreAccountId("all");
    setAddMoreType("all");

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
        // Keep stable ordering; exclude the selected txn if it appears in the matches.
        const filtered = matches.filter((m) => m.dedupeHash !== txn.dedupeHash);
        setSimilar(filtered);
        setSelectedSimilar(() => {
          const next: Record<string, true> = {};
          for (const m of filtered) {
            if (m?.dedupeHash) next[m.dedupeHash] = true;
          }
          return next;
        });
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

  const showAddMore = similarUnavailable || similar.length < MIN_AUTO_SUGGESTIONS;

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

  const handleAddMore = React.useCallback(async () => {
    if (!txn) return;

    setIsWorking(true);
    try {
      const res = await fetchHqTransactions({
        orgId,
        accountId: addMoreAccountId !== "all" ? addMoreAccountId : undefined,
        from: addMoreFrom || undefined,
        to: addMoreTo || undefined,
        limit: 500,
      });

      const all = Array.isArray(res.transactions) ? res.transactions : [];
      const term = addMoreSearch.trim().toLowerCase();

      const existing = new Set<string>([txn.dedupeHash, ...similar.map((s) => s.dedupeHash)].filter(Boolean));
      const added: HqTransaction[] = [];
      for (const t of all) {
        if (!t?.dedupeHash) continue;
        if (existing.has(t.dedupeHash)) continue;
        if (addMoreType !== "all" && t.type !== addMoreType) continue;
        if (term && !txnSearchHaystack(t).includes(term)) continue;
        added.push(t);
        existing.add(t.dedupeHash);
        if (added.length >= 80) break;
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
    } catch (err) {
      console.error(err);
      toast.error("Could not load more candidates.");
    } finally {
      setIsWorking(false);
    }
  }, [addMoreAccountId, addMoreFrom, addMoreSearch, addMoreTo, addMoreType, orgId, similar, txn]);

  const handleApply = React.useCallback(async () => {
    if (!txn) return;

    const nextCategoryId = String(categoryId || "OTHER");
    const nextType = String(type || "unknown");

    const selected = similar.map((t) => t.dedupeHash).filter((dh) => Boolean(dh) && Boolean(selectedSimilar[String(dh)]));
    const dedupeHashes = [txn.dedupeHash, ...selected].filter(Boolean);
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
  }, [categoryId, onRequestClose, orgId, selectedSimilar, similar, txn, type]);

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
              <HqCategoryPicker
                orgId={orgId}
                className={styles.select}
                value={String(categoryId)}
                disabled={isWorking}
                onValueChange={(v) => setCategoryId(v as HqCategoryId)}
                ariaLabel="Select category"
                placeholder="Search categories…"
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
            <div className={styles.similarHeaderRight}>
              {similar.length > 0 ? (
                <div className={styles.selectActions}>
                  <button type="button" className={styles.linkButton} onClick={handleSelectAll} disabled={isWorking}>
                    Select all
                  </button>
                  <button type="button" className={styles.linkButton} onClick={handleSelectNone} disabled={isWorking}>
                    Select none
                  </button>
                </div>
              ) : null}
              <div className={styles.similarMeta}>{similar.length} shown</div>
            </div>
          </div>

          {showAddMore ? (
            <div className={styles.addMore}>
              <div className={styles.addMoreTitle}>Add more</div>
              <div className={styles.addMoreFields}>
                <input
                  className={styles.addMoreField}
                  type="search"
                  placeholder="Search vendor / memo"
                  value={addMoreSearch}
                  onChange={(e) => setAddMoreSearch(e.target.value)}
                  aria-label="Search candidates"
                  disabled={isWorking}
                />
                <input
                  className={styles.addMoreField}
                  type="date"
                  value={addMoreFrom}
                  onChange={(e) => setAddMoreFrom(e.target.value)}
                  aria-label="Candidate start date"
                  disabled={isWorking}
                />
                <input
                  className={styles.addMoreField}
                  type="date"
                  value={addMoreTo}
                  onChange={(e) => setAddMoreTo(e.target.value)}
                  aria-label="Candidate end date"
                  disabled={isWorking}
                />
                <HqSelect
                  className={styles.addMoreField}
                  value={addMoreAccountId}
                  onValueChange={setAddMoreAccountId}
                  ariaLabel="Filter candidates by account"
                  disabled={isWorking}
                  options={[
                    { value: "all", label: "All accounts" },
                    ...accounts.map((a) => ({
                      value: a.accountId,
                      label: String(a.name ?? a.accountName ?? a.accountId),
                    })),
                  ]}
                />
                <HqSelect
                  className={styles.addMoreField}
                  value={addMoreType}
                  onValueChange={(v) => setAddMoreType(v as "all" | HqTransactionType)}
                  ariaLabel="Filter candidates by type"
                  disabled={isWorking}
                  options={[
                    { value: "all", label: "All types" },
                    ...TYPE_OPTIONS,
                  ]}
                />
                <button type="button" className={styles.addMoreButton} onClick={() => void handleAddMore()} disabled={isWorking || !txn}>
                  Add
                </button>
              </div>
            </div>
          ) : null}

          {similarUnavailable ? (
            <div className={styles.emptyState}>Similar unavailable (no vendor key).</div>
          ) : similar.length === 0 ? (
            <div className={styles.emptyState}>No similar transactions found.</div>
          ) : (
            <div className={styles.similarList} role="region" aria-label="Similar transactions">
              {similar.map((t) => (
                <div key={t.dedupeHash} className={styles.similarRow}>
                  <div className={styles.checkboxCell}>
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      checked={Boolean(t?.dedupeHash && selectedSimilar[String(t.dedupeHash)])}
                      onChange={(e) => {
                        if (!t?.dedupeHash) return;
                        toggleSelected(String(t.dedupeHash), e.target.checked);
                      }}
                      disabled={isWorking}
                      aria-label={`Select ${txnTitle(t)}`}
                    />
                  </div>
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
