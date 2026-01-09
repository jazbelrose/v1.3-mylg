import type { BudgetSpellbookLineDraft } from "./budgetSpellbook";
import type { BudgetTaskLinkType } from "@/shared/utils/budgetTaskLinks";
import {
  blockMinutesFromWindow,
  getFocusBlockWindow,
  type FocusBlockWindowId,
} from "@/shared/utils/focusBlockWindows";
import { packTasksIntoFocusBlock } from "@/shared/utils/packTasksIntoFocusBlock";

export type PlanDraftOutputs = {
  budget: boolean;
  calendarPlan: boolean;
  links: boolean;
};

export type PlanDraftAssumptions = {
  eventDate: string | null; // YYYY-MM-DD
  focusBlockWindowId: FocusBlockWindowId;
  minTaskMinutes: number;
  maxTaskMinutes: number;
};

export type PlanDraftAssumptionChip = {
  key: keyof PlanDraftAssumptions;
  label: string;
  value: string;
  confidence: number; // 0..1
};

export type PlanDraftBlockKey = "prepro" | "build" | "pack" | "show" | "strike";

export type PlanDraftFocusBlock = {
  key: PlanDraftBlockKey;
  draftId: string;
  title: string;
  dateIso: string; // YYYY-MM-DD
  startLocalTime: string; // HH:MM
  endLocalTime: string; // HH:MM
  minTaskMinutes?: number;
  maxTaskMinutes?: number;
};

export type PlanDraftTaskItem = {
  id: string;
  title: string;
  dateIso: string; // YYYY-MM-DD
  focusBlockDraftId: string;
  order: number;
  plannedMinutes?: number;
  budgetLineDraftId: string;
  linkType: BudgetTaskLinkType;
};

