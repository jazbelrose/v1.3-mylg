import type {
  ChangeEventHandler,
  Dispatch,
  DragEventHandler,
  MutableRefObject,
  SetStateAction,
} from "react";
import type {
  BudgetItem,
  GroupField,
  OrganizationInfoLine,
  RowData,
} from "./invoicePreviewTypes";

export interface UseInvoicePreviewModalResult {
  items: BudgetItem[];
  invoiceRef: MutableRefObject<HTMLDivElement | null>;
  previewRef: MutableRefObject<HTMLDivElement | null>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  currentFileName: string;
  handleSaveClick: () => void;
  handleSavePdf: () => void;
  handlePreviewPdf: () => void;
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  pages: RowData[][];
  groupField: GroupField;
  handleGroupFieldChange: (field: GroupField) => void;
  groupOptions: string[];
  groupValues: string[];
  handleToggleGroupValue: (value: string) => void;
  handleToggleAllGroupValues: (checked: boolean) => void;
  selectedPages: number[];
  handleTogglePage: (index: number) => void;
  handleToggleAllPages: (checked: boolean) => void;
  isDirty: boolean;
  handleSaveHeader: () => Promise<void>;
  showSaved: boolean;
  logoDataUrl: string | null;
  brandLogoKey: string;
  handleLogoSelect: ChangeEventHandler<HTMLInputElement>;
  handleLogoDrop: DragEventHandler<HTMLDivElement>;
  brandName: string;
  handleBrandNameBlur: (value: string) => void;
  brandTagline: string;
  handleBrandTaglineBlur: (value: string) => void;
  invoiceNumber: string;
  handleInvoiceNumberBlur: (value: string) => void;
  issueDate: string;
  handleIssueDateBlur: (value: string) => void;
  projectTitle: string;
  handleProjectTitleBlur: (value: string) => void;
  customerSummary: string;
  handleCustomerSummaryBlur: (value: string) => void;
  rowsData: RowData[];
  organizationLines: OrganizationInfoLine[];
  organizationName: string;
  handleOrganizationNameBlur: (value: string) => void;
  organizationAddress: string;
  handleOrganizationAddressBlur: (value: string) => void;
  organizationPhone: string;
  handleOrganizationPhoneBlur: (value: string) => void;
  organizationEmail: string;
  handleOrganizationEmailBlur: (value: string) => void;
  subtotal: number;
  depositReceived: number;
  handleDepositBlur: (value: string) => void;
  totalDue: number;
  handleTotalDueBlur: (value: string) => void;
  notes: string;
  handleNotesBlur: (value: string) => void;
  pdfPreviewUrl: string | null;
  closePdfPreview: () => void;
  showUnsavedPrompt: boolean;
  handleStayOpen: () => void;
  handleConfirmLeave: () => void;
  handleAttemptClose: () => void;
}
