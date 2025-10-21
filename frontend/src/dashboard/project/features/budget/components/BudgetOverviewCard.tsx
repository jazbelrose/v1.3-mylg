import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import type { Project } from "@/app/contexts/DataProvider";
import { formatUSD } from "@/shared/utils/budgetUtils";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileInvoiceDollar, faSpinner } from "@fortawesome/free-solid-svg-icons";
import ClientInvoicePreviewModal from "@/dashboard/project/features/budget/ClientInvoicePreviewModal";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import BudgetDonut, {
  type BudgetDonutSlice,
  type BudgetDonutDatum,
} from "@/dashboard/project/features/budget/components/BudgetDonut";
import { useSocket } from "@/app/contexts/useSocket";
import DonutSlot from "@/components/DonutSlot";
import { generateSequentialPalette, getColor } from "@/shared/utils/colorUtils";
import { fetchBudgetHeader, fetchBudgetItems } from "@/shared/utils/api";


type BudgetHeaderData = {
  headerFinalTotalCost?: number | null;
  headerBallPark?: number | null;
  headerBudgetedTotalCost?: number | null;
  headerActualTotalCost?: number | null;
  headerEffectiveMarkup?: number | null; // e.g. 0.25 for 25%
  createdAt?: string | number | Date | null;
  revision?: number | null;
  clientRevisionId?: number | null;
  // Include other fields if your app uses them
};

interface BudgetOverviewCardProps {
  projectId?: string;
}

