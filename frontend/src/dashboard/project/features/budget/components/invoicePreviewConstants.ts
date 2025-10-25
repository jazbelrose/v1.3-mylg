import type { GroupField } from "./invoicePreviewTypes";

export const groupFields: Array<{ label: string; value: GroupField }> = [
  { label: "Invoice Group", value: "invoiceGroup" },
  { label: "Area Group", value: "areaGroup" },
  { label: "Category", value: "category" },
];

export const DEFAULT_NOTES_HTML =
  "<p>A 50% deposit is required to initiate the design phase. The remaining 50% balance is due prior to the start of production. Full payment must be received before production can begin.</p>";
