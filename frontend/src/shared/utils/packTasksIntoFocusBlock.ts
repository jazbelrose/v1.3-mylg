import type { TaskDraftKind } from "@/dashboard/project/features/calendar/lib/taskSpellbookDraft";

export type PackTasksOptions = {
  minTaskMinutes?: number;
  maxTaskMinutes?: number;
  /** When provided, merging will only occur between adjacent tasks with the same mergeKey. */
  mergeKey?: (task: PackableTask) => string | null | undefined;
  /** Default duration guess for items without explicit duration */
  defaultDurationMinutes?: number;
};

export type PackableTask = {
  draftId: string;
  title: string;
  /** Duration in minutes from draft (used for weighted allocation) */
  durationMinutes?: number | null;
  /** Item kind - breaks/buffers are never merged */
  kind?: TaskDraftKind;
  /** Merge key for grouping */
  mergeKey?: string;
};

export type PackedTask = PackableTask & {
  plannedMinutes: number;
  order: number;
  /** Was this task merged with others? */
  wasMerged?: boolean;
  /** IDs of tasks merged into this one */
  mergedFromIds?: string[];
};

export type PackingWarningCode =
  | "slack_time"
  | "min_task_minutes_unmet"
  | "over_allocated"
  | "tiny_tasks_detected"
  | "break_buffer_preserved"
  | "merge_key_conflict";

export type PackTasksResult = {
  tasks: PackedTask[];
  warnings: Array<{ code: PackingWarningCode; message: string }>;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeMinutes = (value: unknown, fallback: number) => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return clamp(n, 0, 24 * 60);
};

const roundTo5 = (value: number) => Math.round(value / 5) * 5;

