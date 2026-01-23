import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoneyBillWave,
  faPercent,
  faFileInvoiceDollar,
  faGear,
  faChartLine,
} from "@fortawesome/free-solid-svg-icons";

import EditBallparkModal from "@/dashboard/project/features/budget/components/EditBallparkModal";
import InvoicePreviewModal from "@/dashboard/project/features/budget/components/InvoicePreviewModal";
import BudgetDonut, {
  type BudgetDonutSlice,
  type BudgetDonutDatum,
} from "@/dashboard/project/features/budget/components/BudgetDonut";
import RevisionPillTooltip from "@/dashboard/project/features/budget/components/RevisionPillTooltip";
import RevisionQuickSwitcher from "@/dashboard/project/features/budget/components/RevisionQuickSwitcher";
import { useSocket } from "@/app/contexts/useSocket";
import { useOrg } from "@/app/contexts/useOrg";

import { updateBudgetItem, type BudgetInvoiceDetails } from "@/shared/utils/api";
import { formatUSD, parseBudget } from "@/shared/utils/budgetUtils";
import {
  CHART_COLORS,
  generateSequentialPalette,
  getColor,
} from "@/shared/utils/colorUtils";
import { fetchHqAllocationSummary } from "@/hq/lib/hqApi";

import summaryStyles from "./budget-header-summary.module.css";
import mobileStyles from "./budget-header-mobile.module.css";

/* =========================
   Types
   ========================= */

type MetricTitle =
  | "Cost"
  | "Effective Markup"
  | "Client Price"
  | "Spend";

type GroupBy = "none" | "areaGroup" | "invoiceGroup" | "category";


export interface BudgetItem {
  [key: string]: unknown;
  areaGroup?: string;
  invoiceGroup?: string;
  category?: string;
  quantity?: string | number;

  // numeric fields (string or number in data; we coerce with parseBudget)
  itemBudgetedCost?: string | number;
  itemActualCost?: string | number;
  itemReconciledCost?: string | number;
  itemFinalCost?: string | number;
  itemMarkUp?: string | number;
}

export interface BudgetHeaderData {
  budgetItemId: string;
  revision: number;
  headerBallPark?: number | string;
  headerBudgetedTotalCost?: number | string;
  headerActualTotalCost?: number | string;
  headerFinalTotalCost?: number | string;
  clientRevisionId?: number | string | null;
  createdAt?: string | number | Date | null;
  revisionName?: string | null;
  revisionNote?: string | null;
  invoiceFileKey?: string | null;
  invoiceFileUrl?: string | null;
  invoiceDetails?: BudgetInvoiceDetails | null;
}

export interface ProjectLike {
  projectId?: string;
  color?: string;
}

interface SummaryCardProps {
  icon: IconDefinition;
  color: string;
  title: MetricTitle;
  tag: string;
  value: string;
  description: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
  ariaPressed?: boolean;
  disableHover?: boolean;
  disablePointer?: boolean;
}

type MetricField = keyof BudgetItem | "markupAmount" | "costBasis" | null;

interface MetricConfig {
  title: MetricTitle;
  tag: string;
  icon: IconDefinition;
  color: string;
  value: string;
  chartValue: number;
  description: React.ReactNode;
  field: MetricField;
  sticky?: boolean;
  extra?: React.ReactNode;
  isPercentage?: boolean;
  onSelect?: () => void;
  ariaLabel?: string;
  isSelectable?: boolean;
  disableHover?: boolean;
  disablePointer?: boolean;
}

interface RevisionForSwitcher {
  revision: number;
  revisionName?: string | null;
  clientRevisionId?: number | null;
  revisionNote?: string | null;
}

interface BudgetHeaderProps {
  activeProject?: ProjectLike | null;
  budgetHeader?: BudgetHeaderData | null;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  budgetItems?: BudgetItem[];
  onBallparkChange?: (val: number) => void;
  onOpenRevisionModal: () => void;
  onSwitchRevision?: (revision: number) => void;
  revisions?: RevisionForSwitcher[];
  onCreateBudget?: () => Promise<Record<string, unknown> | null> | void;
  initialMetric?: MetricTitle;
}

const RELEVANT_WS_ACTIONS = new Set<unknown>([
  "budgetUpdated",
  "projectTotalsUpdated",
  "chartDataUpdated",
]);

