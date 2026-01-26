import type { HqCategoryId } from "@/hq/types";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Car,
  CircleHelp,
  CloudCog,
  HardHat,
  Landmark,
  MoreHorizontal,
  Package,
  PackageOpen,
  Plane,
  Receipt,
  RotateCcw,
  Scale,
  ShieldCheck,
  Truck,
  Utensils,
  Users,
  CarTaxiFront,
} from "lucide-react";

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
    | "refunds_adjustments"
    | "other";
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
  { id: "other", label: "Other", categoryIds: ["OTHER"] },
] as const;

export type HqCategoryGroupId = HqCategoryGroupDefinition["id"];

export const HQ_CATEGORY_GROUP_ICON: Record<HqCategoryGroupId, LucideIcon> = {
  income: Banknote,
  direct_job_costs: Briefcase,
  operating_expenses: Receipt,
  payroll: Users,
  vehicle: Car,
  travel: Plane,
  taxes: Landmark,
  transfers_owner: ArrowLeftRight,
  refunds_adjustments: RotateCcw,
  other: MoreHorizontal,
};

const HQ_CATEGORY_ICON_BY_ID: Partial<Record<HqCategoryId, LucideIcon>> = {
  // Operating Expenses
  PROFESSIONAL_SERVICES: Scale,
  INSURANCE: ShieldCheck,
  SOFTWARE_SAAS: CloudCog,

  // Direct Job Costs
  CONTRACTORS_1099: HardHat,
  MATERIALS_SUPPLIES: Package,
  SHIPPING: PackageOpen,
  TRUCKING_TRANSPORT: Truck,

  // Travel
  GROUND_TRANSPORTATION: CarTaxiFront,
  MEALS: Utensils,
};

export type HqCategoryMeta = {
  id: HqCategoryId;
  label: string;
  groupId: HqCategoryGroupId;
  groupLabel: string;
};

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

const HQ_CATEGORY_GROUP_BY_ID: Partial<Record<HqCategoryId, HqCategoryGroupId>> = (() => {
  const map: Partial<Record<HqCategoryId, HqCategoryGroupId>> = {};
  for (const group of HQ_CATEGORY_GROUPS) {
    for (const id of group.categoryIds) map[id] = group.id;
  }

  // Legacy IDs (keep UI stable for historical data).
  map.PAYROLL = "payroll";
  map.PRODUCTION = "direct_job_costs";
  map.SOFTWARE = "operating_expenses";
  map.MARKETING = "operating_expenses";
  map.FEES = "operating_expenses";
  map.TAXES = "taxes";
  map.TRANSFERS = "transfers_owner";

  return map;
})();

const HQ_CATEGORY_GROUP_LABEL_BY_ID: Record<HqCategoryGroupId, string> = HQ_CATEGORY_GROUPS.reduce(
  (acc, group) => {
    acc[group.id] = group.label;
    return acc;
  },
  {} as Record<HqCategoryGroupId, string>
);

export const HQ_CATEGORY_META_BY_ID: Partial<Record<HqCategoryId, HqCategoryMeta>> = (() => {
  const meta: Partial<Record<HqCategoryId, HqCategoryMeta>> = {};

  for (const [id, label] of Object.entries(HQ_CATEGORY_LABEL) as Array<[HqCategoryId, string]>) {
    const groupId = HQ_CATEGORY_GROUP_BY_ID[id];
    if (!groupId) continue;
    meta[id] = { id, label, groupId, groupLabel: HQ_CATEGORY_GROUP_LABEL_BY_ID[groupId] };
  }

  return meta;
})();

export function getHqCategoryMeta(categoryId: string | null | undefined): HqCategoryMeta | null {
  if (!categoryId) return null;
  const id = categoryId as HqCategoryId;
  const label = HQ_CATEGORY_LABEL[id];
  if (!label) return null;
  const groupId = HQ_CATEGORY_GROUP_BY_ID[id] ?? "other";
  return { id, label, groupId, groupLabel: HQ_CATEGORY_GROUP_LABEL_BY_ID[groupId] };
}

export function getHqCategoryIcon(categoryId: string | null | undefined): LucideIcon {
  const meta = getHqCategoryMeta(categoryId);
  if (!meta) return CircleHelp;
  return HQ_CATEGORY_ICON_BY_ID[meta.id] ?? HQ_CATEGORY_GROUP_ICON[meta.groupId] ?? CircleHelp;
}

/**
 * Options array for dropdowns/selects: { value, label } pairs.
 */
export const HQ_CATEGORY_OPTIONS: readonly { value: HqCategoryId; label: string }[] = HQ_CATEGORIES.map(
  (cat) => ({ value: cat.id, label: cat.label })
);
