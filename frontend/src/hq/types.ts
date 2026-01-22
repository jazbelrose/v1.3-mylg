export type HQAccount = {
  id: string;
  institution: string;
  name: string;
  mask?: string;
  type: "depository" | "credit" | "loan" | "investment" | "other";
  subtype?: string;
  currency: string;
  current: number;
  available?: number;
  lastSyncAt: string;
};

export type HQTxn = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  isDebit: boolean;
  name: string;
  merchant?: string;
  category: string[];
  tags?: string[];
  note?: string;
  receiptUrl?: string;
  // Allocation info
  allocations?: TxnAllocation[];
  totalAllocated?: number;
  isFullyAllocated?: boolean;
};

export type HQAlert = {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
};

export type TxnAllocation = {
  allocationId: string;
  transactionId: string;
  projectId: string;
  budgetId?: string | null;
  budgetItemId: string;
  allocatedAmount: number;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AllocationRequest = {
  transactionId: string;
  projectId: string;
  budgetId?: string;
  budgetItemId: string;
  allocatedAmount: number;
  notes?: string;
};

export type AllocationSplitRequest = {
  transactionId: string;
  allocations: Array<{
    projectId: string;
    budgetId?: string;
    budgetItemId: string;
    allocatedAmount: number;
    notes?: string;
  }>;
};

