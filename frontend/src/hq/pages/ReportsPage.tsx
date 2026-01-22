import React, { useMemo, useState, useCallback } from "react";
import { toast } from "react-toastify";
import { useParams } from "react-router-dom";
import HQLayout from "../components/HQLayout";
import ImportBundleModal from "../components/ImportBundleModal";
import { downloadHqBundle, downloadHqCsv } from "../lib/hqApi";
import styles from "./ReportsPage.module.css";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

const plData = [
  { category: "Income", monthly: [32000, 34000, 41000, 43000, 47000, 45500] },
  { category: "Cost of goods", monthly: [-12000, -13800, -16200, -17000, -18200, -17600] },
  { category: "Operating", monthly: [-8500, -9200, -9800, -10100, -11200, -10800] },
  { category: "Net", monthly: [11500, 11000, 15000, 15900, 17600, 17100] },
];

const cashFlowData = [
  { month: "Apr", inflow: 46000, outflow: 39000 },
  { month: "May", inflow: 51000, outflow: 42000 },
  { month: "Jun", inflow: 48800, outflow: 40500 },
];

const ReportsPage: React.FC = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const [activeTab, setActiveTab] = useState<"pl" | "cashflow">("pl");
  const [isExporting, setIsExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const totals = useMemo(() => {
    const plTotals = plData.map((row) => ({
      category: row.category,
      total: row.monthly.reduce((acc, val) => acc + val, 0),
    }));

    const maxCashflow = Math.max(
      ...cashFlowData.flatMap((row) => [row.inflow, row.outflow])
    );

    return { plTotals, maxCashflow };
  }, []);

  const handleExportCsv = useCallback(async () => {
    if (!orgId || isExporting) return;
    setIsExporting(true);
    try {
      await downloadHqCsv(orgId);
      toast.success("CSV exported successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export CSV");
    } finally {
      setIsExporting(false);
    }
  }, [orgId, isExporting]);

  const handleExportBundle = useCallback(async () => {
    if (!orgId || isExporting) return;
    setIsExporting(true);
    try {
      await downloadHqBundle(orgId);
      toast.success("Memry backup exported successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export backup");
    } finally {
      setIsExporting(false);
    }
  }, [orgId, isExporting]);

  const handleImportComplete = useCallback(() => {
    toast.info("Refresh the page to see updated categories.");
  }, []);

  const actions = (
    <div className={styles.actionsRow}>
      <button
        type="button"
        className={styles.actionButton}
        aria-label="Export transactions as CSV"
        onClick={handleExportCsv}
        disabled={isExporting}
      >
        Export CSV
      </button>
      <button
        type="button"
        className={styles.actionButton}
        aria-label="Export full backup as Memry bundle"
        onClick={handleExportBundle}
        disabled={isExporting}
      >
        Export Backup
      </button>
      <button
        type="button"
        className={styles.actionButton}
        aria-label="Import Memry backup"
        onClick={() => setShowImportModal(true)}
      >
        Import Backup
      </button>
    </div>
  );

  return (
    <HQLayout
      title="Reports"
      description="Drill into profitability and cash flow for HQ. Select a tab to view P&L or Cash Flow statements."
      actions={actions}
    >
      <div className={styles.page}>
        <div className={styles.tabs} role="tablist" aria-label="HQ reports">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pl"}
            className={[styles.tabButton, activeTab === "pl" ? styles.tabButtonActive : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setActiveTab("pl")}
          >
            Profit & Loss
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "cashflow"}
            className={[styles.tabButton, activeTab === "cashflow" ? styles.tabButtonActive : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setActiveTab("cashflow")}
          >
            Cash Flow
          </button>
        </div>

        {activeTab === "pl" ? (
          <section className={styles.section} aria-label="Profit and loss statement">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  {months.map((month) => (
                    <th key={month} scope="col">
                      {month}
                    </th>
                  ))}
                  <th scope="col">YTD</th>
                </tr>
              </thead>
              <tbody>
                {plData.map((row) => (
                  <tr key={row.category}>
                    <th scope="row">{row.category}</th>
                    {row.monthly.map((value, index) => (
                      <td key={months[index]}>{value.toLocaleString()}</td>
                    ))}
                    <td>
                      {totals.plTotals
                        .find((totalRow) => totalRow.category === row.category)
                        ?.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <section className={styles.section} aria-label="Cash flow report">
            <div className={styles.chartRow}>
              {cashFlowData.map((row) => {
                const inflowPercent = Math.round((row.inflow / totals.maxCashflow) * 100);
                const outflowPercent = Math.round((row.outflow / totals.maxCashflow) * 100);
                return (
                  <article key={row.month} className={styles.chartBlock}>
                    <header>
                      <h3>{row.month}</h3>
                      <p aria-label={`Inflow ${row.inflow.toLocaleString()} and outflow ${row.outflow.toLocaleString()}`}>
                        In {row.inflow.toLocaleString()} • Out {row.outflow.toLocaleString()}
                      </p>
                    </header>
                    <div className={styles.chartBarShell} aria-hidden>
                      <div
                        className={styles.chartBarFill}
                        style={{ width: `${inflowPercent}%` }}
                        title={`Inflow ${row.inflow.toLocaleString()}`}
                      />
                    </div>
                    <div className={styles.chartBarShell} aria-hidden>
                      <div
                        className={styles.chartBarFill}
                        style={{ width: `${outflowPercent}%`, background: "rgba(255, 255, 255, 0.5)" }}
                        title={`Outflow ${row.outflow.toLocaleString()}`}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {orgId && (
        <ImportBundleModal
          orgId={orgId}
          isOpen={showImportModal}
          onRequestClose={() => setShowImportModal(false)}
          onImported={handleImportComplete}
        />
      )}
    </HQLayout>
  );
};

export default ReportsPage;
