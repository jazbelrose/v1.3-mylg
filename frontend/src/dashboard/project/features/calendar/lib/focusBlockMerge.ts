import type { Task as ApiTask } from "@/shared/utils/api";
import type { CalendarTask } from "../utils";
import { getBestAssigneeTokensByUserId } from "./groupStack";

const normalizeKind = (task: CalendarTask): string =>
  typeof task.kind === "string" ? task.kind.trim().toLowerCase() : "";

const isTimeBlockContainer = (task: CalendarTask): boolean => {
  const kind = normalizeKind(task);
  if (kind === "focus_block" || kind === "group_stack") return true;
  return Boolean(
    (Array.isArray(task.focusChildTaskIds) && task.focusChildTaskIds.length > 0) ||
      (Array.isArray(task.focusChecklist) && task.focusChecklist.length > 0),
  );
};

const parseTimeToMinutes = (time?: string | null): number | null => {
  if (typeof time !== "string") return null;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return Math.max(0, Math.min(24 * 60, hours * 60 + minutes));
};

const resolveAssigneeTokenCandidates = (task: CalendarTask): string[] => {
  const source = (task.source ?? {}) as ApiTask & {
    assigneeIds?: unknown;
    assigneeTokens?: unknown;
  };

  const candidates: unknown[] = [
    task.assignedTo,
    source.assigneeId,
    ...(Array.isArray(task.assigneeIds) ? task.assigneeIds : []),
    ...(Array.isArray(source.assigneeIds) ? (source.assigneeIds as unknown[]) : []),
    ...(Array.isArray(source.assigneeTokens) ? (source.assigneeTokens as unknown[]) : []),
  ];

  return candidates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
};

const resolveOwnerToken = (focusBlock: CalendarTask): string | null => {
  const source = (focusBlock.source ?? {}) as ApiTask;
  const token =
    (typeof focusBlock.assignedTo === "string" ? focusBlock.assignedTo : null) ??
    (typeof source.assigneeId === "string" ? source.assigneeId : null);
  const normalized = typeof token === "string" ? token.trim() : "";
  return normalized.length > 0 ? normalized : null;
};

const resolveFocusChildIds = (task: CalendarTask): string[] => {
  const ids = [
    ...(Array.isArray(task.focusChildTaskIds) ? task.focusChildTaskIds : []),
    ...(Array.isArray(task.focusChecklist) ? task.focusChecklist.map((item) => item?.taskId) : []),
  ];
  return ids
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id) => id.length > 0);
};

const resolveLinkedChildIds = (options: { allTasks: CalendarTask[]; focusId: string; resolveId: (t: CalendarTask) => string | null }): string[] => {
  const { allTasks, focusId, resolveId } = options;
  const out: string[] = [];
  allTasks.forEach((task) => {
    if (typeof task.focusBlockId !== "string") return;
    if (task.focusBlockId.trim() !== focusId) return;
    const id = resolveId(task);
    if (id) out.push(id);
  });
  return out;
};

const collectLeafTaskIds = (options: {
  root: CalendarTask;
  allTasks: CalendarTask[];
  taskById: Map<string, CalendarTask>;
  resolveId: (t: CalendarTask) => string | null;
  warn?: (message: string, details: Record<string, unknown>) => void;
}): string[] => {
  const { root, allTasks, taskById, resolveId, warn } = options;

  const rootId = resolveId(root);
  if (!rootId) return [];

  const visited = new Set<string>();
  const leaves: string[] = [];

  const enqueue = (ids: string[]) => {
    ids.forEach((id) => {
      const normalized = typeof id === "string" ? id.trim() : "";
      if (!normalized) return;
      if (visited.has(normalized)) return;
      visited.add(normalized);
      queue.push(normalized);
    });
  };

  const queue: string[] = [];
  enqueue(resolveFocusChildIds(root));
  enqueue(resolveLinkedChildIds({ allTasks, focusId: rootId, resolveId }));

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;

    const task = taskById.get(id) ?? null;
    if (!task) {
      warn?.("[calendar] Dropping stale focus child reference during merge", { focusId: rootId, childId: id });
      continue;
    }

    if (isTimeBlockContainer(task)) {
      enqueue(resolveFocusChildIds(task));
      enqueue(resolveLinkedChildIds({ allTasks, focusId: id, resolveId }));
      continue;
    }

    leaves.push(id);
  }

  return leaves;
};

export type FocusBlockMergeToGroupStackPlan = {
  leafTaskIds: string[];
  focusChecklist: Array<{ taskId: string; title: string }>;
  childUpdates: Array<{ taskId: string; fields: { focusBlockId: string; assigneeId?: string } }>;
  participants: string[];
};

