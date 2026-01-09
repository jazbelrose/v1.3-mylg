import React from "react";
import { Link, useNavigate } from "react-router-dom";
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
  canonicalSignedAmount,
  computeMonthlyFlow,
  computeRecurringCommitments,
  computeTopCategories,
  computeTrailingBurn,
  getRange,
  inRange,
  type HqRangeId,
} from "@/hq/lib/hqMetrics";
import {
  fetchHqChartSeries,
  fetchHqRecurringCommitments,
  fetchHqTopCategories,
  type HqChartSeriesRange,
  type HqChartSeriesResponse,
  type HqRecurringCommitmentsResponse,
  type HqTopCategoriesResponse,
} from "@/hq/lib/hqApi";
import type { HqAccount, HqAlert, HqTransaction } from "@/hq/types";
import { todayPacificIsoDate } from "@/hq/lib/hqDate";
import HeroCashChart, { type DailyPoint, type VisibleHeroCashSeries } from "@/hq/components/HeroCashChart";
import TxnModalApply from "@/hq/components/TxnModalApply";
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
  if (range === "YTD") {
    const anchor = points.length ? points[points.length - 1].date : todayPacificIsoDate();
    const start = `${String(anchor).slice(0, 4)}-01-01`;
    return points.filter((p) => p.date >= start);
  }
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
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "1Y" },
  { id: "ALL", label: "ALL" },
];

