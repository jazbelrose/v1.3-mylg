import type { HqCategoryId } from "@/hq/types";

export type HqCategoryDefinition = {
  id: HqCategoryId;
  label: string;
  tone: "in" | "out" | "neutral";
};

export const HQ_CATEGORIES: readonly HqCategoryDefinition[] = [
  // Income
  { id: "CLIENT_PAYMENT", label: "Client Revenue", tone: "in" },
  { id: "INCOME", label: "Other Income", tone: "in" },
  { id: "INTEREST_INCOME", label: "Interest Income", tone: "in" },

  // Direct Job Costs
  { id: "CONTRACTORS_1099", label: "Labor (Freelance / Crew / Subs)", tone: "out" },
  { id: "MATERIALS_SUPPLIES", label: "Materials & Purchases (Fabric / Amazon / Build)", tone: "out" },
  { id: "RENTALS_EQUIPMENT", label: "Rentals (Furniture / AV / Equipment)", tone: "out" },
  { id: "SHIPPING", label: "Shipping & Delivery", tone: "out" },
  { id: "TRUCKING_TRANSPORT", label: "Trucking & Transport", tone: "out" },
  { id: "PERMITS_LICENSES", label: "Onsite / Venue Fees (Permits / Rigging / Union Pass-through)", tone: "out" },

  // Operating Expenses
  { id: "SOFTWARE_SAAS", label: "Software / SaaS", tone: "out" },
  { id: "COMPUTER_HARDWARE", label: "Computer Hardware", tone: "out" },
  { id: "INSURANCE", label: "Insurance", tone: "out" },
  { id: "RENT_LEASE", label: "Rent / Workspace", tone: "out" },
  { id: "RENT_STORAGE", label: "Rent / Storage", tone: "out" },
  { id: "UTILITIES", label: "Utilities", tone: "out" },
  { id: "PHONE_INTERNET", label: "Phone / Internet", tone: "out" },
  { id: "OFFICE_SUPPLIES", label: "Office Supplies", tone: "out" },
  { id: "MARKETING", label: "Marketing", tone: "out" },
  { id: "PROFESSIONAL_SERVICES", label: "Professional Services (Legal / Accounting)", tone: "out" },
  { id: "BANK_FEES", label: "Banking Fees", tone: "out" },
  { id: "INTEREST", label: "Interest Expense", tone: "out" },

  // Payroll
  { id: "PAYROLL_W2", label: "W-2 Wages", tone: "out" },
  { id: "PAYROLL_TAXES", label: "Payroll Taxes", tone: "out" },
  { id: "BENEFITS", label: "Benefits", tone: "out" },
  { id: "REIMBURSEMENTS", label: "Reimbursements", tone: "out" },

  // Vehicle
  { id: "AUTO_PAYMENT", label: "Car Payment / Lease", tone: "neutral" },
  { id: "AUTO_INSURANCE", label: "Auto Insurance", tone: "out" },
  { id: "GAS", label: "Fuel", tone: "out" },
  { id: "CHARGING", label: "Charging", tone: "out" },
  { id: "AUTO_MAINTENANCE", label: "Maintenance / Repairs", tone: "out" },
  { id: "PARKING_TOLLS", label: "Parking / Tolls", tone: "out" },

  // Travel
  { id: "TRAVEL", label: "Air / Hotel", tone: "out" },
  { id: "GROUND_TRANSPORTATION", label: "Ground Transportation (Uber / Rental)", tone: "out" },
  { id: "MEALS", label: "Meals", tone: "out" },

  // Taxes
  { id: "SALES_TAX", label: "Sales Tax Payable", tone: "out" },
  { id: "ESTIMATED_TAXES", label: "Estimated Income Taxes", tone: "out" },

  // Transfers and Owner
  { id: "TRANSFER_INTERNAL", label: "Internal Transfer", tone: "neutral" },
  { id: "OWNER_DRAW", label: "Owner Draw", tone: "out" },
  { id: "OWNER_CONTRIBUTION", label: "Owner Contribution", tone: "in" },
  { id: "LOAN_PAYMENT", label: "Loan Payment (Principal)", tone: "neutral" },
  { id: "CARD_PAYMENT", label: "Credit Card Payment (Principal)", tone: "neutral" },

  // Refunds and Adjustments
  { id: "CUSTOMER_REFUND", label: "Customer Refund", tone: "out" },
  { id: "REFUND_CHARGEBACK", label: "Chargeback", tone: "neutral" },
  { id: "REFUND_RECEIVED", label: "Vendor Refund", tone: "in" },

  // Fallback
  { id: "OTHER", label: "Other", tone: "neutral" },
] as const;

