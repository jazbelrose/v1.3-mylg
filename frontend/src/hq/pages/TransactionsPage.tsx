import React, { useMemo, useState } from "react";
import HQLayout from "../components/HQLayout";
import AttachTransactionModal from "../components/AttachTransactionModal";
import type { HQTxn } from "../types";
import styles from "./TransactionsPage.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

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
];

const TransactionsPage: React.FC = () => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<HQTxn | null>(null);

  const filteredTxns = useMemo(() => {
    let txns = MOCK_TXNS;
    
    // Filter by unassigned if checkbox is checked
    if (showUnassignedOnly) {
      txns = txns.filter((txn) => !txn.isFullyAllocated);
    }
    
    // Filter by search term
    if (!searchTerm) return txns;
    const term = searchTerm.toLowerCase();
    return txns.filter((txn) =>
      [txn.name, txn.merchant, ...(txn.tags ?? []), ...(txn.category ?? [])]
        .filter(Boolean)
        .some((field) => field?.toLowerCase().includes(term))
    );
  }, [searchTerm, showUnassignedOnly]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allVisibleSelected = filteredTxns.every((txn) => selectedIds.has(txn.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredTxns.forEach((txn) => next.delete(txn.id));
      } else {
        filteredTxns.forEach((txn) => next.add(txn.id));
      }
      return next;
    });
  };

  const selectionCount = selectedIds.size;

  const handleAttachClick = (txn: HQTxn) => {
    setSelectedTransaction(txn);
    setAttachModalOpen(true);
  };

  const handleAttachSuccess = () => {
    // Refresh transactions data
    // In a real implementation, this would refetch from the API
    console.log("Transaction attached successfully");
  };

  return (
    <HQLayout
      title="Transactions"
      description="Review and classify every transaction. Use HQ rules to automate tags, notes, and categories."
    >
      <div className={styles.page}>
        <div className={styles.filters}>
          <input
            className={styles.filterField}
            type="search"
            placeholder="Search by merchant or tag"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Search transactions"
          />
          <input className={styles.filterField} type="month" aria-label="Start month" />
          <input className={styles.filterField} type="month" aria-label="End month" />
          <select className={styles.filterField} aria-label="Filter by category">
            <option>All categories</option>
            <option>Software</option>
            <option>Production</option>
            <option>Facilities</option>
            <option>Income</option>
          </select>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showUnassignedOnly}
              onChange={(e) => setShowUnassignedOnly(e.target.checked)}
            />
            <span>Unassigned only</span>
          </label>
        </div>

        {selectionCount > 0 ? (
          <div className={styles.bulkBar} role="status" aria-live="polite">
            <span>{selectionCount} selected</span>
            <button type="button" className={styles.bulkButton}>
              Create rule from selection
            </button>
            <button type="button" className={styles.bulkButton}>
              Tag selected
            </button>
            <button type="button" className={styles.bulkButton}>
              Export CSV
            </button>
          </div>
        ) : null}

        {filteredTxns.length === 0 ? (
          <div className={styles.emptyState} role="status">
            No transactions for this range. Try expanding the date filter.
          </div>
        ) : (
          <div className={styles.tableWrapper} role="region" aria-label="Transactions table">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">
                    <input
                      type="checkbox"
                      aria-label="Select all visible transactions"
                      checked={allVisibleSelected && filteredTxns.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th scope="col">Date</th>
                  <th scope="col">Name</th>
                  <th scope="col">Category</th>
                  <th scope="col">Tags</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map((txn) => (
                  <tr key={txn.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select transaction ${txn.name}`}
                        checked={selectedIds.has(txn.id)}
                        onChange={() => toggleSelection(txn.id)}
                      />
                    </td>
                    <td>{new Date(txn.date).toLocaleDateString()}</td>
                    <td>{txn.name}</td>
                    <td>
                      {(txn.category ?? []).map((category) => (
                        <span key={category} className={styles.tagPill}>
                          {category}
                        </span>
                      ))}
                    </td>
                    <td>
                      {(txn.tags ?? []).map((tag) => (
                        <span key={tag} className={styles.tagPill}>
                          {tag}
                        </span>
                      ))}
                    </td>
                    <td className={txn.isDebit ? styles.amountDebit : styles.amountCredit}>
                      {txn.isDebit ? "-" : "+"}
                      {currency.format(txn.amount)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.attachButton}
                        onClick={() => handleAttachClick(txn)}
                      >
                        Attach
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

export default TransactionsPage;
