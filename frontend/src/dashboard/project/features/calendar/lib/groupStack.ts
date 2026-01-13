import type { Task as ApiTask } from "@/shared/utils/api";
import type { CalendarTask } from "../utils";
import { parseAssigneeUserId } from "../components/timelineLayout";

export const GROUP_STACK_KIND = "group_stack";

const normalizeToken = (value?: string | null): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const looksLikeAssignmentToken = (value: string): boolean => value.includes("__");

const collectAssigneeTokenCandidates = (task: CalendarTask): string[] => {
  const source = (task.source ?? {}) as ApiTask & {
    assigneeIds?: unknown;
    assigneeTokens?: unknown;
  };

  const out: string[] = [];
  const push = (value?: string | null) => {
    const normalized = normalizeToken(value);
    if (!normalized) return;
    out.push(normalized);
  };

  push(task.assignedTo ?? null);
  push(source.assigneeId ?? null);

  if (Array.isArray(task.assigneeIds)) {
    task.assigneeIds.forEach((candidate) => push(candidate));
  }
  if (Array.isArray(source.assigneeIds)) {
    (source.assigneeIds as unknown[]).forEach((candidate) => push(candidate as string));
  }
  if (Array.isArray(source.assigneeTokens)) {
    (source.assigneeTokens as unknown[]).forEach((candidate) => push(candidate as string));
  }

  return out;
};

export const getPrimaryAssigneeUserId = (task: CalendarTask): string | null => {
  const tokens = collectAssigneeTokenCandidates(task);
  for (const token of tokens) {
    const userId = parseAssigneeUserId(token);
    if (userId) return userId;
  }
  return null;
};

export const getBestAssigneeTokensByUserId = (tasks: CalendarTask[]): string[] => {
  const bestTokenByUserId = new Map<string, string>();
  const orderedUserIds: string[] = [];

  tasks.forEach((task) => {
    collectAssigneeTokenCandidates(task).forEach((token) => {
      const userId = parseAssigneeUserId(token);
      if (!userId) return;

      const existing = bestTokenByUserId.get(userId);
      if (!existing) {
        bestTokenByUserId.set(userId, token);
        orderedUserIds.push(userId);
        return;
      }

      // Prefer assignment tokens (Name__userId) over bare ids.
      if (!looksLikeAssignmentToken(existing) && looksLikeAssignmentToken(token)) {
        bestTokenByUserId.set(userId, token);
      }
    });
  });

  return orderedUserIds.map((userId) => bestTokenByUserId.get(userId) ?? userId);
};

export const shouldConvertToGroupStack = (options: { container: CalendarTask; dragged: CalendarTask }): boolean => {
  const containerOwner = getPrimaryAssigneeUserId(options.container);
  const dragOwner = getPrimaryAssigneeUserId(options.dragged);
  if (!containerOwner || !dragOwner) return false;
  return containerOwner !== dragOwner;
};

export const isGroupStackTask = (task: CalendarTask): boolean => {
  const normalizedKind = typeof task.kind === "string" ? task.kind.trim().toLowerCase() : "";
  return normalizedKind === GROUP_STACK_KIND;
};

