export type BusyBlock = {
  startMinutes: number;
  endMinutes: number;
};

export type DoableDraft = {
  id: string;
  title: string;
  durationMinutes: number;
};

export type DoablePlacement = {
  draftId: string;
  startMinutes: number;
  endMinutes: number;
};

export type DoablePlan = {
  id: string;
  label: string;
  hint: string;
  placements: DoablePlacement[];
  overflow: DoableDraft[];
  dayStartMinutes: number;
  dayEndMinutes: number;
  bufferMinutes: number;
  scheduledMinutes: number;
};

const clampMinutes = (value: number) => Math.max(0, Math.min(24 * 60, value));

const mergeBusy = (busy: BusyBlock[]): BusyBlock[] => {
  const sorted = busy
    .map((block) => ({
      startMinutes: clampMinutes(block.startMinutes),
      endMinutes: clampMinutes(block.endMinutes),
    }))
    .filter((block) => block.endMinutes > block.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const merged: BusyBlock[] = [];
  for (const block of sorted) {
    const last = merged[merged.length - 1];
    if (!last || block.startMinutes > last.endMinutes) {
      merged.push({ ...block });
      continue;
    }
    last.endMinutes = Math.max(last.endMinutes, block.endMinutes);
  }
  return merged;
};

const invertBusy = (busy: BusyBlock[], dayStart: number, dayEnd: number): BusyBlock[] => {
  const merged = mergeBusy(busy);
  const clampedStart = clampMinutes(dayStart);
  const clampedEnd = clampMinutes(dayEnd);
  if (clampedEnd <= clampedStart) return [];

  const slots: BusyBlock[] = [];
  let cursor = clampedStart;
  for (const block of merged) {
    if (block.endMinutes <= clampedStart) continue;
    if (block.startMinutes >= clampedEnd) break;
    const start = Math.max(cursor, clampedStart);
    const end = Math.min(block.startMinutes, clampedEnd);
    if (end > start) slots.push({ startMinutes: start, endMinutes: end });
    cursor = Math.max(cursor, block.endMinutes);
  }
  if (cursor < clampedEnd) {
    slots.push({ startMinutes: cursor, endMinutes: clampedEnd });
  }
  return slots;
};

const packGreedy = (
  drafts: DoableDraft[],
  slots: BusyBlock[],
  bufferMinutes: number,
): { placements: DoablePlacement[]; overflow: DoableDraft[] } => {
  const placements: DoablePlacement[] = [];
  const overflow: DoableDraft[] = [];

  const remainingSlots = slots.map((slot) => ({ ...slot }));

  for (const draft of drafts) {
    const needed = Math.max(5, Math.round(draft.durationMinutes));
    let placed = false;

    for (let i = 0; i < remainingSlots.length; i += 1) {
      const slot = remainingSlots[i];
      const start = slot.startMinutes;
      const end = start + needed;
      if (end <= slot.endMinutes) {
        placements.push({ draftId: draft.id, startMinutes: start, endMinutes: end });
        slot.startMinutes = Math.min(slot.endMinutes, end + bufferMinutes);
        if (slot.startMinutes >= slot.endMinutes) {
          remainingSlots.splice(i, 1);
        }
        placed = true;
        break;
      }
    }

    if (!placed) overflow.push(draft);
  }

  return { placements, overflow };
};

export function buildDoablePlans(options: {
  drafts: DoableDraft[];
  busy: BusyBlock[];
}): DoablePlan[] {
  const drafts = options.drafts.slice();
  const busy = options.busy ?? [];

  const byDurationDesc = drafts.slice().sort((a, b) => b.durationMinutes - a.durationMinutes);
  const byOriginal = drafts.slice();
  const byShortFirst = drafts.slice().sort((a, b) => a.durationMinutes - b.durationMinutes);

  const planSpecs: Array<{
    id: string;
    label: string;
    hint: string;
    dayStartMinutes: number;
    dayEndMinutes: number;
    bufferMinutes: number;
    ordering: DoableDraft[];
  }> = [
    {
      id: "balanced",
      label: "Balanced",
      hint: "9–5 with breathing room",
      dayStartMinutes: 9 * 60,
      dayEndMinutes: 17 * 60,
      bufferMinutes: 10,
      ordering: byOriginal,
    },
    {
      id: "early",
      label: "Early start",
      hint: "Front-load deep work",
      dayStartMinutes: 8 * 60,
      dayEndMinutes: 16 * 60,
      bufferMinutes: 5,
      ordering: byDurationDesc,
    },
    {
      id: "late",
      label: "Late start",
      hint: "Start later, keep momentum",
      dayStartMinutes: 10 * 60,
      dayEndMinutes: 18 * 60,
      bufferMinutes: 10,
      ordering: byShortFirst,
    },
  ];

  return planSpecs.map((spec) => {
    const freeSlots = invertBusy(busy, spec.dayStartMinutes, spec.dayEndMinutes);
    const { placements, overflow } = packGreedy(spec.ordering, freeSlots, spec.bufferMinutes);
    const scheduledMinutes = placements.reduce((sum, p) => sum + (p.endMinutes - p.startMinutes), 0);
    return {
      id: spec.id,
      label: spec.label,
      hint: spec.hint,
      placements,
      overflow,
      dayStartMinutes: spec.dayStartMinutes,
      dayEndMinutes: spec.dayEndMinutes,
      bufferMinutes: spec.bufferMinutes,
      scheduledMinutes,
    };
  });
}

export const formatMinutesHHMM = (minutes: number) => {
  const clamped = clampMinutes(minutes);
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