export const buildGroupStackFromTwoFocusBlocks = (options: {
  src: CalendarTask;
  dst: CalendarTask;
  dstId: string;
  allTasks: CalendarTask[];
  taskById: Map<string, CalendarTask>;
  resolveId: (t: CalendarTask) => string | null;
  warn?: (message: string, details: Record<string, unknown>) => void;
}): FocusBlockMergeToGroupStackPlan => {
  const { src, dst, dstId, allTasks, taskById, resolveId, warn } = options;

  const srcOwnerToken = resolveOwnerToken(src);
  const dstOwnerToken = resolveOwnerToken(dst);

  const srcLeafIds = collectLeafTaskIds({ root: src, allTasks, taskById, resolveId, warn });
  const dstLeafIds = collectLeafTaskIds({ root: dst, allTasks, taskById, resolveId, warn });

  const originOwnerTokenByLeafId = new Map<string, string | null>();
  srcLeafIds.forEach((id) => originOwnerTokenByLeafId.set(id, srcOwnerToken));
  dstLeafIds.forEach((id) => {
    if (!originOwnerTokenByLeafId.has(id)) originOwnerTokenByLeafId.set(id, dstOwnerToken);
  });

  const uniqueLeafIds = Array.from(
    new Set([...srcLeafIds, ...dstLeafIds].filter((id) => id !== dstId)),
  );

  const leafTasks = uniqueLeafIds
    .map((id) => ({ id, task: taskById.get(id) ?? null }))
    .filter((entry): entry is { id: string; task: CalendarTask } => Boolean(entry.task))
    .map((entry) => entry.task)
    .slice()
    .sort((a, b) => {
      const aStart = parseTimeToMinutes(a.start) ?? 0;
      const bStart = parseTimeToMinutes(b.start) ?? 0;
      if (aStart !== bStart) return aStart - bStart;
      const aTitle = (a.title ?? "").trim();
      const bTitle = (b.title ?? "").trim();
      if (aTitle !== bTitle) return aTitle.localeCompare(bTitle);
      return (resolveId(a) ?? "").localeCompare(resolveId(b) ?? "");
    });

  const leafTaskIds = leafTasks
    .map((task) => resolveId(task))
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

  const focusChecklist = leafTasks.map((task) => ({
    taskId: resolveId(task) ?? task.id,
    title: (task.title ?? "").trim() || "Untitled task",
  }));

  const childUpdates: FocusBlockMergeToGroupStackPlan["childUpdates"] = [];
  const virtualForParticipants: CalendarTask[] = [src, dst];

  leafTasks.forEach((task) => {
    const taskId = resolveId(task);
    if (!taskId) return;

    const candidates = resolveAssigneeTokenCandidates(task);
    const hasAssignment = candidates.length > 0;

    const fallbackToken = originOwnerTokenByLeafId.get(taskId) ?? null;

    const fields: { focusBlockId: string; assigneeId?: string } = { focusBlockId: dstId };
    const source = (task.source ?? {}) as ApiTask;
    const nextAssigneeId = !hasAssignment && fallbackToken ? fallbackToken : undefined;
    if (nextAssigneeId && (!source.assigneeId || source.assigneeId.trim().length === 0)) {
      fields.assigneeId = nextAssigneeId;
    }

    const shouldUpdateFocusId = typeof task.focusBlockId !== "string" || task.focusBlockId.trim() !== dstId;
    const shouldUpdateAssignment = typeof fields.assigneeId === "string";
    if (shouldUpdateFocusId || shouldUpdateAssignment) {
      childUpdates.push({ taskId, fields });
    }

    if (shouldUpdateAssignment) {
      const nextSource = { ...(task.source as ApiTask), assigneeId: fields.assigneeId } as ApiTask;
      virtualForParticipants.push({ ...task, assignedTo: task.assignedTo ?? fields.assigneeId, source: nextSource });
    } else {
      virtualForParticipants.push(task);
    }
  });

  if (srcOwnerToken) {
    virtualForParticipants.push({ ...src, assignedTo: src.assignedTo ?? srcOwnerToken, source: { ...(src.source as ApiTask), assigneeId: srcOwnerToken } as ApiTask });
  }
  if (dstOwnerToken) {
    virtualForParticipants.push({ ...dst, assignedTo: dst.assignedTo ?? dstOwnerToken, source: { ...(dst.source as ApiTask), assigneeId: dstOwnerToken } as ApiTask });
  }

  const participants = getBestAssigneeTokensByUserId(virtualForParticipants);

  return { leafTaskIds, focusChecklist, childUpdates, participants };
};

