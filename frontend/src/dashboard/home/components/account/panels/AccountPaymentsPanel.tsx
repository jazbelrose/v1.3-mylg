import React from "react";
import { Copy, FileText, Plus } from "lucide-react";
import { toast } from "react-toastify";

import SegmentedControl from "../ui/SegmentedControl";
import SideSheet from "../ui/SideSheet";
import styles from "./accountPayments.module.css";
import panelStyles from "./accountPanels.module.css";

type PaymentsTabKey = "pay-vendors" | "get-paid";

type PaymentMethod = "ach" | "card" | "check";
type OutgoingStatus = "draft" | "scheduled" | "processing" | "paid" | "failed";
type IncomingStatus = "draft" | "sent" | "viewed" | "paid" | "overdue";

type PaymentItem = {
  id: string;
  vendorName: string;
  amountCents: number;
  dueDate: string;
  method: PaymentMethod;
  status: OutgoingStatus;
  category?: string;
  note?: string;
  attachmentName?: string;
  createdAt: string;
};

type InvoiceLineItem = { description: string; amountCents: number };

type InvoiceItem = {
  id: string;
  clientName: string;
  invoiceNumber: string;
  amountCents: number;
  dueDate: string;
  status: IncomingStatus;
  createdAt: string;
  notes?: string;
  lineItems: InvoiceLineItem[];
};

type StoreState = {
  payments: PaymentItem[];
  invoices: InvoiceItem[];
};

type StoreAction =
  | { type: "addPayment"; payment: PaymentItem }
  | { type: "addInvoice"; invoice: InvoiceItem }
  | { type: "updatePayment"; id: string; patch: Partial<PaymentItem> }
  | { type: "updateInvoice"; id: string; patch: Partial<InvoiceItem> };

const STORAGE_KEY = "mylg:account-payments-mock:v1";
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inSameMonth(aIso: string, now: Date): boolean {
  const d = new Date(`${aIso}T00:00:00`);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function loadInitialState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoreState;
  } catch {
    // ignore
  }

  const now = new Date();
  const today = isoDate(now);
  const in7 = isoDate(new Date(now.getTime() + 7 * 86400000));
  const in14 = isoDate(new Date(now.getTime() + 14 * 86400000));
  const lastWeek = isoDate(new Date(now.getTime() - 7 * 86400000));

  return {
    payments: [
      {
        id: "pmt_1",
        vendorName: "Evergreen Lumber Co.",
        amountCents: 184200,
        dueDate: in7,
        method: "ach",
        status: "scheduled",
        category: "Materials",
        note: "Framing package",
        createdAt: today,
      },
      {
        id: "pmt_2",
        vendorName: "Northside Electric",
        amountCents: 92500,
        dueDate: in14,
        method: "card",
        status: "draft",
        category: "Subcontractor",
        note: "Rough-in deposit",
        createdAt: today,
      },
      {
        id: "pmt_3",
        vendorName: "City Permit Office",
        amountCents: 41500,
        dueDate: today,
        method: "check",
        status: "processing",
        createdAt: today,
      },
      {
        id: "pmt_4",
        vendorName: "Concrete Supply",
        amountCents: 236900,
        dueDate: lastWeek,
        method: "ach",
        status: "paid",
        createdAt: lastWeek,
      },
    ],
    invoices: [
      {
        id: "inv_1",
        clientName: "Sierra & Co.",
        invoiceNumber: "INV-1042",
        amountCents: 125000,
        dueDate: in14,
        status: "sent",
        createdAt: today,
        lineItems: [
          { description: "Design milestone (50%)", amountCents: 100000 },
          { description: "Site visit", amountCents: 25000 },
        ],
      },
      {
        id: "inv_2",
        clientName: "Langford Residence",
        invoiceNumber: "INV-1043",
        amountCents: 89000,
        dueDate: lastWeek,
        status: "overdue",
        createdAt: lastWeek,
        lineItems: [{ description: "Phase 1 deposit", amountCents: 89000 }],
      },
      {
        id: "inv_3",
        clientName: "Oak Ridge Builders",
        invoiceNumber: "INV-1041",
        amountCents: 410000,
        dueDate: today,
        status: "paid",
        createdAt: lastWeek,
        lineItems: [{ description: "Invoice paid", amountCents: 410000 }],
      },
    ],
  };
}

function reducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case "addPayment":
      return { ...state, payments: [action.payment, ...state.payments] };
    case "addInvoice":
      return { ...state, invoices: [action.invoice, ...state.invoices] };
    case "updatePayment":
      return { ...state, payments: state.payments.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)) };
    case "updateInvoice":
      return { ...state, invoices: state.invoices.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)) };
    default:
      return state;
  }
}

function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

function statusPillClass(status: OutgoingStatus | IncomingStatus): string {
  if (status === "paid") return [styles.pill, styles.pillGood].join(" ");
  if (status === "failed" || status === "overdue") return [styles.pill, styles.pillWarn].join(" ");
  return [styles.pill, styles.pillQuiet].join(" ");
}

function outgoingStatusLabel(status: OutgoingStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "scheduled":
      return "Scheduled";
    case "processing":
      return "Processing";
    case "paid":
      return "Paid";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function incomingStatusLabel(status: IncomingStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "viewed":
      return "Viewed";
    case "paid":
      return "Paid";
    case "overdue":
      return "Overdue";
    default:
      return status;
  }
}

function copyToClipboard(text: string) {
  void (async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.info("Copy not available");
    }
  })();
}

function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case "ach":
      return "ACH";
    case "card":
      return "Card";
    case "check":
      return "Check";
    default:
      return method;
  }
}

