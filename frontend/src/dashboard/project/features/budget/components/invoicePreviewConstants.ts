import type { GroupField } from "./invoicePreviewTypes";

export const groupFields: Array<{ label: string; value: GroupField }> = [
  { label: "Invoice Group", value: "invoiceGroup" },
  { label: "Area Group", value: "areaGroup" },
  { label: "Category", value: "category" },
];

export const DEFAULT_NOTES_HTML = "<p>Notes...</p>";
