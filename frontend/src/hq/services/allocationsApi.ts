import { apiFetch } from "../../shared/utils/api";
import type {
  TxnAllocation,
  AllocationRequest,
  AllocationSplitRequest,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Create a single allocation linking a transaction to a budget line
 */
export async function createAllocation(
  request: AllocationRequest
): Promise<TxnAllocation> {
  return apiFetch<TxnAllocation>(`${API_BASE}/allocations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

/**
 * Split a transaction across multiple budget lines
 */
export async function createAllocationSplit(
  request: AllocationSplitRequest
): Promise<TxnAllocation[]> {
  return apiFetch<TxnAllocation[]>(`${API_BASE}/allocations/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

/**
 * Update an existing allocation
 */
export async function updateAllocation(
  allocationId: string,
  allocatedAmount: number,
  notes?: string
): Promise<TxnAllocation> {
  return apiFetch<TxnAllocation>(`${API_BASE}/allocations/${allocationId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allocatedAmount, notes }),
  });
}

/**
 * Delete an allocation
 */
export async function deleteAllocation(
  allocationId: string
): Promise<{ message: string; allocationId: string }> {
  return apiFetch(`${API_BASE}/allocations/${allocationId}`, {
    method: "DELETE",
  });
}

/**
 * Get all allocations for a specific project
 */
export async function getAllocationsByProject(
  projectId: string
): Promise<TxnAllocation[]> {
  return apiFetch<TxnAllocation[]>(
    `${API_BASE}/allocations/project/${projectId}`
  );
}

/**
 * Get all allocations for a specific transaction
 */
export async function getAllocationsByTransaction(
  transactionId: string
): Promise<TxnAllocation[]> {
  return apiFetch<TxnAllocation[]>(
    `${API_BASE}/allocations/transaction/${transactionId}`
  );
}
