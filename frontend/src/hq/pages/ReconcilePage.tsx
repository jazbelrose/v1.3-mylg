import React, { useState, useEffect, useMemo } from "react";
import HQLayout from "../components/HQLayout";
import AttachTransactionModal from "../components/AttachTransactionModal";
import { getAllocationsByTransaction } from "../services/allocationsApi";
import { apiFetch } from "@/shared/utils/api";
import type { HQTxn, TxnAllocation } from "../types";
import type { Project } from "@/shared/utils/api";
import styles from "./ReconcilePage.module.css";

// Mock transactions for demo (in production, fetch from API)
const MOCK_TXNS: HQTxn[] = [
  {
    id: "txn-1",
    accountId: "acct-operating",
    date: "2024-06-12",
    amount: 1250,
    isDebit: true,
    name: "Adobe Creative Cloud",
    merchant: "Adobe",
    category: ["Software", "Design"],
    tags: ["Subscription"],
    note: "Annual renewal",
  },
  {
    id: "txn-2",
    accountId: "acct-operating",
    date: "2024-06-10",
    amount: 5850,
    isDebit: true,
    name: "RMC Logistics",
    merchant: "RMC",
    category: ["Production"],
    tags: ["Event"],
  },
  {
    id: "txn-3",
    accountId: "acct-operating",
    date: "2024-06-09",
    amount: 19000,
    isDebit: false,
    name: "Invoice #2041",
    merchant: "Spotify",
    category: ["Income", "Client"],
    tags: ["Accounts Receivable"],
  },
  {
    id: "txn-4",
    accountId: "acct-card",
    date: "2024-06-07",
    amount: 420,
    isDebit: true,
    name: "WeWork Downtown",
    merchant: "WeWork",
    category: ["Facilities"],
    tags: ["Meeting"],
  },
  {
    id: "txn-5",
    accountId: "acct-operating",
    date: "2024-06-05",
    amount: 2500,
    isDebit: true,
    name: "Camera Equipment Rental",
    merchant: "LensRentals",
    category: ["Production", "Equipment"],
  },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const ReconcilePage: React.FC = () => {
  const [transactions, setTransactions] = useState<HQTxn[]>(MOCK_TXNS);
  const [allocations, setAllocations] = useState<Map<string, TxnAllocation[]>>(
    new Map()
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<HQTxn | null>(
    null
  );
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "unassigned" | "partial" | "complete">("unassigned");
  const [isLoading, setIsLoading] = useState(false);

  // Load projects and allocations on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // TODO: Get userId from authentication context
        // Example: const { userId } = useAuth();
        const userId = "current-user-id"; // Placeholder for development
        
        // Load projects
        const projectsData = await apiFetch<Project[]>(
          `${import.meta.env.VITE_API_BASE_URL}/projects?userId=${userId}`
        );
        setProjects(projectsData);

        // Load allocations for all transactions
        const allocsMap = new Map<string, TxnAllocation[]>();
        for (const txn of MOCK_TXNS) {
          try {
            const txnAllocs = await getAllocationsByTransaction(txn.id);
            allocsMap.set(txn.id, txnAllocs);
          } catch (err) {
            console.error(`Failed to load allocations for ${txn.id}:`, err);
            allocsMap.set(txn.id, []);
          }
        }
        setAllocations(allocsMap);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Calculate allocation status for each transaction
  const enrichedTransactions = useMemo(() => {
    return transactions.map((txn) => {
      const txnAllocations = allocations.get(txn.id) || [];
      const totalAllocated = txnAllocations.reduce(
        (sum, alloc) => sum + alloc.allocatedAmount,
        0
      );
      const isFullyAllocated = Math.abs(totalAllocated - txn.amount) < 0.01;
      const isPartiallyAllocated = totalAllocated > 0 && !isFullyAllocated;

      return {
        ...txn,
        allocations: txnAllocations,
        totalAllocated,
        isFullyAllocated,
        isPartiallyAllocated,
      };
    });
  }, [transactions, allocations]);

  // Filter transactions by status
  const filteredTransactions = useMemo(() => {
    switch (filterStatus) {
      case "unassigned":
        return enrichedTransactions.filter((txn) => txn.totalAllocated === 0);
      case "partial":
        return enrichedTransactions.filter((txn) => txn.isPartiallyAllocated);
      case "complete":
        return enrichedTransactions.filter((txn) => txn.isFullyAllocated);
      default:
        return enrichedTransactions;
    }
  }, [enrichedTransactions, filterStatus]);

  // Calculate reconciliation stats
  const stats = useMemo(() => {
    const total = enrichedTransactions.length;
    const unassigned = enrichedTransactions.filter(
      (txn) => txn.totalAllocated === 0
    ).length;
    const partial = enrichedTransactions.filter(
      (txn) => txn.isPartiallyAllocated
    ).length;
    const complete = enrichedTransactions.filter(
      (txn) => txn.isFullyAllocated
    ).length;
    const percentComplete =
      total > 0 ? Math.round((complete / total) * 100) : 0;

    return { total, unassigned, partial, complete, percentComplete };
  }, [enrichedTransactions]);

  const handleAttachClick = (txn: HQTxn) => {
    setSelectedTransaction(txn);
    setAttachModalOpen(true);
  };

  const handleAttachSuccess = async () => {
    // Reload allocations for the selected transaction
    if (selectedTransaction) {
      try {
        const txnAllocs = await getAllocationsByTransaction(
          selectedTransaction.id
        );
        setAllocations((prev) => {
          const updated = new Map(prev);
          updated.set(selectedTransaction.id, txnAllocs);
          return updated;
        });
      } catch (err) {
        console.error("Failed to reload allocations:", err);
      }
    }
  };

  const handleMarkAsNonProject = (txnId: string) => {
    // Mark transaction as non-project cost
    // In production, this would call an API to tag the transaction
    // or add it to an exclusion list
    console.log("Mark as non-project cost:", txnId);
    // TODO: Implement API call when backend endpoint is available
    // Example: await markTransactionAsNonProject(txnId);
    // Could add a tag like "non-project" or category "Owner Draw"
  };

  return (
    <HQLayout
      title="Reconcile Transactions"
      description="Match transactions to projects and budget lines. Get to 100% reconciled."
    >
      <div className={styles.page}>
        {/* Progress Banner */}
        <div className={styles.progressBanner}>
          <div className={styles.progressInfo}>
            <h3 className={styles.progressTitle}>Reconciliation Progress</h3>
            <div className={styles.progressStats}>
              <span>{stats.complete} of {stats.total} transactions reconciled</span>
              <span className={styles.progressPercent}>{stats.percentComplete}%</span>
            </div>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${stats.percentComplete}%` }}
            />
          </div>
        </div>

        {/* Status Filter */}
        <div className={styles.filters}>
          <button
            className={`${styles.filterButton} ${
              filterStatus === "unassigned" ? styles.active : ""
            }`}
            onClick={() => setFilterStatus("unassigned")}
          >
            Unassigned ({stats.unassigned})
          </button>
          <button
            className={`${styles.filterButton} ${
              filterStatus === "partial" ? styles.active : ""
            }`}
            onClick={() => setFilterStatus("partial")}
          >
            Partial ({stats.partial})
          </button>
          <button
            className={`${styles.filterButton} ${
              filterStatus === "complete" ? styles.active : ""
            }`}
            onClick={() => setFilterStatus("complete")}
          >
            Complete ({stats.complete})
          </button>
          <button
            className={`${styles.filterButton} ${
              filterStatus === "all" ? styles.active : ""
            }`}
            onClick={() => setFilterStatus("all")}
          >
            All ({stats.total})
          </button>
        </div>

        {/* Transactions List */}
        {isLoading ? (
          <div className={styles.loading}>Loading transactions...</div>
        ) : filteredTransactions.length === 0 ? (
          <div className={styles.emptyState}>
            <h4>No {filterStatus} transactions</h4>
            <p>
              {filterStatus === "unassigned"
                ? "Great! All transactions are assigned."
                : "Try changing the filter to see other transactions."}
            </p>
          </div>
        ) : (
          <div className={styles.transactionsList}>
            {filteredTransactions.map((txn) => (
              <div key={txn.id} className={styles.transactionCard}>
                <div className={styles.transactionHeader}>
                  <div className={styles.transactionInfo}>
                    <h4 className={styles.transactionName}>{txn.name}</h4>
                    <p className={styles.transactionMeta}>
                      {new Date(txn.date).toLocaleDateString()} •{" "}
                      {txn.merchant || "Unknown merchant"}
                    </p>
                  </div>
                  <div className={styles.transactionAmount}>
                    <span
                      className={
                        txn.isDebit
                          ? styles.amountDebit
                          : styles.amountCredit
                      }
                    >
                      {txn.isDebit ? "-" : "+"}
                      {currency.format(txn.amount)}
                    </span>
                  </div>
                </div>

                {/* Allocation Status */}
                {txn.allocations && txn.allocations.length > 0 && (
                  <div className={styles.allocations}>
                    <h5 className={styles.allocationsTitle}>Allocations:</h5>
                    {txn.allocations.map((alloc) => {
                      const project = projects.find(
                        (p) => p.projectId === alloc.projectId
                      );
                      return (
                        <div key={alloc.allocationId} className={styles.allocation}>
                          <span className={styles.allocationProject}>
                            {project?.name || alloc.projectId}
                          </span>
                          <span className={styles.allocationAmount}>
                            ${alloc.allocatedAmount.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                    {txn.isPartiallyAllocated && (
                      <div className={styles.allocationRemaining}>
                        Remaining: $
                        {(txn.amount - txn.totalAllocated).toFixed(2)}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className={styles.actions}>
                  <button
                    className={styles.actionButton}
                    onClick={() => handleAttachClick(txn)}
                  >
                    {txn.totalAllocated > 0 ? "Add/Edit" : "Attach to Project"}
                  </button>
                  {txn.totalAllocated === 0 && (
                    <button
                      className={styles.actionButtonSecondary}
                      onClick={() => handleMarkAsNonProject(txn.id)}
                    >
                      Not a Project Cost
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AttachTransactionModal
        isOpen={attachModalOpen}
        onClose={() => setAttachModalOpen(false)}
        transaction={selectedTransaction}
        onSuccess={handleAttachSuccess}
      />
    </HQLayout>
  );
};

export default ReconcilePage;
