import React from "react";
import { createPortal } from "react-dom";
import { Virtuoso } from "react-virtuoso";
import { toast } from "react-toastify";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import useModalStack from "@/shared/utils/useModalStack";
import { HQ_CATEGORIES, HQ_CATEGORY_LABEL } from "@/hq/lib/hqCategories";
import {
  applyHqCategoryRules,
  createHqCategoryRule,
  deleteHqCategoryRule,
  fetchHqSummary,
  fetchHqTransactions,
  deleteHqImportRun,
  resetHqData,
  fetchHqVendorCounts,
  fetchHqVendorMatches,
} from "@/hq/lib/hqApi";
import { hydrateHqState, readHqState, useHqStore } from "@/hq/lib/hqStore";
import { suggestCategory, suggestCategoryFromUserRules } from "@/hq/lib/hqCategorization";
import { cleanVendorLabel, getVendorKeyForTxn, normalizeVendorKey } from "@/hq/lib/vendorNormalization";

import type { HqCategoryId, HqTransaction } from "@/hq/types";
import styles from "./CategorizationSpellbookSheet.module.css";
import HqSelect from "@/hq/components/HqSelect";

type MatchType = "contains" | "startsWith" | "exact" | "regex";
type RuleScope = "org" | "account" | "card";
type TimeScope = "range" | "all-historical" | "future-only";

type DirectionGuard = "any" | "out" | "in";
type MethodGuard = "any" | "ach" | "card" | "wire" | "check" | "transfer";
type ApplyMode = "uncategorized" | "overwrite";

type VendorCluster = {
  vendorKey: string;
  vendorLabel: string;
  clusterType: "Vendor" | "Person" | "Payroll" | "Contractor" | "Owner" | "Transfer" | "Bank Fee" | "Tax" | "Unknown";
  count: number;
  totalAbs: number;
  totalOutflow: number;
  totalInflow: number;
  lastSeen: string;
  examples: HqTransaction[];
  exampleAccountId?: string;
  suggestedCategoryId: HqCategoryId;
  suggestedConfidence: number;
  suggestedReason: string;
  isRecurringCandidate: boolean;
  hasAnyUncategorized: boolean;
};

type PendingRule = {
  vendorKey: string;
  vendorLabel: string;
  patternText: string;
  categoryId: HqCategoryId;
  matchType: MatchType;
  scope: RuleScope;
  accountId?: string;
  cardLast4?: string;
  regexPattern?: string;
  direction?: DirectionGuard;
  method?: MethodGuard;
  applyMode?: ApplyMode;
  applyWindow?: { from?: string; to?: string; accountId?: string };
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
  patternText: string;
  regexPattern?: string;
}): { apiMatchType: "vendor" | "regex"; pattern: string } {
  if (input.matchType === "exact") {
    return { apiMatchType: "vendor", pattern: input.patternText };
  }

  if (input.matchType === "regex") {
    return { apiMatchType: "regex", pattern: String(input.regexPattern || "").trim() };
  }

  const escaped = escapeRegExp(input.patternText);
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

function inferClusterType(label: string, txns: HqTransaction[]): VendorCluster["clusterType"] {
  const upper = String(label || "").toUpperCase();
  const anyInternal = txns.some((t) => Boolean(t.isInternalTransfer));
  if (anyInternal) return "Transfer";

  if (txns.some((t) => t.type === "fee")) return "Bank Fee";

  if (/\b(IRS|TAX|FRANCHISE\s+TAX|SALES\s+TAX)\b/i.test(upper)) return "Tax";
  if (/\b(GUSTO|ADP|PAYCHEX|PAYROLL)\b/i.test(upper)) return "Payroll";
  if (/\b(CONTRACTOR|1099|UPWORK|FIVERR)\b/i.test(upper)) return "Contractor";
  if (/\b(OWNER\s*DRAW|DRAW|DISTRIBUTION|OWNER)\b/i.test(upper)) return "Owner";

  // Light person heuristic: "Name (Contractor)" etc, or single-token capitalized name.
  if (/\(.+\)/.test(label) && /\b(CONTRACTOR|1099)\b/i.test(label)) return "Contractor";
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/.test(label)) return "Person";

  if (!label || label === "Unknown") return "Unknown";
  return "Vendor";
}

function inferMethodForTxn(txn: Pick<HqTransaction, "type" | "cardLast4" | "isInternalTransfer" | "normalizedDescription" | "rawDescription">): Exclude<MethodGuard, "any"> {
  const type = String(txn.type || "unknown").toLowerCase();
  if (txn.cardLast4 || type === "card_purchase") return "card";
  if (type === "wire") return "wire";
  if (txn.isInternalTransfer || type === "transfer" || type === "zelle") return "transfer";

  const upper = String(txn.normalizedDescription || txn.rawDescription || "").toUpperCase();
  if (upper.includes("CHECK")) return "check";

  if (type === "recurring" || type === "deposit") return "ach";
  return "ach";
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
  patternText: string;
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
}): number {
  const { apiMatchType, pattern } = buildRulePattern({
    matchType: input.matchType,
    patternText: input.patternText,
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

    if (input.direction && input.direction !== "any" && t.direction !== input.direction) return false;

    if (input.method && input.method !== "any") {
      if (inferMethodForTxn(t) !== input.method) return false;
    }

    const abs = Math.abs(t.amount || 0);
    if (Number.isFinite(Number(input.amountMin)) && input.amountMin !== undefined && abs < input.amountMin) return false;
    if (Number.isFinite(Number(input.amountMax)) && input.amountMax !== undefined && abs > input.amountMax) return false;

    if (input.applyMode === "uncategorized" && !isUncategorized(t)) return false;

    if (apiMatchType === "vendor") {
      const label = cleanVendorLabel({ vendor: t.vendor, counterparty: t.counterparty, rawDescription: t.rawDescription });
      return normalizeVendorKey(label) === normalizeVendorKey(input.patternText);
    }

    const haystack = `${cleanVendorLabel({ vendor: t.vendor, counterparty: t.counterparty, rawDescription: t.rawDescription })} ${t.normalizedDescription || ""}`;
    return Boolean(re?.test(haystack));
  }).length;
}

