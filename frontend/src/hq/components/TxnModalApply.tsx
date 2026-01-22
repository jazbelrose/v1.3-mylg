import React from "react";
import { toast } from "react-toastify";
import Modal from "@/shared/ui/ModalWithStack";
import { useSocket } from "@/app/contexts/useSocket";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import { applyHqTransactionsBulk, fetchHqSummary, fetchHqTransactions, fetchHqVendorMatches } from "@/hq/lib/hqApi";
import { hydrateHqState, readHqState, useHqStore } from "@/hq/lib/hqStore";
import { sendHqUpdated } from "@/hq/lib/hqWebSocket";
import type { HqCategoryId, HqPaymentType, HqTransaction } from "@/hq/types";
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
  /** Called after transactions are successfully updated. */
  onSaved?: () => void;
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

function getMatchReason(
  source: HqTransaction,
  match: HqTransaction
): string | null {
  const reasons: string[] = [];
  // Check vendor match
  if (source.vendorKey && match.vendorKey && source.vendorKey === match.vendorKey) {
    reasons.push("Same vendor");
  }
  // Check amount match
  if (source.amount === match.amount) {
    reasons.push("same amount");
  } else if (Math.abs(source.amount - match.amount) <= 1) {
    reasons.push("similar amount");
  }
  // Check direction match
  const sourceDir = source.amount < 0 ? "out" : "in";
  const matchDir = match.amount < 0 ? "out" : "in";
  if (sourceDir === matchDir && !reasons.includes("same amount") && !reasons.includes("similar amount")) {
    reasons.push(`flow ${sourceDir}`);
  }
  if (reasons.length === 0) return null;
  // Capitalize first reason
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

const MIN_AUTO_SUGGESTIONS = 5;

const TxnModalApply: React.FC<Props> = ({ orgId, isOpen, txn, onRequestClose, onSaved, from, to }) => {
  const { ws } = useSocket();
  const [categoryId, setCategoryId] = React.useState<HqCategoryId | "OTHER">("OTHER");
  const [paymentType, setPaymentType] = React.useState<HqPaymentType>("unknown");
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [isWorking, setIsWorking] = React.useState(false);
  const [similar, setSimilar] = React.useState<HqTransaction[]>([]);
  const [similarUnavailable, setSimilarUnavailable] = React.useState(false);
  const [selectedSimilar, setSelectedSimilar] = React.useState<Record<string, true>>({});

  const accounts = useHqStore(orgId, (s) => s.accounts);

  const [addMoreSearch, setAddMoreSearch] = React.useState("");
  const [addMoreFrom, setAddMoreFrom] = React.useState<string>("");
  const [addMoreTo, setAddMoreTo] = React.useState<string>("");
  const [addMoreAccountId, setAddMoreAccountId] = React.useState<string>("all");
  const [addMoreType, setAddMoreType] = React.useState<"all" | HqPaymentType>("all");

  React.useEffect(() => {
    if (!isOpen || !txn) return;

    setCategoryId((txn.categoryId && txn.categoryId !== "OTHER" ? txn.categoryId : "OTHER") as HqCategoryId | "OTHER");
    const nextPaymentType = (txn.paymentType || (txn.type === "recurring" ? "unknown" : txn.type) || "unknown") as HqPaymentType;
    setPaymentType(nextPaymentType);
    setIsRecurring(Boolean(txn.isRecurring));
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
        const tPaymentType = (t.paymentType || (t.type === "recurring" ? "unknown" : t.type) || "unknown") as HqPaymentType;
        if (addMoreType !== "all" && tPaymentType !== addMoreType) continue;
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
    const nextPaymentType = String(paymentType || "unknown");

    const selected = similar.map((t) => t.dedupeHash).filter((dh) => Boolean(dh) && Boolean(selectedSimilar[String(dh)]));
    const dedupeHashes = [txn.dedupeHash, ...selected].filter(Boolean);
    const unique = Array.from(new Set(dedupeHashes)).slice(0, 60);

    setIsWorking(true);
    try {
      const res = await applyHqTransactionsBulk(orgId, {
        dedupeHashes: unique,
        categoryId: nextCategoryId,
        paymentType: nextPaymentType,
        // Keep legacy field name sent as well for any older server path.
        type: nextPaymentType,
        isRecurring,
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
      // Broadcast update to other org members via WebSocket
      sendHqUpdated(ws, orgId, "transaction");
      onSaved?.();
      onRequestClose();
    } catch (err) {
      console.error(err);
      toast.error("Could not apply changes.");
    } finally {
      setIsWorking(false);
    }
  }, [categoryId, isRecurring, onRequestClose, onSaved, orgId, paymentType, selectedSimilar, similar, txn, ws]);

  const title = txn ? txnTitle(txn) : "Transaction";
  const accountLabel = txn?.accountId
    ? (accounts.find((a) => a.accountId === txn.accountId)?.name ??
        accounts.find((a) => a.accountId === txn.accountId)?.accountName ??
        txn.accountId)
    : "Account";
  const flowDirection = txn ? (txn.amount < 0 ? "Flow Out" : "Flow In") : "";
  const selectedCount = Object.keys(selectedSimilar).length;
  const applyButtonLabel =
    selectedCount > 0
      ? `Apply to 1 + ${selectedCount} selected`
      : "Apply to 1 transaction";

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
        </div>
        <button type="button" className={styles.closeButton} onClick={onRequestClose} aria-label="Close">
          ×
        </button>
      </div>

      {txn ? (
        <div className={styles.body}>
          {/* Selected transaction summary card */}
          <div className={styles.sectionHeader}>Selected transaction</div>
          <div className={styles.selectedCard}>
            <div className={styles.selectedCardMain}>
              <div className={styles.selectedMerchant}>{title}</div>
              <div className={styles.selectedMeta}>
                <span>{formatDate(txn.postedAt)}</span>
                <span>•</span>
                <span>{accountLabel}</span>
                <span>•</span>
                <span>{flowDirection}</span>
              </div>
            </div>
            <div className={styles.selectedAmount}>
              {txn.amount < 0 ? "-" : "+"}
              {currency.format(Math.abs(txn.amount))}
            </div>
          </div>

          {/* Edits section */}
          <div className={styles.sectionDivider}>
            <div className={styles.sectionHeader}>Edits</div>
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
              <div className={styles.controlLabel}>Payment type</div>
              <HqSelect
                className={styles.select}
                value={paymentType}
                disabled={isWorking}
                onValueChange={(v) => setPaymentType(v as HqPaymentType)}
                ariaLabel="Select payment type"
                options={PAYMENT_TYPE_OPTIONS}
              />
            </div>

            <div className={styles.control} style={{ gridColumn: "1 / -1" }}>
              <div className={styles.controlLabel}>Recurring commitment</div>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  disabled={isWorking}
                  aria-label="Mark as recurring commitment"
                />
                <span style={{ opacity: 0.9 }}>Counts toward burn/runway</span>
                {txn?.recurringCandidate && !txn?.isRecurring ? (
                  <span style={{ opacity: 0.7, fontSize: 12 }}>(Suggested)</span>
                ) : null}
              </label>
            </div>
          </div>

          {/* Similar transactions section */}
          <div className={styles.sectionDivider}>
            <div className={styles.similarHeader}>
              <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>Similar transactions</div>
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
          </div>

          {showAddMore ? (
            <div className={styles.findSimilar}>
              <div className={styles.findSimilarTitle}>Find similar</div>
              <div className={styles.findSimilarFields}>
                <input
                  className={styles.findSimilarField}
                  type="search"
                  placeholder="Search vendor / memo"
                  value={addMoreSearch}
                  onChange={(e) => setAddMoreSearch(e.target.value)}
                  aria-label="Search candidates"
                  disabled={isWorking}
                />
                <input
                  className={styles.findSimilarField}
                  type="date"
                  value={addMoreFrom}
                  onChange={(e) => setAddMoreFrom(e.target.value)}
                  aria-label="Candidate start date"
                  disabled={isWorking}
                />
                <input
                  className={styles.findSimilarField}
                  type="date"
                  value={addMoreTo}
                  onChange={(e) => setAddMoreTo(e.target.value)}
                  aria-label="Candidate end date"
                  disabled={isWorking}
                />
                <HqSelect
                  className={styles.findSimilarField}
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
                  className={styles.findSimilarField}
                  value={addMoreType}
                  onValueChange={(v) => setAddMoreType(v as "all" | HqPaymentType)}
                  ariaLabel="Filter candidates by payment type"
                  disabled={isWorking}
                  options={[
                    { value: "all", label: "All types" },
                    ...PAYMENT_TYPE_OPTIONS,
                  ]}
                />
                <button type="button" className={styles.searchButton} onClick={() => void handleAddMore()} disabled={isWorking || !txn}>
                  Search
                </button>
              </div>
            </div>
          ) : null}

          {similarUnavailable ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateText}>Similar transactions unavailable</div>
              <div className={styles.emptyStateHint}>No vendor key found for matching. Use "Find similar" to search manually.</div>
            </div>
          ) : similar.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateText}>No similar transactions found</div>
              <div className={styles.emptyStateHint}>Try widening the date range or removing filters above.</div>
            </div>
          ) : (
            <div className={styles.similarList} role="region" aria-label="Similar transactions">
              {similar.map((t) => {
                const matchReason = txn ? getMatchReason(txn, t) : null;
                return (
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
                      <span>{formatDate(t.postedAt)}</span>
                      <span>·</span>
                      <span>{HQ_CATEGORY_LABEL[(t.categoryId || "OTHER") as HqCategoryId]}</span>
                      <span>·</span>
                      <span>{String(t.paymentType || (t.type === "recurring" ? "unknown" : t.type) || "unknown")}</span>
                      {t.isRecurring ? (
                        <>
                          <span>·</span>
                          <span>Recurring</span>
                        </>
                      ) : t.recurringCandidate ? (
                        <>
                          <span>·</span>
                          <span>Suggested</span>
                        </>
                      ) : null}
                    </div>
                    {matchReason ? (
                      <div className={styles.matchReason}>{matchReason}</div>
                    ) : null}
                  </div>
                  <div className={styles.similarAmt}>
                    {t.amount < 0 ? "-" : "+"}
                    {currency.format(Math.abs(t.amount))}
                  </div>
                </div>
              );})}
            </div>
          )}
        </div>
      ) : null}

      <div className={styles.footer}>
        {selectedCount > 0 ? (
          <div className={styles.applyHint}>
            These edits will update 1 + {selectedCount} transactions
          </div>
        ) : null}
        <button type="button" className={styles.secondaryButton} onClick={onRequestClose} disabled={isWorking}>
          Cancel
        </button>
        <button type="button" className={styles.primaryButton} onClick={() => void handleApply()} disabled={isWorking || !txn}>
          {applyButtonLabel}
        </button>
      </div>
    </Modal>
  );
};

export default TxnModalApply;
