import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import { formatUSD } from "@/shared/utils/budgetUtils";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import RevisionPillTooltip from "@/dashboard/project/features/budget/components/RevisionPillTooltip";
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
  const finalCostValue = stats.finalCost;
  const displayedRevision =
    clientBudgetHeader?.revision ??
    (typeof budgetHeader?.clientRevisionId === "number"
      ? budgetHeader?.clientRevisionId
      : budgetHeader?.revision ?? null);
  const isClientRevision =
    typeof (overviewHeader as { clientRevisionId?: number | null } | null)?.clientRevisionId ===
    "number";
  const revisionName = (overviewHeader as { revisionName?: string | null } | null)?.revisionName ?? null;

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
      >
        <span className="budget-overview-header" style={{ paddingLeft: "6px", display: "flex", alignItems: "center", gap: 8 }}>
          Budget
          {overviewLoading ? (
            <span
              className="budget-overview-skeleton budget-overview-skeleton-revision"
              aria-hidden="true"
            />
          ) : (
            displayedRevision != null && (
              <RevisionPillTooltip
                data={{
                  revisionNumber: Number(displayedRevision),
                  revisionName,
                  isClientVersion: isClientRevision,
                }}
              >
                <span
                  className="budget-overview-revision"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 6px",
                    borderRadius: 10,
                    background: "var(--bg-3, #f3f4f6)",
                    color: "var(--text-strong, #111827)",
                    fontSize: 11,
                    lineHeight: 1.2,
                  }}
                >
                  {isClientRevision && <span style={{ fontWeight: 600 }}>CLIENT</span>}
                  <span>{`Rev.${displayedRevision}`}</span>
                </span>
              </RevisionPillTooltip>
            )
          )}
        </span>

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
            <span className="budget-overview-amount">
              {overviewHeader
                ? finalCostValue > 0
                  ? formatUSD(finalCostValue)
                  : "Not set"
                : "Not available"}
            </span>
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