export type HqCategoryGroupDefinition = {
  id:
    | "income"
    | "direct_job_costs"
    | "operating_expenses"
    | "payroll"
    | "vehicle"
    | "travel"
    | "taxes"
    | "transfers_owner"
    | "refunds_adjustments";
  label: string;
  categoryIds: readonly HqCategoryId[];
};

export const HQ_CATEGORY_GROUPS: readonly HqCategoryGroupDefinition[] = [
  { id: "income", label: "Income", categoryIds: ["CLIENT_PAYMENT", "INCOME", "INTEREST_INCOME"] },
  {
    id: "direct_job_costs",
    label: "Direct Job Costs",
    categoryIds: [
      "CONTRACTORS_1099",
      "MATERIALS_SUPPLIES",
      "RENTALS_EQUIPMENT",
      "SHIPPING",
      "TRUCKING_TRANSPORT",
      "PERMITS_LICENSES",
    ],
  },
  {
    id: "operating_expenses",
    label: "Operating Expenses",
    categoryIds: [
      "SOFTWARE_SAAS",
      "COMPUTER_HARDWARE",
      "INSURANCE",
      "RENT_LEASE",
      "RENT_STORAGE",
      "UTILITIES",
      "PHONE_INTERNET",
      "OFFICE_SUPPLIES",
      "MARKETING",
      "PROFESSIONAL_SERVICES",
      "BANK_FEES",
      "INTEREST",
    ],
  },
  { id: "payroll", label: "Payroll", categoryIds: ["PAYROLL_W2", "PAYROLL_TAXES", "BENEFITS", "REIMBURSEMENTS"] },
  {
    id: "vehicle",
    label: "Vehicle",
    categoryIds: ["AUTO_PAYMENT", "AUTO_INSURANCE", "GAS", "CHARGING", "AUTO_MAINTENANCE", "PARKING_TOLLS"],
  },
  { id: "travel", label: "Travel", categoryIds: ["TRAVEL", "GROUND_TRANSPORTATION", "MEALS"] },
  { id: "taxes", label: "Taxes", categoryIds: ["SALES_TAX", "ESTIMATED_TAXES"] },
  {
    id: "transfers_owner",
    label: "Transfers and Owner",
    categoryIds: ["TRANSFER_INTERNAL", "OWNER_DRAW", "OWNER_CONTRIBUTION", "LOAN_PAYMENT", "CARD_PAYMENT"],
  },
  {
    id: "refunds_adjustments",
    label: "Refunds and Adjustments",
    categoryIds: ["CUSTOMER_REFUND", "REFUND_CHARGEBACK", "REFUND_RECEIVED"],
  },
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
    MARKETING: "Marketing (legacy)",
    RENT_STORAGE: "Rent / Lease (legacy)",
    FEES: "Bank Fees (legacy)",
    TAXES: "Estimated Taxes (legacy)",
    TRANSFERS: "Transfer (Internal) (legacy)",
  } as Record<HqCategoryId, string>
);

/**
 * Options array for dropdowns/selects: { value, label } pairs.
 */
export const HQ_CATEGORY_OPTIONS: readonly { value: HqCategoryId; label: string }[] = HQ_CATEGORIES.map(
  (cat) => ({ value: cat.id, label: cat.label })
);