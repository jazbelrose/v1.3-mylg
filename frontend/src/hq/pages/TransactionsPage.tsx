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
import { todayPacificIsoDate } from "@/hq/lib/hqDate";
import type { HqCategoryId, HqPaymentType, HqTransaction } from "@/hq/types";
import styles from "./TransactionsPage.module.css";
import HqSelect from "@/hq/components/HqSelect";
import TxnModalApply from "@/hq/components/TxnModalApply";
import HqCategoryPicker from "@/hq/components/HqCategoryPicker";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function typeIcon(type: HqPaymentType): React.ReactNode {
  switch (type) {
    case "card_purchase":
      return <CreditCard size={16} />;
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

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [yyyy, mm, dd] = String(isoDate || "").split("-");
  const year = Number(yyyy);
  const monthIndex = Number(mm) - 1;
  const day = Number(dd);
  const base = new Date(Date.UTC(year, monthIndex, day));
  if (!Number.isFinite(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function effectivePaymentType(txn: HqTransaction): HqPaymentType {
  const paymentType = txn.paymentType;
  if (paymentType) return paymentType;
  const legacy = String(txn.type || "unknown").trim();
  // Legacy stored `type: "recurring"` should not be treated as a payment type.
  if (legacy === "recurring") return "unknown";
  return legacy as HqPaymentType;
}
type DateRangePreset = "all" | "7d" | "30d" | "90d" | "month" | "ytd";

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
  const [paymentType, setPaymentType] = React.useState<"all" | HqPaymentType>("all");
  const [recurringOnly, setRecurringOnly] = React.useState(false);
  const [categoryId, setCategoryId] = React.useState<"all" | HqCategoryId | "UNCATEGORIZED">("all");
  const [dateRange, setDateRange] = React.useState<DateRangePreset>("all");
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
    const q = params.get("q");
    const type = params.get("type");
    if (typeof q === "string" && q.length) setSearchTerm(q);

    const allowedPaymentTypes: Array<HqPaymentType> = [
      "card_purchase",
      "transfer",
      "zelle",
      "wire",
      "deposit",
      "fee",
      "unknown",
    ];
    if (type && type !== "all" && allowedPaymentTypes.includes(type as HqPaymentType)) {
      setPaymentType(type as HqPaymentType);
    }

    // Backward-compat for old links.
    setRecurringOnly(filter === "recurring");

    if (filter === "uncategorized") {
      setCategoryId("UNCATEGORIZED");
    }

  }, [location.search]);

  React.useEffect(() => {
    const today = todayPacificIsoDate();
    if (dateRange === "all") {
      setStartDate("");
      setEndDate("");
      return;
    }

    if (dateRange === "7d") {
      setStartDate(addDaysIso(today, -6));
      setEndDate(today);
      return;
    }

    if (dateRange === "30d") {
      setStartDate(addDaysIso(today, -29));
      setEndDate(today);
      return;
    }

    if (dateRange === "90d") {
      setStartDate(addDaysIso(today, -89));
      setEndDate(today);
      return;
    }

    if (dateRange === "month") {
      setStartDate(`${today.slice(0, 7)}-01`);
      setEndDate(today);
      return;
    }

    // YTD
    setStartDate(`${today.slice(0, 4)}-01-01`);
    setEndDate(today);
  }, [dateRange]);

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

      if (recurringOnly && txn.isRecurring !== true) return false;

      const effectiveType = effectivePaymentType(txn);
      if (paymentType !== "all" && effectiveType !== paymentType) return false;

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
  }, [accountId, categoryId, direction, endDate, paymentType, recurringOnly, searchTerm, startDate, transactions]);

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
      actions={actions}
    >
      <div className={styles.page}>
        <div className={styles.transactionsShell}>
          <div className={styles.stickyStack}>
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
                { value: "all", label: "Flow: In + Out" },
                { value: "out", label: "Flow: Out" },
                { value: "in", label: "Flow: In" },
              ]}
            />

            <HqSelect
              className={styles.filterField}
              value={paymentType}
              onValueChange={(v) => setPaymentType(v as "all" | HqPaymentType)}
              ariaLabel="Filter by payment type"
              options={[
                { value: "all", label: "All payment types" },
                { value: "card_purchase", label: "Card purchase" },
                { value: "transfer", label: "Transfer" },
                { value: "zelle", label: "Zelle" },
                { value: "wire", label: "Wire" },
                { value: "deposit", label: "Deposit" },
                { value: "fee", label: "Fee" },
                { value: "unknown", label: "Unknown" },
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

            <HqSelect
              className={styles.filterField}
              value={dateRange}
              onValueChange={(v) => setDateRange(v as DateRangePreset)}
              ariaLabel="Filter by date range"
              options={[
                { value: "all", label: "Date: All time" },
                { value: "7d", label: "Date: Last 7d" },
                { value: "30d", label: "Date: Last 30d" },
                { value: "90d", label: "Date: Last 90d" },
                { value: "month", label: "Date: This month" },
                { value: "ytd", label: "Date: YTD" },
              ]}
            />

            <button
              type="button"
              className={styles.recurringToggle}
              aria-label="Show only recurring commitments (you marked)."
              title="Show only recurring commitments (you marked)."
              aria-pressed={recurringOnly}
              data-active={recurringOnly ? "true" : "false"}
              onClick={() => setRecurringOnly((prev) => !prev)}
            >
              <Repeat size={18} aria-hidden="true" />
            </button>
          </div>

          {filtered.length ? (
            <div className={styles.tableHeader} aria-hidden>
              <div>Txn</div>
              <div>Category</div>
              <div className={styles.amountCol}>Amount</div>
            </div>
          ) : null}
          </div>

            {filtered.length === 0 ? (
            <div className={styles.emptyState} role="status">
              No transactions for this filter. Import a CSV or adjust your search.
            </div>
          ) : (
            <div className={styles.table} role="region" aria-label="Transactions table">
            {filtered.map((txn) => {
              const accountLabel = accountsById.get(txn.accountId) || "Account";
              const currentCategoryId: HqCategoryId = (txn.categoryId || "OTHER") as HqCategoryId;
              const directionClass = txn.amount < 0 ? styles.out : styles.in;
              const iconType = effectivePaymentType(txn);
              return (
                <div
                  key={txn.dedupeHash}
                  className={[styles.row, canAdmin ? styles.rowClickable : ""].filter(Boolean).join(" ")}
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
                      {typeIcon(iconType)}
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
