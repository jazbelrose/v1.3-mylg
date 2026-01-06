import type { BudgetSpellbookLineDraft } from "./budgetSpellbook";
import type { BudgetTaskLinkType } from "@/shared/utils/budgetTaskLinks";

export type PlanDraftOutputs = {
  budget: boolean;
  calendarPlan: boolean;
  links: boolean;
};

export type PlanDraftAssumptions = {
  eventDate: string | null; // YYYY-MM-DD
  loadInHours: number;
  strikeHours: number;
  crewCallTime: string; // HH:MM
  venueStartTime: string; // HH:MM
  venueEndTime: string; // HH:MM
};

export type PlanDraftAssumptionChip = {
  key: keyof PlanDraftAssumptions;
  label: string;
  value: string;
  confidence: number; // 0..1
};

export type PlanDraftBlockKey = "prepro" | "build" | "show" | "strike";

export type PlanDraftCalendarBlock = {
  key: PlanDraftBlockKey;
  title: string;
  dateIso: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  durationMinutes: number;
};

export type PlanDraftTaskItem = {
  id: string;
  title: string;
  dateIso: string; // YYYY-MM-DD
  blockKey: PlanDraftBlockKey;
  budgetLineDraftId: string;
  linkType: BudgetTaskLinkType;
};

export type PlanDraft = {
  assumptions: PlanDraftAssumptionChip[];
  warnings: Array<{ code: string; message: string }>;
  calendarBlocks: PlanDraftCalendarBlock[];
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
  const inferredInstallDays = typeof input.installDays === "number" && Number.isFinite(input.installDays) ? input.installDays : null;
  const loadInHours = inferredInstallDays ? clamp(Math.round(inferredInstallDays * 6), 2, 48) : 8;

  const assumptions: PlanDraftAssumptions = {
    eventDate,
    loadInHours,
    strikeHours: 6,
    crewCallTime: "08:00",
    venueStartTime: "09:00",
    venueEndTime: "22:00",
  };

  const confidence: Record<keyof PlanDraftAssumptions, number> = {
    eventDate: eventDate ? 0.75 : 0.3,
    loadInHours: inferredInstallDays ? 0.7 : 0.4,
    strikeHours: 0.45,
    crewCallTime: 0.45,
    venueStartTime: 0.35,
    venueEndTime: 0.35,
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
    return {
      assumptions: [
        {
          key: "eventDate",
          label: "Event date",
          value: "Missing",
          confidence: 0.3,
        },
        {
          key: "loadInHours",
          label: "Load-in",
          value: `${Math.round(params.assumptions.loadInHours)}h`,
          confidence: params.confidence?.loadInHours ?? 0.4,
        },
        {
          key: "strikeHours",
          label: "Strike",
          value: `${Math.round(params.assumptions.strikeHours)}h`,
          confidence: params.confidence?.strikeHours ?? 0.4,
        },
        {
          key: "crewCallTime",
          label: "Crew call",
          value: normalizeTime(params.assumptions.crewCallTime, "08:00"),
          confidence: params.confidence?.crewCallTime ?? 0.4,
        },
        {
          key: "venueStartTime",
          label: "Venue",
          value: `${normalizeTime(params.assumptions.venueStartTime, "09:00")}-${normalizeTime(
            params.assumptions.venueEndTime,
            "22:00",
          )}`,
          confidence: Math.min(params.confidence?.venueStartTime ?? 0.35, params.confidence?.venueEndTime ?? 0.35),
        },
      ],
      warnings: [{ code: "missing_event_date", message: "Add an event date to generate a calendar plan." }],
      calendarBlocks: [],
      tasks: [],
    };
  }

  const loadInHours = clamp(Number(params.assumptions.loadInHours) || 0, 0, 72);
  const strikeHours = clamp(Number(params.assumptions.strikeHours) || 0, 0, 72);
  const crewCallTime = normalizeTime(params.assumptions.crewCallTime, "08:00");
  const venueStartTime = normalizeTime(params.assumptions.venueStartTime, "09:00");
  const venueEndTime = normalizeTime(params.assumptions.venueEndTime, "22:00");

  const preproDate = isoAddDays(eventDate, -14);
  const procureDate = isoAddDays(eventDate, -10);
  const buildDate = isoAddDays(eventDate, -7);
  const packDate = isoAddDays(eventDate, -2);
  const showDate = eventDate;
  const strikeDate = isoAddDays(eventDate, 1);

  const blocks: PlanDraftCalendarBlock[] = [
    {
      key: "prepro",
      title: "Pre-Pro Sprint",
      dateIso: preproDate,
      startTime: "10:00",
      endTime: "16:00",
      durationMinutes: 6 * 60,
    },
    {
      key: "build",
      title: "Build/Print Sprint",
      dateIso: buildDate,
      startTime: "10:00",
      endTime: "17:00",
      durationMinutes: 7 * 60,
    },
    {
      key: "show",
      title: "Show Day",
      dateIso: showDate,
      startTime: crewCallTime,
      endTime: hhmmFromMinutes(minutesFromHHMM(crewCallTime) + Math.max(60, Math.round(loadInHours * 60))),
      durationMinutes: Math.max(60, Math.round(loadInHours * 60)),
    },
    {
      key: "strike",
      title: "Strike/Returns",
      dateIso: strikeDate,
      startTime: "09:00",
      endTime: hhmmFromMinutes(9 * 60 + Math.max(60, Math.round(strikeHours * 60))),
      durationMinutes: Math.max(60, Math.round(strikeHours * 60)),
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
      push({ title: `Quote: ${line.description}`, dateIso: preproDate, blockKey: "prepro", budgetLineDraftId: line.id, linkType: "quote" });
      push({ title: `Procure: ${line.description}`, dateIso: procureDate, blockKey: "prepro", budgetLineDraftId: line.id, linkType: "procure" });
      push({ title: `Install: ${line.description}`, dateIso: showDate, blockKey: "show", budgetLineDraftId: line.id, linkType: "install" });
      push({ title: `Strike: ${line.description}`, dateIso: strikeDate, blockKey: "strike", budgetLineDraftId: line.id, linkType: "strike" });
      push({ title: `Invoice: ${line.description}`, dateIso: strikeDate, blockKey: "strike", budgetLineDraftId: line.id, linkType: "invoice" });
      return;
    }

    if (lifecycle === "scenic") {
      push({ title: `Build: ${line.description}`, dateIso: buildDate, blockKey: "build", budgetLineDraftId: line.id, linkType: "build" });
      push({ title: `Install: ${line.description}`, dateIso: showDate, blockKey: "show", budgetLineDraftId: line.id, linkType: "install" });
      push({ title: `Strike: ${line.description}`, dateIso: strikeDate, blockKey: "strike", budgetLineDraftId: line.id, linkType: "strike" });
      push({ title: `Invoice: ${line.description}`, dateIso: strikeDate, blockKey: "strike", budgetLineDraftId: line.id, linkType: "invoice" });
      return;
    }

    if (lifecycle === "graphics") {
      push({ title: `Quote: ${line.description}`, dateIso: preproDate, blockKey: "prepro", budgetLineDraftId: line.id, linkType: "quote" });
      push({ title: `Build/Print: ${line.description}`, dateIso: buildDate, blockKey: "build", budgetLineDraftId: line.id, linkType: "build" });
      push({ title: `Pack + Confirmations: ${line.description}`, dateIso: packDate, blockKey: "build", budgetLineDraftId: line.id, linkType: "build" });
      push({ title: `Install: ${line.description}`, dateIso: showDate, blockKey: "show", budgetLineDraftId: line.id, linkType: "install" });
      push({ title: `Invoice: ${line.description}`, dateIso: strikeDate, blockKey: "strike", budgetLineDraftId: line.id, linkType: "invoice" });
      return;
    }
  });

  const chips: PlanDraftAssumptionChip[] = [
    {
      key: "eventDate",
      label: "Event date",
      value: eventDate,
      confidence: params.confidence?.eventDate ?? 0.75,
    },
    {
      key: "loadInHours",
      label: "Load-in",
      value: `${Math.round(loadInHours)}h`,
      confidence: params.confidence?.loadInHours ?? 0.5,
    },
    {
      key: "strikeHours",
      label: "Strike",
      value: `${Math.round(strikeHours)}h`,
      confidence: params.confidence?.strikeHours ?? 0.45,
    },
    {
      key: "crewCallTime",
      label: "Crew call",
      value: crewCallTime,
      confidence: params.confidence?.crewCallTime ?? 0.45,
    },
    {
      key: "venueStartTime",
      label: "Venue",
      value: `${venueStartTime}-${venueEndTime}`,
      confidence: Math.min(params.confidence?.venueStartTime ?? 0.35, params.confidence?.venueEndTime ?? 0.35),
    },
  ];

  if (minutesFromHHMM(venueEndTime) <= minutesFromHHMM(venueStartTime)) {
    warnings.push({ code: "venue_hours", message: "Venue end time should be after start time." });
  }

  return { assumptions: chips, warnings, calendarBlocks: blocks, tasks };
}
