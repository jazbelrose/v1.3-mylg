export interface RevisionLike {
  revision?: number;
  [k: string]: unknown;
}

export interface ProjectLike {
  projectId?: string;
  title?: string;
  company?: string;
  clientName?: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  invoiceBrandName?: string;
  invoiceBrandAddress?: string;
  invoiceBrandPhone?: string;
  address?: string;
  [k: string]: unknown;
}

export type GroupField = "invoiceGroup" | "areaGroup" | "category";

export interface BudgetItem {
  budgetItemId?: string;
  description?: string;
  quantity?: number | string;
  unit?: string;
  itemFinalCost?: number | string;
  invoiceGroup?: string;
  areaGroup?: string;
  category?: string;
  [k: string]: unknown;
}

export type RowData =
  | { type: "group"; group: string }
  | { type: "item"; item: BudgetItem };

export interface SavedInvoice {
  name: string;
  url: string;
}

export interface InvoicePreviewModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  revision: RevisionLike;
  project?: ProjectLike | null;
  allowSave?: boolean;
  itemsOverride?: BudgetItem[] | null;
}
