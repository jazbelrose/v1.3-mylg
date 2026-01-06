export type HqCategoryId =
  | "PAYROLL"
  | "PRODUCTION"
  | "SOFTWARE"
  | "TRAVEL"
  | "MARKETING"
  | "RENT_STORAGE"
  | "FEES"
  | "TAXES"
  | "TRANSFERS"
  | "INCOME"
  | "OTHER";

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

  anchorDate?: string | null; // YYYY-MM-DD
  anchorBalance?: number | null;

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
  createdAt: string; // ISO
};

export type HqCategoryRuleMatchType = "vendor" | "regex";

export type HqCategoryRule = {
  orgId: string;
  ruleId: string;
  priority: number;
  matchType: HqCategoryRuleMatchType;
  pattern: string;
  categoryId: HqCategoryId;
  projectId?: string;
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
};
