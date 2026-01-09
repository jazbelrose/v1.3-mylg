export type HqCategoryId =
  // People
  | "PAYROLL_W2"
  | "PAYROLL_TAXES"
  | "CONTRACTORS_1099"
  | "REIMBURSEMENTS"
  // Owner
  | "OWNER_DRAW"
  | "OWNER_CONTRIBUTION"
  // Operations
  | "MATERIALS_SUPPLIES"
  | "SOFTWARE_SAAS"
  | "INSURANCE"
  | "RENT_LEASE"
  | "UTILITIES"
  | "PHONE_INTERNET"
  | "SHIPPING"
  // Travel & Vehicles
  | "AUTO_PAYMENT"
  | "AUTO_INSURANCE"
  | "AUTO_MAINTENANCE"
  | "GAS"
  | "CHARGING"
  | "PARKING_TOLLS"
  | "TRAVEL"
  // Finance
  | "BANK_FEES"
  | "INTEREST"
  | "CARD_PAYMENT"
  | "LOAN_PAYMENT"
  // Government
  | "SALES_TAX"
  | "ESTIMATED_TAXES"
  | "PERMITS_LICENSES"
  // Movement
  | "TRANSFER_INTERNAL"
  | "REFUND_CHARGEBACK"
  // Income
  | "INCOME"
  | "CLIENT_PAYMENT"
  | "REFUND_RECEIVED"
  | "INTEREST_INCOME"
  // Fallback
  | "OTHER"
  // Legacy IDs (keep for backwards compatibility with stored data)
  | "PAYROLL"
  | "PRODUCTION"
  | "SOFTWARE"
  | "MARKETING"
  | "RENT_STORAGE"
  | "FEES"
  | "TAXES"
  | "TRANSFERS";

export type HqTransactionType =
  | "card_purchase"
  | "recurring"
  | "transfer"
  | "zelle"
  | "wire"
  | "deposit"
  | "fee"
  | "unknown";

export type HqAccount = {
  orgId: string;
  accountId: string;
  name: string;
  /** @deprecated legacy field name; kept for backward compatibility */
  accountName?: string;
  institution: string;
  currency: "USD";
  accountMask?: string;
  notes?: string;

  includeInCashOnHand?: boolean;
  archivedAt?: string | null;

  anchorDate?: string | null; // YYYY-MM-DD
  anchorBalance?: number | null;

  /** Stored current balance (fast cash-on-hand). Updated at import-time or via recompute. */
  currentBalance?: number | null;

  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type HqImportRunStatus = "processing" | "completed" | "failed";

export type HqImportRun = {
  orgId: string;
  importRunId: string;
  accountId: string;
  filename: string;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  status: HqImportRunStatus;
  warnings?: string[];
  createdAt: string; // ISO
};

export type HqCategoryRuleMatchType = "vendor" | "regex";

export type HqCategoryRuleScope = "org" | "account" | "card";

export type HqCategoryRule = {
  orgId: string;
  ruleId: string;
  priority: number;
  matchType: HqCategoryRuleMatchType;
  pattern: string;
  categoryId: HqCategoryId;
  projectId?: string;
  scope?: HqCategoryRuleScope;
  accountId?: string;
  cardLast4?: string;
  direction?: "in" | "out";
  method?: "ach" | "card" | "wire" | "check" | "transfer";
  applyMode?: "uncategorized" | "overwrite";
  amountMin?: number;
  amountMax?: number;
  frequencyHint?: "weekly" | "biweekly" | "monthly" | "other";
  enabled: boolean;
  createdAt: string; // ISO
};

export type HqTransaction = {
  orgId: string;
  accountId: string;

  postedAt: string; // YYYY-MM-DD
  authorizedAt?: string; // YYYY-MM-DD

  amount: number; // signed
  currency: "USD";

  rawDescription: string;
  normalizedDescription: string;

  /** Server-computed vendor match key (parity with /hq/vendor-matches). */
  vendorKey?: string;

  type: HqTransactionType;
  direction: "in" | "out";
  vendor?: string;
  counterparty?: string;
  locationCity?: string;
  locationState?: string;
  cardLast4?: string;
  referenceId?: string;

  categoryId?: HqCategoryId;
  categoryConfidence?: number;
  isInternalTransfer?: boolean;

  projectId?: string;

  importRunId: string;
  dedupeHash: string;
  createdAt: string; // ISO
};

export type HqAlert = {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
};

export type HqStoreStateV1 = {
  version: 1;
  orgId: string;
  accounts: HqAccount[];
  importRuns: HqImportRun[];
  transactions: HqTransaction[];
  categoryRules: HqCategoryRule[];

  cashOnHandAggregate?: number | null;
  missingAnchorAccountIds?: string[];
};
