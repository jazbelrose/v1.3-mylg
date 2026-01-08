import type { HqCategoryId } from "@/hq/types";

export type HqCategoryDefinition = {
  id: HqCategoryId;
  label: string;
  tone: "in" | "out" | "neutral";
};

export const HQ_CATEGORIES: readonly HqCategoryDefinition[] = [
  // People
  { id: "PAYROLL_W2", label: "Payroll (W-2)", tone: "out" },
  { id: "PAYROLL_TAXES", label: "Payroll Taxes", tone: "out" },
  { id: "CONTRACTORS_1099", label: "Contractors (1099)", tone: "out" },
  { id: "REIMBURSEMENTS", label: "Reimbursements", tone: "out" },

  // Owner
  { id: "OWNER_DRAW", label: "Owner Draw", tone: "out" },
  { id: "OWNER_CONTRIBUTION", label: "Owner Contribution", tone: "in" },

  // Operations
  { id: "MATERIALS_SUPPLIES", label: "Materials & Supplies", tone: "out" },
  { id: "SOFTWARE_SAAS", label: "Software / SaaS", tone: "out" },
  { id: "INSURANCE", label: "Insurance", tone: "out" },
  { id: "RENT_LEASE", label: "Rent / Lease", tone: "out" },
  { id: "UTILITIES", label: "Utilities", tone: "out" },
  { id: "PHONE_INTERNET", label: "Phone / Internet", tone: "out" },
  { id: "SHIPPING", label: "Shipping", tone: "out" },

  // Travel & Vehicles
  { id: "AUTO_PAYMENT", label: "Auto — Car payment", tone: "neutral" },
  { id: "AUTO_INSURANCE", label: "Auto — Insurance", tone: "out" },
  { id: "GAS", label: "Auto — Fuel", tone: "out" },
  { id: "CHARGING", label: "Auto — Charging", tone: "out" },
  { id: "AUTO_MAINTENANCE", label: "Auto — Maintenance / Repairs", tone: "out" },
  { id: "PARKING_TOLLS", label: "Auto — Parking / Tolls", tone: "out" },
  { id: "TRAVEL", label: "Travel (air/hotel/uber)", tone: "out" },

  // Finance
  { id: "BANK_FEES", label: "Bank Fees", tone: "out" },
  { id: "INTEREST", label: "Interest", tone: "in" },
  { id: "CARD_PAYMENT", label: "Card Payment", tone: "neutral" },
  { id: "LOAN_PAYMENT", label: "Loan Payment", tone: "neutral" },

  // Government
  { id: "SALES_TAX", label: "Sales Tax", tone: "out" },
  { id: "ESTIMATED_TAXES", label: "Estimated Taxes", tone: "out" },
  { id: "PERMITS_LICENSES", label: "Permits / Licenses", tone: "out" },

  // Movement
  { id: "TRANSFER_INTERNAL", label: "Transfer (Internal)", tone: "neutral" },
  { id: "REFUND_CHARGEBACK", label: "Refund / Chargeback", tone: "neutral" },

  // Income + fallback
  { id: "INCOME", label: "Income", tone: "in" },
  { id: "OTHER", label: "Other", tone: "neutral" },
] as const;

export const HQ_CATEGORY_LABEL: Record<HqCategoryId, string> = HQ_CATEGORIES.reduce(
  (acc, category) => {
    acc[category.id] = category.label;
    return acc;
  },
  {
    // Legacy labels: keep UI stable when older data exists.
    PAYROLL: "Payroll (legacy)",
    PRODUCTION: "Materials & Supplies (legacy)",
    SOFTWARE: "Software / SaaS (legacy)",
    MARKETING: "Other (legacy)",
    RENT_STORAGE: "Rent / Lease (legacy)",
    FEES: "Bank Fees (legacy)",
    TAXES: "Estimated Taxes (legacy)",
    TRANSFERS: "Transfer (Internal) (legacy)",
  } as Record<HqCategoryId, string>
);

