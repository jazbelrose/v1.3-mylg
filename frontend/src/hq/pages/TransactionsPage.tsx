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
import { HQ_CATEGORIES, HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import { setTransactionCategory, useHqStore } from "@/hq/lib/hqStore";
import { useUser } from "@/app/contexts/useUser";
import { isOrgAdmin, useOrg } from "@/app/contexts/useOrg";
import { useHqBootstrap } from "@/hq/lib/useHqBootstrap";
import type { HqCategoryId, HqTransaction, HqTransactionType } from "@/hq/types";
import styles from "./TransactionsPage.module.css";

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
  const orgId = activeOrgId || "local";
  const canAdmin = isOrgAdmin(activeOrgRole);
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

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const filter = params.get("filter");
    if (filter === "uncategorized") {
      setCategoryId("UNCATEGORIZED");
    }
  }, [location.search]);

  const accountsById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.accountId, a.accountName);
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
          <button type="button" className={styles.primaryButton} onClick={() => setIsImportOpen(true)}>
            Import CSV
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setIsAddAccountOpen(true)}>
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
          <select
            className={styles.filterField}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="Filter by account"
          >
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.accountName}
              </option>
            ))}
          </select>
          <select
            className={styles.filterField}
            value={direction}
            onChange={(e) => setDirection(e.target.value as "all" | "in" | "out")}
            aria-label="Filter by direction"
          >
            <option value="all">In + Out</option>
            <option value="out">Outflow</option>
            <option value="in">Inflow</option>
          </select>
          <select
            className={styles.filterField}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value as "all" | HqCategoryId | "UNCATEGORIZED")}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            <option value="UNCATEGORIZED">Uncategorized</option>
            {HQ_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
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
              const currentCategory = txn.categoryId || "OTHER";
              const categoryValue = currentCategory === "OTHER" ? "" : currentCategory;
              const directionClass = txn.amount < 0 ? styles.out : styles.in;
              return (
                <div key={txn.dedupeHash} className={styles.row}>
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
                    <select
                      className={styles.categorySelect}
                      value={categoryValue}
                      disabled={!canAdmin}
                      onChange={(e) =>
                        setTransactionCategory(orgId, txn.dedupeHash, (e.target.value as HqCategoryId) || undefined)
                      }
                      aria-label={`Set category for ${txnTitle(txn)}`}
                    >
                      <option value="">{HQ_CATEGORY_LABEL.OTHER}</option>
                      {HQ_CATEGORIES.filter((c) => c.id !== "OTHER").map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
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

      <ImportCsvModal orgId={orgId} isOpen={isImportOpen} onRequestClose={() => setIsImportOpen(false)} />
      <AddAccountModal orgId={orgId} isOpen={isAddAccountOpen} onRequestClose={() => setIsAddAccountOpen(false)} />
    </HQLayout>
  );
};

export default TransactionsPage;
