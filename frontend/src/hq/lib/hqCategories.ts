import type { HqCategoryId } from "@/hq/types";

export type HqCategoryDefinition = {
  id: HqCategoryId;
  label: string;
  tone: "in" | "out" | "neutral";
};

export const HQ_CATEGORIES: readonly HqCategoryDefinition[] = [
  { id: "PAYROLL", label: "Payroll", tone: "out" },
  { id: "PRODUCTION", label: "Production", tone: "out" },
  { id: "SOFTWARE", label: "Software", tone: "out" },
  { id: "TRAVEL", label: "Travel", tone: "out" },
  { id: "MARKETING", label: "Marketing", tone: "out" },
  { id: "RENT_STORAGE", label: "Rent / Storage", tone: "out" },
  { id: "FEES", label: "Fees", tone: "out" },
  { id: "TAXES", label: "Taxes", tone: "out" },
  { id: "TRANSFERS", label: "Transfers", tone: "neutral" },
  { id: "INCOME", label: "Income", tone: "in" },
  { id: "OTHER", label: "Other", tone: "neutral" },
] as const;

export const HQ_CATEGORY_LABEL: Record<HqCategoryId, string> = HQ_CATEGORIES.reduce(
  (acc, category) => {
    acc[category.id] = category.label;
    return acc;
  },
  {} as Record<HqCategoryId, string>
);