function getDateWindowForChartRange(range: HqChartSeriesRange, txns: HqTransaction[]): { start: string; end: string } {
  const end = todayPacificIsoDate();
  if (range === "ALL") {
    const earliest = [...txns]
      .map((t) => String(t.postedAt || "").slice(0, 10))
      .filter(Boolean)
      .sort()
      .at(0);
    return { start: earliest || end, end };
  }
  if (range === "YTD") return { start: `${String(end).slice(0, 4)}-01-01`, end };
  const fixedDays = range === "1W" ? 7 : range === "1M" ? 30 : range === "3M" ? 90 : range === "1Y" ? 365 : null;
  if (!fixedDays) return { start: end, end };
  return { start: addDaysIso(end, -(fixedDays - 1)), end };
}

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
      .filter((t) => includedAccountIds.has(t.accountId))
      .map((t) => String(t.postedAt || "").slice(0, 10))
      .filter(Boolean);
    dates.sort();
    start = dates[0] || today;
  }

  const inflowByDate = new Map<string, number>();
  const outflowByDate = new Map<string, number>();

  for (const t of input.transactions) {
    if (!includedAccountIds.has(t.accountId)) continue;
    const date = String(t.postedAt || "").slice(0, 10);
    if (!date || date < start || date > today) continue;
    const amt = canonicalSignedAmount(t);
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

  const navigate = useNavigate();

  useHqBootstrap(activeOrgId);

  const [selectedRange, setSelectedRange] = React.useState<HqRangeId>("ytd");
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = React.useState(false);
  const [selectedTxn, setSelectedTxn] = React.useState<HqTransaction | null>(null);
  const [isApplyOpen, setIsApplyOpen] = React.useState(false);

  const [chartRange, setChartRange] = React.useState<HqChartSeriesRange>("1Y");
  const [chartCollapsed, setChartCollapsed] = React.useState(false);
  const [showBalance, setShowBalance] = React.useState(true);
  const [showInflow, setShowInflow] = React.useState(false);
  const [showOutflow, setShowOutflow] = React.useState(false);
  const [chart, setChart] = React.useState<HqChartSeriesResponse | null>(null);
  const [chartError, setChartError] = React.useState<string | null>(null);
  const [chartLoading, setChartLoading] = React.useState(false);
  const [chartNeedsImport, setChartNeedsImport] = React.useState(false);

  const [topCategoriesRange, setTopCategoriesRange] = React.useState<HqChartSeriesRange>("1M");
  const [topCategoriesData, setTopCategoriesData] = React.useState<HqTopCategoriesResponse | null>(null);
  const [topCategoriesError, setTopCategoriesError] = React.useState<string | null>(null);
  const [topCategoriesLoading, setTopCategoriesLoading] = React.useState(false);

  const [recurringData, setRecurringData] = React.useState<HqRecurringCommitmentsResponse | null>(null);
  const [recurringError, setRecurringError] = React.useState<string | null>(null);
  const [recurringLoading, setRecurringLoading] = React.useState(false);

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
      setChartNeedsImport(false);
      return;
    }

    let cancelled = false;
    setChartLoading(true);
    setChartError(null);
    setChartNeedsImport(false);

    const fetchRange: HqChartSeriesRange = "ALL";
    fetchHqChartSeries({ orgId: activeOrgId, scope: "aggregate", range: fetchRange })
      .then((res) => {
        if (cancelled) return;
        setChart(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not load chart.";

        // Friendly empty-state: org has no anchored accounts / no data yet.
        if (
          String(msg).toLowerCase().includes("no anchored accounts available for chart series") ||
          String(msg).includes('No anchored accounts available for chart series')
        ) {
          setChart(null);
          setChartError(null);
          setChartNeedsImport(true);
          return;
        }

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

  const recurringLocal = React.useMemo(() => {
    return computeRecurringCommitments(transactions, 3, { limit: 8, excludeInternalTransfers: true });
  }, [transactions]);

  const recurringSummary = React.useMemo(() => {
    if (recurringData) return recurringData;
    if (!activeOrgId) return null;
    return {
      orgId: activeOrgId,
      months: recurringLocal.months,
      startDate: recurringLocal.startDate,
      endDate: recurringLocal.endDate,
      excludeInternalTransfers: true,
      mandatoryMonthlyBurn: recurringLocal.mandatoryMonthlyBurn,
      items: recurringLocal.items,
    };
  }, [activeOrgId, recurringData, recurringLocal]);

  const totals = React.useMemo(() => {
    const cashOnHand =
      typeof cashOnHandAggregate === "number" ? cashOnHandAggregate : computeCashOnHand(accounts, transactions);
    const avgOutflow = computeTrailingBurn(transactions, 3);
    const mandatoryMonthlyBurn = Math.max(0, Number(recurringSummary?.mandatoryMonthlyBurn ?? 0) || 0);
    const runwayMonths =
      cashOnHand !== null && mandatoryMonthlyBurn > 0
        ? cashOnHand / mandatoryMonthlyBurn
        : null;

    const rangeTxns = transactions.filter(
      (t) => inRange(t.postedAt, start, end) && !t.isInternalTransfer
    );
    const inflow = rangeTxns.filter((t) => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
    const outflow = rangeTxns.filter((t) => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const net = inflow - outflow;
    const uncategorizedCount = rangeTxns.filter((t) => !t.categoryId || t.categoryId === "OTHER").length;

    const variableSpend =
      avgOutflow === null
        ? null
        : Math.max(0, Math.round((avgOutflow - mandatoryMonthlyBurn) * 100) / 100);

    return {
      cashOnHand,
      avgOutflow,
      mandatoryMonthlyBurn,
      variableSpend,
      runwayMonths,
      net,
      inflow,
      outflow,
      uncategorizedCount,
    };
  }, [accounts, cashOnHandAggregate, end, recurringSummary?.mandatoryMonthlyBurn, start, transactions]);

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

  const topCategoriesWindow = React.useMemo(() => {
    return getDateWindowForChartRange(topCategoriesRange, transactions);
  }, [topCategoriesRange, transactions]);

  React.useEffect(() => {
    if (!activeOrgId) {
      setTopCategoriesData(null);
      setTopCategoriesError(null);
      setTopCategoriesLoading(false);
      return;
    }

    let cancelled = false;
    setTopCategoriesLoading(true);
    setTopCategoriesError(null);

    fetchHqTopCategories({ orgId: activeOrgId, range: topCategoriesRange, limit: 8, direction: "out" })
      .then((res) => {
        if (cancelled) return;
        setTopCategoriesData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not load top categories.";

        // Common during dev: backend not redeployed yet -> endpoint returns 404.
        // Fall back to local cache so HQ stays usable.
        if (String(msg).includes("404")) {
          const local = computeTopCategories(transactions, topCategoriesWindow.start, topCategoriesWindow.end, {
            direction: "out",
            limit: 8,
          }).map((x) => ({ categoryId: x.categoryId, amount: x.amount }));
          setTopCategoriesData({
            orgId: activeOrgId,
            range: topCategoriesRange,
            direction: "out",
            startDate: topCategoriesWindow.start,
            endDate: topCategoriesWindow.end,
            items: local,
          });
          setTopCategoriesError(null);
          return;
        }

        setTopCategoriesData(null);
        setTopCategoriesError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setTopCategoriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, topCategoriesRange, topCategoriesWindow.end, topCategoriesWindow.start, transactions]);

  React.useEffect(() => {
    if (!activeOrgId) {
      setRecurringData(null);
      setRecurringError(null);
      setRecurringLoading(false);
      return;
    }

    let cancelled = false;
    setRecurringLoading(true);
    setRecurringError(null);

    fetchHqRecurringCommitments({ orgId: activeOrgId, months: 3, limit: 8, excludeInternalTransfers: true })
      .then((res) => {
        if (cancelled) return;
        setRecurringData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not load recurring commitments.";

        // Common during dev: backend not redeployed yet -> endpoint returns 404.
        // Fall back to local cache so HQ stays usable.
        if (String(msg).includes("404")) {
          setRecurringData({
            orgId: activeOrgId,
            months: recurringLocal.months,
            startDate: recurringLocal.startDate,
            endDate: recurringLocal.endDate,
            excludeInternalTransfers: true,
            mandatoryMonthlyBurn: recurringLocal.mandatoryMonthlyBurn,
            items: recurringLocal.items,
          });
          setRecurringError(null);
          return;
        }

        setRecurringData(null);
        setRecurringError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setRecurringLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, recurringLocal]);

  const topCategories = React.useMemo(() => {
    return (topCategoriesData?.items || []).slice(0, 8);
  }, [topCategoriesData]);

  const topCategoriesMax = React.useMemo(() => {
    return Math.max(1, ...topCategories.map((x) => x.amount));
  }, [topCategories]);

  const topCategoriesLabel = React.useMemo(() => {
    const startLabel = topCategoriesData?.startDate || topCategoriesWindow.start;
    const endLabel = topCategoriesData?.endDate || topCategoriesWindow.end;
    return `${startLabel} – ${endLabel}`;
  }, [topCategoriesData?.endDate, topCategoriesData?.startDate, topCategoriesWindow.end, topCategoriesWindow.start]);

  const recurringItems = React.useMemo(() => {
    return (recurringSummary?.items || []).slice(0, 8);
  }, [recurringSummary]);

  const recurringLabel = React.useMemo(() => {
    if (!recurringSummary) return "Trailing 3 full months";
    return `${recurringSummary.startDate} – ${recurringSummary.endDate}`;
  }, [recurringSummary]);

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
        message: "Runway is below 2 months. Consider tightening mandatory burn or replenishing cash.",
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
      title="HQ"
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
                  onClick={() => {
                    setSelectedRange(filter.id);
                    if (filter.id === "month") setChartRange("1M");
                    else if (filter.id === "quarter") setChartRange("3M");
                    else if (filter.id === "ytd") setChartRange("YTD");
                  }}
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
              <div className={styles.emptyState}>
                {chartLoading
                  ? "Loading chart…"
                  : chartNeedsImport
                    ? canAdmin
                      ? (
                        <div>
                          <div style={{ marginBottom: 10 }}>No data yet. Import a CSV to generate your cash series.</div>
                          <button type="button" className={styles.secondaryButton} onClick={openImport}>
                            Import CSV
                          </button>
                        </div>
                      )
                      : "No data yet. Ask an admin to import a CSV."
                    : chartError
                      ? "Could not load chart."
                      : "Set ending balance today on your accounts to see the chart."}
              </div>
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
              <div className={styles.kpiLabel}>Mandatory burn (avg / mo)</div>
              <div className={styles.kpiValue}>
                {currency.format(totals.mandatoryMonthlyBurn)}
              </div>
              <div className={styles.kpiHint}>Trailing 3 full months, recurring only</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Runway (mandatory)</div>
              <div className={styles.kpiValue}>
                {totals.cashOnHand === null
                  ? "—"
                  : totals.mandatoryMonthlyBurn === 0
                    ? "Stable"
                    : totals.runwayMonths === null
                      ? "—"
                      : `${runwayFormatter.format(totals.runwayMonths)} mo`}
              </div>
              <div className={styles.kpiHint}>Cash / mandatory burn</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Variable spend (avg / mo)</div>
              <div className={styles.kpiValue}>
                {totals.variableSpend === null ? "—" : currency.format(totals.variableSpend)}
              </div>
              <div className={styles.kpiHint}>Trailing 3 months outflow minus mandatory</div>
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

        <div className={styles.gridRowTwoCol}>
          <div className={styles.leftStack}>
            <HQCard
              title="Accounts"
              aria-label="Accounts breakdown"
              onClick={() => {
                navigate("/dashboard/hq/accounts");
              }}
            >
              {accounts.length === 0 ? (
                <div className={styles.emptyState}>
                  Add an account to start.{" "}
                  {canAdmin ? (
                    <button
                      type="button"
                      className={styles.inlineButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddAccount();
                      }}
                    >
                      Add account
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul className={styles.list}>
                  {accounts.slice(0, 5).map((acct) => (
                    <li key={acct.accountId} className={styles.listItem}>
                      <span className={styles.accountName}>{acct.name ?? acct.accountName}</span>
                      <span>{acct.anchorDate && typeof acct.anchorBalance === "number" ? "Anchored" : "Set anchor"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </HQCard>

            <HQCard
              title="Recurring"
              subtitle={recurringLabel}
              aria-label="Recurring commitments"
              onClick={() => {
                navigate("/dashboard/hq/transactions?filter=recurring");
              }}
              footer={
                <Link className={styles.cardLink} to="/dashboard/hq/transactions?filter=recurring">
                  View all
                </Link>
              }
            >
              {recurringLoading && recurringItems.length === 0 ? (
                <div className={styles.emptyState}>Loading…</div>
              ) : recurringError ? (
                <div className={styles.emptyState}>Could not load recurring commitments.</div>
              ) : recurringItems.length === 0 ? (
                <div className={styles.emptyState}>No recurring transactions detected yet.</div>
              ) : (
                <ul className={styles.list}>
                  {recurringItems.map((entry) => (
                    <li
                      key={entry.vendorKey}
                      className={[styles.listItem, styles.listItemClickable].join(" ")}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/hq/transactions?filter=recurring&q=${encodeURIComponent(entry.label)}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/dashboard/hq/transactions?filter=recurring&q=${encodeURIComponent(entry.label)}`);
                        }
                      }}
                    >
                      <span className={styles.accountName} title={entry.label}>
                        {entry.label}
                      </span>
                      <span className={styles.out}>{currency.format(entry.amountMonthly)}/mo</span>
                    </li>
                  ))}
                </ul>
              )}
            </HQCard>
          </div>

          <HQCard
            title="Top Categories"
            subtitle={topCategoriesLabel}
            aria-label="Top spend categories"
            badge={
              <div className={styles.topCategoriesPills} aria-label="Top categories range">
                {chartRanges.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={[styles.filterChip, topCategoriesRange === r.id ? styles.filterChipActive : ""]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTopCategoriesRange(r.id);
                    }}
                    aria-pressed={topCategoriesRange === r.id}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            }
            footer={
              <Link className={styles.cardLink} to="/dashboard/hq/transactions">
                View all
              </Link>
            }
          >
            {topCategoriesLoading && topCategories.length === 0 ? (
              <div className={styles.emptyState}>Loading…</div>
            ) : topCategoriesError ? (
              <div className={styles.emptyState}>Could not load top categories.</div>
            ) : topCategories.length === 0 ? (
              <div className={styles.emptyState}>No spend yet.</div>
            ) : (
              <ul className={styles.topCategoriesList}>
                {topCategories.map((entry) => {
                  const pct = Math.round((entry.amount / topCategoriesMax) * 100);
                  return (
                    <li key={entry.categoryId} className={styles.topCategoriesRow}>
                      <span className={styles.topCategoriesName} title={HQ_CATEGORY_LABEL[entry.categoryId as keyof typeof HQ_CATEGORY_LABEL]}>
                        {HQ_CATEGORY_LABEL[entry.categoryId as keyof typeof HQ_CATEGORY_LABEL] || entry.categoryId}
                      </span>
                      <div className={styles.chartBar} aria-hidden>
                        <div className={styles.chartBarFill} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={styles.topCategoriesAmount}>{currency.format(entry.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </HQCard>
        </div>

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

          <HQCard
            title="Uncategorized"
            subtitle={rangeLabel}
            aria-label="Uncategorized transactions"
            badge={
              totals.uncategorizedCount > 0 ? (
                <Link className={styles.primaryLink} to="/dashboard/hq/transactions?filter=uncategorized">
                  Review now
                </Link>
              ) : null
            }
          >
            {totals.uncategorizedCount === 0 ? (
              <div className={styles.emptyState}>Nothing to triage.</div>
            ) : (
              <div className={styles.queue}>
                <div className={styles.queueMetric}>{totals.uncategorizedCount}</div>
              </div>
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
                <div
                  key={txn.dedupeHash}
                  className={[styles.txnRow, canAdmin ? styles.txnRowClickable : ""].filter(Boolean).join(" ")}
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
          <TxnModalApply
            orgId={activeOrgId}
            isOpen={isApplyOpen}
            txn={selectedTxn}
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

export default HQOverview;
