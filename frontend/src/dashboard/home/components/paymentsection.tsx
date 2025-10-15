import React from "react";
import { Download } from "lucide-react";
import { getFileUrl } from "../../../shared/utils/api";

type Invoice = { url: string; fileName?: string };

interface PaymentsSectionProps {
  lastInvoiceDate?: string | null;
  lastInvoiceAmount?: string | null;
  invoiceList?: Invoice[];
}

const formatDate = (iso?: string | null) => {
  if (!iso) return "N/A";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString();
};

const PaymentsSection: React.FC<PaymentsSectionProps> = ({
  lastInvoiceDate = null,
  lastInvoiceAmount = null,
  invoiceList = [],
}) => {
  return (
    <div className="payments-section">
      <h2>Payments &amp; Invoices</h2>

      <div className="payments-line-one">
        <span className="last-invoice-label">Last Invoice:</span>
        <span className="last-invoice-value">
          {formatDate(lastInvoiceDate)}
          {lastInvoiceAmount ? ` - ${lastInvoiceAmount}` : ""}
        </span>
      </div>

      <div className="invoice-list">
        {invoiceList.length > 0 ? (
          invoiceList.map((inv) => (
            <div className="invoice-item" key={inv.url}>
              <a href={getFileUrl(inv.url)} download>
                <Download size={16} /> {inv.fileName ?? "Invoice"}
              </a>
            </div>
          ))
        ) : (
          <span>No invoices</span>
        )}
      </div>

      <div className="future-payment-method">
        Add payment method <span className="coming-soon-badge">coming soon</span>
      </div>
    </div>
  );
};

export default PaymentsSection;