const RELEVANT_WS_ACTIONS = new Set([
  "budgetUpdated",
  "projectTotalsUpdated",
  "chartDataUpdated",
  "clientRevisionUpdated",
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

const BudgetOverviewCard: React.FC<BudgetOverviewCardProps> = ({ projectId }) => {
  const { activeProject, isAdmin } = useData();
  const {
    budgetHeader,
    clientBudgetHeader,
    clientBudgetItems,
    loading,
    clientLoading,
    refresh,
    getStats,
    getPie,
    getClientStats,
    getClientPie,
  } = useBudget();
  const navigate = useNavigate();

  const [groupBy] = useState<"invoiceGroup" | "none">("invoiceGroup");
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoiceRevision, setInvoiceRevision] = useState<BudgetHeaderData | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<Array<Record<string, unknown>> | null>(null);

  const { ws } = useSocket();

  const overviewHeader = clientBudgetHeader ?? budgetHeader;
  const overviewLoading = loading || clientLoading;
  const stats = clientBudgetHeader ? getClientStats() : getStats();
  const ballparkValue = stats.ballpark;
  const displayedRevision =
    clientBudgetHeader?.revision ??
    (typeof budgetHeader?.clientRevisionId === "number"
      ? budgetHeader?.clientRevisionId
      : budgetHeader?.revision ?? null);

  const resolvedProjectKey = useMemo(() => {
    const key = projectId ?? activeProject?.projectId;
    return key ? String(key) : null;
  }, [projectId, activeProject?.projectId]);

  const computeChartState = useCallback((): ChartState => {
    const raw = (clientBudgetHeader ? getClientPie : getPie)(groupBy) ?? [];
    const sorted = [...raw].sort((a, b) => b.value - a.value);
    const slices = sorted.map((item, index) => ({
      id: `${groupBy}-${item.name ?? `slice-${index}`}`,
      label: item.name,
      value: item.value,
    }));
    const total = sorted.reduce((sum, item) => sum + item.value, 0);
    const baseColorSource =
      typeof activeProject?.color === "string" && activeProject.color.trim() !== ""
        ? activeProject.color
        : getColor(resolvedProjectKey ?? "budget");
    const palette = slices.length
      ? generateSequentialPalette(baseColorSource, slices.length).reverse()
      : [];

    return {
      slices,
      total,
      palette,
      signature: computeSignature(slices),
    };
  }, [
    clientBudgetHeader,
    getClientPie,
    getPie,
    groupBy,
    activeProject?.color,
    resolvedProjectKey,
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

  const formatDatumValue = useCallback(
    (slice: BudgetDonutSlice) => {
      const isPercent = groupBy === "none" && slice.label === "Effective Markup";
      const rounded = Math.round(slice.value);
      return isPercent ? `${rounded}%` : formatUSD(rounded);
    },
    [groupBy]
  );

  const formatTooltip = useCallback(
    (slice: BudgetDonutDatum) => `${slice.label}: ${formatDatumValue(slice)}`,
    [formatDatumValue]
  );

  const totalFormatter = useCallback(
    (value: number) => formatUSD(Math.round(value)),
    []
  );

  const openInvoicePreview = async (): Promise<void> => {
    const projectKey = projectId ?? activeProject?.projectId;
    if (!projectKey) return;

    try {
      const targetRevision =
        clientBudgetHeader?.revision ??
        (typeof budgetHeader?.clientRevisionId === "number"
          ? budgetHeader.clientRevisionId
          : budgetHeader?.revision ?? null);
      if (targetRevision == null) return;

      if (clientBudgetHeader) {
        setInvoiceRevision(clientBudgetHeader as BudgetHeaderData);
        setInvoiceItems(clientBudgetItems as Array<Record<string, unknown>>);
        setIsInvoicePreviewOpen(true);
        return;
      }

      const header = await fetchBudgetHeader(projectKey, targetRevision);
      if (!header || !header.budgetId) return;
      const items = await fetchBudgetItems(
        String(header.budgetId),
        header.revision ?? targetRevision
      );
      setInvoiceRevision(header as BudgetHeaderData);
      setInvoiceItems(items as Array<Record<string, unknown>>);
      setIsInvoicePreviewOpen(true);
    } catch (err) {
      console.error("Failed to load invoice", err);
    }
  };

  const closeInvoicePreview = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e && "stopPropagation" in e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
    }
    setIsInvoicePreviewOpen(false);
    setInvoiceItems(null);
    // Restore focus state after modal close
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && typeof active.blur === "function") {
        active.blur();
      }
    }, 0);
  };
  const openBudgetPage = () => {
    if (!activeProject || !isAdmin) return;
    navigate(
      getProjectDashboardPath(activeProject.projectId, activeProject.title, "/budget")
    );
  };



  return (
    <div
      className="dashboard-item budget budget-component-container budget-overview-card"
      onClick={isAdmin && !isInvoicePreviewOpen ? openBudgetPage : undefined}
      style={{
        cursor: isAdmin ? "pointer" : "default",
        position: "relative",
        overflow: "visible",
        zIndex: 2,
      }}
    >
      <div className="budget-overview-summary">
        <span className="budget-overview-header" style={{ paddingLeft: "6px" }}>
          
          Budget
          {displayedRevision != null && (
            <span className="budget-overview-revision">{`Rev.${displayedRevision}`}</span>
          )}
        </span>

        {overviewLoading ? (
          <FontAwesomeIcon
            icon={faSpinner}
            spin
            className="budget-overview-spinner"
            aria-label="Loading budget"
          />
        ) : (
          <>
            <span className="budget-overview-amount">
              {overviewHeader ? formatUSD(ballparkValue) : "Not available"}
              {overviewHeader && (
                <FontAwesomeIcon
                  icon={faFileInvoiceDollar}
                  className="budget-overview-invoice-icon"
                  title="Invoice preview"
                  aria-label="Invoice preview"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    openInvoicePreview();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      openInvoicePreview();
                    }
                  }}
                />
              )}
            </span>

            <span className="budget-overview-date">
              {(() => {
                const createdAt = overviewHeader?.createdAt;
                return createdAt ? new Date(createdAt as string | number | Date).toLocaleDateString() : "No date";
              })()}
            </span>
          </>
        )}
      </div>

      {overviewLoading ? (
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <FontAwesomeIcon icon={faSpinner} spin aria-label="Loading chart" />
        </div>
      ) : (
        overviewHeader && (
          <>
            <div className="chart-legend-container">
              <div className="budget-chart">
                <DonutSlot>
                  <div className="donut-slot-fade-in">
                    <BudgetDonut
                      data={chartState.slices}
                      total={chartState.total}
                      palette={chartState.palette}
                      formatTooltip={formatTooltip}
                      totalFormatter={totalFormatter}
                    />
                  </div>
                </DonutSlot>
              </div>
            </div>
          </>
        )
      )}

      <ClientInvoicePreviewModal
        isOpen={isInvoicePreviewOpen}
        onRequestClose={closeInvoicePreview}
        revision={invoiceRevision}
        project={activeProject as Project}
        items={invoiceItems}
      />
    </div>
  );
};

export default React.memo(BudgetOverviewCard, (prev, next) =>
  prev.projectId === next.projectId
);











