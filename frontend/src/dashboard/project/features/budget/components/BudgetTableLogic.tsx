import React, { useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faClone } from "@fortawesome/free-solid-svg-icons";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { formatUSD } from "@/shared/utils/budgetUtils";
import styles from "@/dashboard/project/features/budget/pages/budget-page.module.css";

type TableColumn = Record<string, unknown>;
type TableData = Record<string, unknown>;

interface BudgetTableLogicProps {
  groupBy: string;
  sortField: string | null;
  sortOrder: string | null;
  filterQuery: string;
  selectedRowKeys: string[];
  setSelectedRowKeys: (keys: string[] | ((prev: string[]) => string[])) => void;
  openDeleteModal: (ids: string[]) => void;
  openDuplicateModal: (item: Record<string, unknown>) => void;
  children: (tableConfig: BudgetTableConfig) => React.ReactNode;
}

interface BudgetTableConfig {
  tableColumns: TableColumn[];
  tableData: TableData[];
  sortedTableData: TableData[];
  groupedTableData: TableData[];
  mainColumnsOrder: string[];
}

const EMPTY_PLACEHOLDER = "\u2014";

type NormalizedPaymentStatus = "PAID" | "PARTIAL" | "UNPAID";

const normalizePaymentStatus = (status: unknown): NormalizedPaymentStatus => {
  if (typeof status !== "string") return "UNPAID";
  const cleaned = status.replace(/[�.]+$/, "").trim().toUpperCase();
  if (!cleaned) return "UNPAID";
  if (cleaned.includes("UNPAID")) return "UNPAID";
  if (cleaned.includes("PART")) return "PARTIAL";
  if (cleaned.includes("PAID")) return "PAID";
  return "UNPAID";
};

