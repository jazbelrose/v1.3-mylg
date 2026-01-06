import React from "react";
import { Link } from "react-router-dom";
import HQLayout from "../components/HQLayout";
import HQCard from "../components/HQCard";
import CategorizationSpellbookSheet from "@/hq/components/CategorizationSpellbookSheet";
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
import { fetchHqChartSeries, type HqChartSeriesRange, type HqChartSeriesResponse } from "@/hq/lib/hqApi";
import type { HqAccount, HqAlert, HqTransaction } from "@/hq/types";
import { todayPacificIsoDate } from "@/hq/lib/hqDate";
import HeroCashChart, { type DailyPoint, type VisibleHeroCashSeries } from "@/hq/components/HeroCashChart";
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

function filterIsoDatesForRange(points: HqChartSeriesResponse["points"], range: HqChartSeriesRange): HqChartSeriesResponse["points"] {
  if (range === "ALL") return points;
  const fixedDays = range === "1W" ? 7 : range === "1M" ? 30 : range === "3M" ? 90 : range === "1Y" ? 365 : null;
  if (!fixedDays) return points;
  const anchor = points.length ? points[points.length - 1].date : todayPacificIsoDate();
  const start = addDaysIso(anchor, -(fixedDays - 1));
  return points.filter((p) => p.date >= start);
}

const quickFilters: Array<{ id: HqRangeId; label: string }> = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "Quarter" },
  { id: "ytd", label: "Year-to-date" },
];