export default function AccountPaymentsPanel() {
  const [tab, setTab] = React.useState<PaymentsTabKey>("pay-vendors");
  const [state, dispatch] = React.useReducer(reducer, undefined as unknown as StoreState, loadInitialState);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  const now = React.useMemo(() => new Date(), []);

  const outgoingSummary = React.useMemo(() => {
    const outgoingThisMonth = state.payments
      .filter((p) => inSameMonth(p.dueDate, now))
      .reduce((sum, p) => sum + p.amountCents, 0);
    const scheduled = state.payments.filter((p) => p.status === "scheduled").length;
    const needsAttention = state.payments.filter((p) => p.status === "failed").length;
    return { outgoingThisMonth, scheduled, needsAttention };
  }, [now, state.payments]);

  const incomingSummary = React.useMemo(() => {
    const outstanding = state.invoices
      .filter((i) => i.status === "sent" || i.status === "viewed" || i.status === "overdue")
      .reduce((sum, i) => sum + i.amountCents, 0);
    const overdue = state.invoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + i.amountCents, 0);
    const paidThisMonth = state.invoices
      .filter((i) => i.status === "paid" && inSameMonth(i.dueDate, now))
      .reduce((sum, i) => sum + i.amountCents, 0);
    return { outstanding, overdue, paidThisMonth };
  }, [now, state.invoices]);

  const [newPaymentOpen, setNewPaymentOpen] = React.useState(false);
  const [newInvoiceOpen, setNewInvoiceOpen] = React.useState(false);
  const [paymentDetailsId, setPaymentDetailsId] = React.useState<string | null>(null);
  const [invoiceDetailsId, setInvoiceDetailsId] = React.useState<string | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = React.useState<string | null>(null);

  const paymentDetails = React.useMemo(
    () => (paymentDetailsId ? state.payments.find((p) => p.id === paymentDetailsId) ?? null : null),
    [paymentDetailsId, state.payments]
  );
  const invoiceDetails = React.useMemo(
    () => (invoiceDetailsId ? state.invoices.find((i) => i.id === invoiceDetailsId) ?? null : null),
    [invoiceDetailsId, state.invoices]
  );
  const previewInvoice = React.useMemo(
    () => (previewInvoiceId ? state.invoices.find((i) => i.id === previewInvoiceId) ?? null : null),
    [previewInvoiceId, state.invoices]
  );

  const [paymentDraft, setPaymentDraft] = React.useState(() => ({
    vendorName: "",
    amount: "",
    dueDate: isoDate(new Date(Date.now() + 7 * 86400000)),
    category: "",
    note: "",
    attachmentName: "",
  }));

  const [invoiceDraft, setInvoiceDraft] = React.useState(() => ({
    clientName: "",
    dueDate: isoDate(new Date(Date.now() + 14 * 86400000)),
    notes: "",
    lineItems: [{ description: "Services", amount: "" }],
  }));

  const openPaymentDrawer = () => {
    setPaymentDraft({
      vendorName: "",
      amount: "",
      dueDate: isoDate(new Date(Date.now() + 7 * 86400000)),
      category: "",
      note: "",
      attachmentName: "",
    });
    setNewPaymentOpen(true);
  };

  const openInvoiceDrawer = () => {
    setInvoiceDraft({
      clientName: "",
      dueDate: isoDate(new Date(Date.now() + 14 * 86400000)),
      notes: "",
      lineItems: [{ description: "Services", amount: "" }],
    });
    setNewInvoiceOpen(true);
  };

  const paymentAmountCents = Math.round(Number(paymentDraft.amount || 0) * 100);
  const canCreatePayment = paymentDraft.vendorName.trim().length > 1 && paymentAmountCents > 0 && Boolean(paymentDraft.dueDate);

  const invoiceTotalCents = React.useMemo(
    () => invoiceDraft.lineItems.reduce((sum, li) => sum + Math.round(Number(li.amount || 0) * 100), 0),
    [invoiceDraft.lineItems]
  );
  const canCreateInvoice = invoiceDraft.clientName.trim().length > 1 && invoiceTotalCents > 0 && Boolean(invoiceDraft.dueDate);

  const createPaymentDraft = () => {
    const vendorName = paymentDraft.vendorName.trim();
    if (!vendorName || paymentAmountCents <= 0 || !paymentDraft.dueDate) return;

    const payment: PaymentItem = {
      id: `pmt_${Date.now().toString(36)}`,
      vendorName,
      amountCents: paymentAmountCents,
      dueDate: paymentDraft.dueDate,
      method: "ach",
      status: "draft",
      category: paymentDraft.category.trim() || undefined,
      note: paymentDraft.note.trim() || undefined,
      attachmentName: paymentDraft.attachmentName || undefined,
      createdAt: isoDate(new Date()),
    };
    dispatch({ type: "addPayment", payment });
    toast.success("Draft created");
    setNewPaymentOpen(false);
  };

  const createInvoiceDraft = () => {
    const clientName = invoiceDraft.clientName.trim();
    if (!clientName || invoiceTotalCents <= 0 || !invoiceDraft.dueDate) return;

    const nextNumber = `INV-${1000 + (state.invoices.length + 1)}`;
    const lineItems: InvoiceLineItem[] = invoiceDraft.lineItems
      .map((li) => ({ description: li.description.trim(), amountCents: Math.round(Number(li.amount || 0) * 100) }))
      .filter((li) => li.description && li.amountCents > 0);
    const invoice: InvoiceItem = {
      id: `inv_${Date.now().toString(36)}`,
      clientName,
      invoiceNumber: nextNumber,
      amountCents: invoiceTotalCents,
      dueDate: invoiceDraft.dueDate,
      status: "draft",
      createdAt: isoDate(new Date()),
      notes: invoiceDraft.notes.trim() || undefined,
      lineItems: lineItems.length ? lineItems : [{ description: "Line item", amountCents: invoiceTotalCents }],
    };

    dispatch({ type: "addInvoice", invoice });
    toast.success("Invoice drafted");
    setNewInvoiceOpen(false);
  };

  return (
    <div className={styles.stack}>
      <div className={styles.segmentedWrap}>
        <SegmentedControl<PaymentsTabKey>
          value={tab}
          onChange={setTab}
          options={[
            { value: "pay-vendors", label: "Pay vendors" },
            { value: "get-paid", label: "Get paid" },
          ]}
          aria-label="Payments tabs"
        />
      </div>

      {tab === "pay-vendors" ? (
        <>
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Outgoing this month</div>
              <div className={styles.summaryValue}>{formatCents(outgoingSummary.outgoingThisMonth)}</div>
              <div className={styles.summaryHint}>Scheduled + paid + drafts due this month.</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Scheduled</div>
              <div className={styles.summaryValue}>{outgoingSummary.scheduled}</div>
              <div className={styles.summaryHint}>Next 30 days (mocked rails).</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Needs attention</div>
              <div className={styles.summaryValue}>{outgoingSummary.needsAttention}</div>
              <div className={styles.summaryHint}>Failed or blocked payments.</div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>Vendor payments</div>
                <div className={styles.cardSubtitle}>Create drafts now; wire processing rails later.</div>
              </div>
              <div className={styles.headerActions}>
                <button type="button" className={panelStyles.primaryButton} onClick={openPaymentDrawer}>
                  <Plus size={16} /> New vendor payment
                </button>
              </div>
            </div>

            {state.payments.length ? (
              <div className={styles.cardBody}>
                <div className={styles.tableHeader} aria-hidden>
                  <div>Vendor</div>
                  <div>Amount</div>
                  <div>Due</div>
                  <div>Method</div>
                  <div>Status</div>
                </div>
                {state.payments.map((p) => (
                  <div key={p.id} className={styles.row} onClick={() => setPaymentDetailsId(p.id)} role="button" tabIndex={0}>
                    <div>
                      <div className={styles.name}>{p.vendorName}</div>
                      <div className={styles.meta}>
                        {p.category ? `${p.category} · ` : ""}
                        {p.note || "Vendor payment"}
                      </div>
                    </div>
                    <div className={styles.mono}>{formatCents(p.amountCents)}</div>
                    <div className={styles.mono}>{p.dueDate}</div>
                    <div className={styles.mono}>{paymentMethodLabel(p.method)}</div>
                    <div className={statusPillClass(p.status)}>{outgoingStatusLabel(p.status)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <div className={styles.emptyTitle}>No vendor payments yet</div>
                <div className={styles.emptyText}>Create your first vendor payment. Drafts save instantly.</div>
                <div className={styles.emptyActions}>
                  <button type="button" className={panelStyles.primaryButton} onClick={openPaymentDrawer}>
                    <Plus size={16} /> New vendor payment
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Outstanding</div>
              <div className={styles.summaryValue}>{formatCents(incomingSummary.outstanding)}</div>
              <div className={styles.summaryHint}>Sent + viewed + overdue invoices.</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Overdue</div>
              <div className={styles.summaryValue}>{formatCents(incomingSummary.overdue)}</div>
              <div className={styles.summaryHint}>Follow up with clients.</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Paid this month</div>
              <div className={styles.summaryValue}>{formatCents(incomingSummary.paidThisMonth)}</div>
              <div className={styles.summaryHint}>Mocked until rails land.</div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>Invoices</div>
                <div className={styles.cardSubtitle}>Create, “send”, and preview invoices.</div>
              </div>
              <div className={styles.headerActions}>
                <button type="button" className={panelStyles.primaryButton} onClick={openInvoiceDrawer}>
                  <FileText size={16} /> Create invoice
                </button>
              </div>
            </div>

            {state.invoices.length ? (
              <div className={styles.cardBody}>
                <div className={styles.tableHeader} aria-hidden>
                  <div>Client</div>
                  <div>Amount</div>
                  <div>Due</div>
                  <div>Invoice</div>
                  <div>Status</div>
                </div>
                {state.invoices.map((inv) => (
                  <div key={inv.id} className={styles.row} onClick={() => setInvoiceDetailsId(inv.id)} role="button" tabIndex={0}>
                    <div>
                      <div className={styles.name}>{inv.clientName}</div>
                      <div className={styles.meta}>
                        {inv.invoiceNumber} · {inv.lineItems.length} item{inv.lineItems.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className={styles.mono}>{formatCents(inv.amountCents)}</div>
                    <div className={styles.mono}>{inv.dueDate}</div>
                    <div className={styles.mono}>{inv.invoiceNumber}</div>
                    <div className={statusPillClass(inv.status)}>{incomingStatusLabel(inv.status)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <div className={styles.emptyTitle}>No invoices yet</div>
                <div className={styles.emptyText}>Create your first invoice to get paid faster.</div>
                <div className={styles.emptyActions}>
                  <button type="button" className={panelStyles.primaryButton} onClick={openInvoiceDrawer}>
                    <FileText size={16} /> Create invoice
                  </button>
                  <button type="button" className={panelStyles.secondaryButton} onClick={() => toast.info("Coming soon")}>
                    Add payment method <span className={styles.chipSoon}>Coming soon</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <SideSheet
        open={newPaymentOpen}
        title="New vendor payment"
        description="Creates a draft now; scheduling rails coming soon."
        onClose={() => setNewPaymentOpen(false)}
        footer={
          <>
            <button type="button" className={panelStyles.secondaryButton} onClick={() => setNewPaymentOpen(false)}>
              Cancel
            </button>
            <button type="button" className={panelStyles.primaryButton} onClick={createPaymentDraft} disabled={!canCreatePayment}>
              Schedule payment
            </button>
          </>
        }
      >
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Vendor</span>
          <input
            className={panelStyles.input}
            value={paymentDraft.vendorName}
            onChange={(e) => setPaymentDraft((p) => ({ ...p, vendorName: e.target.value }))}
            placeholder="Start typing…"
          />
        </label>
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Amount</span>
          <input
            className={panelStyles.input}
            value={paymentDraft.amount}
            onChange={(e) => setPaymentDraft((p) => ({ ...p, amount: e.target.value }))}
            placeholder="0.00"
            inputMode="decimal"
          />
        </label>
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Due date</span>
          <input
            className={panelStyles.input}
            type="date"
            value={paymentDraft.dueDate}
            onChange={(e) => setPaymentDraft((p) => ({ ...p, dueDate: e.target.value }))}
          />
        </label>
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Category (optional)</span>
          <input
            className={panelStyles.input}
            value={paymentDraft.category}
            onChange={(e) => setPaymentDraft((p) => ({ ...p, category: e.target.value }))}
            placeholder="Materials, Labor…"
          />
        </label>
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Note (optional)</span>
          <input
            className={panelStyles.input}
            value={paymentDraft.note}
            onChange={(e) => setPaymentDraft((p) => ({ ...p, note: e.target.value }))}
            placeholder="What’s this for?"
          />
        </label>
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Attach invoice</span>
          <input
            className={panelStyles.input}
            type="file"
            onChange={(e) => setPaymentDraft((p) => ({ ...p, attachmentName: e.target.files?.[0]?.name ?? "" }))}
          />
          <span className={panelStyles.helper}>
            {paymentDraft.attachmentName ? `Attached: ${paymentDraft.attachmentName}` : "Upload is stored locally for now."}
          </span>
        </label>
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Payment method</span>
          <select className={panelStyles.select} value="ach" disabled>
            <option value="ach">ACH</option>
            <option value="card">Card</option>
            <option value="check">Check</option>
          </select>
          <span className={panelStyles.helper}>Coming soon — shown but disabled until rails are wired.</span>
        </label>
      </SideSheet>

      <SideSheet
        open={newInvoiceOpen}
        title="Create invoice"
        description="Draft and “send” invoices while email rails land."
        onClose={() => setNewInvoiceOpen(false)}
        footer={
          <>
            <button type="button" className={panelStyles.secondaryButton} onClick={() => setNewInvoiceOpen(false)}>
              Cancel
            </button>
            <button type="button" className={panelStyles.primaryButton} onClick={createInvoiceDraft} disabled={!canCreateInvoice}>
              Create invoice
            </button>
          </>
        }
      >
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Client</span>
          <input
            className={panelStyles.input}
            value={invoiceDraft.clientName}
            onChange={(e) => setInvoiceDraft((p) => ({ ...p, clientName: e.target.value }))}
            placeholder="Client name"
          />
        </label>
        <div className={panelStyles.field}>
          <span className={panelStyles.label}>Line items</span>
          <div style={{ display: "grid", gap: 10 }}>
            {invoiceDraft.lineItems.map((li, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
                <input
                  className={panelStyles.input}
                  value={li.description}
                  onChange={(e) =>
                    setInvoiceDraft((p) => ({
                      ...p,
                      lineItems: p.lineItems.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                    }))
                  }
                  placeholder="Description"
                />
                <input
                  className={panelStyles.input}
                  value={li.amount}
                  onChange={(e) =>
                    setInvoiceDraft((p) => ({
                      ...p,
                      lineItems: p.lineItems.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)),
                    }))
                  }
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </div>
            ))}
            <button
              type="button"
              className={panelStyles.secondaryButton}
              onClick={() =>
                setInvoiceDraft((p) => ({ ...p, lineItems: [...p.lineItems, { description: "Line item", amount: "" }] }))
              }
            >
              Add line item
            </button>
            <div className={panelStyles.helper}>Total: {formatCents(invoiceTotalCents)}</div>
          </div>
        </div>
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Due date</span>
          <input
            className={panelStyles.input}
            type="date"
            value={invoiceDraft.dueDate}
            onChange={(e) => setInvoiceDraft((p) => ({ ...p, dueDate: e.target.value }))}
          />
        </label>
        <label className={panelStyles.field}>
          <span className={panelStyles.label}>Notes (optional)</span>
          <input
            className={panelStyles.input}
            value={invoiceDraft.notes}
            onChange={(e) => setInvoiceDraft((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Payment instructions, thanks…"
          />
        </label>
      </SideSheet>

      <SideSheet
        open={Boolean(paymentDetails)}
        title={paymentDetails ? paymentDetails.vendorName : "Payment"}
        description="Timeline is simulated until rails are wired."
        onClose={() => setPaymentDetailsId(null)}
        footer={
          paymentDetails ? (
            <>
              <button type="button" className={panelStyles.secondaryButton} onClick={() => setPaymentDetailsId(null)}>
                Close
              </button>
              <button
                type="button"
                className={panelStyles.primaryButton}
                onClick={() => {
                  dispatch({ type: "updatePayment", id: paymentDetails.id, patch: { status: "scheduled" } });
                  toast.success("Scheduled (mock)");
                }}
                disabled={paymentDetails.status !== "draft"}
              >
                Schedule
              </button>
            </>
          ) : null
        }
      >
        {paymentDetails ? (
          <>
            <div className={panelStyles.field}>
              <div className={panelStyles.label}>Amount</div>
              <div className={panelStyles.helper} style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.94)" }}>
                {formatCents(paymentDetails.amountCents)}
              </div>
            </div>
            <div className={panelStyles.field}>
              <div className={panelStyles.label}>Status</div>
              <div className={statusPillClass(paymentDetails.status)}>{outgoingStatusLabel(paymentDetails.status)}</div>
            </div>
            <div className={panelStyles.field}>
              <div className={panelStyles.label}>Timeline</div>
              <div style={{ display: "grid", gap: 8 }}>
                <TimelineRow label="Draft created" at={paymentDetails.createdAt} />
                {paymentDetails.status !== "draft" ? <TimelineRow label="Scheduled" at={paymentDetails.dueDate} /> : null}
                {paymentDetails.status === "processing" || paymentDetails.status === "paid" ? (
                  <TimelineRow label="Processing" at={paymentDetails.dueDate} />
                ) : null}
                {paymentDetails.status === "paid" ? <TimelineRow label="Paid" at={paymentDetails.dueDate} /> : null}
                {paymentDetails.status === "failed" ? <TimelineRow label="Failed" at={paymentDetails.dueDate} /> : null}
              </div>
            </div>
          </>
        ) : null}
      </SideSheet>

      <SideSheet
        open={Boolean(invoiceDetails)}
        title={invoiceDetails ? `${invoiceDetails.invoiceNumber} · ${invoiceDetails.clientName}` : "Invoice"}
        description="Looks live now; swap data source later."
        onClose={() => setInvoiceDetailsId(null)}
        footer={
          invoiceDetails ? (
            <>
              <button type="button" className={panelStyles.secondaryButton} onClick={() => setInvoiceDetailsId(null)}>
                Close
              </button>
              <button type="button" className={panelStyles.secondaryButton} onClick={() => setPreviewInvoiceId(invoiceDetails.id)}>
                Preview
              </button>
              <button
                type="button"
                className={panelStyles.primaryButton}
                onClick={() => {
                  dispatch({ type: "updateInvoice", id: invoiceDetails.id, patch: { status: "sent" } });
                  toast.info("Email sending coming soon");
                }}
                disabled={invoiceDetails.status !== "draft"}
              >
                Send invoice
              </button>
            </>
          ) : null
        }
      >
        {invoiceDetails ? (
          <>
            <div className={panelStyles.field}>
              <div className={panelStyles.label}>Payment link</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className={panelStyles.input} value={`https://pay.mylg.app/invoice/${invoiceDetails.id}`} readOnly />
                <button
                  type="button"
                  className={panelStyles.secondaryButton}
                  onClick={() => copyToClipboard(`https://pay.mylg.app/invoice/${invoiceDetails.id}`)}
                >
                  <Copy size={16} />
                </button>
              </div>
              <div className={panelStyles.helper}>Link is a placeholder until payments are wired.</div>
            </div>
            <div className={panelStyles.field}>
              <div className={panelStyles.label}>Status</div>
              <div className={statusPillClass(invoiceDetails.status)}>{incomingStatusLabel(invoiceDetails.status)}</div>
            </div>
            <div className={panelStyles.field}>
              <div className={panelStyles.label}>Line items</div>
              <div style={{ display: "grid", gap: 10 }}>
                {invoiceDetails.lineItems.map((li, idx) => (
                  <div key={`${li.description}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div className={panelStyles.helper} style={{ color: "rgba(255,255,255,0.84)" }}>
                      {li.description}
                    </div>
                    <div className={panelStyles.helper}>{formatCents(li.amountCents)}</div>
                  </div>
                ))}
                <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div className={panelStyles.helper} style={{ fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>
                    Total
                  </div>
                  <div className={panelStyles.helper} style={{ fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>
                    {formatCents(invoiceDetails.amountCents)}
                  </div>
                </div>
              </div>
            </div>
            {invoiceDetails.notes ? (
              <div className={panelStyles.field}>
                <div className={panelStyles.label}>Notes</div>
                <div className={panelStyles.helper}>{invoiceDetails.notes}</div>
              </div>
            ) : null}
          </>
        ) : null}
      </SideSheet>

      <SideSheet
        open={Boolean(previewInvoice)}
        title={previewInvoice ? `Preview · ${previewInvoice.invoiceNumber}` : "Preview"}
        description="Polished preview modal (mock data)."
        onClose={() => setPreviewInvoiceId(null)}
        footer={
          <button type="button" className={panelStyles.primaryButton} onClick={() => setPreviewInvoiceId(null)}>
            Done
          </button>
        }
      >
        {previewInvoice ? <InvoicePreviewCard invoice={previewInvoice} /> : null}
      </SideSheet>
    </div>
  );
}

function TimelineRow({ label, at }: { label: string; at: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <div className={panelStyles.helper} style={{ color: "rgba(255,255,255,0.82)" }}>
        {label}
      </div>
      <div className={panelStyles.helper}>{at}</div>
    </div>
  );
}

function InvoicePreviewCard({ invoice }: { invoice: InvoiceItem }) {
  return (
    <div className={panelStyles.card}>
      <div className={panelStyles.cardBody}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Invoice</div>
            <div style={{ fontSize: 18, fontWeight: 850 }}>{invoice.invoiceNumber}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{invoice.clientName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Total</div>
            <div style={{ fontSize: 18, fontWeight: 850 }}>{formatCents(invoice.amountCents)}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Due {invoice.dueDate}</div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {invoice.lineItems.map((li, idx) => (
            <div key={`${li.description}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div className={panelStyles.helper} style={{ color: "rgba(255,255,255,0.86)" }}>
                {li.description}
              </div>
              <div className={panelStyles.helper}>{formatCents(li.amountCents)}</div>
            </div>
          ))}
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div className={panelStyles.helper} style={{ fontWeight: 850, color: "rgba(255,255,255,0.92)" }}>
              Total
            </div>
            <div className={panelStyles.helper} style={{ fontWeight: 850, color: "rgba(255,255,255,0.92)" }}>
              {formatCents(invoice.amountCents)}
            </div>
          </div>
        </div>

        {invoice.notes ? (
          <div style={{ marginTop: 14 }}>
            <div className={panelStyles.label}>Notes</div>
            <div className={panelStyles.helper}>{invoice.notes}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
