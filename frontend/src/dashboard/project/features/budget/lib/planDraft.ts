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
  fingerprint: string;
  title: string;
  dateIso: string; // YYYY-MM-DD
  startLocalTime: string; // HH:MM
  endLocalTime: string; // HH:MM
  minTaskMinutes?: number;
  maxTaskMinutes?: number;
};

export type PlanDraftTaskItem = {
  id: string;
  fingerprint: string;
  stepKey: string;
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

const hashFNV1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

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

const classifyLifecycle = (
  category: BudgetSpellbookLineDraft["category"],
): "rentals-av" | "scenic" | "graphics" | "none" => {
  if (category === "RENTALS" || category === "AUDIO-VISUAL" || category === "LIGHTING") return "rentals-av";
  if (category === "FABRICATION" || category === "DECOR") return "scenic";
  if (category === "GRAPHICS") return "graphics";
  if (category === "CONTINGENCY-MISC") return "none";
  return "none";
};

const taskSpecsForLine = (
  line: BudgetSpellbookLineDraft,
  dates: { preproDate: string; buildDate: string; packDate: string; showDate: string; strikeDate: string },
): Array<{ stepKey: string; title: string; dateIso: string; focusBlockDraftId: PlanDraftBlockKey; linkType: BudgetTaskLinkType }> => {
  const template = line.meta?.coverageTemplate ?? "NONE";

  if (template === "RENTAL_AV") {
    return [
      { stepKey: "quote", title: `Quote: ${line.description}`, dateIso: dates.preproDate, focusBlockDraftId: "prepro", linkType: "quote" },
      { stepKey: "procure", title: `Procure: ${line.description}`, dateIso: dates.preproDate, focusBlockDraftId: "prepro", linkType: "procure" },
      { stepKey: "install", title: `Install: ${line.description}`, dateIso: dates.showDate, focusBlockDraftId: "show", linkType: "install" },
      { stepKey: "strike", title: `Strike: ${line.description}`, dateIso: dates.strikeDate, focusBlockDraftId: "strike", linkType: "strike" },
      { stepKey: "invoice", title: `Invoice: ${line.description}`, dateIso: dates.strikeDate, focusBlockDraftId: "strike", linkType: "invoice" },
    ];
  }

  if (template === "SCENIC") {
    return [
      { stepKey: "build", title: `Build: ${line.description}`, dateIso: dates.buildDate, focusBlockDraftId: "build", linkType: "build" },
      { stepKey: "install", title: `Install: ${line.description}`, dateIso: dates.showDate, focusBlockDraftId: "show", linkType: "install" },
      { stepKey: "strike", title: `Strike: ${line.description}`, dateIso: dates.strikeDate, focusBlockDraftId: "strike", linkType: "strike" },
      { stepKey: "invoice", title: `Invoice: ${line.description}`, dateIso: dates.strikeDate, focusBlockDraftId: "strike", linkType: "invoice" },
    ];
  }

  if (template === "PRINT") {
    return [
      { stepKey: "quote", title: `Quote: ${line.description}`, dateIso: dates.preproDate, focusBlockDraftId: "prepro", linkType: "quote" },
      { stepKey: "build", title: `Build/Print: ${line.description}`, dateIso: dates.buildDate, focusBlockDraftId: "build", linkType: "build" },
      { stepKey: "pack", title: `Pack + Confirmations: ${line.description}`, dateIso: dates.packDate, focusBlockDraftId: "pack", linkType: "build" },
      { stepKey: "install", title: `Install: ${line.description}`, dateIso: dates.showDate, focusBlockDraftId: "show", linkType: "install" },
      { stepKey: "invoice", title: `Invoice: ${line.description}`, dateIso: dates.strikeDate, focusBlockDraftId: "strike", linkType: "invoice" },
    ];
  }

  if (template === "PERMITS") {
    return [
      { stepKey: "procure", title: `Procure: ${line.description}`, dateIso: dates.preproDate, focusBlockDraftId: "prepro", linkType: "procure" },
      { stepKey: "invoice", title: `Invoice: ${line.description}`, dateIso: dates.strikeDate, focusBlockDraftId: "strike", linkType: "invoice" },
    ];
  }

  // Back-compat fallback.
  const lifecycle = classifyLifecycle(line.category);
  if (lifecycle === "rentals-av") return taskSpecsForLine({ ...line, meta: { ...(line.meta ?? {}), coverageTemplate: "RENTAL_AV" } }, dates);
  if (lifecycle === "scenic") return taskSpecsForLine({ ...line, meta: { ...(line.meta ?? {}), coverageTemplate: "SCENIC" } }, dates);
  if (lifecycle === "graphics") return taskSpecsForLine({ ...line, meta: { ...(line.meta ?? {}), coverageTemplate: "PRINT" } }, dates);
  return [];
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
      fingerprint: `fb_${hashFNV1a(`prepro|${preproDate}|${startLocalTime}|${endLocalTime}`)}`,
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
      fingerprint: `fb_${hashFNV1a(`build|${buildDate}|${startLocalTime}|${endLocalTime}`)}`,
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
      fingerprint: `fb_${hashFNV1a(`pack|${packDate}|${startLocalTime}|${endLocalTime}`)}`,
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
      fingerprint: `fb_${hashFNV1a(`show|${showDate}|${startLocalTime}|${endLocalTime}`)}`,
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
      fingerprint: `fb_${hashFNV1a(`strike|${strikeDate}|${startLocalTime}|${endLocalTime}`)}`,
      title: "Strike/Returns",
      dateIso: strikeDate,
      startLocalTime,
      endLocalTime,
      minTaskMinutes: params.assumptions.minTaskMinutes,
      maxTaskMinutes: params.assumptions.maxTaskMinutes,
    },
  ];

  const tasks: PlanDraftTaskItem[] = [];

  const push = (args: Omit<PlanDraftTaskItem, "id" | "fingerprint">) => {
    const id = `task_${hashFNV1a([args.budgetLineDraftId, args.stepKey, args.focusBlockDraftId].join("|"))}`;
    const fingerprint = `tfp_${hashFNV1a([args.budgetLineDraftId, args.stepKey, args.title.toLowerCase()].join("|"))}`;
    tasks.push({ ...args, id, fingerprint });
  };

  params.budgetLines.forEach((line) => {
    const specs = taskSpecsForLine(line, { preproDate, buildDate, packDate, showDate, strikeDate });
    specs.forEach((spec) => {
      push({
        stepKey: spec.stepKey,
        title: spec.title,
        dateIso: spec.dateIso,
        focusBlockDraftId: spec.focusBlockDraftId,
        order: 0,
        budgetLineDraftId: line.id,
        linkType: spec.linkType,
      });
    });
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
          return `${original.budgetLineDraftId}::${original.linkType}::${original.stepKey}`;
        },
      },
    );

    packed.warnings.forEach((w) => warnings.push(w));

    packed.tasks.forEach((pt) => {
      const parts = pt.draftId.split("__");
      const first = byOriginalId.get(parts[0]) ?? blockTasks[0];
      if (!first) return;

      packedTasks.push({
        id: `packed_${hashFNV1a([block.draftId, pt.draftId, pt.title.toLowerCase()].join("|"))}`,
        fingerprint: `pfp_${hashFNV1a([first.budgetLineDraftId, first.stepKey, pt.title.toLowerCase()].join("|"))}`,
        stepKey: first.stepKey,
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
