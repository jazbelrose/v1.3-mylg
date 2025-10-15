import React from "react";
import HQLayout from "../components/HQLayout";
import styles from "./InvoicesPage.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const mockInvoices = [
  {
    id: "inv-2041",
    client: "Spotify",
    amount: 19000,
    status: "Due",
    dueDate: "2024-07-05",
  },
  {
    id: "inv-2038",
    client: "Netflix",
    amount: 12500,
    status: "Paid",
    dueDate: "2024-06-01",
  },
];

const InvoicesPage: React.FC = () => {
  const hasInvoices = mockInvoices.length > 0;

  return (
    <HQLayout
      title="Invoices"
      description="Track invoices sent to clients and monitor outstanding AR in one place."
      actions={
        <button type="button" className={styles.createButton}>
          New invoice
        </button>
      }
    >
      <div className={styles.page}>
        {hasInvoices ? (
          <div className={styles.list}>
            {mockInvoices.map((invoice) => (
              <article key={invoice.id} className={styles.card}>
                <div className={styles.row}>
                  <h3>{invoice.client}</h3>
                  <span className={styles[invoice.status === "Paid" ? "statusPaid" : "statusDue"]}>
                    {invoice.status}
                  </span>
                </div>
                <div className={styles.row}>
                  <span>{invoice.id}</span>
                  <strong>{currency.format(invoice.amount)}</strong>
                </div>
                <div>Due {new Date(invoice.dueDate).toLocaleDateString()}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            No invoices yet. Create your first invoice to start tracking receivables.
          </div>
        )}
      </div>
    </HQLayout>
  );
};

export default InvoicesPage;