const chartRanges: Array<{ id: HqChartSeriesRange; label: string }> = [
  { id: "1W", label: "1W" },
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "1Y", label: "1Y" },
  { id: "ALL", label: "ALL" },
];

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildLocalChartSeries(input: {
  range: HqChartSeriesRange;
  anchorBalance: number;
  accounts: HqAccount[];
  transactions: HqTransaction[];
}): HqChartSeriesResponse {
  const today = todayPacificIsoDate();
  const fixedDays =
    input.range === "1W" ? 7 : input.range === "1M" ? 30 : input.range === "3M" ? 90 : input.range === "1Y" ? 365 : null;

  const includedAccountIds = new Set(
    input.accounts
      .filter((a) => !a.archivedAt && a.includeInCashOnHand !== false)
      .map((a) => a.accountId)
  );

  let start = fixedDays ? addDaysIso(today, -(fixedDays - 1)) : today;
  if (!fixedDays) {
    // ALL: best-effort using whatever the client cache has.
    const dates = input.transactions
      .filter((t) => includedAccountIds.has(t.accountId) && !t.isInternalTransfer)
      .map((t) => String(t.postedAt || "").slice(0, 10))
      .filter(Boolean);
    dates.sort();
    start = dates[0] || today;
  }

  const inflowByDate = new Map<string, number>();
  const outflowByDate = new Map<string, number>();

  for (const t of input.transactions) {
    if (!includedAccountIds.has(t.accountId)) continue;
    if (t.isInternalTransfer) continue;
    const date = String(t.postedAt || "").slice(0, 10);
    if (!date || date < start || date > today) continue;
    const amt = typeof t.amount === "number" ? t.amount : Number(t.amount);
    if (!Number.isFinite(amt) || amt === 0) continue;
    if (amt > 0) inflowByDate.set(date, (inflowByDate.get(date) ?? 0) + amt);
    else outflowByDate.set(date, (outflowByDate.get(date) ?? 0) + Math.abs(amt));
  }

  const points: HqChartSeriesResponse["points"] = [];
  for (let d = start; d <= today; d = addDaysIso(d, 1)) {
    const inflow = Math.round(((inflowByDate.get(d) ?? 0) * 100)) / 100;
    const outflow = Math.round(((outflowByDate.get(d) ?? 0) * 100)) / 100;
    points.push({ date: d, inflow, outflow, balance: 0 });
  }

  if (points.length) {
    points[points.length - 1].balance = Math.round(input.anchorBalance * 100) / 100;
    for (let i = points.length - 2; i >= 0; i -= 1) {
      const next = points[i + 1];
      const netNext = next.inflow - next.outflow;
      points[i].balance = Math.round((next.balance - netNext) * 100) / 100;
    }
  }

  const totals = points.reduce(
    (acc, p) => {
      acc.inflow += p.inflow;
      acc.outflow += p.outflow;
      return acc;
    },
    { inflow: 0, outflow: 0 }
  );
  totals.inflow = Math.round(totals.inflow * 100) / 100;
  totals.outflow = Math.round(totals.outflow * 100) / 100;
  const net = Math.round((totals.inflow - totals.outflow) * 100) / 100;

  return {
    scope: "aggregate",
    range: input.range,
    currency: "USD",
    anchorDate: today,
    anchorBalance: Math.round(input.anchorBalance * 100) / 100,
    points,
    totals: { inflow: totals.inflow, outflow: totals.outflow, net },
  };
}

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
  const [spellbook, setSpellbook] = React.useState<{ isOpen: boolean; importRunId?: string }>({ isOpen: false });

  const [chartRange, setChartRange] = React.useState<HqChartSeriesRange>("1Y");
  const [chartCollapsed, setChartCollapsed] = React.useState(false);
  const [showBalance, setShowBalance] = React.useState(true);
  const [showInflow, setShowInflow] = React.useState(false);
  const [showOutflow, setShowOutflow] = React.useState(false);
  const [chart, setChart] = React.useState<HqChartSeriesResponse | null>(null);
  const [chartError, setChartError] = React.useState<string | null>(null);
  const [chartLoading, setChartLoading] = React.useState(false);

  const openImport = React.useCallback(() => {
    if (!canAdmin) return;
    setSpellbook({ isOpen: false });
    setIsImportOpen(true);
  }, [canAdmin]);

  const openAddAccount = React.useCallback(() => {
    if (!canAdmin) return;
    setSpellbook({ isOpen: false });
    setIsAddAccountOpen(true);
  }, [canAdmin]);

  const openSpellbook = React.useCallback(
    (input: { importRunId?: string }) => {
      setIsImportOpen(false);
      setIsAddAccountOpen(false);
      setSpellbook({ isOpen: true, importRunId: input.importRunId });
    },
    []
  );

  const accounts = useHqStore(orgId, (s) => s.accounts);
  const transactions = useHqStore(orgId, (s) => s.transactions);
  const importRuns = useHqStore(orgId, (s) => s.importRuns);
  const cashOnHandAggregate = useHqStore(orgId, (s) => s.cashOnHandAggregate ?? null);
  const missingAnchorAccountIds = useHqStore(orgId, (s) => s.missingAnchorAccountIds ?? []);

  const anchorBalanceForChart = React.useMemo(() => {
    return typeof cashOnHandAggregate === "number"
      ? cashOnHandAggregate
      : computeCashOnHand(accounts, transactions);
  }, [accounts, cashOnHandAggregate, transactions]);

  React.useEffect(() => {
    if (!activeOrgId) {
      setChart(null);
      setChartError(null);
      setChartLoading(false);
      return;
    }

    let cancelled = false;
    setChartLoading(true);
    setChartError(null);

    const fetchRange: HqChartSeriesRange = "ALL";
    fetchHqChartSeries({ orgId: activeOrgId, scope: "aggregate", range: fetchRange })
      .then((res) => {
        if (cancelled) return;
        setChart(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not load chart.";

        // Common during dev: backend not redeployed yet -> endpoint returns 404.
        // Fall back to local cache so HQ stays usable.
        if (String(msg).includes("404") && anchorBalanceForChart !== null) {
          setChart(
            buildLocalChartSeries({
              range: fetchRange,
              anchorBalance: anchorBalanceForChart,
              accounts,
              transactions,
            })
          );
          setChartError(null);
          return;
        }

        setChart(null);
        setChartError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setChartLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, accounts, anchorBalanceForChart, transactions]);

  const chartPointsInRange = React.useMemo(() => {
    if (!chart) return null;
    return filterIsoDatesForRange(chart.points, chartRange);
  }, [chart, chartRange]);

  const heroCashSeries = React.useMemo(() => {
    if (!chartPointsInRange) return null;

    const balance: DailyPoint[] = chartPointsInRange.map((p) => ({ time: p.date, value: p.balance }));
    const inflow: DailyPoint[] = chartPointsInRange.map((p) => ({ time: p.date, value: p.inflow }));
    const outflow: DailyPoint[] = chartPointsInRange.map((p) => ({ time: p.date, value: p.outflow }));
    return { balance, inflow, outflow };
  }, [chartPointsInRange]);

  const heroCashTotals = React.useMemo(() => {
    if (!chartPointsInRange) return null;
    const totals = chartPointsInRange.reduce(
      (acc, p) => {
        acc.inflow += p.inflow;
        acc.outflow += p.outflow;
        return acc;
      },
      { inflow: 0, outflow: 0 }
    );
    totals.inflow = Math.round(totals.inflow * 100) / 100;
    totals.outflow = Math.round(totals.outflow * 100) / 100;
    const net = Math.round((totals.inflow - totals.outflow) * 100) / 100;
    return { inflow: totals.inflow, outflow: totals.outflow, net };
  }, [chartPointsInRange]);

  const { start, end } = getRange(selectedRange);

  const totals = React.useMemo(() => {
    const cashOnHand =
      typeof cashOnHandAggregate === "number" ? cashOnHandAggregate : computeCashOnHand(accounts, transactions);
    const burnOutflow = computeTrailingBurn(transactions, 3);
    const runwayMonths =
      cashOnHand !== null && burnOutflow !== null && burnOutflow > 0
        ? cashOnHand / burnOutflow
        : null;

    const rangeTxns = transactions.filter(
      (t) => inRange(t.postedAt, start, end) && !t.isInternalTransfer
    );
    const inflow = rangeTxns.filter((t) => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
    const outflow = rangeTxns.filter((t) => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const net = inflow - outflow;
    const uncategorizedCount = rangeTxns.filter((t) => !t.categoryId || t.categoryId === "OTHER").length;

    return { cashOnHand, burnOutflow, runwayMonths, net, inflow, outflow, uncategorizedCount };
  }, [accounts, cashOnHandAggregate, end, start, transactions]);

  const includedAccounts = React.useMemo(
    () => accounts.filter((a) => !a.archivedAt && a.includeInCashOnHand !== false),
    [accounts]
  );

  const derivedMissingAnchors = React.useMemo(() => {
    const included = includedAccounts.map((a) => a.accountId);
    const provided = missingAnchorAccountIds.filter((id) => included.includes(id));
    if (provided.length > 0) return provided;

    return includedAccounts
      .filter((a) => !a.anchorDate || typeof a.anchorBalance !== "number")
      .map((a) => a.accountId);
  }, [includedAccounts, missingAnchorAccountIds]);

  const lastSyncedAt = React.useMemo(() => {
    if (!importRuns.length) return null;
    const latest = importRuns
      .map((r) => r.createdAt)
      .filter((d): d is string => typeof d === "string" && Boolean(d))
      .sort()
      .at(-1);
    return latest ?? null;
  }, [importRuns]);

  const rangeShortLabel = React.useMemo(() => {
    return selectedRange === "month" ? "This month" : selectedRange === "quarter" ? "Quarter" : "YTD";
  }, [selectedRange]);

  const rangeLabel = React.useMemo(() => {
    return `${start} – ${end}`;
  }, [end, start]);

  const monthlyFlow = React.useMemo(() => {
    return computeMonthlyFlow(transactions, start, end);
  }, [end, start, transactions]);

  const maxFlow = React.useMemo(() => {
    return Math.max(
      1,
      ...monthlyFlow.flatMap((r) => [r.inflow, r.outflow])
    );
  }, [monthlyFlow]);

  const topCategories = React.useMemo(() => {
    return computeTopCategories(transactions, start, end);
  }, [end, start, transactions]);

  const latestTransactions = React.useMemo(() => {
    return [...transactions]
      .filter((t) => !t.isInternalTransfer)
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
      .slice(0, 8);
  }, [transactions]);

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

  const heroVisibleSeries: VisibleHeroCashSeries = React.useMemo(
    () => ({ balance: showBalance, inflow: showInflow, outflow: showOutflow }),
    [showBalance, showInflow, showOutflow]
  );

  const toggleBalance = React.useCallback(() => {
    setShowBalance((prev) => {
      if (prev && !showInflow && !showOutflow) return true;
      return !prev;
    });
  }, [showInflow, showOutflow]);

  const toggleInflow = React.useCallback(() => setShowInflow((prev) => !prev), []);
  const toggleOutflow = React.useCallback(() => setShowOutflow((prev) => !prev), []);

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

          <div className={styles.heroChart} aria-label="Cash chart module">
            <div className={styles.heroChartHeader}>
              <div className={styles.heroChartTitleBlock}>
                <div className={styles.heroChartTitle}>Cash</div>
                <div className={styles.heroChartSubtitle}>
                  {chartLoading ? "Loading…" : chartError ? chartError : chart ? `Ending balance ${chart.anchorDate}` : "—"}
                </div>
              </div>
              <div className={styles.heroChartHeaderRight}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setChartCollapsed((v) => !v)}
                >
                  {chartCollapsed ? "Expand" : "Collapse"}
                </button>
              </div>
            </div>

            <div className={styles.heroChartControls} aria-label="Chart controls">
              <div className={styles.heroFilters} aria-label="Chart range">
                {chartRanges.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={[styles.filterChip, chartRange === r.id ? styles.filterChipActive : ""]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setChartRange(r.id)}
                    aria-pressed={chartRange === r.id}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div className={styles.heroFilters} aria-label="Series toggles">
                <button
                  type="button"
                  className={[styles.filterChip, showBalance ? styles.filterChipActive : ""].filter(Boolean).join(" ")}
                  onClick={toggleBalance}
                  aria-pressed={showBalance}
                >
                  Balance
                </button>
                <button
                  type="button"
                  className={[styles.filterChip, showInflow ? styles.filterChipActive : ""].filter(Boolean).join(" ")}
                  onClick={toggleInflow}
                  aria-pressed={showInflow}
                >
                  Inflow
                </button>
                <button
                  type="button"
                  className={[styles.filterChip, showOutflow ? styles.filterChipActive : ""].filter(Boolean).join(" ")}
                  onClick={toggleOutflow}
                  aria-pressed={showOutflow}
                >
                  Outflow
                </button>
              </div>
            </div>

            {chartCollapsed ? null : heroCashSeries && chart ? (
              <div className={styles.heroChartStageWrap}>
                <HeroCashChart
                  balance={heroCashSeries.balance}
                  inflow={heroCashSeries.inflow}
                  outflow={heroCashSeries.outflow}
                  range={chartRange}
                  visibleSeries={heroVisibleSeries}
                />

                <div className={styles.heroChartFooter}>
                  <div className={styles.heroChartFooterStat}>
                    <span>Range</span>
                    <span>{chartRange}</span>
                  </div>
                  <div className={styles.heroChartFooterStat}>
                    <span className={styles.kpiIn}>In</span>
                    <span>{currency.format(heroCashTotals?.inflow ?? chart.totals.inflow)}</span>
                  </div>
                  <div className={styles.heroChartFooterStat}>
                    <span className={styles.kpiOut}>Out</span>
                    <span>{currency.format(heroCashTotals?.outflow ?? chart.totals.outflow)}</span>
                  </div>
                  <div className={styles.heroChartFooterStat}>
                    <span>Net</span>
                    <span className={(heroCashTotals?.net ?? chart.totals.net) < 0 ? styles.kpiOut : styles.kpiIn}>
                      {currency.format(heroCashTotals?.net ?? chart.totals.net)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.emptyState}>Set ending balance today on your accounts to see the chart.</div>
            )}
          </div>

          <div className={styles.kpiRow}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Cash on hand</div>
              <div className={styles.kpiValue}>
                {totals.cashOnHand === null ? "—" : currency.format(totals.cashOnHand)}
              </div>
              <div className={styles.kpiHint}>
                {includedAccounts.length === 0
                  ? "No accounts included"
                  : derivedMissingAnchors.length > 0
                    ? `${includedAccounts.length} included · ${derivedMissingAnchors.length} missing anchors`
                    : `${includedAccounts.length} included · anchored balances + net flow`}
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Burn (avg / mo)</div>
              <div className={styles.kpiValue}>
                {totals.burnOutflow === null ? "—" : currency.format(totals.burnOutflow)}
              </div>
              <div className={styles.kpiHint}>Trailing 3 full months, outflow only</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Runway</div>
              <div className={styles.kpiValue}>
                {totals.runwayMonths === null
                  ? "—"
                  : totals.burnOutflow === 0
                    ? "Stable"
                    : `${runwayFormatter.format(totals.runwayMonths)} mo`}
              </div>
              <div className={styles.kpiHint}>Cash / burn</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Net cash flow ({rangeShortLabel})</div>
              <div className={[styles.kpiValue, totals.net < 0 ? styles.kpiOut : styles.kpiIn].join(" ")}>
                {preciseCurrency.format(totals.net)}
              </div>
              <div className={styles.kpiHint}>
                In {preciseCurrency.format(totals.inflow)} · Out {preciseCurrency.format(totals.outflow)}
              </div>
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
                    <span className={styles.accountName}>{acct.name ?? acct.accountName}</span>
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
          <ImportCsvModal
            orgId={activeOrgId}
            isOpen={isImportOpen}
            onRequestClose={() => setIsImportOpen(false)}
            onOpenCategorization={({ importRunId }) => openSpellbook({ importRunId })}
          />
          <CategorizationSpellbookSheet
            orgId={activeOrgId}
            importRunId={spellbook.importRunId}
            isOpen={spellbook.isOpen}
            onRequestClose={() => setSpellbook({ isOpen: false })}
          />
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