const BudgetTableLogic: React.FC<BudgetTableLogicProps> = ({
  groupBy,
  sortField,
  sortOrder,
  filterQuery,
  selectedRowKeys,
  setSelectedRowKeys,
  openDeleteModal,
  openDuplicateModal,
  children,
}) => {
  const { getRows } = useBudget();
  
  // Use context selectors for data
  const budgetItems = getRows();

  const normalizedQuery = filterQuery.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return budgetItems;
    }

    const searchableKeys = [
      "elementKey",
      "elementId",
      "description",
      "category",
      "areaGroup",
      "invoiceGroup",
      "paymentStatus",
    ];

    return budgetItems.filter((item) => {
      return searchableKeys.some((key) => {
        const value = item[key as keyof typeof item];
        if (value === undefined || value === null) return false;
        return String(value).toLowerCase().includes(normalizedQuery);
      });
    });
  }, [budgetItems, normalizedQuery]);

  const isDefined = useCallback((val: unknown) => {
    if (val === undefined || val === null) return false;
    const str = String(val).trim();
    if (!str) return false;
    const num = parseFloat(str.replace(/[$,]/g, ""));
    if (!Number.isNaN(num)) {
      return num !== 0;
    }
    return str !== "0";
  }, []);

  const baseColumnsOrder = useMemo(() => [
    "elementKey",
    "elementId",
    "description",
    "quantity",
    "unit",
    "itemBudgetedCost",
    "itemActualCost",
    "itemMarkUp",
    "itemFinalCost",
  ], []);

  const mainColumnsOrder = useMemo(
    () =>
      groupBy !== "none" ? [groupBy, ...baseColumnsOrder] : baseColumnsOrder,
    [groupBy, baseColumnsOrder]
  );

  const columnHeaderMap = useMemo(() => ({
    elementKey: "Element Key",
    elementId: "Element ID",
    category: "Category",
    areaGroup: "Area Group",
    invoiceGroup: "Invoice Group",
    description: "Description",
    quantity: "Quantity",
    unit: "Unit",
    dates: "Dates",
    itemBudgetedCost: "Planned Cost",
    itemActualCost: "Actual Cost",
    itemMarkUp: "Markup",
    itemFinalCost: "Client Price",
  }), []);

    const tableColumns = useMemo(() => {
    const hidden = [
      "projectId",
      "budgetItemId",
      "budgetId",
      "title",
      "startDate",
      "endDate",
      "itemCost",
      "paymentStatus",
    ];
    const safeBudgetItems = filteredItems.filter(Boolean);
    const available = safeBudgetItems.length
      ? Array.from(
          new Set([
            ...mainColumnsOrder,
            ...safeBudgetItems.flatMap((it) => Object.keys(it)),
          ])
        ).filter((key) => !hidden.includes(key))
      : mainColumnsOrder;
    const costKeys = [
      "itemBudgetedCost",
      "itemActualCost",
      "itemFinalCost",
    ];
    const allIds = safeBudgetItems.map((it) => String(it.budgetItemId));
    const cols = mainColumnsOrder
      .map((key) => {
        if (key === "dates") {
          return {
            title: columnHeaderMap[key],
            dataIndex: "dates",
            key: "dates",
          };
        }
        if (available.includes(key)) {
          const base: TableColumn = {
            title: columnHeaderMap[key] || key,
            dataIndex: key,
            key,
            sorter: () => 0,
            sortOrder: sortField === key ? sortOrder : null,
          };
          if (key === "elementKey") {
            base.title = (
              <span className={styles.elementKeyCell}>
                <input
                  type="checkbox"
                  checked={
                    allIds.length > 0 && selectedRowKeys.length === allIds.length
                  }
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selectedRowKeys.length > 0 &&
                        selectedRowKeys.length < allIds.length;
                    }
                  }}
                  onChange={(e) => {
                    const { checked } = e.target;
                    setSelectedRowKeys(checked ? allIds : []);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span style={{ marginLeft: "15px" }}>{columnHeaderMap[key]}</span>
              </span>
            );
            base.render = (value: unknown, record: TableData) => (
              <span className={styles.elementKeyCell}>
                <input
                  type="checkbox"
                  checked={selectedRowKeys.includes(String(record.budgetItemId))}
                  onChange={(e) => {
                    const { checked } = e.target;
                    const next = checked
                      ? Array.from(new Set([...selectedRowKeys, String(record.budgetItemId)]))
                      : selectedRowKeys.filter((k) => k !== String(record.budgetItemId));
                    setSelectedRowKeys(next);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span style={{ marginLeft: "15px" }}>{String(value)}</span>
              </span>
            );
          }
          if (key === "itemMarkUp") {
            base.render = (value: unknown) =>
              typeof value === "number" ? `${Math.round(value * 100)}%` : String(value);
          } else if (costKeys.includes(key)) {
            base.render = (value: unknown, record: TableData) => {
              if (key === "itemFinalCost") {
                const hasValue = isDefined(value);
                const amount = hasValue ? formatUSD(Number(value)) : EMPTY_PLACEHOLDER;
                const status = normalizePaymentStatus(record.paymentStatus);
                const statusLabel =
                  status === "PAID" ? "Paid" : status === "PARTIAL" ? "Partially paid" : "Unpaid";
                const statusClass =
                  status === "PAID"
                    ? styles.paid
                    : status === "PARTIAL"
                    ? styles.partial
                    : styles.unpaid;

                return (
                  <span className={styles.costWithStatus}>
                    {amount}
                    <span
                      className={`${styles.statusDot} ${statusClass}`}
                      role="img"
                      aria-label={`${statusLabel} status`}
                    />
                  </span>
                );
              }

              if (!isDefined(value)) return "";
              return <span>{formatUSD(Number(value))}</span>;
            };
          }
          if (groupBy !== "none" && key === groupBy) {
            base.className = styles.groupColumn;
            const origRender = base.render as ((value: unknown, record: TableData, index: number) => React.ReactNode) | undefined;
            base.render = (value: unknown, record: TableData, index: number) => {
              const span = record[`${groupBy}RowSpan`];
              const children = origRender
                ? origRender(value, record, index)
                : String(value);
              return { children, props: { rowSpan: span } };
            };
          }
          return base;
        }
        return null;
      })
      .filter(Boolean);

    cols.push({
      title: "",
      key: "actions",
      align: "center",
      render: (_value: unknown, record: TableData) => (
        <div className={styles.actionButtons}>
          <button
            className={styles.duplicateButton}
            onClick={(e) => {
              e.stopPropagation();
              openDuplicateModal(record);
            }}
            aria-label="Duplicate line item"
          >
            <FontAwesomeIcon icon={faClone} />
          </button>
          <button
            className={styles.deleteButton}
            onClick={(e) => {
              e.stopPropagation();
              openDeleteModal([String(record.budgetItemId)]);
            }}
            aria-label="Delete line item"
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      ),
      width: 60,
    });
    return cols;
  }, [
    filteredItems,
    groupBy,
    mainColumnsOrder,
    sortField,
    sortOrder,
    selectedRowKeys,
    setSelectedRowKeys,
    isDefined,
    openDuplicateModal,
    openDeleteModal,
    columnHeaderMap,
  ]);

  const tableData = useMemo(
    () =>
      filteredItems.map((item) => ({
        ...item,
        key: item.budgetItemId,
      })),
    [filteredItems]
  );

  const sortedTableData = useMemo(() => {
    const compareValues = (a: unknown, b: unknown) => {
      if (a === b) return 0;
      if (a === undefined || a === null) return -1;
      if (b === undefined || b === null) return 1;
      if (typeof a === "number" && typeof b === "number") {
        return a - b;
      }
      return String(a).localeCompare(String(b));
    };

    const data = tableData.slice();

    data.sort((a, b) => {
      if (groupBy !== "none") {
        const groupComp = compareValues(a[groupBy], b[groupBy]);
        if (groupComp !== 0) {
          // If sorting the group column itself allow descend/ascend
          if (sortField === groupBy && sortOrder === "descend") {
            return -groupComp;
          }
          return groupComp;
        }
      }

      if (sortField && sortField !== groupBy) {
        const fieldComp = compareValues(a[sortField], b[sortField]);
        return sortOrder === "descend" ? -fieldComp : fieldComp;
      }

      return 0;
    });

    return data;
  }, [tableData, groupBy, sortField, sortOrder]);

  const groupedTableData = useMemo(() => {
    if (groupBy === "none") {
      return sortedTableData.map((row) => ({ ...row }));
    }

    const result = [];
    let i = 0;

    while (i < sortedTableData.length) {
      const current = sortedTableData[i][groupBy];
      let j = i + 1;
      while (j < sortedTableData.length && sortedTableData[j][groupBy] === current) {
        j++;
      }

      const groupRows = sortedTableData.slice(i, j);
      const span = groupRows.length;

      for (let k = i; k < j; k++) {
        const row = { ...sortedTableData[k] };
        row[`${groupBy}RowSpan`] = k === i ? span : 0;
        result.push(row);
      }

      i = j;
    }

    return result;
  }, [sortedTableData, groupBy]);

  const tableConfig: BudgetTableConfig = useMemo(() => ({
    tableColumns,
    tableData,
    sortedTableData,
    groupedTableData,
    mainColumnsOrder,
  }), [tableColumns, tableData, sortedTableData, groupedTableData, mainColumnsOrder]);

  return <>{children(tableConfig)}</>;
};

export default BudgetTableLogic;











