import React from "react";
import { Link } from "react-router-dom";
import HQLayout from "../components/HQLayout";
import HQCard from "../components/HQCard";
import AddAccountModal from "@/hq/components/AddAccountModal";
import ImportCsvModal from "@/hq/components/ImportCsvModal";
import { useUser } from "@/app/contexts/useUser";
import { isOrgAdmin, useOrg } from "@/app/contexts/useOrg";
import { HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import { useHqStore } from "@/hq/lib/hqStore";
import { useHqBootstrap } from "@/hq/lib/useHqBootstrap";
import {
  computeCashOnHand,
  computeMonthlyFlow,
  computeTopCategories,
  computeTrailingBurn,
  getRange,
  inRange,
  type HqRangeId,
} from "@/hq/lib/hqMetrics";
import type { HqAlert } from "@/hq/types";
import styles from "./HQOverview.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const preciseCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const runwayFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const quickFilters: Array<{ id: HqRangeId; label: string }> = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "Quarter" },
  { id: "ytd", label: "Year-to-date" },
];

const HQOverview: React.FC = () => {
  useUser();
  const { activeOrgId, activeOrgRole } = useOrg();
  const hasOrg = Boolean(activeOrgId);
  const orgId = activeOrgId ?? "__no_org__";
  const canAdmin = hasOrg && isOrgAdmin(activeOrgRole);

  useHqBootstrap(activeOrgId);

  const [selectedRange, setSelectedRange] = React.useState<HqRangeId>("ytd");
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = React.useState(false);

  const openImport = React.useCallback(() => {
    if (!canAdmin) return;
    setIsImportOpen(true);
  }, [canAdmin]);

  const openAddAccount = React.useCallback(() => {
    if (!canAdmin) return;
    setIsAddAccountOpen(true);
  }, [canAdmin]);

  const accounts = useHqStore(orgId, (s) => s.accounts);
  const transactions = useHqStore(orgId, (s) => s.transactions);
  const importRuns = useHqStore(orgId, (s) => s.importRuns);

  const { start, end } = getRange(selectedRange);

  const totals = React.useMemo(() => {
    const cashOnHand = computeCashOnHand(accounts, transactions);
    const avgMonthlyBurn = computeTrailingBurn(transactions, 3);
    const runwayMonths =
      cashOnHand !== null && avgMonthlyBurn !== null && avgMonthlyBurn > 0
        ? cashOnHand / avgMonthlyBurn
        : null;

    const rangeTxns = transactions.filter(
      (t) => inRange(t.postedAt, start, end) && !t.isInternalTransfer
    );
    const cashIn = rangeTxns.filter((t) => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
    const cashOut = rangeTxns.filter((t) => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const net = cashIn - cashOut;
    const uncategorizedCount = rangeTxns.filter((t) => !t.categoryId || t.categoryId === "OTHER").length;

    return { cashOnHand, avgMonthlyBurn, runwayMonths, net, uncategorizedCount };
  }, [accounts, end, start, transactions]);

  const actions = (
    <div className={styles.actions}>
      {canAdmin ? (
        <>
          <button type="button" className={styles.primaryButton} onClick={openImport}>
            Import CSV
          </button>
          <button type="button" className={styles.secondaryButton} onClick={openAddAccount}>
            Add account
          </button>
        </>
      ) : null}
    </div>
  );

  const lastSyncedAt = importRuns[0]?.createdAt;
  const rangeLabel = quickFilters.find((f) => f.id === selectedRange)?.label ?? "Year-to-date";
  const monthlyFlow = React.useMemo(() => computeMonthlyFlow(transactions, start, end), [end, start, transactions]);
  const maxFlow = Math.max(1, ...monthlyFlow.flatMap((row) => [row.inflow, row.outflow]));
  const topCategories = React.useMemo(() => computeTopCategories(transactions, start, end), [end, start, transactions]);
  const latestTransactions = React.useMemo(() => transactions.slice(0, 20), [transactions]);

  const alerts: HqAlert[] = React.useMemo(() => {
    const items: HqAlert[] = [];
    if (totals.runwayMonths !== null && totals.runwayMonths < 2) {
      items.push({
        id: "low-runway",
        severity: "warning",
        message: "Runway is below 2 months. Consider tightening burn or replenishing cash.",
      });
    }
    if (totals.uncategorizedCount > 0) {
      items.push({
        id: "uncategorized",
        severity: "info",
        message: `${totals.uncategorizedCount} transactions need categorization in this range.`,
      });
    }
    if (accounts.length === 0) {
      items.push({
        id: "no-accounts",
        severity: "critical",
        message: "Add an account to start importing transactions.",
      });
    } else if (accounts.every((a) => !a.anchorDate || typeof a.anchorBalance !== "number")) {
      items.push({
        id: "no-anchor",
        severity: "warning",
        message: "Set a balance anchor to unlock Cash on Hand + accurate runway.",
      });
    }
    return items.slice(0, 4);
  }, [accounts, totals.runwayMonths, totals.uncategorizedCount]);

  return (
    <HQLayout
      title="HQ · Financial"
      description="Accounts, ledger, burn, runway, and anomalies at a glance."
      actions={actions}
    >
      <div className={styles.page}>
        <section className={styles.hero} aria-label="Financial HQ hero">
          <div className={styles.heroTopRow}>
            <div className={styles.heroTitleBlock}>
              <div className={styles.heroTitle}>Financial HQ</div>
              <div className={styles.heroSubtitle}>
                Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "—"} ·{" "}
                {accounts.length} accounts · {transactions.length} transactions
              </div>
            </div>
            <div className={styles.heroFilters} aria-label="Quick range filters">
              {quickFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={[styles.filterChip, selectedRange === filter.id ? styles.filterChipActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedRange(filter.id)}
                  aria-pressed={selectedRange === filter.id}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.kpiRow}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Cash on hand</div>
              <div className={styles.kpiValue}>
                {totals.cashOnHand === null ? "—" : currency.format(totals.cashOnHand)}
              </div>
              <div className={styles.kpiHint}>
                {accounts.some((a) => a.anchorDate && typeof a.anchorBalance === "number")
                  ? "Anchored balances + net flow"
                  : "Set an anchor to enable"}
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Burn (avg / mo)</div>
              <div className={styles.kpiValue}>
                {totals.avgMonthlyBurn === null ? "—" : currency.format(totals.avgMonthlyBurn)}
              </div>
              <div className={styles.kpiHint}>Trailing 3 months, excludes transfers</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Runway</div>
              <div className={styles.kpiValue}>
                {totals.runwayMonths === null
                  ? "—"
                  : totals.avgMonthlyBurn === 0
                    ? "Stable"
                    : `${runwayFormatter.format(totals.runwayMonths)} mo`}
              </div>
              <div className={styles.kpiHint}>Cash / burn</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Net ({rangeLabel})</div>
              <div className={[styles.kpiValue, totals.net < 0 ? styles.kpiOut : styles.kpiIn].join(" ")}>
                {preciseCurrency.format(totals.net)}
              </div>
              <div className={styles.kpiHint}>Excludes internal transfers</div>
            </div>
          </div>
        </section>

        <div className={styles.gridRow}>
          <HQCard
            title="Cash in vs cash out"
            subtitle={`Range: ${rangeLabel}`}
            badge={
              <Link className={styles.cardLink} to="/dashboard/hq/transactions">
                View all
              </Link>
            }
            aria-label="Monthly cash inflow versus outflow chart"
          >
            {monthlyFlow.length === 0 ? (
              <div className={styles.emptyState}>Import a CSV to see cashflow.</div>
            ) : (
              <div className={styles.chartBars} role="img" aria-label="Monthly cash flow">
                {monthlyFlow.map((row) => {
                  const inflowPercent = Math.round((row.inflow / maxFlow) * 100);
                  const outflowPercent = Math.round((row.outflow / maxFlow) * 100);
                  return (
                    <div key={row.key} className={styles.chartBarRow}>
                      <div className={styles.chartBar} aria-hidden>
                        <div
                          className={styles.chartBarFill}
                          style={{ width: `${inflowPercent}%` }}
                          title={`${row.month} inflow ${preciseCurrency.format(row.inflow)}`}
                        />
                      </div>
                      <span className={styles.chartMonth}>{row.month}</span>
                      <div className={styles.chartBar} aria-hidden>
                        <div
                          className={`${styles.chartBarFill} ${styles.chartBarFillMuted}`}
                          style={{ width: `${outflowPercent}%` }}
                          title={`${row.month} outflow ${preciseCurrency.format(row.outflow)}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </HQCard>

          <HQCard title="Top categories" subtitle={rangeLabel} aria-label="Top spend categories">
            {topCategories.length === 0 ? (
              <div className={styles.emptyState}>No spend yet.</div>
            ) : (
              <ul className={styles.list}>
                {topCategories.map((entry) => (
                  <li key={entry.categoryId} className={styles.listItem}>
                    <span>{HQ_CATEGORY_LABEL[entry.categoryId]}</span>
                    <span>{currency.format(entry.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </HQCard>

          <HQCard title="Recurring commitments" subtitle="Candidates" aria-label="Recurring vendor commitments">
            <div className={styles.inlineNote}>
              v1 shows candidates after you’ve imported enough history.
            </div>
          </HQCard>
        </div>

        <div className={styles.gridRow}>
          <HQCard title="Alerts" aria-label="Financial alerts">
            {alerts.length === 0 ? (
              <div className={styles.emptyState}>All clear.</div>
            ) : (
              <ul className={styles.alertsList}>
                {alerts.map((alert) => (
                  <li key={alert.id} className={styles.alertItem}>
                    <span className={styles.alertBadge}>{alert.severity}</span>
                    <span>{alert.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </HQCard>

          <HQCard title="Uncategorized" subtitle={rangeLabel} aria-label="Uncategorized transactions">
            {totals.uncategorizedCount === 0 ? (
              <div className={styles.emptyState}>Nothing to triage.</div>
            ) : (
              <div className={styles.queue}>
                <div className={styles.queueMetric}>{totals.uncategorizedCount}</div>
                <Link className={styles.primaryLink} to="/dashboard/hq/transactions?filter=uncategorized">
                  Review now
                </Link>
              </div>
            )}
          </HQCard>

          <HQCard title="Accounts" aria-label="Accounts breakdown">
            {accounts.length === 0 ? (
              <div className={styles.emptyState}>
                Add an account to start.{" "}
                {canAdmin ? (
                  <button type="button" className={styles.inlineButton} onClick={openAddAccount}>
                  Add account
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className={styles.list}>
                {accounts.slice(0, 5).map((acct) => (
                  <li key={acct.accountId} className={styles.listItem}>
                    <span className={styles.accountName}>{acct.accountName}</span>
                    <Link className={styles.cardLink} to="/dashboard/hq/accounts">
                      {acct.anchorDate && typeof acct.anchorBalance === "number" ? "Anchored" : "Set anchor"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </HQCard>
        </div>

        <HQCard
          title="Latest transactions"
          subtitle="Preview"
          badge={
            <Link className={styles.cardLink} to="/dashboard/hq/transactions">
              View all
            </Link>
          }
          aria-label="Transactions preview"
        >
          {latestTransactions.length === 0 ? (
            <div className={styles.emptyState}>Import a CSV to populate your ledger.</div>
          ) : (
            <div className={styles.txnPreview}>
              {latestTransactions.map((txn) => (
                <div key={txn.dedupeHash} className={styles.txnRow}>
                  <div className={styles.txnMain}>
                    <div className={styles.txnVendor}>{txn.vendor || txn.counterparty || txn.rawDescription}</div>
                    <div className={styles.txnMeta}>
                      <span>{txn.postedAt}</span>
                      {txn.categoryId ? <span>· {HQ_CATEGORY_LABEL[txn.categoryId]}</span> : null}
                    </div>
                  </div>
                  <div className={[styles.txnAmount, txn.direction === "out" ? styles.out : styles.in].join(" ")}>
                    {txn.direction === "out" ? "-" : "+"}
                    {preciseCurrency.format(Math.abs(txn.amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </HQCard>
      </div>

      {activeOrgId ? (
        <>
          <ImportCsvModal orgId={activeOrgId} isOpen={isImportOpen} onRequestClose={() => setIsImportOpen(false)} />
          <AddAccountModal
            orgId={activeOrgId}
            isOpen={isAddAccountOpen}
            onRequestClose={() => setIsAddAccountOpen(false)}
          />
        </>
      ) : null}
    </HQLayout>
  );
};

export default HQOverview;