const CategorizationSpellbookSheet: React.FC<Props> = ({ orgId, isOpen, importRunId, onRequestClose }) => {
  const accounts = useHqStore(orgId, (s) => s.accounts);
  const importRuns = useHqStore(orgId, (s) => s.importRuns);
  const categoryRules = useHqStore(orgId, (s) => s.categoryRules);
  const cachedTxns = useHqStore(orgId, (s) => s.transactions);

  const [isLoading, setIsLoading] = React.useState(false);
  const [txns, setTxns] = React.useState<HqTransaction[]>([]);

  const [query, setQuery] = React.useState("");
  const [filterUncategorizedOnly, setFilterUncategorizedOnly] = React.useState(true);
  const [filterLowConfidence, setFilterLowConfidence] = React.useState(false);
  const [filterRecurring, setFilterRecurring] = React.useState(false);
  const [filterType, setFilterType] = React.useState<"all" | VendorCluster["clusterType"]>("all");

  const [rangeMode, setRangeMode] = React.useState<"YTD" | "12MO" | "CUSTOM">("YTD");
  const [customFrom, setCustomFrom] = React.useState<string>("");
  const [customTo, setCustomTo] = React.useState<string>("");

  const [pendingRules, setPendingRules] = React.useState<Record<string, PendingRule>>({});
  const [selectedVendorKey, setSelectedVendorKey] = React.useState<string | null>(null);

  const [isMobile, setIsMobile] = React.useState(false);

  const [isShredMenuOpen, setIsShredMenuOpen] = React.useState(false);
  const [confirmShredAction, setConfirmShredAction] = React.useState<
    null | "delete-import-run" | "delete-bank-txns-keep-accounts-rules" | "delete-everything"
  >(null);
  const [isShredding, setIsShredding] = React.useState(false);

  const [isApplying, setIsApplying] = React.useState(false);
  const [lastApply, setLastApply] = React.useState<
    | null
    | {
        createdRuleIds: string[];
        updated: number;
      }
  >(null);

  // "Apply to similar?" prompt state
  const [applyToSimilarPrompt, setApplyToSimilarPrompt] = React.useState<{
    cluster: VendorCluster;
    categoryId: HqCategoryId;
    counts: { inView: number; totalAllAccounts?: number; totalThisAccount?: number };
    applyScope: "inView" | "allAccounts" | "thisAccount";
  } | null
  >(null);

  const [totalCountsByVendorKey, setTotalCountsByVendorKey] = React.useState<Record<string, number>>({});

  const [reviewIncludeCategorized, setReviewIncludeCategorized] = React.useState(true);
  const [reviewRange, setReviewRange] = React.useState<"YTD" | "12MO" | "ALL">("YTD");
  const [reviewAccountScope, setReviewAccountScope] = React.useState<"all" | "this">("all");
  const [reviewMatches, setReviewMatches] = React.useState<HqTransaction[]>([]);
  const [reviewCountInScope, setReviewCountInScope] = React.useState<number | null>(null);
  const [reviewCountTotal, setReviewCountTotal] = React.useState<number | null>(null);
  const [reviewLoading, setReviewLoading] = React.useState(false);

  const importRunAccountId = React.useMemo(() => {
    if (!importRunId) return "";
    const run = importRuns.find((r) => r.importRunId === importRunId);
    return run?.accountId || "";
  }, [importRunId, importRuns]);

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
    setIsShredMenuOpen(false);
    setConfirmShredAction(null);
    setApplyToSimilarPrompt(null);
  }, [isOpen, importRunId]);

  const handleShredAction = React.useCallback(
    async (action: "delete-import-run" | "delete-bank-txns-keep-accounts-rules" | "delete-everything") => {
      if (isShredding) return;

      setIsShredding(true);
      setIsShredMenuOpen(false);
      setConfirmShredAction(null);

      try {
        if (action === "delete-import-run") {
          await deleteHqImportRun(orgId, importRunId as string);
          toast.success("Removed CSV dataset.");
          window.dispatchEvent(new Event("mylg:hq-refresh"));
          onRequestClose();
          return;
        }

        if (action === "delete-bank-txns-keep-accounts-rules") {
          await resetHqData(orgId, "keepAccountsRulesAndImports");
          toast.success("Removed bank-synced transactions. Kept accounts + rules + CSV imports.");
        }

        if (action === "delete-everything") {
          await resetHqData(orgId, "all");
          toast.success("Removed everything.");
        }

        setPendingRules({});
        setSelectedVendorKey(null);
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
        toast.error(err instanceof Error ? err.message : "Could not remove data.");
      } finally {
        setIsShredding(false);
      }
    },
    [importRunId, isShredding, orgId, onRequestClose]
  );

  const requestConfirmOrRun = React.useCallback(
    (action: "delete-import-run" | "delete-bank-txns-keep-accounts-rules" | "delete-everything") => {
      if (isShredding) return;
      if (confirmShredAction !== action) {
        setConfirmShredAction(action);
        return;
      }
      void handleShredAction(action);
    },
    [confirmShredAction, handleShredAction, isShredding]
  );

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
      if (fromIso && t.postedAt < fromIso) return false;
      if (toIso && t.postedAt > toIso) return false;
      return true;
    };

    const withinRange = txns.filter(filterTxn);
    if (withinRange.length) return withinRange;

    return cachedTxns.filter(filterTxn);
  }, [cachedTxns, fromIso, toIso, txns]);

  const viewTxns = React.useMemo(() => {
    return filterUncategorizedOnly ? baseTxns.filter((t) => isUncategorized(t)) : baseTxns;
  }, [baseTxns, filterUncategorizedOnly]);

  const inViewCountsByVendorKey = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const txn of viewTxns) {
      const { vendorKey } = getVendorKeyForTxn(txn);
      const key = vendorKey || "unknown";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [viewTxns]);

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
      const exampleAccountId = txnsSorted[0]?.accountId;
      const count = g.txns.length;
      const totalOutflow = g.txns
        .filter((t) => t.direction === "out")
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
      const totalInflow = g.txns
        .filter((t) => t.direction === "in")
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
      const totalAbs = g.txns.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
      const lastSeen = txnsSorted[0]?.postedAt || "";

      const hasAnyUncategorized = g.txns.some((t) => isUncategorized(t));
      const recurring = inferRecurringCandidate(g.txns);

      const suggestion = guessSuggestedCategory(g.txns.slice(0, 20), categoryRules);

      const clusterType = inferClusterType(g.vendorLabel, g.txns);

      out.push({
        vendorKey,
        vendorLabel: g.vendorLabel,
        clusterType,
        count,
        totalAbs,
        totalOutflow,
        totalInflow,
        lastSeen,
        examples,
        exampleAccountId,
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
        if (filterType !== "all" && c.clusterType !== filterType) return false;
        if (q && !c.vendorLabel.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const ap = pendingRules[a.vendorKey];
        const bp = pendingRules[b.vendorKey];
        if (ap && !bp) return -1;
        if (!ap && bp) return 1;
        return b.totalAbs - a.totalAbs;
      });
  }, [baseTxns, categoryRules, filterLowConfidence, filterRecurring, filterType, filterUncategorizedOnly, pendingRules, query]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (!clusters.length) return;

    const keys = Array.from(new Set(clusters.map((c) => c.vendorKey).filter(Boolean))).slice(0, 80);
    const missing = keys.filter((k) => totalCountsByVendorKey[k] === undefined);
    if (!missing.length) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchHqVendorCounts(orgId, { vendorKeys: missing, includeCategorized: true });
        if (cancelled) return;
        setTotalCountsByVendorKey((prev) => ({ ...prev, ...(res.counts || {}) }));
      } catch {
        // best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clusters, isOpen, orgId, totalCountsByVendorKey]);

  const categoryOptions = React.useMemo(
    () => HQ_CATEGORIES.filter((c) => c.id !== "TRANSFERS").map((c) => ({ value: c.id, label: c.label })),
    []
  );

  const selectedCluster = React.useMemo(() => {
    if (!selectedVendorKey) return null;
    return clusters.find((c) => c.vendorKey === selectedVendorKey) || null;
  }, [clusters, selectedVendorKey]);

  const selectedClusterInViewCount = React.useMemo(() => {
    if (!selectedCluster) return 0;
    return inViewCountsByVendorKey.get(selectedCluster.vendorKey) || 0;
  }, [inViewCountsByVendorKey, selectedCluster]);

  const selectedClusterTotalCount = React.useMemo(() => {
    if (!selectedCluster) return undefined;
    return totalCountsByVendorKey[selectedCluster.vendorKey];
  }, [selectedCluster, totalCountsByVendorKey]);

  const reviewAccountOptions = React.useMemo(() => {
    const opts: Array<{ value: "all" | "this"; label: string }> = [{ value: "all", label: "All accounts" }];
    if (selectedCluster?.exampleAccountId) opts.push({ value: "this", label: "This account" });
    return opts;
  }, [selectedCluster?.exampleAccountId]);

  const queuedCount = Object.keys(pendingRules).length;

  // Calculate match count for a cluster with a given category
  const getMatchCountForCluster = React.useCallback(
    (cluster: VendorCluster): number => {
      return inViewCountsByVendorKey.get(cluster.vendorKey) || 0;
    },
    [inViewCountsByVendorKey]
  );

  // Show the "Apply to similar?" prompt when user changes category inline
  const handleCategoryChangeFromRow = React.useCallback(
    (cluster: VendorCluster, categoryId: HqCategoryId) => {
      const inView = getMatchCountForCluster(cluster);
      const totalAllAccounts = totalCountsByVendorKey[cluster.vendorKey];

      setApplyToSimilarPrompt({
        cluster,
        categoryId,
        counts: { inView, totalAllAccounts },
        applyScope: "inView",
      });

      const accountId = cluster.exampleAccountId || "";
      if (!accountId) return;

      void (async () => {
        try {
          const res = await fetchHqVendorCounts(orgId, {
            vendorKeys: [cluster.vendorKey],
            includeCategorized: true,
            accountId,
          });
          const totalThisAccount = res.counts?.[cluster.vendorKey];
          setApplyToSimilarPrompt((prev) => {
            if (!prev) return prev;
            if (prev.cluster.vendorKey !== cluster.vendorKey) return prev;
            return {
              ...prev,
              counts: {
                ...prev.counts,
                totalThisAccount: typeof totalThisAccount === "number" ? totalThisAccount : prev.counts.totalThisAccount,
              },
            };
          });
        } catch {
          // ignore
        }
      })();
    },
    [getMatchCountForCluster, orgId, totalCountsByVendorKey]
  );

  // Confirm and queue rule from prompt
  const handleConfirmApplyToSimilar = React.useCallback(() => {
    if (!applyToSimilarPrompt) return;
    const { cluster, categoryId, applyScope } = applyToSimilarPrompt;

    const applyWindow: PendingRule["applyWindow"] =
      applyScope === "inView"
        ? { from: fromIso, to: toIso }
        : applyScope === "thisAccount" && cluster.exampleAccountId
          ? { accountId: cluster.exampleAccountId }
          : undefined;

    setPendingRules((prev) => ({
      ...prev,
      [cluster.vendorKey]: {
        vendorKey: cluster.vendorKey,
        vendorLabel: cluster.vendorLabel,
        patternText: cluster.vendorKey,
        categoryId,
        matchType: "exact",
        scope: "org",
        direction: "any",
        method: "any",
        applyMode: "uncategorized",
        applyWindow,
      },
    }));
    setApplyToSimilarPrompt(null);
    toast.success(`Queued rule for "${cluster.vendorLabel}" → ${HQ_CATEGORY_LABEL[categoryId]}`);
  }, [applyToSimilarPrompt, fromIso, toIso]);

  // Review matches from prompt → open the drawer
  const handleReviewFromPrompt = React.useCallback(() => {
    if (!applyToSimilarPrompt) return;
    setSelectedVendorKey(applyToSimilarPrompt.cluster.vendorKey);
    setApplyToSimilarPrompt(null);
  }, [applyToSimilarPrompt]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (!selectedCluster) return;

    // Default review scope explains "why you only see 1".
    setReviewIncludeCategorized(!filterUncategorizedOnly);
    setReviewRange(rangeMode === "12MO" ? "12MO" : rangeMode === "YTD" ? "YTD" : "ALL");
    setReviewAccountScope("all");
  }, [filterUncategorizedOnly, isOpen, rangeMode, selectedCluster]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (!selectedCluster) return;

    const vendorKey = selectedCluster.vendorKey;
    const todayIso = new Date().toISOString().slice(0, 10);
    const ytdFrom = `${new Date().getUTCFullYear()}-01-01`;
    const twelveMoFrom = (() => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      return d.toISOString().slice(0, 10);
    })();

    const from = reviewRange === "YTD" ? ytdFrom : reviewRange === "12MO" ? twelveMoFrom : undefined;
    const to = reviewRange === "ALL" ? undefined : todayIso;
    const accountId = reviewAccountScope === "this" ? selectedCluster.exampleAccountId : undefined;

    let cancelled = false;
    setReviewLoading(true);

    void (async () => {
      try {
        const [inScope, totalAll] = await Promise.all([
          fetchHqVendorCounts(orgId, {
            vendorKeys: [vendorKey],
            from,
            to,
            includeCategorized: reviewIncludeCategorized,
            ...(accountId ? { accountId } : {}),
          }),
          fetchHqVendorCounts(orgId, { vendorKeys: [vendorKey], includeCategorized: true }),
        ]);
        if (cancelled) return;

        setReviewCountInScope(typeof inScope.counts?.[vendorKey] === "number" ? inScope.counts[vendorKey] : 0);
        setReviewCountTotal(typeof totalAll.counts?.[vendorKey] === "number" ? totalAll.counts[vendorKey] : 0);

        const res = await fetchHqVendorMatches(orgId, {
          vendorKey,
          from,
          to,
          includeCategorized: reviewIncludeCategorized,
          ...(accountId ? { accountId } : {}),
          limit: 30,
        });
        if (cancelled) return;
        setReviewMatches(Array.isArray(res.matches) ? res.matches : []);
      } catch {
        if (!cancelled) {
          setReviewMatches([]);
          setReviewCountInScope(null);
          setReviewCountTotal(null);
        }
      } finally {
        if (!cancelled) setReviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, orgId, reviewAccountScope, reviewIncludeCategorized, reviewRange, selectedCluster]);

  const handleApply = React.useCallback(async () => {
    if (queuedCount === 0) return;
    setIsApplying(true);

    try {
      const createdRuleIds: Array<{ ruleId: string; applyWindow?: PendingRule["applyWindow"] }> = [];

      for (const rule of Object.values(pendingRules)) {
        const { apiMatchType, pattern } = buildRulePattern({
          matchType: rule.matchType,
          patternText: rule.patternText || rule.vendorLabel,
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
          direction: rule.direction && rule.direction !== "any" ? rule.direction : undefined,
          method: rule.method && rule.method !== "any" ? rule.method : undefined,
          applyMode: rule.applyMode,
          amountMin: rule.amountMin,
          amountMax: rule.amountMax,
          frequencyHint: rule.frequencyHint,
        });

        createdRuleIds.push({ ruleId: created.rule.ruleId, applyWindow: rule.applyWindow });
      }

      const groups = new Map<string, { ruleIds: string[]; from?: string; to?: string; accountId?: string }>();
      for (const r of createdRuleIds) {
        const w = r.applyWindow || {};
        const key = `${w.from || ""}|${w.to || ""}|${w.accountId || ""}`;
        const g = groups.get(key) || { ruleIds: [], from: w.from, to: w.to, accountId: w.accountId };
        g.ruleIds.push(r.ruleId);
        groups.set(key, g);
      }

      let updatedTotal = 0;
      for (const g of groups.values()) {
        const applied = await applyHqCategoryRules(orgId, {
          ruleIds: g.ruleIds,
          from: g.from,
          to: g.to,
          accountId: g.accountId,
        });
        updatedTotal += applied.updated || 0;
      }

      toast.success(`Applied ${createdRuleIds.length} rules. Updated ${updatedTotal} transactions.`);
      setLastApply({ createdRuleIds: createdRuleIds.map((r) => r.ruleId), updated: updatedTotal });
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
  }, [orgId, pendingRules, queuedCount]);

  const handleRevertLastApply = React.useCallback(async () => {
    if (!lastApply?.createdRuleIds?.length) return;
    setIsApplying(true);

    try {
      for (const ruleId of lastApply.createdRuleIds) {
        await deleteHqCategoryRule(orgId, ruleId);
      }

      const applied = await applyHqCategoryRules(orgId, {});

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
  }, [lastApply, orgId]);

  const renderRow = React.useCallback(
    (index: number, cluster: VendorCluster) => {
      void index;
      const pending = pendingRules[cluster.vendorKey];
      const isSelected = selectedVendorKey === cluster.vendorKey;

      const inViewCount = inViewCountsByVendorKey.get(cluster.vendorKey) || 0;
      const totalCount = typeof totalCountsByVendorKey[cluster.vendorKey] === "number" ? totalCountsByVendorKey[cluster.vendorKey] : null;

      const currentCategory = pending?.categoryId || cluster.suggestedCategoryId || "OTHER";

      const reasonText = describeReason(cluster.suggestedReason);
      const confidencePct = Math.round(cluster.suggestedConfidence * 100);

      const exampleLine = cluster.examples[0]
        ? `${cluster.examples[0].type.replace(/_/g, " ")} — ${formatShortDate(cluster.examples[0].postedAt)} — ${currencyPrecise.format(
            Math.abs(cluster.examples[0].amount)
          )}`
        : "—";

      const rowClasses = [
        styles.row,
        pending ? styles.rowPending : "",
        isSelected ? styles.rowSelected : "",
      ].filter(Boolean).join(" ");

      return (
        <div
          className={rowClasses}
          role="button"
          tabIndex={0}
          onClick={() => setSelectedVendorKey(cluster.vendorKey)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSelectedVendorKey(cluster.vendorKey);
            }
          }}
        >
          <button
            type="button"
            className={styles.vendorCell}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedVendorKey(cluster.vendorKey);
            }}
          >
            <div className={styles.vendorTop}>
              <span className={styles.vendorName} title={cluster.vendorLabel}>
                {cluster.vendorLabel}
              </span>
              <span className={styles.typeChip} data-type={cluster.clusterType}>
                {cluster.clusterType}
              </span>
            </div>
            <div className={styles.vendorHint} title={cluster.examples[0]?.rawDescription || ""}>
              {exampleLine}
            </div>
          </button>

          <div className={styles.metricsCell}>
            <div className={styles.metricStrong}>{inViewCount} in view</div>
            <div className={styles.metricMuted}>{totalCount === null ? "…" : totalCount} total</div>
            <div className={styles.metricMuted}>{currencyCompact.format(cluster.totalAbs)}</div>
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
                onValueChange={(v) => handleCategoryChangeFromRow(cluster, v as HqCategoryId)}
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
              className={styles.previewButton}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedVendorKey(cluster.vendorKey);
              }}
            >
              Preview matches
            </button>
          </div>
        </div>
      );
    },
    [categoryOptions, handleCategoryChangeFromRow, inViewCountsByVendorKey, isApplying, pendingRules, selectedVendorKey, totalCountsByVendorKey]
  );

  const [builderMatchType, setBuilderMatchType] = React.useState<MatchType>("contains");
  const [builderScope, setBuilderScope] = React.useState<RuleScope>("org");
  const [builderTimeScope, setBuilderTimeScope] = React.useState<TimeScope>("range");
  const [builderAccountId, setBuilderAccountId] = React.useState<string>("");
  const [builderCardLast4, setBuilderCardLast4] = React.useState<string>("");
  const [builderCategoryId, setBuilderCategoryId] = React.useState<HqCategoryId>("OTHER");
  const [builderPatternText, setBuilderPatternText] = React.useState<string>("");
  const [builderRegex, setBuilderRegex] = React.useState<string>("");
  const [builderDirection, setBuilderDirection] = React.useState<DirectionGuard>("any");
  const [builderMethod, setBuilderMethod] = React.useState<MethodGuard>("any");
  const [builderApplyMode, setBuilderApplyMode] = React.useState<ApplyMode>("uncategorized");
  const [builderAmountMin, setBuilderAmountMin] = React.useState<string>("");
  const [builderAmountMax, setBuilderAmountMax] = React.useState<string>("");
  const [builderFrequency, setBuilderFrequency] = React.useState<PendingRule["frequencyHint"] | "">("");

  type TemplateId = "owner-draw" | "payroll" | "contractor" | "internal-transfer" | "bank-fee" | "tax-payment";

  const applyTemplate = React.useCallback(
    (template: TemplateId) => {
      if (!selectedCluster) return;

      setBuilderScope("org");
      setBuilderAccountId("");
      setBuilderCardLast4("");
      setBuilderMatchType("contains");
      setBuilderPatternText(selectedCluster.vendorLabel);
      setBuilderRegex("");
      setBuilderAmountMin("");
      setBuilderAmountMax("");
      setBuilderFrequency("");
      setBuilderApplyMode("uncategorized");
      setBuilderDirection("any");
      setBuilderMethod("any");

      if (template === "payroll") {
        setBuilderCategoryId("PAYROLL_W2");
        setBuilderDirection("out");
        setBuilderMethod("ach");
        setBuilderFrequency("biweekly");
        return;
      }

      if (template === "contractor") {
        setBuilderCategoryId("CONTRACTORS_1099");
        setBuilderDirection("out");
        setBuilderMethod("ach");
        return;
      }

      if (template === "owner-draw") {
        setBuilderCategoryId("OWNER_DRAW");
        setBuilderDirection("out");
        setBuilderMethod("transfer");
        return;
      }

      if (template === "internal-transfer") {
        setBuilderCategoryId("TRANSFER_INTERNAL");
        setBuilderMethod("transfer");
        setBuilderApplyMode("overwrite");
        return;
      }

      if (template === "bank-fee") {
        setBuilderCategoryId("BANK_FEES");
        setBuilderDirection("out");
        return;
      }

      if (template === "tax-payment") {
        setBuilderCategoryId("ESTIMATED_TAXES");
        setBuilderDirection("out");
        return;
      }
    },
    [selectedCluster]
  );

  React.useEffect(() => {
    if (!selectedCluster) return;
    const pending = pendingRules[selectedCluster.vendorKey];
    if (pending) return;

    // “Magic” auto-template: payroll/owner/transfer snap-in.
    if (selectedCluster.clusterType === "Payroll") applyTemplate("payroll");
    else if (selectedCluster.clusterType === "Owner") applyTemplate("owner-draw");
    else if (selectedCluster.clusterType === "Transfer") applyTemplate("internal-transfer");
  }, [applyTemplate, pendingRules, selectedCluster]);

  React.useEffect(() => {
    if (!selectedCluster) return;
    const pending = pendingRules[selectedCluster.vendorKey];
    setBuilderMatchType(pending?.matchType || "contains");
    setBuilderScope(pending?.scope || "org");
    setBuilderAccountId(pending?.accountId || "");
    setBuilderCardLast4(pending?.cardLast4 || "");
    setBuilderCategoryId(pending?.categoryId || selectedCluster.suggestedCategoryId || "OTHER");
    setBuilderPatternText(pending?.patternText || selectedCluster.vendorLabel);
    setBuilderRegex(pending?.regexPattern || "");
    setBuilderDirection(pending?.direction || "any");
    setBuilderMethod(pending?.method || "any");
    setBuilderApplyMode(pending?.applyMode || "uncategorized");
    setBuilderAmountMin(pending?.amountMin !== undefined ? String(pending.amountMin) : "");
    setBuilderAmountMax(pending?.amountMax !== undefined ? String(pending.amountMax) : "");
    setBuilderFrequency(pending?.frequencyHint || "");
  }, [pendingRules, selectedCluster]);

  const builderMatchPreview = React.useMemo(() => {
    if (!selectedCluster) {
      return { matches: [] as HqTransaction[], matchesTotal: 0, affectsCount: 0, conflictCount: 0, hasInvalidRegex: false };
    }

    const patternText = (builderPatternText || selectedCluster.vendorLabel).trim();
    const regexPattern = builderMatchType === "regex" ? String(builderRegex || "").trim() : "";

    let re: RegExp | null = null;
    if (builderMatchType === "regex") {
      try {
        re = new RegExp(regexPattern, "i");
      } catch {
        return { matches: [], matchesTotal: 0, affectsCount: 0, conflictCount: 0, hasInvalidRegex: true };
      }
    } else {
      const { apiMatchType, pattern } = buildRulePattern({
        matchType: builderMatchType,
        patternText,
      });
      if (apiMatchType === "regex") {
        try {
          re = new RegExp(pattern, "i");
        } catch {
          return { matches: [], matchesTotal: 0, affectsCount: 0, conflictCount: 0, hasInvalidRegex: true };
        }
      }
    }

    const minAmt = builderAmountMin.trim() ? Number(builderAmountMin) : undefined;
    const maxAmt = builderAmountMax.trim() ? Number(builderAmountMax) : undefined;

    const all = baseTxns
      .filter((t) => {
        if (builderScope === "account" && builderAccountId && t.accountId !== builderAccountId) return false;
        if (builderScope === "card" && builderCardLast4 && t.cardLast4 !== builderCardLast4) return false;

        if (builderDirection !== "any" && t.direction !== builderDirection) return false;
        if (builderMethod !== "any" && inferMethodForTxn(t) !== builderMethod) return false;

        const abs = Math.abs(t.amount || 0);
        if (minAmt !== undefined && Number.isFinite(minAmt) && abs < minAmt) return false;
        if (maxAmt !== undefined && Number.isFinite(maxAmt) && abs > maxAmt) return false;

        if (builderMatchType === "exact") {
          const label = cleanVendorLabel({ vendor: t.vendor, counterparty: t.counterparty, rawDescription: t.rawDescription });
          return label.trim().toLowerCase() === patternText.toLowerCase();
        }

        const haystack = `${cleanVendorLabel({ vendor: t.vendor, counterparty: t.counterparty, rawDescription: t.rawDescription })} ${t.normalizedDescription || ""}`;
        return Boolean(re?.test(haystack));
      })
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt));

    const conflictCount = all.filter((t) => !isUncategorized(t)).length;
    const affectsCount =
      builderApplyMode === "overwrite" ? all.length : all.filter((t) => isUncategorized(t)).length;

    return {
      matches: all.slice(0, 8),
      matchesTotal: all.length,
      affectsCount,
      conflictCount,
      hasInvalidRegex: false,
    };
  }, [
    baseTxns,
    builderAccountId,
    builderApplyMode,
    builderAmountMax,
    builderAmountMin,
    builderCardLast4,
    builderDirection,
    builderMatchType,
    builderMethod,
    builderPatternText,
    builderRegex,
    builderScope,
    selectedCluster,
  ]);

  const handleSaveBuilder = React.useCallback(() => {
    if (!selectedCluster) return;

    setPendingRules((prev) => ({
      ...prev,
      [selectedCluster.vendorKey]: {
        vendorKey: selectedCluster.vendorKey,
        vendorLabel: selectedCluster.vendorLabel,
        patternText: builderPatternText || selectedCluster.vendorLabel,
        categoryId: builderCategoryId,
        matchType: builderMatchType,
        scope: builderScope,
        accountId: builderScope === "account" ? builderAccountId || undefined : undefined,
        cardLast4: builderScope === "card" ? builderCardLast4 || undefined : undefined,
        regexPattern: builderMatchType === "regex" ? builderRegex : undefined,
        direction: builderDirection,
        method: builderMethod,
        applyMode: builderApplyMode,
        amountMin: builderAmountMin.trim() ? Number(builderAmountMin) : undefined,
        amountMax: builderAmountMax.trim() ? Number(builderAmountMax) : undefined,
        frequencyHint: builderFrequency || undefined,
      },
    }));

    toast.success("Queued rule.");
  }, [
    builderAccountId,
    builderApplyMode,
    builderCardLast4,
    builderCategoryId,
    builderDirection,
    builderFrequency,
    builderMatchType,
    builderMethod,
    builderPatternText,
    builderRegex,
    builderScope,
    builderAmountMin,
    builderAmountMax,
    selectedCluster,
  ]);

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
          <div className={styles.headerActions}>
            <DropdownMenu.Root
              open={isShredMenuOpen}
              onOpenChange={(open) => {
                setIsShredMenuOpen(open);
                if (!open) setConfirmShredAction(null);
              }}
            >
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={styles.moreButton}
                  aria-label="Shred data"
                  aria-haspopup="menu"
                  aria-expanded={isShredMenuOpen}
                >
                  ⋯
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className={styles.menu}
                  sideOffset={8}
                  align="end"
                  collisionPadding={12}
                >
                  <DropdownMenu.Label className={styles.menuLabel}>Shred data</DropdownMenu.Label>
                  <div className={styles.menuHint}>Choose what to delete. Accounts stay unless you pick the full reset.</div>
                  <DropdownMenu.Separator className={styles.menuSeparator} />

                  {importRunId ? (
                    <DropdownMenu.Item asChild>
                      <button
                        type="button"
                        className={[styles.menuItem, styles.menuItemDanger].join(" ")}
                        onClick={() => requestConfirmOrRun("delete-import-run")}
                        disabled={isShredding}
                      >
                        <span className={styles.menuItemTitle}>
                          {confirmShredAction === "delete-import-run" ? "Confirm: Remove CSV dataset" : "Remove CSV dataset"}
                        </span>
                        <span className={styles.menuItemDesc}>Deletes this imported dataset. Keeps account + bank sync + rules.</span>
                      </button>
                    </DropdownMenu.Item>
                  ) : null}

                  <DropdownMenu.Item asChild>
                    <button
                      type="button"
                      className={[styles.menuItem, styles.menuItemDanger].join(" ")}
                      onClick={() => requestConfirmOrRun("delete-bank-txns-keep-accounts-rules")}
                      disabled={isShredding}
                    >
                      <span className={styles.menuItemTitle}>
                        {confirmShredAction === "delete-bank-txns-keep-accounts-rules"
                          ? "Confirm: Remove bank-synced transactions"
                          : "Remove bank-synced transactions"}
                      </span>
                      <span className={styles.menuItemDesc}>Clears only bank-synced transactions. Keeps accounts + rules + CSV imports.</span>
                    </button>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className={styles.menuSeparator} />

                  <DropdownMenu.Item asChild>
                    <button
                      type="button"
                      className={[styles.menuItem, styles.menuItemDanger].join(" ")}
                      onClick={() => requestConfirmOrRun("delete-everything")}
                      disabled={isShredding}
                    >
                      <span className={styles.menuItemTitle}>
                        {confirmShredAction === "delete-everything" ? "Confirm: Remove everything" : "Remove everything"}
                      </span>
                      <span className={styles.menuItemDesc}>Deletes account + all data + rules (rare).</span>
                    </button>
                  </DropdownMenu.Item>

                  {confirmShredAction ? (
                    <div className={styles.menuHintStrong}>Click the same action again to confirm.</div>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button type="button" className={styles.closeButton} onClick={onRequestClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <div className={styles.stickyControls}>
          <div className={styles.controlsRow}>
            <input
              className={styles.search}
              placeholder="Search payees"
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

            <div className={styles.filters}>
              {(["Owner", "Payroll", "Transfer", "Vendor"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={[styles.filterChip, filterType === t ? styles.filterChipActive : ""].filter(Boolean).join(" ")}
                  onClick={() => setFilterType((prev) => (prev === t ? "all" : t))}
                  aria-pressed={filterType === t}
                >
                  {t}
                </button>
              ))}
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

            <div className={[styles.pendingBar, queuedCount > 0 ? styles.pendingBarActive : ""].filter(Boolean).join(" ")}>
              <div className={queuedCount > 0 ? styles.pendingMeta : styles.pendingMetaQuiet}>
                Pending rules: <span className={queuedCount > 0 ? styles.pendingCount : styles.pendingCountQuiet}>{queuedCount}</span>
              </div>
              <button
                type="button"
                className={queuedCount > 0 ? styles.primaryButton : styles.secondaryButton}
                disabled={queuedCount === 0 || isApplying}
                onClick={() => void handleApply()}
              >
                {queuedCount > 0 ? `Apply ${queuedCount} rule${queuedCount > 1 ? "s" : ""}` : "Apply rules"}
              </button>
              {queuedCount > 0 && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={isApplying}
                  onClick={() => setPendingRules({})}
                >
                  Reset
                </button>
              )}
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

          {/* Apply to Similar? Prompt */}
          {applyToSimilarPrompt ? (
            <div className={styles.applyToSimilarPrompt}>
              <div className={styles.promptContent}>
                <span className={styles.promptText}>
                  Apply <strong>"{HQ_CATEGORY_LABEL[applyToSimilarPrompt.categoryId]}"</strong> to all{" "}
                  <strong>"{applyToSimilarPrompt.cluster.vendorLabel}"</strong> transactions?
                </span>
                <div className={styles.promptActions}>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button type="button" className={styles.primaryButton}>
                        Apply to {applyToSimilarPrompt.counts.inView} in view ▾
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className={styles.menu} sideOffset={8} align="start">
                        <div className={styles.menuLabel}>Apply scope</div>
                        <div className={styles.menuHint}>Choose how far back to apply when running rules.</div>
                        <div className={styles.menuSeparator} />

                        <button
                          type="button"
                          className={styles.menuItem}
                          onClick={() => {
                            setApplyToSimilarPrompt((p) => (p ? { ...p, applyScope: "inView" } : p));
                            void handleConfirmApplyToSimilar();
                          }}
                        >
                          <span className={styles.menuItemTitle}>Apply to {applyToSimilarPrompt.counts.inView} in view</span>
                          <span className={styles.menuItemDesc}>Respects current filters + range.</span>
                        </button>

                        {typeof applyToSimilarPrompt.counts.totalThisAccount === "number" && applyToSimilarPrompt.cluster.exampleAccountId ? (
                          <button
                            type="button"
                            className={styles.menuItem}
                            onClick={() => {
                              setApplyToSimilarPrompt((p) => (p ? { ...p, applyScope: "thisAccount" } : p));
                              void handleConfirmApplyToSimilar();
                            }}
                          >
                            <span className={styles.menuItemTitle}>
                              Apply to {applyToSimilarPrompt.counts.totalThisAccount} total (this account)
                            </span>
                            <span className={styles.menuItemDesc}>All time, limited to the account of the example match.</span>
                          </button>
                        ) : null}

                        {typeof applyToSimilarPrompt.counts.totalAllAccounts === "number" ? (
                          <button
                            type="button"
                            className={styles.menuItem}
                            onClick={() => {
                              setApplyToSimilarPrompt((p) => (p ? { ...p, applyScope: "allAccounts" } : p));
                              void handleConfirmApplyToSimilar();
                            }}
                          >
                            <span className={styles.menuItemTitle}>
                              Apply to {applyToSimilarPrompt.counts.totalAllAccounts} total (all accounts)
                            </span>
                            <span className={styles.menuItemDesc}>All time across the org.</span>
                          </button>
                        ) : null}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleReviewFromPrompt}
                  >
                    Review matches
                  </button>
                  <button
                    type="button"
                    className={styles.promptCancel}
                    onClick={() => setApplyToSimilarPrompt(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.content}>
          <div className={styles.listPane}>
            <div className={styles.tableHeader}>
              <div>Payees & Movement</div>
              <div>Stats</div>
              <div>Category</div>
              <div />
            </div>

            <div className={styles.list} role="region" aria-label="Payees & movement clusters">
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
                <div className={styles.drawerHint}>Select a payee cluster → Preview matches to build a rule.</div>
              </div>
            ) : (
              <div className={styles.drawer}>
                <div className={styles.drawerHeader}>
                  <div>
                    <div className={styles.drawerTitle}>{selectedCluster.vendorLabel}</div>
                    <div className={styles.drawerSubtitle}>
                      In view {selectedClusterInViewCount} · Total {typeof selectedClusterTotalCount === "number" ? selectedClusterTotalCount : "…"}
                    </div>
                    <div className={styles.drawerHint}>
                      {builderMatchPreview.hasInvalidRegex ? (
                        <span className={styles.inlineStrong}>Invalid regex</span>
                      ) : (
                        <>
                          Rule will affect <span className={styles.inlineStrong}>{builderMatchPreview.affectsCount}</span> transactions
                          {builderApplyMode === "overwrite" && builderMatchPreview.conflictCount > 0 ? (
                            <> · <span className={styles.conflictWarning}>{builderMatchPreview.conflictCount} already categorized</span></>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                  <button type="button" className={styles.drawerClose} onClick={() => setSelectedVendorKey(null)} aria-label="Close">
                    ×
                  </button>
                </div>

                <div className={styles.drawerBody}>
                  <div className={styles.previewExamples}>
                    <div className={styles.previewTitle}>Review matches</div>

                    <div className={styles.guardGrid}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Include</span>
                        <HqSelect
                          value={reviewIncludeCategorized ? "include" : "uncategorized"}
                          onValueChange={(v) => setReviewIncludeCategorized(v === "include")}
                          ariaLabel="Review include categorized"
                          options={[
                            { value: "uncategorized", label: "Uncategorized only" },
                            { value: "include", label: "Include categorized" },
                          ]}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Time</span>
                        <HqSelect
                          value={reviewRange}
                          onValueChange={(v) => setReviewRange(v as any)}
                          ariaLabel="Review time range"
                          options={[
                            { value: "YTD", label: "YTD" },
                            { value: "12MO", label: "Last 12 months" },
                            { value: "ALL", label: "All time" },
                          ]}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Account</span>
                        <HqSelect
                          value={reviewAccountScope}
                          onValueChange={(v) => setReviewAccountScope(v as any)}
                          ariaLabel="Review account scope"
                          options={reviewAccountOptions}
                        />
                      </label>
                    </div>

                    <div className={styles.exampleLine}>
                      List filters: {filterUncategorizedOnly ? "Uncategorized only" : "Include categorized"} · Range: {rangeMode}
                    </div>
                    <div className={styles.exampleLine}>
                      {reviewLoading ? (
                        <>Loading…</>
                      ) : (
                        <>
                          Showing <span className={styles.inlineStrong}>{reviewCountInScope ?? "…"}</span> in scope ·{" "}
                          <span className={styles.inlineStrong}>{reviewCountTotal ?? "…"}</span> total (all time)
                        </>
                      )}
                    </div>

                    {reviewMatches.length ? (
                      reviewMatches.slice(0, 10).map((t) => (
                        <div key={`${t.postedAt}-${t.dedupeHash}`} className={styles.exampleLine}>
                          {formatShortDate(t.postedAt)} — {currencyPrecise.format(Math.abs(t.amount))} — {t.normalizedDescription || t.rawDescription}
                        </div>
                      ))
                    ) : reviewLoading ? null : (
                      <div className={styles.drawerHint}>No matches in the current review scope.</div>
                    )}
                  </div>

                  <div className={styles.templateBar}>
                    {selectedCluster.clusterType === "Owner" ? (
                      <button type="button" className={styles.templateButton} onClick={() => applyTemplate("owner-draw")}>
                        Owner draw
                      </button>
                    ) : null}
                    {selectedCluster.clusterType === "Payroll" ? (
                      <button type="button" className={styles.templateButton} onClick={() => applyTemplate("payroll")}>
                        Payroll
                      </button>
                    ) : null}
                    {selectedCluster.clusterType === "Contractor" ? (
                      <button type="button" className={styles.templateButton} onClick={() => applyTemplate("contractor")}>
                        Contractor
                      </button>
                    ) : null}
                    {selectedCluster.clusterType === "Transfer" ? (
                      <button type="button" className={styles.templateButton} onClick={() => applyTemplate("internal-transfer")}>
                        Internal transfer
                      </button>
                    ) : null}
                    {selectedCluster.clusterType === "Bank Fee" ? (
                      <button type="button" className={styles.templateButton} onClick={() => applyTemplate("bank-fee")}>
                        Bank fee
                      </button>
                    ) : null}
                    {selectedCluster.clusterType === "Tax" ? (
                      <button type="button" className={styles.templateButton} onClick={() => applyTemplate("tax-payment")}>
                        Tax payment
                      </button>
                    ) : null}
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

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Pattern</span>
                    <input
                      className={styles.input}
                      value={builderMatchType === "regex" ? builderRegex : builderPatternText}
                      onChange={(e) =>
                        builderMatchType === "regex" ? setBuilderRegex(e.target.value) : setBuilderPatternText(e.target.value)
                      }
                      placeholder={builderMatchType === "regex" ? "e.g. \\b(UBER|LYFT)\\b" : "e.g. Amazon"}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Scope</span>
                    <HqSelect
                      value={builderScope}
                      onValueChange={(v) => setBuilderScope(v as RuleScope)}
                      ariaLabel="Scope"
                      options={[
                        { value: "org", label: "All accounts" },
                        { value: "account", label: "This account only" },
                        { value: "card", label: "This card only" },
                      ]}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Time</span>
                    <HqSelect
                      value={builderTimeScope}
                      onValueChange={(v) => setBuilderTimeScope(v as TimeScope)}
                      ariaLabel="Time scope"
                      options={[
                        { value: "range", label: "Current range + future" },
                        { value: "all-historical", label: "All historical + future" },
                        { value: "future-only", label: "Future only" },
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
                        placeholder="Select…"
                        options={accounts.map((a) => ({
                          value: a.accountId,
                          label: `${a.name ?? a.accountName} · ${a.institution}`,
                        }))}
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

                  <div className={styles.guardGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Direction</span>
                      <HqSelect
                        value={builderDirection}
                        onValueChange={(v) => setBuilderDirection(v as DirectionGuard)}
                        ariaLabel="Direction"
                        options={[
                          { value: "any", label: "Any" },
                          { value: "out", label: "Outflow" },
                          { value: "in", label: "Inflow" },
                        ]}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Method</span>
                      <HqSelect
                        value={builderMethod}
                        onValueChange={(v) => setBuilderMethod(v as MethodGuard)}
                        ariaLabel="Method"
                        options={[
                          { value: "any", label: "Any" },
                          { value: "ach", label: "ACH" },
                          { value: "card", label: "Card" },
                          { value: "wire", label: "Wire" },
                          { value: "check", label: "Check" },
                          { value: "transfer", label: "Transfer" },
                        ]}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Apply to</span>
                      <HqSelect
                        value={builderApplyMode}
                        onValueChange={(v) => setBuilderApplyMode(v as ApplyMode)}
                        ariaLabel="Apply mode"
                        options={[
                          { value: "uncategorized", label: "Uncategorized only" },
                          { value: "overwrite", label: "Overwrite existing" },
                        ]}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Frequency</span>
                      <HqSelect
                        value={builderFrequency || ""}
                        onValueChange={(v) => setBuilderFrequency(v as any)}
                        ariaLabel="Frequency"
                        placeholder="(optional)"
                        options={[
                          { value: "weekly", label: "Weekly" },
                          { value: "biweekly", label: "Biweekly" },
                          { value: "monthly", label: "Monthly" },
                          { value: "other", label: "Other" },
                        ]}
                      />
                    </label>
                  </div>

                  <div className={styles.amountRow}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Amount min</span>
                      <input
                        className={styles.input}
                        inputMode="decimal"
                        value={builderAmountMin}
                        onChange={(e) => setBuilderAmountMin(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="(optional)"
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Amount max</span>
                      <input
                        className={styles.input}
                        inputMode="decimal"
                        value={builderAmountMax}
                        onChange={(e) => setBuilderAmountMax(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="(optional)"
                      />
                    </label>
                  </div>

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
                    <div className={styles.previewTitle}>Preview</div>
                    {builderMatchPreview.matches.length ? (
                      builderMatchPreview.matches.map((t) => (
                        <div key={`${t.postedAt}-${t.dedupeHash}`} className={styles.exampleLine}>
                          {formatShortDate(t.postedAt)} — {currencyPrecise.format(Math.abs(t.amount))} — {t.normalizedDescription || t.rawDescription}
                        </div>
                      ))
                    ) : (
                      <div className={styles.drawerHint}>No matches yet.</div>
                    )}
                  </div>
                </div>

                <div className={styles.drawerFooter}>
                  <button type="button" className={styles.primaryButton} onClick={handleSaveBuilder} disabled={isApplying}>
                    Queue rule
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
              <div className={styles.previewExamples}>
                <div className={styles.previewTitle}>Review matches</div>

                <div className={styles.guardGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Include</span>
                    <HqSelect
                      value={reviewIncludeCategorized ? "include" : "uncategorized"}
                      onValueChange={(v) => setReviewIncludeCategorized(v === "include")}
                      ariaLabel="Review include categorized"
                      options={[
                        { value: "uncategorized", label: "Uncategorized only" },
                        { value: "include", label: "Include categorized" },
                      ]}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Time</span>
                    <HqSelect
                      value={reviewRange}
                      onValueChange={(v) => setReviewRange(v as any)}
                      ariaLabel="Review time range"
                      options={[
                        { value: "YTD", label: "YTD" },
                        { value: "12MO", label: "Last 12 months" },
                        { value: "ALL", label: "All time" },
                      ]}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Account</span>
                    <HqSelect
                      value={reviewAccountScope}
                      onValueChange={(v) => setReviewAccountScope(v as any)}
                      ariaLabel="Review account scope"
                      options={reviewAccountOptions}
                    />
                  </label>
                </div>

                <div className={styles.exampleLine}>
                  In view {selectedClusterInViewCount} · Total {typeof selectedClusterTotalCount === "number" ? selectedClusterTotalCount : "…"}
                </div>
                <div className={styles.exampleLine}>
                  {reviewLoading ? (
                    <>Loading…</>
                  ) : (
                    <>
                      Showing <span className={styles.inlineStrong}>{reviewCountInScope ?? "…"}</span> in scope ·{" "}
                      <span className={styles.inlineStrong}>{reviewCountTotal ?? "…"}</span> total (all time)
                    </>
                  )}
                </div>

                {reviewMatches.length ? (
                  reviewMatches.slice(0, 6).map((t) => (
                    <div key={`${t.postedAt}-${t.dedupeHash}`} className={styles.exampleLine}>
                      {formatShortDate(t.postedAt)} — {currencyPrecise.format(Math.abs(t.amount))} — {t.normalizedDescription || t.rawDescription}
                    </div>
                  ))
                ) : reviewLoading ? null : (
                  <div className={styles.drawerHint}>No matches in the current review scope.</div>
                )}
              </div>

              <div className={styles.drawerHint}>
                {builderMatchPreview.hasInvalidRegex ? (
                  <span className={styles.inlineStrong}>Invalid regex</span>
                ) : (
                  <>
                    Will affect <span className={styles.inlineStrong}>{builderMatchPreview.affectsCount}</span> tx
                    {builderApplyMode === "overwrite" ? (
                      <> · Conflicts <span className={styles.inlineStrong}>{builderMatchPreview.conflictCount}</span></>
                    ) : null}
                  </>
                )}
              </div>

              <div className={styles.templateBar}>
                {selectedCluster.clusterType === "Owner" ? (
                  <button type="button" className={styles.templateButton} onClick={() => applyTemplate("owner-draw")}>
                    Owner draw
                  </button>
                ) : null}
                {selectedCluster.clusterType === "Payroll" ? (
                  <button type="button" className={styles.templateButton} onClick={() => applyTemplate("payroll")}>
                    Payroll
                  </button>
                ) : null}
                {selectedCluster.clusterType === "Contractor" ? (
                  <button type="button" className={styles.templateButton} onClick={() => applyTemplate("contractor")}>
                    Contractor
                  </button>
                ) : null}
                {selectedCluster.clusterType === "Transfer" ? (
                  <button type="button" className={styles.templateButton} onClick={() => applyTemplate("internal-transfer")}>
                    Internal transfer
                  </button>
                ) : null}
                {selectedCluster.clusterType === "Bank Fee" ? (
                  <button type="button" className={styles.templateButton} onClick={() => applyTemplate("bank-fee")}>
                    Bank fee
                  </button>
                ) : null}
                {selectedCluster.clusterType === "Tax" ? (
                  <button type="button" className={styles.templateButton} onClick={() => applyTemplate("tax-payment")}>
                    Tax payment
                  </button>
                ) : null}
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

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Pattern</span>
                <input
                  className={styles.input}
                  value={builderMatchType === "regex" ? builderRegex : builderPatternText}
                  onChange={(e) => (builderMatchType === "regex" ? setBuilderRegex(e.target.value) : setBuilderPatternText(e.target.value))}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Scope</span>
                <HqSelect
                  value={builderScope}
                  onValueChange={(v) => setBuilderScope(v as RuleScope)}
                  ariaLabel="Scope"
                  options={[
                    { value: "org", label: "All accounts" },
                    { value: "account", label: "This account only" },
                    { value: "card", label: "This card only" },
                  ]}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Time</span>
                <HqSelect
                  value={builderTimeScope}
                  onValueChange={(v) => setBuilderTimeScope(v as TimeScope)}
                  ariaLabel="Time scope"
                  options={[
                    { value: "range", label: "Current range + future" },
                    { value: "all-historical", label: "All historical + future" },
                    { value: "future-only", label: "Future only" },
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
                    placeholder="Select…"
                    options={accounts.map((a) => ({
                      value: a.accountId,
                      label: `${a.name ?? a.accountName} · ${a.institution}`,
                    }))}
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

              <div className={styles.guardGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Direction</span>
                  <HqSelect
                    value={builderDirection}
                    onValueChange={(v) => setBuilderDirection(v as DirectionGuard)}
                    ariaLabel="Direction"
                    options={[
                      { value: "any", label: "Any" },
                      { value: "out", label: "Outflow" },
                      { value: "in", label: "Inflow" },
                    ]}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Method</span>
                  <HqSelect
                    value={builderMethod}
                    onValueChange={(v) => setBuilderMethod(v as MethodGuard)}
                    ariaLabel="Method"
                    options={[
                      { value: "any", label: "Any" },
                      { value: "ach", label: "ACH" },
                      { value: "card", label: "Card" },
                      { value: "wire", label: "Wire" },
                      { value: "check", label: "Check" },
                      { value: "transfer", label: "Transfer" },
                    ]}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Apply to</span>
                  <HqSelect
                    value={builderApplyMode}
                    onValueChange={(v) => setBuilderApplyMode(v as ApplyMode)}
                    ariaLabel="Apply mode"
                    options={[
                      { value: "uncategorized", label: "Uncategorized only" },
                      { value: "overwrite", label: "Overwrite" },
                    ]}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Frequency</span>
                  <HqSelect
                    value={builderFrequency || ""}
                    onValueChange={(v) => setBuilderFrequency(v as any)}
                    ariaLabel="Frequency"
                    placeholder="(optional)"
                    options={[
                      { value: "weekly", label: "Weekly" },
                      { value: "biweekly", label: "Biweekly" },
                      { value: "monthly", label: "Monthly" },
                      { value: "other", label: "Other" },
                    ]}
                  />
                </label>
              </div>

              <div className={styles.amountRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Amount min</span>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={builderAmountMin}
                    onChange={(e) => setBuilderAmountMin(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="(optional)"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Amount max</span>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={builderAmountMax}
                    onChange={(e) => setBuilderAmountMax(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="(optional)"
                  />
                </label>
              </div>

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
                <div className={styles.previewTitle}>Preview</div>
                {builderMatchPreview.matches.length ? (
                  builderMatchPreview.matches.map((t) => (
                    <div key={`${t.postedAt}-${t.dedupeHash}`} className={styles.exampleLine}>
                      {formatShortDate(t.postedAt)} — {currencyPrecise.format(Math.abs(t.amount))} — {t.normalizedDescription || t.rawDescription}
                    </div>
                  ))
                ) : (
                  <div className={styles.drawerHint}>No matches yet.</div>
                )}
              </div>
            </div>

            <div className={styles.mobileDrawerFooter}>
              <div className={styles.mobileFooterMeta}>
                <div className={styles.pendingMeta}>
                  Pending rules: <span className={styles.pendingCount}>{queuedCount}</span>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={queuedCount === 0 || isApplying}
                  onClick={() => setPendingRules({})}
                >
                  Reset
                </button>
              </div>

              <div className={styles.mobileFooterButtons}>
                <button type="button" className={styles.secondaryButton} onClick={handleSaveBuilder} disabled={isApplying}>
                  Queue rule
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={queuedCount === 0 || isApplying}
                  onClick={() => void handleApply()}
                >
                  Apply rules
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

    </div>,
    root
  );
};

export default CategorizationSpellbookSheet;
