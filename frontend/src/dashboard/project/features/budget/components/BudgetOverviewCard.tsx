import React from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import { formatCompactUSD } from "@/shared/utils/budgetUtils";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import RevisionPillTooltip from "@/dashboard/project/features/budget/components/RevisionPillTooltip";
import { ChevronRight } from "lucide-react";
// Ultra-clean Overview: no invoice preview or chart

// No local types needed now

interface BudgetOverviewCardProps {
  projectId?: string;
}

// Keep ultra-clean: no chart or websocket listeners here

const BudgetOverviewCard: React.FC<BudgetOverviewCardProps> = ({ projectId }) => {
  const { activeProject, isAdmin } = useData();
  const {
    budgetHeader,
    clientBudgetHeader,
    loading,
    clientLoading,
    getStats,
    getClientStats,
  } = useBudget();
  const navigate = useNavigate();

  const overviewHeader = clientBudgetHeader ?? budgetHeader;
  const overviewLoading = loading || clientLoading;
  const stats = clientBudgetHeader ? getClientStats() : getStats();
  const finalCostValue = stats?.finalCost ?? 0;
  const displayedRevision =
    clientBudgetHeader?.revision ??
    (typeof budgetHeader?.clientRevisionId === "number"
      ? budgetHeader?.clientRevisionId
      : budgetHeader?.revision ?? null);
  const isClientRevision =
    typeof (overviewHeader as { clientRevisionId?: number | null } | null)?.clientRevisionId ===
    "number";
  const revisionName = (overviewHeader as { revisionName?: string | null } | null)?.revisionName ?? null;

  const hasData = Boolean(overviewHeader);
  const hasValue = typeof finalCostValue === "number" && finalCostValue > 0;
  const displayValue = hasData ? (hasValue ? formatCompactUSD(finalCostValue) : "Not set") : "Not available";
  const displaySubLabel = hasData ? (hasValue ? "Client price" : "Not set") : "Not available";

  // No derived project key needed

  // No chart tooltips/formatters needed in clean Overview

  // Invoice preview removed from Overview for now
  const openBudgetPage = () => {
    if (!activeProject || !isAdmin) return;
    navigate(
      getProjectDashboardPath(activeProject.projectId, activeProject.title, "/budget")
    );
  };



  return (
    <div
      className="dashboard-item budget budget-component-container budget-overview-card"
      onClick={isAdmin ? openBudgetPage : undefined}
      style={{
        cursor: isAdmin ? "pointer" : "default",
        position: "relative",
        overflow: "visible",
        zIndex: 2,
      }}
    >
      <div
        className={`budget-overview-summary${
          overviewLoading ? " budget-overview-summary--loading" : ""
        }`}
        role={overviewLoading ? "status" : undefined}
        aria-live={overviewLoading ? "polite" : undefined}
        aria-busy={overviewLoading}
        style={{ position: "relative" }}
      >
        <span
          className="budget-overview-header"
          style={{
            paddingLeft: "6px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-muted, #9aa0a6)",
            fontWeight: 600,
            fontSize: "0.95rem",
          }}
        >
          Budget
        </span>

        {!overviewLoading && displayedRevision != null && (
          <div style={{ position: "absolute", top: 0, right: 0 }}>
            <RevisionPillTooltip
              data={{
                revisionNumber: Number(displayedRevision),
                revisionName,
                isClientVersion: isClientRevision,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  height: 22,
                  borderRadius: 999,
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "var(--text-muted, rgba(255, 255, 255, 0.72))",
                  fontSize: 11,
                  lineHeight: 1.2,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                }}
              >
                <span>{`REV ${displayedRevision}`}</span>
                {isClientRevision && (
                  <span
                    aria-label="Published revision"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#fbbf24",
                      display: "inline-block",
                    }}
                  />
                )}
              </span>
            </RevisionPillTooltip>
          </div>
        )}

        {overviewLoading ? (
          <>
            <span
              className="budget-overview-skeleton budget-overview-skeleton-amount"
              aria-hidden="true"
            />
            <span
              className="budget-overview-skeleton budget-overview-skeleton-date"
              aria-hidden="true"
            />
            <span className="visually-hidden">Loading budget summary</span>
          </>
        ) : (
          <>
            <span
              className="budget-overview-amount"
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span style={{ fontWeight: 700 }}>{displayValue}</span>
              <span style={{ color: "var(--text-muted, #9aa0a6)", fontSize: "0.95rem" }}>
                {displaySubLabel}
              </span>
            </span>
            {!overviewLoading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 12,
                  color: "var(--text-muted, #9aa0a6)",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span>Open Budget</span>
                  <ChevronRight size={16} />
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Path A — Keep Overview ultra-clean: hide chart/legend and invoice preview */}
    </div>
  );
};

export default React.memo(BudgetOverviewCard, (prev, next) =>
  prev.projectId === next.projectId
);











