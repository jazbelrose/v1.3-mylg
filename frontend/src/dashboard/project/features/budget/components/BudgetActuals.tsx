import React, { useEffect, useState } from "react";
import { apiFetch } from "@/shared/utils/api";
import styles from "./BudgetActuals.module.css";

interface BudgetActualsData {
  projectId: string;
  actualsByBudgetItem: Record<
    string,
    {
      budgetItemId: string;
      totalAllocated: number;
      allocationCount: number;
    }
  >;
  totalAllocations: number;
}

interface BudgetActualsProps {
  projectId: string;
  budgetItems?: Array<{
    budgetItemId: string;
    itemName?: string;
    budgetedCost?: number;
  }>;
}

const BudgetActuals: React.FC<BudgetActualsProps> = ({
  projectId,
  budgetItems = [],
}) => {
  const [actualsData, setActualsData] = useState<BudgetActualsData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchActuals = async () => {
      if (!projectId) return;

      setIsLoading(true);
      setError("");

      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
        const data = await apiFetch<BudgetActualsData>(
          `${API_BASE}/projects/${projectId}/budget/actuals`
        );
        setActualsData(data);
      } catch (err) {
        console.error("Failed to fetch budget actuals:", err);
        setError("Failed to load actuals data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchActuals();
  }, [projectId]);

  if (isLoading) {
    return <div className={styles.loading}>Loading actuals...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (!actualsData || Object.keys(actualsData.actualsByBudgetItem).length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No transaction allocations yet.</p>
        <p className={styles.hint}>
          Use HQ → Transactions to attach transactions to budget line items.
        </p>
      </div>
    );
  }

  // Merge budget items with actuals data
  const enrichedItems = budgetItems
    .filter((item) => item.budgetItemId?.startsWith("LINE-"))
    .map((item) => {
      const actuals =
        actualsData.actualsByBudgetItem[item.budgetItemId] || null;
      const budgeted = item.budgetedCost || 0;
      const spent = actuals?.totalAllocated || 0;
      const remaining = budgeted - spent;
      const variance = spent - budgeted;
      const variancePercent =
        budgeted > 0 ? ((variance / budgeted) * 100).toFixed(1) : "0.0";

      return {
        ...item,
        actuals,
        budgeted,
        spent,
        remaining,
        variance,
        variancePercent,
        isOverBudget: variance > 0,
      };
    })
    .filter((item) => item.actuals !== null); // Only show items with allocations

  if (enrichedItems.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No allocations for tracked budget items yet.</p>
      </div>
    );
  }

  // Calculate totals
  const totals = enrichedItems.reduce(
    (acc, item) => ({
      budgeted: acc.budgeted + item.budgeted,
      spent: acc.spent + item.spent,
      remaining: acc.remaining + item.remaining,
    }),
    { budgeted: 0, spent: 0, remaining: 0 }
  );

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Budget Actuals & Variance</h3>

      <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Total Budgeted</span>
          <span className={styles.summaryValue}>
            ${totals.budgeted.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Total Spent</span>
          <span className={styles.summaryValue}>
            ${totals.spent.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Remaining</span>
          <span
            className={`${styles.summaryValue} ${
              totals.remaining < 0 ? styles.negative : ""
            }`}
          >
            ${totals.remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Line Item</th>
              <th className={styles.numberColumn}>Budgeted</th>
              <th className={styles.numberColumn}>Spent (Actuals)</th>
              <th className={styles.numberColumn}>Remaining</th>
              <th className={styles.numberColumn}>Variance</th>
              <th className={styles.numberColumn}>Txns</th>
            </tr>
          </thead>
          <tbody>
            {enrichedItems.map((item) => (
              <tr
                key={item.budgetItemId}
                className={item.isOverBudget ? styles.overBudget : ""}
              >
                <td className={styles.itemName}>
                  {item.itemName || item.budgetItemId}
                </td>
                <td className={styles.numberColumn}>
                  ${item.budgeted.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
                <td className={styles.numberColumn}>
                  ${item.spent.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
                <td
                  className={`${styles.numberColumn} ${
                    item.remaining < 0 ? styles.negative : ""
                  }`}
                >
                  ${item.remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
                <td
                  className={`${styles.numberColumn} ${
                    item.isOverBudget ? styles.negative : styles.positive
                  }`}
                >
                  {item.variance >= 0 ? "+" : ""}
                  ${item.variance.toLocaleString("en-US", { minimumFractionDigits: 2 })} (
                  {item.variancePercent}%)
                </td>
                <td className={styles.numberColumn}>
                  {item.actuals?.allocationCount || 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BudgetActuals;
