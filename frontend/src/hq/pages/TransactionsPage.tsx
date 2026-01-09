import React from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Circle,
  CreditCard,
  Landmark,
  Minus,
  Repeat,
  Zap,
} from "lucide-react";
import HQLayout from "../components/HQLayout";
import AddAccountModal from "@/hq/components/AddAccountModal";
import ImportCsvModal from "@/hq/components/ImportCsvModal";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import { useHqStore } from "@/hq/lib/hqStore";
import { useUser } from "@/app/contexts/useUser";
import { isOrgAdmin, useOrg } from "@/app/contexts/useOrg";
import { useHqBootstrap } from "@/hq/lib/useHqBootstrap";
import type { HqCategoryId, HqTransaction, HqTransactionType } from "@/hq/types";
import styles from "./TransactionsPage.module.css";
import HqSelect from "@/hq/components/HqSelect";
import TxnModalApply from "@/hq/components/TxnModalApply";
import HqCategoryPicker from "@/hq/components/HqCategoryPicker";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function typeIcon(type: HqTransactionType): React.ReactNode {
  switch (type) {
    case "card_purchase":
      return <CreditCard size={16} />;
    case "recurring":
      return <Repeat size={16} />;
    case "transfer":
      return <ArrowLeftRight size={16} />;
    case "zelle":
      return <Zap size={16} />;
    case "wire":
      return <Landmark size={16} />;
    case "deposit":
      return <ArrowDownToLine size={16} />;
    case "fee":
      return <Minus size={16} />;
    default:
      return <Circle size={12} />;
  }
}

function txnTitle(txn: HqTransaction) {
  return txn.vendor || txn.counterparty || txn.rawDescription;
}