const joinTitles = (a: string, b: string) => {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} + ${right}`;
};

/** Check if a kind should never be merged */
function isNonMergeableKind(kind?: TaskDraftKind): boolean {
  return kind === "break" || kind === "buffer";
}

/** Default duration guess based on kind or common patterns */
function getDefaultDuration(task: PackableTask, defaultMinutes: number): number {
  if (typeof task.durationMinutes === "number" && task.durationMinutes > 0) {
    return task.durationMinutes;
  }

  // Kind-based defaults
  if (task.kind === "break") return 15;
  if (task.kind === "buffer") return 10;
  if (task.kind === "intent") return 20;

  // Title-based guesses
  const title = (task.title ?? "").toLowerCase();
  if (/\b(quick|brief|short)\b/.test(title)) return 15;
  if (/\b(review|check|verify)\b/.test(title)) return 20;
  if (/\b(meeting|call|sync)\b/.test(title)) return 30;
  if (/\b(design|architecture|plan)\b/.test(title)) return 60;
  if (/\b(implement|build|create)\b/.test(title)) return 45;

  return defaultMinutes;
}

/**
 * Allocate time using weighted distribution based on duration hints.
 */
function allocateWeighted(
  blockMinutes: number,
  tasks: PackableTask[],
  options: { minTaskMinutes: number; maxTaskMinutes: number; defaultDurationMinutes: number },
): PackedTask[] {
  const total = Math.max(0, Math.floor(blockMinutes));
  if (tasks.length === 0) return [];

  // Calculate weights from duration hints
  const weights = tasks.map((task) => getDefaultDuration(task, options.defaultDurationMinutes));
  const sumWeights = weights.reduce((sum, w) => sum + w, 0);

  if (sumWeights === 0) {
    // Fallback to even distribution
    const base = Math.floor(total / tasks.length);
    let leftover = total - base * tasks.length;
    return tasks.map((t, idx) => {
      const extra = leftover > 0 ? 1 : 0;
      if (leftover > 0) leftover -= 1;
      return {
        ...t,
        plannedMinutes: Math.max(0, base + extra),
        order: idx,
        wasMerged: false,
        mergedFromIds: [],
      };
    });
  }

  // Weighted allocation
  const allocated = tasks.map((task, idx) => {
    const weight = weights[idx];
    const rawMinutes = (total * weight) / sumWeights;
    const planned = roundTo5(rawMinutes);
    // Only clamp to max here - min is handled by merge phase
    const clamped = Math.min(planned, options.maxTaskMinutes);
    return {
      ...task,
      plannedMinutes: clamped,
      order: idx,
      wasMerged: false,
      mergedFromIds: [] as string[],
    };
  });

  // Distribute remainder to highest-weight tasks
  const currentSum = allocated.reduce((sum, t) => sum + t.plannedMinutes, 0);
  let remainder = total - currentSum;

  if (remainder !== 0) {
    // Sort by weight descending to distribute to largest tasks
    const sortedIndices = weights
      .map((w, i) => ({ w, i }))
      .sort((a, b) => b.w - a.w)
      .map((x) => x.i);

    for (const idx of sortedIndices) {
      if (remainder === 0) break;
      const task = allocated[idx];
      const adjustment = remainder > 0 ? Math.min(5, remainder) : Math.max(-5, remainder);

      // Don't go below min or above max
      const newValue = task.plannedMinutes + adjustment;
      if (newValue >= options.minTaskMinutes && newValue <= options.maxTaskMinutes) {
        task.plannedMinutes = newValue;
        remainder -= adjustment;
      }
    }
  }

  return allocated;
}

function mergeAdjacent(
  tasks: PackedTask[],
  shouldMerge: (a: PackedTask, b: PackedTask) => boolean,
  minTaskMinutes: number,
  maxTitleLength: number = 80,
): { tasks: PackedTask[]; merged: boolean; hadConflict: boolean } {
  if (tasks.length < 2) return { tasks, merged: false, hadConflict: false };

  const out: PackedTask[] = [];
  let merged = false;
  let hadConflict = false;

  for (let i = 0; i < tasks.length; i += 1) {
    const cur = tasks[i];
    const prev = out[out.length - 1];

    // Never merge breaks or buffers
    if (isNonMergeableKind(cur.kind) || (prev && isNonMergeableKind(prev.kind))) {
      out.push({ ...cur });
      continue;
    }

    // Check if previous task is too small and should merge
    if (
      prev &&
      prev.plannedMinutes < minTaskMinutes &&
      shouldMerge(prev, cur)
    ) {
      // Check title length constraint
      const mergedTitle = joinTitles(prev.title, cur.title);
      if (mergedTitle.length <= maxTitleLength) {
        prev.draftId = `${prev.draftId}__${cur.draftId}`;
        prev.title = mergedTitle;
        prev.plannedMinutes = prev.plannedMinutes + cur.plannedMinutes;
        prev.wasMerged = true;
        prev.mergedFromIds = [...(prev.mergedFromIds ?? []), cur.draftId];
        merged = true;
        continue;
      }
    }

    // Check for merge key conflict (different merge keys but trying to merge)
    if (
      prev &&
      prev.plannedMinutes < minTaskMinutes &&
      !shouldMerge(prev, cur)
    ) {
      hadConflict = true;
    }

    out.push({ ...cur });
  }

  // Recompute order
  out.forEach((t, idx) => {
    t.order = idx;
  });

  return { tasks: out, merged, hadConflict };
}

export function packTasksIntoFocusBlock(
  blockMinutes: number,
  tasks: PackableTask[],
  options: PackTasksOptions = {},
): PackTasksResult {
  const warnings: PackTasksResult["warnings"] = [];

  const totalMinutes = normalizeMinutes(blockMinutes, 0);
  const minTaskMinutes = normalizeMinutes(options.minTaskMinutes, 15);
  const maxTaskMinutes = normalizeMinutes(options.maxTaskMinutes, 120);
  const defaultDurationMinutes = normalizeMinutes(options.defaultDurationMinutes, 30);

  // Check for break/buffer items that will be preserved
  const breakBufferCount = tasks.filter((t) => isNonMergeableKind(t.kind)).length;
  if (breakBufferCount > 0) {
    warnings.push({
      code: "break_buffer_preserved",
      message: `${breakBufferCount} break/buffer item(s) preserved (never merged)`,
    });
  }

  // Weighted allocation instead of even split
  let allocated = allocateWeighted(totalMinutes, tasks, {
    minTaskMinutes,
    maxTaskMinutes,
    defaultDurationMinutes,
  });

  // Max clamp (leave slack if tasks would be too large)
  allocated = allocated.map((t) => ({
    ...t,
    plannedMinutes: Math.min(t.plannedMinutes, maxTaskMinutes),
  }));

  const plannedSumAfterMax = allocated.reduce((sum, t) => sum + t.plannedMinutes, 0);
  if (plannedSumAfterMax < totalMinutes && allocated.length > 0 && maxTaskMinutes < totalMinutes) {
    warnings.push({
      code: "slack_time",
      message: "This focus block has extra slack time after max task clamp.",
    });
  }

  // Min clamp via merging adjacent tasks (only when mergeKey matches, if provided)
  if (minTaskMinutes > 0) {
    const keyFn = options.mergeKey;
    const shouldMerge = (a: PackedTask, b: PackedTask) => {
      // Never merge non-mergeable kinds
      if (isNonMergeableKind(a.kind) || isNonMergeableKind(b.kind)) {
        return false;
      }

      // If explicit mergeKey on items, use those
      if (a.mergeKey && b.mergeKey) {
        return a.mergeKey === b.mergeKey;
      }

      // Use provided key function
      if (!keyFn) return true;
      const ak = keyFn(a);
      const bk = keyFn(b);
      return Boolean(ak) && ak === bk;
    };

    // Iterate until no more merges possible
    let hadAnyConflict = false;
    for (let pass = 0; pass < 12; pass += 1) {
      const tooTiny = allocated.some(
        (t) => t.plannedMinutes > 0 && t.plannedMinutes < minTaskMinutes && !isNonMergeableKind(t.kind)
      );
      if (!tooTiny) break;
      const result = mergeAdjacent(allocated, shouldMerge, minTaskMinutes);
      allocated = result.tasks;
      if (result.hadConflict) hadAnyConflict = true;
      if (!result.merged) break;
    }

    if (hadAnyConflict) {
      warnings.push({
        code: "merge_key_conflict",
        message: "Tiny tasks detected with different merge keys; consider larger window.",
      });
    }

    const stillTiny = allocated.some(
      (t) => t.plannedMinutes > 0 && t.plannedMinutes < minTaskMinutes && !isNonMergeableKind(t.kind)
    );
    if (stillTiny) {
      warnings.push({
        code: "tiny_tasks_detected",
        message: "Some tasks are shorter than the minimum; increase window or reduce items.",
      });
    }
  }

  // Final guard: ensure sum <= blockMinutes
  const finalSum = allocated.reduce((sum, t) => sum + t.plannedMinutes, 0);
  if (finalSum > totalMinutes) {
    warnings.push({
      code: "over_allocated",
      message: "Planned minutes exceed the focus block window; trimming applied.",
    });

    // Trim from the end until we fit
    let overflow = finalSum - totalMinutes;
    for (let i = allocated.length - 1; i >= 0 && overflow > 0; i -= 1) {
      const t = allocated[i];
      const take = Math.min(overflow, t.plannedMinutes);
      t.plannedMinutes -= take;
      overflow -= take;
    }
  }

  // Normalize order again
  allocated.forEach((t, idx) => {
    t.order = idx;
  });

  return { tasks: allocated, warnings };
}