export type PlanDraft = {
  assumptions: PlanDraftAssumptionChip[];
  warnings: Array<{ code: string; message: string }>;
  focusBlocks: PlanDraftFocusBlock[];
  tasks: PlanDraftTaskItem[];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isoAddDays = (iso: string, deltaDays: number): string => {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  const yyyy = String(base.getUTCFullYear());
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const safeIsoDate = (value: string | null | undefined): string | null => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return trimmed;
};

const normalizeTime = (value: string, fallback: string): string => {
  const v = (value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(v)) return fallback;
  return v;
};

const minutesFromHHMM = (hhmm: string): number => {
  const [hh, mm] = hhmm.split(":").map((n) => Number(n));
  return clamp(hh * 60 + mm, 0, 24 * 60);
};

const hhmmFromMinutes = (minutes: number): string => {
  const m = clamp(Math.round(minutes), 0, 24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const classifyLifecycle = (
  category: BudgetSpellbookLineDraft["category"],
): "rentals-av" | "scenic" | "graphics" | "none" => {
  if (category === "RENTALS" || category === "AUDIO-VISUAL" || category === "LIGHTING") return "rentals-av";
  if (category === "FABRICATION" || category === "DECOR") return "scenic";
  if (category === "GRAPHICS") return "graphics";
  if (category === "CONTINGENCY-MISC") return "none";
  return "none";
};

export function defaultPlanDraftAssumptions(input: {
  eventDate?: string | null;
  installDays?: number | null;
}): { assumptions: PlanDraftAssumptions; confidence: Record<keyof PlanDraftAssumptions, number> } {
  const eventDate = safeIsoDate(input.eventDate) ?? null;

  const assumptions: PlanDraftAssumptions = {
    eventDate,
    focusBlockWindowId: "balanced",
    minTaskMinutes: 20,
    maxTaskMinutes: 120,
  };

  const confidence: Record<keyof PlanDraftAssumptions, number> = {
    eventDate: eventDate ? 0.75 : 0.3,
    focusBlockWindowId: 0.55,
    minTaskMinutes: 0.45,
    maxTaskMinutes: 0.45,
  };

  return { assumptions, confidence };
}

export function buildPlanDraft(params: {
  budgetLines: BudgetSpellbookLineDraft[];
  assumptions: PlanDraftAssumptions;
  confidence?: Partial<Record<keyof PlanDraftAssumptions, number>>;
}): PlanDraft {
  const warnings: Array<{ code: string; message: string }> = [];

  const eventDate = safeIsoDate(params.assumptions.eventDate);
  if (!eventDate) {
    const window = getFocusBlockWindow(params.assumptions.focusBlockWindowId);
    return {
      assumptions: [
        {
          key: "eventDate",
          label: "Event date",
          value: "Missing",
          confidence: 0.3,
        },
        {
          key: "focusBlockWindowId",
          label: "Focus Block",
          value: `${window.startLocalTime}-${window.endLocalTime}`,
          confidence: params.confidence?.focusBlockWindowId ?? 0.4,
        },
        {
          key: "minTaskMinutes",
          label: "Min task",
          value: `${Math.max(0, Math.round(params.assumptions.minTaskMinutes || 0))}m`,
          confidence: params.confidence?.minTaskMinutes ?? 0.4,
        },
        {
          key: "maxTaskMinutes",
          label: "Max task",
          value: `${Math.max(0, Math.round(params.assumptions.maxTaskMinutes || 0))}m`,
          confidence: params.confidence?.maxTaskMinutes ?? 0.4,
        },
      ],
      warnings: [{ code: "missing_event_date", message: "Add an event date to generate a calendar plan." }],
      focusBlocks: [],
      tasks: [],
    };
  }

  const window = getFocusBlockWindow(params.assumptions.focusBlockWindowId);
  const startLocalTime = normalizeTime(window.startLocalTime, "09:00");
  const endLocalTime = normalizeTime(window.endLocalTime, "17:00");
  const blockMinutes = blockMinutesFromWindow(startLocalTime, endLocalTime);
  if (blockMinutes <= 0) {
    warnings.push({ code: "invalid_window", message: "Focus Block window end time should be after start time." });
  }

  const preproDate = isoAddDays(eventDate, -14);
  const buildDate = isoAddDays(eventDate, -7);
  const packDate = isoAddDays(eventDate, -2);
  const showDate = eventDate;
  const strikeDate = isoAddDays(eventDate, 1);

  const blocks: PlanDraftFocusBlock[] = [
    {
      key: "prepro",
      draftId: "prepro",
      title: "Pre-Pro Sprint",
      dateIso: preproDate,
      startLocalTime,
      endLocalTime,
      minTaskMinutes: params.assumptions.minTaskMinutes,
      maxTaskMinutes: params.assumptions.maxTaskMinutes,
    },
    {
      key: "build",
      draftId: "build",
      title: "Build/Print Sprint",
      dateIso: buildDate,
      startLocalTime,
      endLocalTime,
      minTaskMinutes: params.assumptions.minTaskMinutes,
      maxTaskMinutes: params.assumptions.maxTaskMinutes,
    },
    {
      key: "pack",
      draftId: "pack",
      title: "Packing Sprint",
      dateIso: packDate,
      startLocalTime,
      endLocalTime,
      minTaskMinutes: params.assumptions.minTaskMinutes,
      maxTaskMinutes: params.assumptions.maxTaskMinutes,
    },
    {
      key: "show",
      draftId: "show",
      title: "Show Day",
      dateIso: showDate,
      startLocalTime,
      endLocalTime,
      minTaskMinutes: params.assumptions.minTaskMinutes,
      maxTaskMinutes: params.assumptions.maxTaskMinutes,
    },
    {
      key: "strike",
      draftId: "strike",
      title: "Strike/Returns",
      dateIso: strikeDate,
      startLocalTime,
      endLocalTime,
      minTaskMinutes: params.assumptions.minTaskMinutes,
      maxTaskMinutes: params.assumptions.maxTaskMinutes,
    },
  ];

  const tasks: PlanDraftTaskItem[] = [];
  let seq = 0;

  const push = (args: Omit<PlanDraftTaskItem, "id">) => {
    tasks.push({ ...args, id: `draft-task-${seq++}` });
  };

  params.budgetLines.forEach((line) => {
    const lifecycle = classifyLifecycle(line.category);
    if (lifecycle === "none") return;

    if (lifecycle === "rentals-av") {
      push({ title: `Quote: ${line.description}`, dateIso: preproDate, focusBlockDraftId: "prepro", order: 0, budgetLineDraftId: line.id, linkType: "quote" });
      push({ title: `Procure: ${line.description}`, dateIso: preproDate, focusBlockDraftId: "prepro", order: 0, budgetLineDraftId: line.id, linkType: "procure" });
      push({ title: `Install: ${line.description}`, dateIso: showDate, focusBlockDraftId: "show", order: 0, budgetLineDraftId: line.id, linkType: "install" });
      push({ title: `Strike: ${line.description}`, dateIso: strikeDate, focusBlockDraftId: "strike", order: 0, budgetLineDraftId: line.id, linkType: "strike" });
      push({ title: `Invoice: ${line.description}`, dateIso: strikeDate, focusBlockDraftId: "strike", order: 0, budgetLineDraftId: line.id, linkType: "invoice" });
      return;
    }

    if (lifecycle === "scenic") {
      push({ title: `Build: ${line.description}`, dateIso: buildDate, focusBlockDraftId: "build", order: 0, budgetLineDraftId: line.id, linkType: "build" });
      push({ title: `Install: ${line.description}`, dateIso: showDate, focusBlockDraftId: "show", order: 0, budgetLineDraftId: line.id, linkType: "install" });
      push({ title: `Strike: ${line.description}`, dateIso: strikeDate, focusBlockDraftId: "strike", order: 0, budgetLineDraftId: line.id, linkType: "strike" });
      push({ title: `Invoice: ${line.description}`, dateIso: strikeDate, focusBlockDraftId: "strike", order: 0, budgetLineDraftId: line.id, linkType: "invoice" });
      return;
    }

    if (lifecycle === "graphics") {
      push({ title: `Quote: ${line.description}`, dateIso: preproDate, focusBlockDraftId: "prepro", order: 0, budgetLineDraftId: line.id, linkType: "quote" });
      push({ title: `Build/Print: ${line.description}`, dateIso: buildDate, focusBlockDraftId: "build", order: 0, budgetLineDraftId: line.id, linkType: "build" });
      push({ title: `Pack + Confirmations: ${line.description}`, dateIso: packDate, focusBlockDraftId: "pack", order: 0, budgetLineDraftId: line.id, linkType: "build" });
      push({ title: `Install: ${line.description}`, dateIso: showDate, focusBlockDraftId: "show", order: 0, budgetLineDraftId: line.id, linkType: "install" });
      push({ title: `Invoice: ${line.description}`, dateIso: strikeDate, focusBlockDraftId: "strike", order: 0, budgetLineDraftId: line.id, linkType: "invoice" });
      return;
    }
  });

  // Pack tasks into their focus block containers (no absolute task start/end).
  const tasksByBlock = new Map<string, PlanDraftTaskItem[]>();
  tasks.forEach((t) => {
    const list = tasksByBlock.get(t.focusBlockDraftId) ?? [];
    list.push(t);
    tasksByBlock.set(t.focusBlockDraftId, list);
  });

  const packedTasks: PlanDraftTaskItem[] = [];
  for (const block of blocks) {
    const blockTasks = tasksByBlock.get(block.draftId) ?? [];
    if (blockTasks.length === 0) continue;

    const byOriginalId = new Map(blockTasks.map((t) => [t.id, t] as const));

    const packed = packTasksIntoFocusBlock(
      blockMinutes,
      blockTasks.map((t) => ({ draftId: t.id, title: t.title })),
      {
        minTaskMinutes: block.minTaskMinutes,
        maxTaskMinutes: block.maxTaskMinutes,
        mergeKey: (task) => {
          const original = byOriginalId.get(task.draftId);
          if (!original) return null;
          return `${original.budgetLineDraftId}::${original.linkType}`;
        },
      },
    );

    packed.warnings.forEach((w) => warnings.push(w));

    packed.tasks.forEach((pt) => {
      const parts = pt.draftId.split("__");
      const first = byOriginalId.get(parts[0]) ?? blockTasks[0];
      if (!first) return;

      packedTasks.push({
        id: `packed-${block.draftId}-${pt.order}-${pt.draftId}`,
        title: pt.title,
        dateIso: block.dateIso,
        focusBlockDraftId: block.draftId,
        order: pt.order,
        plannedMinutes: pt.plannedMinutes,
        budgetLineDraftId: first.budgetLineDraftId,
        linkType: first.linkType,
      });
    });
  }

  const chips: PlanDraftAssumptionChip[] = [
    {
      key: "eventDate",
      label: "Event date",
      value: eventDate,
      confidence: params.confidence?.eventDate ?? 0.75,
    },
    {
      key: "focusBlockWindowId",
      label: "Focus Block",
      value: `${startLocalTime}-${endLocalTime}`,
      confidence: params.confidence?.focusBlockWindowId ?? 0.55,
    },
    {
      key: "minTaskMinutes",
      label: "Min task",
      value: `${Math.max(0, Math.round(params.assumptions.minTaskMinutes || 0))}m`,
      confidence: params.confidence?.minTaskMinutes ?? 0.45,
    },
    {
      key: "maxTaskMinutes",
      label: "Max task",
      value: `${Math.max(0, Math.round(params.assumptions.maxTaskMinutes || 0))}m`,
      confidence: params.confidence?.maxTaskMinutes ?? 0.45,
    },
  ];

  const nextTasks = packedTasks.length > 0 ? packedTasks : tasks;
  return { assumptions: chips, warnings, focusBlocks: blocks, tasks: nextTasks };
}