const TransactionsPage: React.FC = () => {
  useUser();
  const { activeOrgId, activeOrgRole } = useOrg();
  const hasOrg = Boolean(activeOrgId);
  const orgId = activeOrgId ?? "__no_org__";
  const canAdmin = hasOrg && isOrgAdmin(activeOrgRole);
  useHqBootstrap(activeOrgId);
  const location = useLocation();

  const accounts = useHqStore(orgId, (s) => s.accounts);
  const transactions = useHqStore(orgId, (s) => s.transactions);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [accountId, setAccountId] = React.useState<string>("all");
  const [direction, setDirection] = React.useState<"all" | "in" | "out">("all");
  const [categoryId, setCategoryId] = React.useState<"all" | HqCategoryId | "UNCATEGORIZED">("all");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = React.useState(false);
  const [selectedTxn, setSelectedTxn] = React.useState<HqTransaction | null>(null);
  const [isApplyOpen, setIsApplyOpen] = React.useState(false);

  const openImport = React.useCallback(() => {
    if (!canAdmin) return;
    setIsImportOpen(true);
  }, [canAdmin]);

  const openAddAccount = React.useCallback(() => {
    if (!canAdmin) return;
    setIsAddAccountOpen(true);
  }, [canAdmin]);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const filter = params.get("filter");
    if (filter === "uncategorized") {
      setCategoryId("UNCATEGORIZED");
    }
  }, [location.search]);

  const accountsById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.accountId, a.name ?? a.accountName ?? "Account");
    return map;
  }, [accounts]);

  const filtered = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return transactions.filter((txn) => {
      if (accountId !== "all" && txn.accountId !== accountId) return false;
      if (startDate && txn.postedAt < startDate) return false;
      if (endDate && txn.postedAt > endDate) return false;
      if (direction === "in" && txn.amount < 0) return false;
      if (direction === "out" && txn.amount >= 0) return false;

      if (categoryId === "UNCATEGORIZED") {
        if (txn.categoryId && txn.categoryId !== "OTHER") return false;
      } else if (categoryId !== "all") {
        if ((txn.categoryId || "OTHER") !== categoryId) return false;
      }

      if (!term) return true;
      const haystack = [txnTitle(txn), txn.rawDescription, txn.normalizedDescription]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [accountId, categoryId, direction, endDate, searchTerm, startDate, transactions]);

  const actions = (
    <div className={styles.actions}>
      {canAdmin ? (
        <>
          <button type="button" className={styles.secondaryButton} onClick={openImport}>
            Import CSV
          </button>
          <button type="button" className={styles.primaryButton} onClick={openAddAccount}>
            Add account
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <HQLayout
      title="Transactions"
      description="Your ledger. Search, filter, and categorize — re-importing CSVs safely skips duplicates."
      actions={actions}
    >
      <div className={styles.page}>
        <div className={styles.filters}>
          <input
            className={styles.filterField}
            type="search"
            placeholder="Search vendor / memo"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Search transactions"
          />
          <HqSelect
            className={styles.filterField}
            value={accountId}
            onValueChange={setAccountId}
            ariaLabel="Filter by account"
            options={[
              { value: "all", label: "All accounts" },
              ...accounts.map((a) => ({
                value: a.accountId,
                label: String(a.name ?? a.accountName ?? a.accountId),
              })),
            ]}
          />

          <HqSelect
            className={styles.filterField}
            value={direction}
            onValueChange={(v) => setDirection(v as "all" | "in" | "out")}
            ariaLabel="Filter by direction"
            options={[
              { value: "all", label: "In + Out" },
              { value: "out", label: "Outflow" },
              { value: "in", label: "Inflow" },
            ]}
          />

          <HqCategoryPicker
            orgId={orgId}
            className={styles.filterField}
            value={categoryId}
            onValueChange={(v) => setCategoryId(v as "all" | HqCategoryId | "UNCATEGORIZED")}
            ariaLabel="Filter by category"
            placeholder="All categories"
            staticOptions={[
              { value: "all", label: "All categories" },
              { value: "UNCATEGORIZED", label: "Uncategorized" },
            ]}
          />
          <input
            className={styles.filterField}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date"
          />
          <input
            className={styles.filterField}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="End date"
          />
        </div>

        {filtered.length === 0 ? (
          <div className={styles.emptyState} role="status">
            No transactions for this filter. Import a CSV or adjust your search.
          </div>
        ) : (
          <div className={styles.table} role="region" aria-label="Transactions table">
            <div className={styles.tableHeader}>
              <div>Txn</div>
              <div>Category</div>
              <div className={styles.amountCol}>Amount</div>
            </div>
            {filtered.map((txn) => {
              const accountLabel = accountsById.get(txn.accountId) || "Account";
              const currentCategoryId: HqCategoryId = (txn.categoryId || "OTHER") as HqCategoryId;
              const directionClass = txn.amount < 0 ? styles.out : styles.in;
              return (
                <div
                  key={txn.dedupeHash}
                  className={styles.row}
                  role={canAdmin ? "button" : undefined}
                  tabIndex={canAdmin ? 0 : undefined}
                  onClick={() => {
                    if (!canAdmin) return;
                    setSelectedTxn(txn);
                    setIsApplyOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (!canAdmin) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedTxn(txn);
                      setIsApplyOpen(true);
                    }
                  }}
                >
                  <div className={styles.txnCell}>
                    <div className={styles.icon} aria-hidden>
                      {typeIcon(txn.type)}
                    </div>
                    <div className={styles.txnMain}>
                      <div className={styles.txnTitle}>{txnTitle(txn)}</div>
                      <div className={styles.txnMeta}>
                        <span>{txn.postedAt}</span>
                        <span>·</span>
                        <span>{accountLabel}</span>
                        {txn.cardLast4 ? (
                          <>
                            <span>·</span>
                            <span>Card {txn.cardLast4}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className={styles.categoryCell}>
                    {HQ_CATEGORY_LABEL[currentCategoryId]}
                  </div>

                  <div className={[styles.amountCol, directionClass].join(" ")}>
                    {txn.amount < 0 ? "-" : "+"}
                    {currency.format(Math.abs(txn.amount))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeOrgId ? (
        <>
          <ImportCsvModal orgId={activeOrgId} isOpen={isImportOpen} onRequestClose={() => setIsImportOpen(false)} />
          <AddAccountModal
            orgId={activeOrgId}
            isOpen={isAddAccountOpen}
            onRequestClose={() => setIsAddAccountOpen(false)}
          />
          <TxnModalApply
            orgId={activeOrgId}
            isOpen={isApplyOpen}
            txn={selectedTxn}
            from={startDate || undefined}
            to={endDate || undefined}
            onRequestClose={() => {
              setIsApplyOpen(false);
              setSelectedTxn(null);
            }}
          />
        </>
      ) : null}
    </HQLayout>
  );
};

export default TransactionsPage;