const computeSignature = (slices: BudgetDonutSlice[]): string =>
  slices.map((slice) => `${slice.id}:${slice.value}`).join("|");

const palettesAreEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

type ChartState = {
  slices: BudgetDonutSlice[];
  total: number;
  palette: string[];
  signature: string;
};

const MOBILE_BREAKPOINT = 768;
const FALLBACK_ACCENT_COLOR = "#38BDF8";

const normalizeHexColor = (value: string): string | null => {
  const trimmed = value.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    return null;
  }
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
};

const rgbaFromHex = (hex: string, alpha: number): string => {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  if (value.length !== 6) {
    return rgbaFromHex(FALLBACK_ACCENT_COLOR, alpha);
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/* =========================
   Helpers
   ========================= */

const toNumber = (v: number | string | undefined | null): number =>
  parseBudget(v);

const toQuantity = (value: unknown): number => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

/* =========================
   Components
   ========================= */

const SummaryCard: React.FC<SummaryCardProps> = ({
  icon,
  color,
  title,
  tag,
  value,
  description,
  onClick,
  active,
  className = "",
  children,
  ariaLabel,
  ariaPressed,
  disableHover,
  disablePointer,
}) => {
  const handleKeyDown =
    onClick != null
      ? (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }
      : undefined;

  return (
    <div
      className={`${summaryStyles.card} ${
        active ? summaryStyles.active : ""
      } ${disableHover ? summaryStyles.noHover : ""} ${
        disablePointer ? summaryStyles.noPointer : ""
      } ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? ariaLabel ?? title : undefined}
      aria-pressed={
        onClick && typeof ariaPressed === "boolean" ? ariaPressed : undefined
      }
      onKeyDown={handleKeyDown}
    >
      <div className={summaryStyles.cardHeader}>
        <div className={summaryStyles.cardIcon} style={{ background: color }}>
          <FontAwesomeIcon icon={icon} />
        </div>
        <span className={summaryStyles.cardTag}>{tag}</span>
        {children ? (
          <div className={summaryStyles.cardActions}>{children}</div>
        ) : null}
      </div>
      <div className={summaryStyles.cardBody}>
        <div className={summaryStyles.cardTitle}>{title}</div>
        <div className={summaryStyles.cardValue}>{value}</div>
        <div className={summaryStyles.cardDesc}>{description}</div>
      </div>
    </div>
  );
};

/* =========================
   Main
   ========================= */

const BudgetHeader: React.FC<BudgetHeaderProps> = ({
  activeProject,
  budgetHeader,
  groupBy,
  setGroupBy, // eslint-disable-line @typescript-eslint/no-unused-vars
  budgetItems = [],
  onBallparkChange,
  onOpenRevisionModal,
  onSwitchRevision,
  revisions = [],
  onCreateBudget,
  initialMetric,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricTitle>(
    initialMetric ?? "Client Price"
  );
  const [isMobile, setIsMobile] = useState(false);
  const [isBallparkModalOpen, setBallparkModalOpen] = useState(false);
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoiceRevision, setInvoiceRevision] = useState<BudgetHeaderData | null>(null);
  const [spendDetailMode, setSpendDetailMode] = useState<"remaining" | "delta">("remaining");

  // Allocated cost from HQ transactions
  const [allocatedTotal, setAllocatedTotal] = useState<number | null>(null);

  const { activeOrgId } = useOrg();
  const { ws } = useSocket();

  // Fetch allocation data for the current project from HQ
  useEffect(() => {
    if (!activeOrgId || !activeProject?.projectId) return;

    let cancelled = false;

    (async () => {
      try {
        const summary = await fetchHqAllocationSummary(activeOrgId);
        if (cancelled) return;
        const projectData = summary.byProject?.find(
          (p) => p.projectId === activeProject.projectId
        );
        setAllocatedTotal(projectData?.allocated ?? 0);
      } catch (err) {
        // Silently ignore - allocation data is optional
        if (!cancelled) setAllocatedTotal(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, activeProject?.projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handleChange = (event: MediaQueryList | MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    handleChange(mediaQuery);

    const listener = (event: MediaQueryListEvent) => handleChange(event);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }

    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }, []);

  const openInvoicePreview = useCallback(() => {
    if (!budgetHeader) return;
    setInvoiceRevision(budgetHeader);
    setIsInvoicePreviewOpen(true);
  }, [budgetHeader]);

  const closeInvoicePreview = useCallback(() => {
    setIsInvoicePreviewOpen(false);
    // blur the trigger to avoid leftover focus outline
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && typeof active.blur === "function") {
        active.blur();
      }
    }, 0);
  }, []);

  const handleOpenBallpark = useCallback(() => {
    setBallparkModalOpen(true);
  }, []);

  const handleSelectCost = useCallback(() => {
    if (selectedMetric !== "Cost") {
      setSelectedMetric("Cost");
    }
  }, [selectedMetric]);

  const handleSelectClientPrice = useCallback(() => {
    setSelectedMetric("Client Price");
  }, []);

  const toggleSpendDetailMode = useCallback(() => {
    setSpendDetailMode((prev) => (prev === "remaining" ? "delta" : "remaining"));
  }, []);

  const metrics = useMemo<MetricConfig[]>(() => {
    const clientPriceTotal = toNumber(budgetHeader?.headerFinalTotalCost);

    // Effective pricing basis: Actual (quote-updated plan) overrides Planned per-line.
    const costTotal = budgetItems.reduce((sum, it) => {
      const qty = toQuantity(it.quantity);
      const basisUnit =
        toNumber(it.itemActualCost) || toNumber(it.itemBudgetedCost) || toNumber(it.itemReconciledCost);
      return sum + qty * basisUnit;
    }, 0);

    const markupDiff = clientPriceTotal - costTotal;

    const formatSignedUSD = (value: number, options?: { plus?: boolean }) => {
      if (!Number.isFinite(value)) return "—";
      const plus = options?.plus ?? false;
      const abs = formatUSD(Math.abs(value));
      if (value < 0) return `-${abs}`;
      if (value > 0 && plus) return `+${abs}`;
      return abs;
    };

    const markupValue = costTotal
      ? (() => {
          const percent = Math.round((markupDiff / costTotal) * 100);
          return `${percent}% (${formatSignedUSD(markupDiff, { plus: true })})`;
        })()
      : "N/A";

    const hasAllocationData = allocatedTotal !== null;
    const spend = allocatedTotal ?? 0;
    const spendValue = hasAllocationData ? formatUSD(spend) : "—";

    const pctUsed =
      hasAllocationData && costTotal > 0 ? Math.round((spend / costTotal) * 100) : null;
    const spendTag = pctUsed == null ? "— used" : `${pctUsed}% used`;

    const remaining = costTotal - spend;
    const delta = spend - costTotal;
    const deltaTone = delta > 0 ? "over" : delta < 0 ? "under" : "even";

    const spendSecondary =
      spendDetailMode === "remaining"
        ? `Remaining: ${formatSignedUSD(remaining)}`
        : `Δ vs Cost: ${formatSignedUSD(delta, { plus: true })} (${deltaTone})`;

    return [
      {
        title: "Cost" as MetricTitle,
        tag: "Auto",
        icon: faMoneyBillWave,
        color: CHART_COLORS[0],
        value: formatUSD(costTotal),
        chartValue: costTotal,
        description: "Current working cost (Actual if present, else Planned)",
        field: "costBasis",
        sticky: true,
        onSelect: handleSelectCost,
        ariaLabel: "View cost totals",
        isSelectable: true,
      },
      {
        title: "Spend" as MetricTitle,
        tag: spendTag,
        icon: faChartLine,
        color: CHART_COLORS[1],
        value: spendValue,
        chartValue: spend,
        description: (
          <>
            <span style={{ display: "block" }}>Bank-linked truth</span>
            <span style={{ display: "block" }}>{spendSecondary}</span>
          </>
        ),
        field: null,
        isSelectable: false,
        onSelect: toggleSpendDetailMode,
        ariaLabel: "Toggle spend details",
      },
      {
        title: "Client Price" as MetricTitle,
        tag: "Price",
        icon: faFileInvoiceDollar,
        color: CHART_COLORS[3],
        value: formatUSD(clientPriceTotal),
        chartValue: clientPriceTotal,
        description: "Computed sell",
        field: "itemFinalCost",
        sticky: true,
        onSelect: handleSelectClientPrice,
        ariaLabel: "View client price totals",
        isSelectable: true,
      },
      {
        title: "Effective Markup" as MetricTitle,
        tag: "Effective",
        icon: faPercent,
        color: CHART_COLORS[2],
        value: markupValue,
        chartValue: markupDiff,
        description: "Markup vs Cost",
        field: "markupAmount",
        isPercentage: true,
        ariaLabel: "Effective markup compared to cost totals",
        isSelectable: false,
        onSelect: undefined,
      },
    ];
  }, [allocatedTotal, budgetHeader, budgetItems, handleSelectClientPrice, handleSelectCost, spendDetailMode, toggleSpendDetailMode]);

  const createdDateLabel = useMemo(() => {
    if (!budgetHeader?.createdAt) return "No date";
    const date = new Date(budgetHeader.createdAt);
    if (Number.isNaN(date.getTime())) return "No date";
    return date.toLocaleDateString();
  }, [budgetHeader?.createdAt]);

  const headerDateText =
    createdDateLabel === "No date" ? "No revision date" : `As of ${createdDateLabel}`;

  const finalDisplay = useMemo(
    () =>
      budgetHeader
        ? formatUSD(toNumber(budgetHeader.headerFinalTotalCost))
        : "Not available",
    [budgetHeader]
  );

  const finalMetric = useMemo(
    () => metrics.find((metric) => metric.title === "Client Price"),
    [metrics]
  );

  const finalMetricTitle = finalMetric?.title ?? "Client Price";
  const finalMetricDescription = finalMetric?.description ?? "Computed sell";
  const finalMetricIcon = finalMetric?.icon ?? faFileInvoiceDollar;

  const handleBallparkSave = async (val: number) => {
    // If the header doesn't exist yet, delegate up — parent will create it once
    if (!budgetHeader) {
      onBallparkChange?.(val);
      setBallparkModalOpen(false);
      return;
    }

    // Header exists: update it here (unchanged behavior)
    if (!activeProject?.projectId) {
      setBallparkModalOpen(false);
      return;
    }

    try {
      const headerId = String(budgetHeader.budgetItemId || "");
      const revision = Number(budgetHeader.revision ?? 1);
      await updateBudgetItem(activeProject.projectId, headerId, {
        headerBallPark: val,
        revision,
      });
      onBallparkChange?.(val); // keep parent in sync
    } catch (err) {
      console.error("Error updating ballpark", err);
    }
    setBallparkModalOpen(false);
  };

  const resolvedProjectKey = useMemo(
    () => (activeProject?.projectId ? String(activeProject.projectId) : null),
    [activeProject?.projectId]
  );

  const accentHex = useMemo(() => {
    const providedColor =
      typeof activeProject?.color === "string" && activeProject.color.trim() !== ""
        ? normalizeHexColor(activeProject.color)
        : null;

    if (providedColor) {
      return providedColor;
    }

    const generated = normalizeHexColor(getColor(resolvedProjectKey ?? "budget"));
    return generated ?? FALLBACK_ACCENT_COLOR;
  }, [activeProject?.color, resolvedProjectKey]);

  const accentAlpha = useCallback(
    (alpha: number) => rgbaFromHex(accentHex, alpha),
    [accentHex]
  );

  const computeChartState = useCallback((): ChartState => {
    const baseColorSource = accentHex;

    if (groupBy === "none") {
      const slices = metrics.map((metric) => ({
        id: `metric-${metric.title}`,
        label: metric.title,
        value: toNumber(metric.chartValue as number | string | undefined | null),
      }));

      const palette = slices.length
        ? generateSequentialPalette(baseColorSource, slices.length).reverse()
        : [];

      return {
        slices,
        total: slices.reduce((sum, slice) => sum + slice.value, 0),
        palette,
        signature: computeSignature(slices),
      };
    }

    const selected = metrics.find((m) => m.title === selectedMetric);
    const field = selected?.field ?? "itemFinalCost";

    const totals: Record<string, number> = {};
    budgetItems.forEach((item) => {
      const rawKey = (item[groupBy] as string) || "Unspecified";
      const key = rawKey && rawKey.trim() !== "" ? rawKey : "Unspecified";
      let val: number;
      const quantity = toQuantity(item.quantity);
      const applyQuantityIfNeeded = (
        fieldName: keyof BudgetItem | null,
        value: number
      ): number => {
        if (
          fieldName === "itemBudgetedCost" ||
          fieldName === "itemActualCost"
        ) {
          return value * quantity;
        }
        return value;
      };

      if (field === "markupAmount") {
        const finalCost = toNumber(item.itemFinalCost);
        const basisUnit =
          toNumber(item.itemActualCost) || toNumber(item.itemBudgetedCost) || toNumber(item.itemReconciledCost);
        const base = basisUnit * quantity;
        val = finalCost - base;
      } else if (field === "costBasis") {
        const basisUnit =
          toNumber(item.itemActualCost) || toNumber(item.itemBudgetedCost) || toNumber(item.itemReconciledCost);
        val = basisUnit * quantity;
      } else if (field === "itemMarkUp") {
        val =
          toNumber(item[field as keyof BudgetItem] as number | string | undefined | null) * 100;
      } else {
        const key = field as keyof BudgetItem;
        const numericValue = toNumber(item[key] as number | string | undefined | null);
        val = applyQuantityIfNeeded(key, numericValue);
      }

      const safeValue = Number.isNaN(val) ? 0 : val;
      totals[key] = (totals[key] ?? 0) + safeValue;
    });

    const slices = Object.entries(totals).map(([label, value]) => ({
      id: `${groupBy}-${label}`,
      label,
      value,
    }));

    const sortedSlices = [...slices].sort((a, b) => b.value - a.value);
    const palette = sortedSlices.length
      ? generateSequentialPalette(baseColorSource, sortedSlices.length).reverse()
      : [];

    return {
      slices: sortedSlices,
      total: sortedSlices.reduce((sum, slice) => sum + slice.value, 0),
      palette,
      signature: computeSignature(sortedSlices),
    };
  }, [
    accentHex,
    budgetItems,
    groupBy,
    metrics,
    selectedMetric,
  ]);

  const [chartState, setChartState] = useState<ChartState>(() => computeChartState());

  const updateRafRef = useRef<number | null>(null);

  const scheduleUpdate = useCallback(() => {
    if (updateRafRef.current) {
      cancelAnimationFrame(updateRafRef.current);
    }
    updateRafRef.current = requestAnimationFrame(() => {
      updateRafRef.current = null;
      const shaped = computeChartState();
      setChartState((prev) => {
        if (prev.signature === shaped.signature) {
          const paletteChanged = !palettesAreEqual(prev.palette, shaped.palette);
          const totalChanged = prev.total !== shaped.total;
          if (!paletteChanged && !totalChanged) {
            return prev;
          }
          return {
            ...prev,
            total: totalChanged ? shaped.total : prev.total,
            palette: paletteChanged ? shaped.palette : prev.palette,
          };
        }
        return shaped;
      });
    });
  }, [computeChartState]);

  useEffect(() => scheduleUpdate(), [scheduleUpdate]);

  useEffect(
    () => () => {
      if (updateRafRef.current) {
        cancelAnimationFrame(updateRafRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch (error) {
        console.error("Failed to parse WebSocket message", error);
        return;
      }

      if (!parsed || typeof parsed !== "object") return;
      const action = (parsed as { action?: unknown }).action;
      if (typeof action !== "string" || !RELEVANT_WS_ACTIONS.has(action)) return;

      const targetProject = (parsed as { projectId?: unknown }).projectId;
      if (
        resolvedProjectKey &&
        targetProject &&
        String(targetProject) !== resolvedProjectKey
      ) {
        return;
      }

      scheduleUpdate();
    };

    ws.addEventListener("message", handleMessage);
    return () => {
      ws.removeEventListener("message", handleMessage);
    };
  }, [ws, scheduleUpdate, resolvedProjectKey]);

  const formatTooltip = useCallback(
    (slice: BudgetDonutDatum) => {
      const metric =
        groupBy === "none"
          ? metrics.find((m) => m.title === slice.label)
          : metrics.find((m) => m.title === selectedMetric);
      const isPercent =
        (metric as { isPercentage?: boolean })?.isPercentage &&
        (groupBy === "none" ? slice.label !== "Effective Markup" : selectedMetric !== "Effective Markup");
      const rounded = Math.round(slice.value);
      const value = isPercent ? `${rounded}%` : formatUSD(rounded);
      return `${slice.label}: ${value}`;
    },
    [groupBy, metrics, selectedMetric]
  );

  const totalFormatter = useCallback(
    (value: number) => formatUSD(Math.round(value)),
    []
  );

  const accentStyle = useMemo(
    () =>
      ({
        "--budget-accent": accentHex,
        "--budget-accent-soft": accentAlpha(0.16),
        "--budget-accent-softer": accentAlpha(0.24),
        "--budget-accent-border": accentAlpha(0.32),
        "--budget-accent-glow": accentAlpha(0.22),
        "--budget-accent-chip": accentAlpha(0.18),
        "--budget-accent-chip-active": accentAlpha(0.3),
        "--budget-accent-text": "rgba(255, 255, 255, 0.92)",
        "--budget-accent-text-muted": "rgba(241, 245, 249, 0.7)",
      }) as React.CSSProperties,
    [accentAlpha, accentHex]
  );

  const desktopAccentStyle = accentStyle;

  // Target (formerly Ballpark) value for inline header display
  const targetValue = toNumber(budgetHeader?.headerBallPark);
  const targetDisplay = targetValue > 0 ? formatUSD(targetValue) : null;

  const desktopContent = (
    <div className={summaryStyles.surface} style={desktopAccentStyle}>
      <div className={summaryStyles.headerRow}>
        <div className={summaryStyles.titleGroup}>
          <span className={summaryStyles.title}>Budget</span>
          <span className={summaryStyles.headerSeparator}>·</span>
          <button
            type="button"
            className={summaryStyles.targetPill}
            onClick={handleOpenBallpark}
            title="Edit target"
          >
            <span className={summaryStyles.targetLabel}>Target</span>
            <span className={targetDisplay ? summaryStyles.targetValue : summaryStyles.targetPlaceholder}>
              {targetDisplay ?? "Set target"}
            </span>
          </button>
          <span className={summaryStyles.headerSeparator}>·</span>
          <div className={summaryStyles.dateControls}>
            <span className={summaryStyles.dateLabel}>As of {headerDateText}</span>
            <button
              type="button"
              className={summaryStyles.iconButton}
              onClick={handleOpenBallpark}
              aria-label="Edit target"
            >
              <FontAwesomeIcon icon={faGear} />
            </button>
          </div>
        </div>
        <div className={summaryStyles.headerActions}>
          <button
            type="button"
            className={summaryStyles.iconButton}
            onClick={openInvoicePreview}
            aria-label="Invoice preview"
            disabled={!budgetHeader}
          >
            <FontAwesomeIcon icon={faFileInvoiceDollar} />
          </button>
          {budgetHeader ? (
            <RevisionPillTooltip
              data={{
                revisionNumber: budgetHeader.revision,
                revisionName: budgetHeader.revisionName,
                isClientVersion: budgetHeader.clientRevisionId != null && 
                  Number(budgetHeader.clientRevisionId) === budgetHeader.revision,
                savedAt: budgetHeader.invoiceDetails?.savedAt,
                isAutosaved: false,
                hasUnsavedChanges: false,
              }}
            >
              <RevisionQuickSwitcher
                revisions={revisions.map((r) => ({
                  revision: r.revision,
                  revisionName: r.revisionName,
                  isClientVersion: r.clientRevisionId != null && 
                    Number(r.clientRevisionId) === r.revision,
                  isActive: r.revision === budgetHeader.revision,
                  isEditing: r.revision === budgetHeader.revision,
                  revisionNote: r.revisionNote,
                }))}
                activeRevision={budgetHeader.revision}
                currentRevisionName={budgetHeader.revisionName}
                isClientVersion={budgetHeader.clientRevisionId != null && 
                  Number(budgetHeader.clientRevisionId) === budgetHeader.revision}
                onSwitch={(rev) => onSwitchRevision?.(rev)}
                onManageRevisions={onOpenRevisionModal}
                disabled={!budgetHeader}
              >
                <span className={summaryStyles.revisionButton}>
                  {`Rev.${budgetHeader.revision}`}
                </span>
              </RevisionQuickSwitcher>
            </RevisionPillTooltip>
          ) : (
            <button
              type="button"
              className={summaryStyles.revisionButton}
              onClick={() => onCreateBudget && onCreateBudget()}
            >
              Create Budget
            </button>
          )}
        </div>
      </div>
      <div className={summaryStyles.bodyRow}>
        <div className={summaryStyles.cardsColumn}>
          <div
            className={`${summaryStyles.cardsRow} ${summaryStyles.cardsRowTop}`}
          >
            {metrics.slice(0, 3).map((m) => (
              <SummaryCard
                key={m.title}
                icon={m.icon}
                color={m.color}
                title={m.title}
                tag={m.tag}
                value={m.value}
                description={m.description}
                className={[
                  m.sticky ? summaryStyles.stickyCard : "",
                  m.title === "Client Price" ? summaryStyles.finalCard : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={m.onSelect}
                active={Boolean(m.isSelectable && selectedMetric === m.title)}
                ariaLabel={m.ariaLabel}
                ariaPressed={m.isSelectable ? selectedMetric === m.title : undefined}
                disableHover={m.disableHover}
                disablePointer={m.disablePointer}
              />
            ))}
          </div>

          <div
            className={`${summaryStyles.cardsRow} ${summaryStyles.cardsRowBottom}`}
          >
            {metrics.slice(3).map((m) => (
              <SummaryCard
                key={m.title}
                icon={m.icon}
                color={m.color}
                title={m.title}
                tag={m.tag}
                value={m.value}
                description={m.description}
                className={m.sticky ? summaryStyles.stickyCard : ""}
                onClick={m.onSelect}
                active={Boolean(m.isSelectable && selectedMetric === m.title)}
                ariaLabel={m.ariaLabel}
                ariaPressed={m.isSelectable ? selectedMetric === m.title : undefined}
                disableHover={m.disableHover}
                disablePointer={m.disablePointer}
              />
            ))}
          </div>
        </div>

        <div className={summaryStyles.chartColumn}>
          <div className={summaryStyles.chartCard}>
            <div className={summaryStyles.chartContainer}>
              <BudgetDonut
                data={chartState.slices}
                total={chartState.total}
                palette={chartState.palette}
                formatTooltip={formatTooltip}
                totalFormatter={totalFormatter}
              />
            </div>
            <ul className={summaryStyles.legend}>
              {chartState.slices.map((slice, index) => {
                const palette = chartState.palette;
                const paletteLength = palette.length;
                const background =
                  paletteLength > 0
                    ? palette[index % paletteLength]
                    : getColor(`${slice.id}-${index}`);
                return (
                  <li className={summaryStyles.legendItem} key={slice.id}>
                    <span
                      className={summaryStyles.legendDot}
                      style={{ background }}
                    />
                    {slice.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const topMetrics = metrics.slice(0, 3);
  const bottomMetrics = metrics.slice(3);

  const mobileAccentStyle = accentStyle;

  const renderMetricChip = (metric: (typeof metrics)[number]) => {
    const isSelectable = Boolean(metric.isSelectable);
    const isActive = isSelectable && selectedMetric === metric.title;

    const chipClassName = [
      mobileStyles.metricChip,
      isActive ? mobileStyles.metricChipActive : "",
    ]
      .filter(Boolean)
      .join(" ");

    const tagClassName = [
      mobileStyles.metricTag,
    ]
      .filter(Boolean)
      .join(" ");

    const ariaLabel = metric.ariaLabel ?? (metric.onSelect ? metric.title : undefined);

    return (
      <div key={metric.title} className={mobileStyles.metricChipWrapper}>
        <button
          type="button"
          className={chipClassName}
          onClick={metric.onSelect ?? undefined}
          disabled={!metric.onSelect}
          aria-label={ariaLabel}
          aria-pressed={isSelectable ? isActive : undefined}
        >
          <div className={mobileStyles.metricChipHeader}>
            <span className={tagClassName}>{metric.tag}</span>
          </div>
          <span className={mobileStyles.metricValue}>{metric.value}</span>
          <span className={mobileStyles.metricDescription}>{metric.description}</span>
        </button>
      </div>
    );
  };

  const mobileContent = (
    <div className={mobileStyles.card} style={mobileAccentStyle}>
      <div className={mobileStyles.headerRow}>
        <div className={mobileStyles.titleGroup}>
          <span>Budget</span>
          <button
            type="button"
            className={mobileStyles.iconButton}
            onClick={handleOpenBallpark}
            aria-label="Edit target"
          >
            <FontAwesomeIcon icon={faGear} />
          </button>
          <button
            type="button"
            className={mobileStyles.iconButton}
            onClick={openInvoicePreview}
            aria-label="Invoice preview"
            disabled={!budgetHeader}
          >
            <FontAwesomeIcon icon={faFileInvoiceDollar} />
          </button>
        </div>
        {budgetHeader ? (
          <RevisionPillTooltip
            data={{
              revisionNumber: budgetHeader.revision,
              revisionName: budgetHeader.revisionName,
              isClientVersion: budgetHeader.clientRevisionId != null && 
                Number(budgetHeader.clientRevisionId) === budgetHeader.revision,
              savedAt: budgetHeader.invoiceDetails?.savedAt,
              isAutosaved: false,
              hasUnsavedChanges: false,
            }}
          >
            <RevisionQuickSwitcher
              revisions={revisions.map((r) => ({
                revision: r.revision,
                revisionName: r.revisionName,
                isClientVersion: r.clientRevisionId != null && 
                  Number(r.clientRevisionId) === r.revision,
                isActive: r.revision === budgetHeader.revision,
                isEditing: r.revision === budgetHeader.revision,
                revisionNote: r.revisionNote,
              }))}
              activeRevision={budgetHeader.revision}
              currentRevisionName={budgetHeader.revisionName}
              isClientVersion={budgetHeader.clientRevisionId != null && 
                Number(budgetHeader.clientRevisionId) === budgetHeader.revision}
              onSwitch={(rev) => onSwitchRevision?.(rev)}
              onManageRevisions={onOpenRevisionModal}
              disabled={!budgetHeader}
            >
              <span className={mobileStyles.revisionButton}>
                {`Rev.${budgetHeader.revision}`}
              </span>
            </RevisionQuickSwitcher>
          </RevisionPillTooltip>
        ) : (
          <button
            type="button"
            className={mobileStyles.revisionButton}
            onClick={() => onCreateBudget && onCreateBudget()}
          >
            Create Budget
          </button>
        )}
      </div>

      {/* Target row for mobile */}
      <div className={mobileStyles.targetRow}>
        <button
          type="button"
          className={mobileStyles.targetPill}
          onClick={handleOpenBallpark}
        >
          <span className={mobileStyles.targetLabel}>Target</span>
          <span className={targetDisplay ? mobileStyles.targetValue : mobileStyles.targetPlaceholder}>
            {targetDisplay ?? "Set target"}
          </span>
        </button>
        <span className={mobileStyles.targetDate}>As of {headerDateText}</span>
      </div>

      <div className={mobileStyles.summaryLayout}>
        <div className={mobileStyles.summaryColumn}>
          <div className={mobileStyles.summaryCard}>
            <div className={mobileStyles.summaryCardHeader}>
              <span className={mobileStyles.summaryCardTitle}>
                <FontAwesomeIcon
                  icon={finalMetricIcon}
                  className={mobileStyles.summaryCardTitleIcon}
                />
                {finalMetricTitle}
              </span>
            </div>
            <span className={mobileStyles.summaryCardValue}>{finalDisplay}</span>
            <span className={mobileStyles.summaryCardDescription}>
              {finalMetricDescription}
            </span>
            <span className={mobileStyles.summaryCardDate}>{createdDateLabel}</span>
          </div>
        </div>
        <div className={mobileStyles.chartContainer}>
          <BudgetDonut
            data={chartState.slices}
            total={chartState.total}
            palette={chartState.palette}
            formatTooltip={formatTooltip}
            totalFormatter={totalFormatter}
          />
        </div>
      </div>

      <div className={mobileStyles.metricGrid}>
        <div className={`${mobileStyles.metricRow} ${mobileStyles.metricRowTop}`}>
          {topMetrics.map((metric) => renderMetricChip(metric))}
        </div>
        <div className={`${mobileStyles.metricRow} ${mobileStyles.metricRowBottom}`}>
          {bottomMetrics.map((metric) => renderMetricChip(metric))}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {isMobile ? mobileContent : desktopContent}

      <EditBallparkModal
        isOpen={isBallparkModalOpen}
        onRequestClose={() => setBallparkModalOpen(false)}
        onSubmit={handleBallparkSave}
        initialValue={toNumber(budgetHeader?.headerBallPark)}
        accentColor={accentHex}
      />

      <InvoicePreviewModal
        isOpen={isInvoicePreviewOpen}
        onRequestClose={closeInvoicePreview}
        revision={invoiceRevision as unknown as { revision?: number; [k: string]: unknown }}
        project={activeProject as unknown as { projectId: string; [k: string]: unknown }}
      />
    </div>
  );
};

export default BudgetHeader;
