import React from "react";
import { Download } from "lucide-react";
import { getFileUrl } from "../../../shared/utils/api";
import { toast } from "react-toastify";

type Invoice = { url: string; fileName?: string };

interface PaymentsSectionProps {
  lastInvoiceDate?: string | null;
  lastInvoiceAmount?: string | null;
  invoiceList?: Invoice[];
  onCreateInvoice?: () => void;
  onAddPaymentMethod?: () => void;
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
  onCreateInvoice,
  onAddPaymentMethod,
}) => {
  const handleCreateInvoice = () => {
    if (onCreateInvoice) return onCreateInvoice();
    toast.info('Open Account → Payments to create an invoice.');
  };

  const handleAddPaymentMethod = () => {
    if (onAddPaymentMethod) return onAddPaymentMethod();
    toast.info('Payment methods coming soon.');
  };

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

      {invoiceList.length > 0 ? (
        <div className="invoice-list">
          {invoiceList.map((inv) => (
            <div className="invoice-item" key={inv.url}>
              <a href={getFileUrl(inv.url)} download>
                <Download size={16} /> {inv.fileName ?? "Invoice"}
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="payments-empty" role="status">
          <div className="payments-empty-illustration" aria-hidden />
          <div className="payments-empty-title">No invoices yet</div>
          <div className="payments-empty-text">Create your first invoice to get paid faster.</div>
          <div className="payments-empty-actions">
            <button type="button" className="payments-primary-button" onClick={handleCreateInvoice}>
              Create invoice
            </button>
            <button type="button" className="payments-secondary-button" onClick={handleAddPaymentMethod}>
              Add payment method <span className="coming-soon-badge">coming soon</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsSection;









