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

type RawBudgetTaskLink = {
  budgetLineItemId?: unknown;
  budgetItemId?: unknown;
  linkType?: unknown;
  createdAt?: unknown;
  createdBy?: unknown;
  isPrimary?: unknown;
};

export type SecondaryBudgetTaskLink = {
  budgetLineItemId: string;
  linkType: BudgetTaskLinkType | null;
  createdAt?: string;
  createdBy?: string;
};

export function getPrimaryBudgetLineItemId(task: Task | null | undefined): string | null {
  if (!task) return null;
  const raw =
    (task as { primaryBudgetLineItemId?: unknown }).primaryBudgetLineItemId ??
    (task as { budgetItemId?: unknown }).budgetItemId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export function getSecondaryBudgetLinks(task: Task | null | undefined): SecondaryBudgetTaskLink[] {
  if (!task) return [];

  const primaryId = getPrimaryBudgetLineItemId(task);
  const rawLinks = Array.isArray(task.budgetLinks) ? (task.budgetLinks as unknown[]) : [];
  const out: SecondaryBudgetTaskLink[] = [];
  const seen = new Set<string>();

  for (const raw of rawLinks) {
    if (!raw || typeof raw !== "object") continue;
    const link = raw as RawBudgetTaskLink;
    const rawId =
      typeof link.budgetLineItemId === "string"
        ? link.budgetLineItemId
        : typeof link.budgetItemId === "string"
          ? link.budgetItemId
          : "";
    const budgetLineItemId = rawId.trim();
    if (!budgetLineItemId) continue;

    // Enforce invariant: secondary links never include primary.
    if (primaryId && budgetLineItemId === primaryId) continue;
    // If older data encoded primary in the list, skip it.
    if (link.isPrimary === true) continue;

    if (seen.has(budgetLineItemId)) continue;
    seen.add(budgetLineItemId);

    const linkType = normalizeBudgetTaskLinkType(link.linkType);
    const createdAt = typeof link.createdAt === "string" && link.createdAt.trim() ? link.createdAt.trim() : undefined;
    const createdBy = typeof link.createdBy === "string" && link.createdBy.trim() ? link.createdBy.trim() : undefined;

    out.push({ budgetLineItemId, linkType, createdAt, createdBy });
  }

  return out;
}

export function taskHasBudgetLink(task: Task | null | undefined, budgetItemId: string): boolean {
  if (!task || !budgetItemId) return false;
  const target = budgetItemId.trim();
  if (!target) return false;
  if (getPrimaryBudgetLineItemId(task) === target) return true;
  return getSecondaryBudgetLinks(task).some((l) => l.budgetLineItemId === target);
}

export function countTasksLinkedToBudgetItem(tasks: Task[], budgetItemId: string): number {
  if (!budgetItemId) return 0;
  return tasks.reduce((sum, task) => sum + (taskHasBudgetLink(task, budgetItemId) ? 1 : 0), 0);
}

export function getTaskLinkTypeForBudgetItem(task: Task, budgetItemId: string): BudgetTaskLinkType | null {
  const target = (budgetItemId || "").trim();
  if (!target) return null;

  if (getPrimaryBudgetLineItemId(task) === target) {
    return normalizeBudgetTaskLinkType(task.budgetLinkType);
  }

  const secondary = getSecondaryBudgetLinks(task);
  const link = secondary.find((l) => l.budgetLineItemId === target);
  if (!link) return null;
  return link.linkType;
}

