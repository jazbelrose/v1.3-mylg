export type PackTasksOptions = {
  minTaskMinutes?: number;
  maxTaskMinutes?: number;
  /** When provided, merging will only occur between adjacent tasks with the same mergeKey. */
  mergeKey?: (task: PackableTask) => string | null | undefined;
};

export type PackableTask = {
  draftId: string;
  title: string;
};

export type PackedTask = PackableTask & {
  plannedMinutes: number;
  order: number;
};

export type PackTasksResult = {
  tasks: PackedTask[];
  warnings: Array<{ code: string; message: string }>;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeMinutes = (value: unknown, fallback: number) => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return clamp(n, 0, 24 * 60);
};

const joinTitles = (a: string, b: string) => {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} + ${right}`;
};

function allocateEvenly(blockMinutes: number, tasks: PackableTask[]): PackedTask[] {
  const total = Math.max(0, Math.floor(blockMinutes));
  if (tasks.length === 0) return [];

  const base = Math.floor(total / tasks.length);
  let leftover = total - base * tasks.length;

  return tasks.map((t, idx) => {
    const extra = leftover > 0 ? 1 : 0;
    if (leftover > 0) leftover -= 1;
    return {
      draftId: t.draftId,
      title: t.title,
      plannedMinutes: Math.max(0, base + extra),
      order: idx,
    };
  });
}

function mergeAdjacent(
  tasks: PackedTask[],
  shouldMerge: (a: PackedTask, b: PackedTask) => boolean,
  minTaskMinutes: number,
): { tasks: PackedTask[]; merged: boolean } {
  if (tasks.length < 2) return { tasks, merged: false };

  const out: PackedTask[] = [];
  let merged = false;

  for (let i = 0; i < tasks.length; i += 1) {
    const cur = tasks[i];
    const prev = out[out.length - 1];

    if (
      prev &&
      prev.plannedMinutes < minTaskMinutes &&
      shouldMerge(prev, cur)
    ) {
      prev.draftId = `${prev.draftId}__${cur.draftId}`;
      prev.title = joinTitles(prev.title, cur.title);
      prev.plannedMinutes = prev.plannedMinutes + cur.plannedMinutes;
      merged = true;
      continue;
    }

    out.push({ ...cur });
  }

  // Recompute order
  out.forEach((t, idx) => {
    t.order = idx;
  });

  return { tasks: out, merged };
}

export function packTasksIntoFocusBlock(blockMinutes: number, tasks: PackableTask[], options: PackTasksOptions = {}): PackTasksResult {
  const warnings: PackTasksResult["warnings"] = [];

  const totalMinutes = normalizeMinutes(blockMinutes, 0);
  const minTaskMinutes = normalizeMinutes(options.minTaskMinutes, 20);
  const maxTaskMinutes = normalizeMinutes(options.maxTaskMinutes, 120);

  const baseAllocated = allocateEvenly(totalMinutes, tasks);

  // Max clamp (leave slack if tasks would be too large).
  let clamped = baseAllocated.map((t) => ({ ...t, plannedMinutes: Math.min(t.plannedMinutes, maxTaskMinutes) }));

  // If max clamp introduced slack, we intentionally leave it unallocated.
  const plannedSumAfterMax = clamped.reduce((sum, t) => sum + t.plannedMinutes, 0);
  if (plannedSumAfterMax < totalMinutes && clamped.length > 0 && maxTaskMinutes < totalMinutes) {
    warnings.push({
      code: "slack_time",
      message: "This focus block has extra slack time after max task clamp.",
    });
  }

  // Min clamp via merging adjacent tasks (only when mergeKey matches, if provided).
  if (minTaskMinutes > 0) {
    const keyFn = options.mergeKey;
    const shouldMerge = (a: PackedTask, b: PackedTask) => {
      if (!keyFn) return true;
      const ak = keyFn(a);
      const bk = keyFn(b);
      return Boolean(ak) && ak === bk;
    };

    // Iterate until no more merges possible.
    for (let pass = 0; pass < 12; pass += 1) {
      const tooTiny = clamped.some((t) => t.plannedMinutes > 0 && t.plannedMinutes < minTaskMinutes);
      if (!tooTiny) break;
      const result = mergeAdjacent(clamped, shouldMerge, minTaskMinutes);
      clamped = result.tasks;
      if (!result.merged) break;
    }

    const stillTiny = clamped.some((t) => t.plannedMinutes > 0 && t.plannedMinutes < minTaskMinutes);
    if (stillTiny) {
      warnings.push({
        code: "min_task_minutes_unmet",
        message: "Some tasks are shorter than the minimum task minutes for this focus block.",
      });
    }
  }

  // Final guard: ensure sum <= blockMinutes.
  const finalSum = clamped.reduce((sum, t) => sum + t.plannedMinutes, 0);
  if (finalSum > totalMinutes) {
    warnings.push({
      code: "over_allocated",
      message: "Planned minutes exceed the focus block window; trimming applied.",
    });

    // Trim from the end until we fit.
    let overflow = finalSum - totalMinutes;
    for (let i = clamped.length - 1; i >= 0 && overflow > 0; i -= 1) {
      const t = clamped[i];
      const take = Math.min(overflow, t.plannedMinutes);
      t.plannedMinutes -= take;
      overflow -= take;
    }
  }

  // Normalize order again.
  clamped.forEach((t, idx) => {
    t.order = idx;
  });

  return { tasks: clamped, warnings };
}
