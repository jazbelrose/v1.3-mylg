import React from "react";
import { createPortal } from "react-dom";
import { Virtuoso } from "react-virtuoso";
import { toast } from "react-toastify";

import useModalStack from "@/shared/utils/useModalStack";
import { HQ_CATEGORIES, HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import {
  applyHqCategoryRules,
  createHqCategoryRule,
  deleteHqCategoryRule,
  fetchHqSummary,
  fetchHqTransactions,
} from "@/hq/lib/hqApi";
import { hydrateHqState, readHqState, useHqStore } from "@/hq/lib/hqStore";
import { suggestCategory, suggestCategoryFromUserRules } from "@/hq/lib/hqCategorization";
import { getVendorKeyForTxn } from "@/hq/lib/vendorNormalization";

import type { HqCategoryId, HqTransaction } from "@/hq/types";
import styles from "./CategorizationSpellbookSheet.module.css";
import HqSelect from "@/hq/components/HqSelect";

type MatchType = "contains" | "startsWith" | "exact" | "regex";
type RuleScope = "org" | "account" | "card";

type DirectionGuard = "any" | "out" | "in";
type MethodGuard = "any" | "ach" | "card" | "wire" | "check" | "transfer";
type ApplyMode = "uncategorized" | "overwrite";

type VendorCluster = {
  vendorKey: string;
  vendorLabel: string;
  count: number;
  totalSpend: number;
  lastSeen: string;
  examples: HqTransaction[];
  suggestedCategoryId: HqCategoryId;
  suggestedConfidence: number;
  suggestedReason: string;
  isRecurringCandidate: boolean;
  hasAnyUncategorized: boolean;
};

type PendingRule = {
  vendorKey: string;
  vendorLabel: string;
  categoryId: HqCategoryId;
  matchType: MatchType;
  scope: RuleScope;
  accountId?: string;
  cardLast4?: string;
  regexPattern?: string;
  direction?: DirectionGuard;
  method?: MethodGuard;
  applyMode?: ApplyMode;
  amountMin?: number;
  amountMax?: number;
  frequencyHint?: "weekly" | "biweekly" | "monthly" | "other";
};

type Props = {
  orgId: string;
  isOpen: boolean;
  importRunId?: string;
  onRequestClose: () => void;
};

const currencyCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRulePattern(input: {
  matchType: MatchType;
  vendorLabel: string;
  regexPattern?: string;
}): { apiMatchType: "vendor" | "regex"; pattern: string } {
  if (input.matchType === "exact") {
    return { apiMatchType: "vendor", pattern: input.vendorLabel };
  }

  if (input.matchType === "regex") {
    return { apiMatchType: "regex", pattern: String(input.regexPattern || "").trim() };
  }

  const escaped = escapeRegExp(input.vendorLabel);
  if (input.matchType === "startsWith") {
    return { apiMatchType: "regex", pattern: `^${escaped}` };
  }

  // contains
  return { apiMatchType: "regex", pattern: escaped };
}

function guessSuggestedCategory(txns: HqTransaction[], rules: ReturnType<typeof readHqState>["categoryRules"]) {
  const totals = new Map<HqCategoryId, { score: number; bestReason: string; bestConfidence: number }>();

  for (const txn of txns) {
    const user = rules.length
      ? suggestCategoryFromUserRules(
          {
            vendor: txn.vendor,
            normalizedDescription: txn.normalizedDescription,
            accountId: txn.accountId,
            cardLast4: txn.cardLast4,
          },
          rules
        )
      : null;
    const guess = user || suggestCategory(txn);

    const prev = totals.get(guess.categoryId as HqCategoryId) || { score: 0, bestReason: guess.reason, bestConfidence: 0 };
    const score = prev.score + Math.max(0.05, guess.confidence);
    const bestConfidence = Math.max(prev.bestConfidence, guess.confidence);
    const bestReason = guess.confidence >= prev.bestConfidence ? guess.reason : prev.bestReason;
    totals.set(guess.categoryId as HqCategoryId, { score, bestReason, bestConfidence });
  }

  let best: { categoryId: HqCategoryId; confidence: number; reason: string } = {
    categoryId: "OTHER",
    confidence: 0.2,
    reason: "fallback",
  };

  for (const [categoryId, meta] of totals.entries()) {
    if (meta.score > (totals.get(best.categoryId)?.score ?? 0)) {
      best = { categoryId, confidence: meta.bestConfidence, reason: meta.bestReason };
    }
  }

  return best;
}

function describeReason(reason: string): string {
  if (reason === "user-vendor") return "Matched prior rule (exact vendor).";
  if (reason === "user-regex") return "Matched prior rule (pattern).";
  if (reason === "default-vendor") return "Matched vendor keyword pack.";
  if (reason === "type-fee") return "Detected fee.";
  if (reason === "type-deposit") return "Detected deposit.";
  if (reason === "internal-transfer") return "Detected internal transfer.";
  if (reason === "type-transfer") return "Detected transfer-like transaction.";
  return "Heuristic suggestion.";
}

function isUncategorized(txn: HqTransaction): boolean {
  return !txn.categoryId || txn.categoryId === "OTHER";
}

function inferRecurringCandidate(txns: HqTransaction[]): boolean {
  if (txns.length < 3) return false;
  const dates = [...txns]
    .map((t) => t.postedAt)
    .filter(Boolean)
    .sort();
  if (dates.length < 3) return false;

  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime() / (1000 * 60 * 60 * 24);
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const a = day(dates[i - 1]);
    const b = day(dates[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = Math.abs(b - a);
    if (delta > 0) intervals.push(delta);
  }

  // Simple cadence test: at least 2 intervals near ~30 days.
  const nearMonthly = intervals.filter((d) => d >= 23 && d <= 37).length;
  return nearMonthly >= 2;
}

function computeAffectsCount(input: {
  txns: HqTransaction[];
  vendorLabel: string;
  matchType: MatchType;
  scope: RuleScope;
  accountId?: string;
  cardLast4?: string;
  regexPattern?: string;
}): number {
  const { apiMatchType, pattern } = buildRulePattern({
    matchType: input.matchType,
    vendorLabel: input.vendorLabel,
    regexPattern: input.regexPattern,
  });

  let re: RegExp | null = null;
  if (apiMatchType === "regex") {
    try {
      re = new RegExp(pattern, "i");
    } catch {
      return 0;
    }
  }

  return input.txns.filter((t) => {
    if (input.scope === "account" && input.accountId && t.accountId !== input.accountId) return false;
    if (input.scope === "card" && input.cardLast4 && t.cardLast4 !== input.cardLast4) return false;

    if (apiMatchType === "vendor") {
      return (t.vendor || "").trim().toLowerCase() === input.vendorLabel.trim().toLowerCase();
    }

    const haystack = `${t.vendor || ""} ${t.normalizedDescription || ""}`;
    return Boolean(re?.test(haystack));
  }).length;
}

const CategorizationSpellbookSheet: React.FC<Props> = ({ orgId, isOpen, importRunId, onRequestClose }) => {
  const accounts = useHqStore(orgId, (s) => s.accounts);
  const categoryRules = useHqStore(orgId, (s) => s.categoryRules);
  const cachedTxns = useHqStore(orgId, (s) => s.transactions);

  const [isLoading, setIsLoading] = React.useState(false);
  const [txns, setTxns] = React.useState<HqTransaction[]>([]);

  const [query, setQuery] = React.useState("");
  const [filterUncategorizedOnly, setFilterUncategorizedOnly] = React.useState(true);
  const [filterLowConfidence, setFilterLowConfidence] = React.useState(false);
  const [filterRecurring, setFilterRecurring] = React.useState(false);

  const [rangeMode, setRangeMode] = React.useState<"YTD" | "12MO" | "CUSTOM">("YTD");
  const [customFrom, setCustomFrom] = React.useState<string>("");
  const [customTo, setCustomTo] = React.useState<string>("");

  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [pendingRules, setPendingRules] = React.useState<Record<string, PendingRule>>({});
  const [selectedVendorKey, setSelectedVendorKey] = React.useState<string | null>(null);

  const [isMobile, setIsMobile] = React.useState(false);

  const [isApplying, setIsApplying] = React.useState(false);
  const [lastApply, setLastApply] = React.useState<
    | null
    | {
        createdRuleIds: string[];
        updated: number;
      }
  >(null);

  useModalStack(isOpen);

  React.useEffect(() => {
    if (!isOpen) return;

    const update = () => {
      setIsMobile(typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
    };

    update();
    window.addEventListener("resize", update);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", update);
    };
  }, [isOpen, onRequestClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    setPendingRules({});
    setSelectedVendorKey(null);
    setLastApply(null);
    setExpanded(new Set());
  }, [isOpen, importRunId]);

  React.useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        // Pull a fresher slice for clustering; store remains the source of truth.
        const res = await fetchHqTransactions({ orgId, limit: 2000 });
        if (cancelled) return;
        setTxns(Array.isArray(res.transactions) ? (res.transactions as HqTransaction[]) : []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setTxns(cachedTxns);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cachedTxns, isOpen, orgId]);

  const { fromIso, toIso } = React.useMemo(() => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    if (rangeMode === "12MO") {
      const d = new Date(today);
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      return { fromIso: d.toISOString().slice(0, 10), toIso: todayIso };
    }

    if (rangeMode === "CUSTOM") {
      const from = customFrom || "";
      const to = customTo || todayIso;
      return { fromIso: from, toIso: to };
    }

    // YTD
    return { fromIso: `${today.getUTCFullYear()}-01-01`, toIso: todayIso };
  }, [customFrom, customTo, rangeMode]);

  const baseTxns = React.useMemo(() => {
    const filterTxn = (t: HqTransaction) => {
      if (importRunId && t.importRunId !== importRunId) return false;
      if (t.isInternalTransfer) return false;
      if (fromIso && t.postedAt < fromIso) return false;
      if (toIso && t.postedAt > toIso) return false;
      return true;
    };

    const withinRange = txns.filter(filterTxn);
    if (withinRange.length) return withinRange;

    return cachedTxns.filter(filterTxn);
  }, [cachedTxns, fromIso, importRunId, toIso, txns]);

  const clusters = React.useMemo((): VendorCluster[] => {
    const groups = new Map<
      string,
      {
        vendorLabel: string;
        txns: HqTransaction[];
      }
    >();

    for (const txn of baseTxns) {
      const { vendorLabel, vendorKey } = getVendorKeyForTxn(txn);
      const key = vendorKey || "unknown";
      const existing = groups.get(key);
      if (existing) existing.txns.push(txn);
      else groups.set(key, { vendorLabel, txns: [txn] });
    }

    const out: VendorCluster[] = [];
    for (const [vendorKey, g] of groups.entries()) {
      const txnsSorted = [...g.txns].sort((a, b) => b.postedAt.localeCompare(a.postedAt));
      const examples = txnsSorted.slice(0, 5);
      const count = g.txns.length;
      const totalSpend = g.txns
        .filter((t) => t.direction === "out")
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
      const lastSeen = txnsSorted[0]?.postedAt || "";

      const hasAnyUncategorized = g.txns.some((t) => isUncategorized(t));
      const recurring = inferRecurringCandidate(g.txns);

      const suggestion = guessSuggestedCategory(g.txns.slice(0, 20), categoryRules);

      out.push({
        vendorKey,
        vendorLabel: g.vendorLabel,
        count,
        totalSpend,
        lastSeen,
        examples,
        suggestedCategoryId: (suggestion.categoryId || "OTHER") as HqCategoryId,
        suggestedConfidence: suggestion.confidence,
        suggestedReason: suggestion.reason,
        isRecurringCandidate: recurring,
        hasAnyUncategorized,
      });
    }

    const q = query.trim().toLowerCase();

    return out
      .filter((c) => {
        if (filterUncategorizedOnly && !c.hasAnyUncategorized) return false;
        if (filterLowConfidence && c.suggestedConfidence >= 0.6) return false;
        if (filterRecurring && !c.isRecurringCandidate) return false;
        if (q && !c.vendorLabel.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const ap = pendingRules[a.vendorKey];
        const bp = pendingRules[b.vendorKey];
        if (ap && !bp) return -1;
        if (!ap && bp) return 1;
        return b.totalSpend - a.totalSpend;
      });
  }, [baseTxns, categoryRules, filterLowConfidence, filterRecurring, filterUncategorizedOnly, pendingRules, query]);

  const categoryOptions = React.useMemo(
    () => HQ_CATEGORIES.filter((c) => c.id !== "TRANSFERS").map((c) => ({ value: c.id, label: c.label })),
    []
  );

  const selectedCluster = React.useMemo(() => {
    if (!selectedVendorKey) return null;
    return clusters.find((c) => c.vendorKey === selectedVendorKey) || null;
  }, [clusters, selectedVendorKey]);

  const queuedCount = Object.keys(pendingRules).length;

  const handleQueueRuleFromRow = React.useCallback(
    (cluster: VendorCluster, categoryId: HqCategoryId) => {
      setPendingRules((prev) => ({
        ...prev,
        [cluster.vendorKey]: {
          vendorKey: cluster.vendorKey,
          vendorLabel: cluster.vendorLabel,
          categoryId,
          matchType: "contains",
          scope: "org",
        },
      }));
    },
    []
  );

  const handleToggleExpanded = React.useCallback((vendorKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(vendorKey)) next.delete(vendorKey);
      else next.add(vendorKey);
      return next;
    });
  }, []);

  const handleApply = React.useCallback(async () => {
    if (queuedCount === 0) return;
    setIsApplying(true);

    try {
      const createdRuleIds: string[] = [];

      for (const rule of Object.values(pendingRules)) {
        const { apiMatchType, pattern } = buildRulePattern({
          matchType: rule.matchType,
          vendorLabel: rule.vendorLabel,
          regexPattern: rule.regexPattern,
        });

        const created = await createHqCategoryRule(orgId, {
          matchType: apiMatchType,
          pattern,
          categoryId: rule.categoryId,
          priority: 250,
          enabled: true,
          scope: rule.scope,
          accountId: rule.accountId,
          cardLast4: rule.cardLast4,
        });

        createdRuleIds.push(created.rule.ruleId);
      }

      const applied = await applyHqCategoryRules(orgId, {
        importRunId,
        ruleIds: createdRuleIds,
      });

      toast.success(`Applied ${createdRuleIds.length} rules. Updated ${applied.updated} transactions.`);
      setLastApply({ createdRuleIds, updated: applied.updated });
      setPendingRules({});

      // Refresh local store (best-effort) + notify pages.
      const summary = await fetchHqSummary(orgId);
      const tx = await fetchHqTransactions({ orgId, limit: 2000 });
      const prev = readHqState(orgId);
      hydrateHqState(orgId, {
        ...prev,
        accounts: summary.accounts,
        importRuns: summary.importRuns,
        transactions: tx.transactions,
        categoryRules: Array.isArray(summary.categoryRules) ? summary.categoryRules : prev.categoryRules,
      });

      window.dispatchEvent(new Event("mylg:hq-refresh"));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not apply rules.");
    } finally {
      setIsApplying(false);
    }
  }, [importRunId, orgId, pendingRules, queuedCount]);

  const handleRevertLastApply = React.useCallback(async () => {
    if (!lastApply?.createdRuleIds?.length) return;
    setIsApplying(true);

    try {
      for (const ruleId of lastApply.createdRuleIds) {
        await deleteHqCategoryRule(orgId, ruleId);
      }

      const applied = await applyHqCategoryRules(orgId, {
        importRunId,
      });

      toast.success(`Reverted. Recomputed ${applied.updated} transactions.`);
      setLastApply(null);

      const summary = await fetchHqSummary(orgId);
      const tx = await fetchHqTransactions({ orgId, limit: 2000 });
      const prev = readHqState(orgId);
      hydrateHqState(orgId, {
        ...prev,
        accounts: summary.accounts,
        importRuns: summary.importRuns,
        transactions: tx.transactions,
        categoryRules: Array.isArray(summary.categoryRules) ? summary.categoryRules : prev.categoryRules,
      });

      window.dispatchEvent(new Event("mylg:hq-refresh"));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not revert.");
    } finally {
      setIsApplying(false);
    }
  }, [importRunId, lastApply, orgId]);

  const renderRow = React.useCallback(
    (index: number, cluster: VendorCluster) => {
      void index;
      const isExpanded = expanded.has(cluster.vendorKey);
      const pending = pendingRules[cluster.vendorKey];

      const currentCategory = pending?.categoryId || cluster.suggestedCategoryId || "OTHER";

      const reasonText = describeReason(cluster.suggestedReason);
      const confidencePct = Math.round(cluster.suggestedConfidence * 100);

      const exampleLine = cluster.examples[0]
        ? `${cluster.examples[0].type.replace(/_/g, " ")} — ${formatShortDate(cluster.examples[0].postedAt)} — ${currencyPrecise.format(
            Math.abs(cluster.examples[0].amount)
          )}`
        : "—";

      return (
        <div className={[styles.row, pending ? styles.rowPending : ""].filter(Boolean).join(" ")}>
          <button
            type="button"
            className={styles.vendorCell}
            onClick={() => handleToggleExpanded(cluster.vendorKey)}
            aria-expanded={isExpanded}
          >
            <div className={styles.vendorTop}>
              <span className={styles.vendorIcon} aria-hidden />
              <span className={styles.vendorName} title={cluster.vendorLabel}>
                {cluster.vendorLabel}
              </span>
            </div>
            <div className={styles.vendorHint} title={cluster.examples[0]?.rawDescription || ""}>
              {exampleLine}
            </div>
            {isExpanded ? (
              <div className={styles.expandedExamples}>
                {cluster.examples.slice(0, 5).map((t) => (
                  <div key={`${t.postedAt}-${t.dedupeHash}`} className={styles.exampleLine}>
                    {t.type.replace(/_/g, " ")} — {formatShortDate(t.postedAt)} — {currencyPrecise.format(Math.abs(t.amount))}
                  </div>
                ))}
              </div>
            ) : null}
          </button>

          <div className={styles.metricsCell}>
            <div className={styles.metricStrong}>{cluster.count} tx</div>
            <div className={styles.metricMuted}>{currencyCompact.format(cluster.totalSpend)}</div>
            <div className={styles.metricMuted}>Last {formatShortDate(cluster.lastSeen)}</div>
          </div>

          <div className={styles.categoryCell}>
            <div className={styles.categoryTop}>
              <span
                className={[
                  styles.confidenceDot,
                  cluster.suggestedConfidence >= 0.8
                    ? styles.dotHigh
                    : cluster.suggestedConfidence >= 0.6
                      ? styles.dotMed
                      : styles.dotLow,
                ].join(" ")}
                title={`Suggested: ${HQ_CATEGORY_LABEL[cluster.suggestedCategoryId]} (${confidencePct}%) — ${reasonText}`}
              />
              <HqSelect
                value={currentCategory}
                onValueChange={(v) => handleQueueRuleFromRow(cluster, v as HqCategoryId)}
                ariaLabel={`Set category for ${cluster.vendorLabel}`}
                disabled={isApplying}
                options={categoryOptions}
              />
            </div>
            <div className={styles.categoryHint}>
              Suggested: {HQ_CATEGORY_LABEL[cluster.suggestedCategoryId]} ({confidencePct}%)
            </div>
          </div>

          <div className={styles.actionCell}>
            <button
              type="button"
              className={styles.reviewButton}
              onClick={() => setSelectedVendorKey(cluster.vendorKey)}
            >
              Review
            </button>
          </div>
        </div>
      );
    },
    [expanded, handleQueueRuleFromRow, handleToggleExpanded, isApplying, pendingRules]
  );

  const [builderMatchType, setBuilderMatchType] = React.useState<MatchType>("contains");
  const [builderScope, setBuilderScope] = React.useState<RuleScope>("org");
  const [builderAccountId, setBuilderAccountId] = React.useState<string>("");
  const [builderCardLast4, setBuilderCardLast4] = React.useState<string>("");
  const [builderCategoryId, setBuilderCategoryId] = React.useState<HqCategoryId>("OTHER");
  const [builderRegex, setBuilderRegex] = React.useState<string>("");

  React.useEffect(() => {
    if (!selectedCluster) return;
    const pending = pendingRules[selectedCluster.vendorKey];
    setBuilderMatchType(pending?.matchType || "contains");
    setBuilderScope(pending?.scope || "org");
    setBuilderAccountId(pending?.accountId || "");
    setBuilderCardLast4(pending?.cardLast4 || "");
    setBuilderCategoryId(pending?.categoryId || selectedCluster.suggestedCategoryId || "OTHER");
    setBuilderRegex(pending?.regexPattern || "");
  }, [pendingRules, selectedCluster]);

  const builderAffectsCount = React.useMemo(() => {
    if (!selectedCluster) return 0;
    return computeAffectsCount({
      txns: baseTxns,
      vendorLabel: selectedCluster.vendorLabel,
      matchType: builderMatchType,
      scope: builderScope,
      accountId: builderScope === "account" ? builderAccountId || undefined : undefined,
      cardLast4: builderScope === "card" ? builderCardLast4 || undefined : undefined,
      regexPattern: builderMatchType === "regex" ? builderRegex : undefined,
    });
  }, [baseTxns, builderAccountId, builderCardLast4, builderMatchType, builderRegex, builderScope, selectedCluster]);

  const handleSaveBuilder = React.useCallback(() => {
    if (!selectedCluster) return;

    setPendingRules((prev) => ({
      ...prev,
      [selectedCluster.vendorKey]: {
        vendorKey: selectedCluster.vendorKey,
        vendorLabel: selectedCluster.vendorLabel,
        categoryId: builderCategoryId,
        matchType: builderMatchType,
        scope: builderScope,
        accountId: builderScope === "account" ? builderAccountId || undefined : undefined,
        cardLast4: builderScope === "card" ? builderCardLast4 || undefined : undefined,
        regexPattern: builderMatchType === "regex" ? builderRegex : undefined,
      },
    }));

    toast.success("Queued rule.");
  }, [builderAccountId, builderCardLast4, builderCategoryId, builderMatchType, builderRegex, builderScope, selectedCluster]);

  if (!isOpen) return null;

  const root = typeof document !== "undefined" ? document.body : null;
  if (!root) return null;

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Categorization Spellbook">
      <div className={styles.backdrop} onClick={onRequestClose} />
      <div className={styles.sheet}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Categorization Spellbook</div>
            <div className={styles.subtitle}>
              Cast rules — don’t edit rows. {importRunId ? "(Import run scoped)" : ""}
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onRequestClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.stickyControls}>
          <div className={styles.controlsRow}>
            <input
              className={styles.search}
              placeholder="Search vendors"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <div className={styles.filters}>
              <button
                type="button"
                className={[styles.filterChip, filterUncategorizedOnly ? styles.filterChipActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setFilterUncategorizedOnly((v) => !v)}
                aria-pressed={filterUncategorizedOnly}
              >
                Uncategorized only
              </button>
              <button
                type="button"
                className={[styles.filterChip, filterLowConfidence ? styles.filterChipActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setFilterLowConfidence((v) => !v)}
                aria-pressed={filterLowConfidence}
              >
                Low confidence
              </button>
              <button
                type="button"
                className={[styles.filterChip, filterRecurring ? styles.filterChipActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setFilterRecurring((v) => !v)}
                aria-pressed={filterRecurring}
              >
                Recurring
              </button>
            </div>

            <div className={styles.range}>
              <HqSelect
                className={styles.rangeSelect}
                value={rangeMode}
                onValueChange={(v) => setRangeMode(v as any)}
                ariaLabel="Range"
                options={[
                  { value: "YTD", label: "YTD" },
                  { value: "12MO", label: "12mo" },
                  { value: "CUSTOM", label: "Custom" },
                ]}
              />
              {rangeMode === "CUSTOM" ? (
                <div className={styles.customRange}>
                  <input className={styles.dateInput} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                  <span className={styles.rangeDash}>–</span>
                  <input className={styles.dateInput} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              ) : null}
            </div>

            <div className={styles.pendingBar}>
              <div className={styles.pendingMeta}>
                Pending rules: <span className={styles.pendingCount}>{queuedCount}</span>
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={queuedCount === 0 || isApplying}
                onClick={() => void handleApply()}
              >
                Apply rules
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={queuedCount === 0 || isApplying}
                onClick={() => setPendingRules({})}
              >
                Reset
              </button>
            </div>
          </div>

          {lastApply ? (
            <div className={styles.applySummary}>
              <div>
                Applied {lastApply.createdRuleIds.length} rules → categorized {lastApply.updated} transactions.
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isApplying}
                onClick={() => void handleRevertLastApply()}
              >
                Revert run
              </button>
            </div>
          ) : null}
        </div>

        <div className={styles.content}>
          <div className={styles.listPane}>
            <div className={styles.tableHeader}>
              <div>Vendor</div>
              <div>Stats</div>
              <div>Category</div>
              <div />
            </div>

            <div className={styles.list} role="region" aria-label="Vendor clusters">
              {isLoading ? <div className={styles.loading}>Loading…</div> : null}
              {!isLoading && clusters.length === 0 ? (
                <div className={styles.empty}>No clusters match your filters.</div>
              ) : null}

              {clusters.length ? (
                <Virtuoso
                  data={clusters}
                  itemContent={renderRow}
                  style={{ height: "100%" }}
                />
              ) : null}
            </div>
          </div>

          <div className={styles.drawerPane} aria-label="Rule builder">
            {!selectedCluster ? (
              <div className={styles.drawerEmpty}>
                <div className={styles.drawerTitle}>Rule Builder</div>
                <div className={styles.drawerHint}>Select a vendor cluster → Review.</div>
              </div>
            ) : (
              <div className={styles.drawer}>
                <div className={styles.drawerHeader}>
                  <div>
                    <div className={styles.drawerTitle}>{selectedCluster.vendorLabel}</div>
                    <div className={styles.drawerHint}>
                      Preview: will affect <span className={styles.inlineStrong}>{builderAffectsCount}</span> transactions
                    </div>
                  </div>
                  <button type="button" className={styles.drawerClose} onClick={() => setSelectedVendorKey(null)} aria-label="Close">
                    ×
                  </button>
                </div>

                <div className={styles.drawerBody}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Match</span>
                    <HqSelect
                      value={builderMatchType}
                      onValueChange={(v) => setBuilderMatchType(v as MatchType)}
                      ariaLabel="Match type"
                      options={[
                        { value: "contains", label: "contains" },
                        { value: "startsWith", label: "starts with" },
                        { value: "exact", label: "exact" },
                        { value: "regex", label: "regex" },
                      ]}
                    />
                  </label>

                  {builderMatchType === "regex" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Regex</span>
                      <input className={styles.input} value={builderRegex} onChange={(e) => setBuilderRegex(e.target.value)} placeholder="e.g. \\b(UBER|LYFT)\\b" />
                    </label>
                  ) : null}

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Scope</span>
                    <HqSelect
                      value={builderScope}
                      onValueChange={(v) => setBuilderScope(v as RuleScope)}
                      ariaLabel="Scope"
                      options={[
                        { value: "org", label: "org-wide" },
                        { value: "account", label: "this account" },
                        { value: "card", label: "this card" },
                      ]}
                    />
                  </label>

                  {builderScope === "account" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Account</span>
                      <HqSelect
                        value={builderAccountId}
                        onValueChange={setBuilderAccountId}
                        ariaLabel="Account"
                        options={[
                          { value: "", label: "Select…", disabled: true },
                          ...accounts.map((a) => ({
                            value: a.accountId,
                            label: `${a.name ?? a.accountName} · ${a.institution}`,
                          })),
                        ]}
                      />
                    </label>
                  ) : null}

                  {builderScope === "card" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Card last 4</span>
                      <input
                        className={styles.input}
                        value={builderCardLast4}
                        onChange={(e) => setBuilderCardLast4(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                        placeholder="1234"
                      />
                    </label>
                  ) : null}

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Category</span>
                    <HqSelect
                      value={builderCategoryId}
                      onValueChange={(v) => setBuilderCategoryId(v as HqCategoryId)}
                      ariaLabel="Category"
                      options={categoryOptions}
                    />
                  </label>

                  <div className={styles.previewExamples}>
                    <div className={styles.previewTitle}>Examples</div>
                    {selectedCluster.examples.length ? (
                      selectedCluster.examples.map((t) => (
                        <div key={`${t.postedAt}-${t.dedupeHash}`} className={styles.exampleLine}>
                          {t.type.replace(/_/g, " ")} — {formatShortDate(t.postedAt)} — {currencyPrecise.format(Math.abs(t.amount))}
                        </div>
                      ))
                    ) : (
                      <div className={styles.drawerHint}>No examples available.</div>
                    )}
                  </div>
                </div>

                <div className={styles.drawerFooter}>
                  <button type="button" className={styles.primaryButton} onClick={handleSaveBuilder} disabled={isApplying}>
                    Save to pending
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {isMobile && selectedCluster ? (
          <div className={styles.mobileDrawerOverlay} role="dialog" aria-label="Rule Builder">
            <div className={styles.mobileDrawerHeader}>
              <button type="button" className={styles.mobileBack} onClick={() => setSelectedVendorKey(null)}>
                Back
              </button>
              <div className={styles.mobileDrawerTitle}>{selectedCluster.vendorLabel}</div>
              <button type="button" className={styles.mobileClose} onClick={onRequestClose} aria-label="Close">
                ×
              </button>
            </div>

            <div className={styles.mobileDrawerBody}>
              <div className={styles.drawerHint}>
                Preview: will affect <span className={styles.inlineStrong}>{builderAffectsCount}</span> transactions
              </div>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Match</span>
                <HqSelect
                  value={builderMatchType}
                  onValueChange={(v) => setBuilderMatchType(v as MatchType)}
                  ariaLabel="Match type"
                  options={[
                    { value: "contains", label: "contains" },
                    { value: "startsWith", label: "starts with" },
                    { value: "exact", label: "exact" },
                    { value: "regex", label: "regex" },
                  ]}
                />
              </label>

              {builderMatchType === "regex" ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Regex</span>
                  <input className={styles.input} value={builderRegex} onChange={(e) => setBuilderRegex(e.target.value)} />
                </label>
              ) : null}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Scope</span>
                <HqSelect
                  value={builderScope}
                  onValueChange={(v) => setBuilderScope(v as RuleScope)}
                  ariaLabel="Scope"
                  options={[
                    { value: "org", label: "org-wide" },
                    { value: "account", label: "this account" },
                    { value: "card", label: "this card" },
                  ]}
                />
              </label>

              {builderScope === "account" ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Account</span>
                  <HqSelect
                    value={builderAccountId}
                    onValueChange={setBuilderAccountId}
                    ariaLabel="Account"
                    options={[
                      { value: "", label: "Select…", disabled: true },
                      ...accounts.map((a) => ({
                        value: a.accountId,
                        label: `${a.name ?? a.accountName} · ${a.institution}`,
                      })),
                    ]}
                  />
                </label>
              ) : null}

              {builderScope === "card" ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Card last 4</span>
                  <input
                    className={styles.input}
                    value={builderCardLast4}
                    onChange={(e) => setBuilderCardLast4(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                    placeholder="1234"
                  />
                </label>
              ) : null}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Category</span>
                <HqSelect
                  value={builderCategoryId}
                  onValueChange={(v) => setBuilderCategoryId(v as HqCategoryId)}
                  ariaLabel="Category"
                  options={categoryOptions}
                />
              </label>

              <div className={styles.previewExamples}>
                <div className={styles.previewTitle}>Examples</div>
                {selectedCluster.examples.slice(0, 5).map((t) => (
                  <div key={`${t.postedAt}-${t.dedupeHash}`} className={styles.exampleLine}>
                    {t.type.replace(/_/g, " ")} — {formatShortDate(t.postedAt)} — {currencyPrecise.format(Math.abs(t.amount))}
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.mobileDrawerFooter}>
              <button type="button" className={styles.primaryButton} onClick={handleSaveBuilder} disabled={isApplying}>
                Save to pending
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    root
  );
};

export default CategorizationSpellbookSheet;
