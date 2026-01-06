import type { Task } from "@/shared/utils/api";

export type BudgetTaskLinkType = "quote" | "procure" | "build" | "install" | "strike" | "invoice";

export const BUDGET_TASK_LINK_TYPES: Array<{ id: BudgetTaskLinkType; label: string }> = [
  { id: "quote", label: "Quote" },
  { id: "procure", label: "Procure" },
  { id: "build", label: "Build" },
  { id: "install", label: "Install" },
  { id: "strike", label: "Strike" },
  { id: "invoice", label: "Invoice" },
];

export function normalizeBudgetTaskLinkType(value: unknown): BudgetTaskLinkType | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase();
  const allowed = new Set(BUDGET_TASK_LINK_TYPES.map((t) => t.id));
  if (allowed.has(cleaned as BudgetTaskLinkType)) return cleaned as BudgetTaskLinkType;
  return null;
}

export function inferBudgetTaskLinkTypeFromTitle(title: string): BudgetTaskLinkType {
  const t = (title || "").toLowerCase();
  if (/\bquote\b|\bestimate\b|\bbid\b/.test(t)) return "quote";
  if (/\bpo\b|\border\b|\bpurchase\b|\bprocure\b/.test(t)) return "procure";
  if (/\binstall\b|\bload[- ]?in\b|\bsetup\b/.test(t)) return "install";
  if (/\bstrike\b|\btear[- ]?down\b|\bwrap\b|\bload[- ]?out\b/.test(t)) return "strike";
  if (/\binvoice\b|\bbill\b|\breconcile\b|\bpay\b/.test(t)) return "invoice";
  return "build";
}

export function taskHasBudgetLink(task: Task | null | undefined, budgetItemId: string): boolean {
  if (!task || !budgetItemId) return false;
  if (task.budgetItemId && task.budgetItemId === budgetItemId) return true;
  const links = Array.isArray(task.budgetLinks) ? task.budgetLinks : [];
  return links.some((l) => l && typeof l === "object" && (l as { budgetItemId?: unknown }).budgetItemId === budgetItemId);
}

export function countTasksLinkedToBudgetItem(tasks: Task[], budgetItemId: string): number {
  if (!budgetItemId) return 0;
  return tasks.reduce((sum, task) => sum + (taskHasBudgetLink(task, budgetItemId) ? 1 : 0), 0);
}

export function getTaskLinkTypeForBudgetItem(task: Task, budgetItemId: string): BudgetTaskLinkType | null {
  if (task.budgetItemId && task.budgetItemId === budgetItemId) {
    return normalizeBudgetTaskLinkType(task.budgetLinkType);
  }
  const links = Array.isArray(task.budgetLinks) ? task.budgetLinks : [];
  const link = links.find((l) => l && typeof l === "object" && (l as { budgetItemId?: unknown }).budgetItemId === budgetItemId);
  if (!link) return null;
  return normalizeBudgetTaskLinkType((link as { linkType?: unknown }).linkType);
}

