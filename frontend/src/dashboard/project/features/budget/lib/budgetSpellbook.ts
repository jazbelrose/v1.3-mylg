export type BudgetSpellbookCrewModel = "internal" | "outsourced" | "mixed";
export type BudgetSpellbookEventType = "corporate" | "brand activation" | "wedding" | "conference";

export type BudgetSpellbookApplyMode = "add" | "merge" | "replace";

export type BudgetSpellbookVariantId =
  | "lean"
  | "producer-standard"
  | "vendor-ready"
  | "client-facing"
  | "ops-ready"
  | "aggressive-margin";

export type BudgetSpellbookLineDraft = {
  id: string;
  category:
    | "LABOR"
    | "FABRICATION"
    | "GRAPHICS"
    | "RENTALS"
    | "AUDIO-VISUAL"
    | "TRAVEL"
    | "TRUCKING"
    | "PERMITS-INSURANCE"
    | "PARKING-FUEL-TOLLS"
    | "PRODUCTION-MGMT"
    | "CONTINGENCY-MISC"
    | "DECOR"
    | "DESIGN"
    | "LIGHTING";
  description: string;
  quantity: number;
  unit: string;
  itemBudgetedCost: number;
  itemMarkUp: number;
  areaGroup: "SHOP" | "VENUE" | "TRAVEL" | "PRE-PRO";
  invoiceGroup: "PRODUCTION" | "VENDORS" | "CLIENT REIMBURSABLE";
  packageLabel?: string;
  meta?: {
    source?: "inferred" | "shopping-list" | "defaults";
    confidence?: number;
  };
};

export type BudgetSpellbookParseResult = {
  input: string;
  inferred: {
    installDays: number | null;
    markupTarget: number | null;
    contingencyPct: number | null;
    crewCount: number | null;
    drapeFeet: number | null;
    uplightCount: number | null;
    hasScenic: boolean;
    hasGraphics: boolean;
    hasAv: boolean;
    hasTravel: boolean;
    hasTrucking: boolean;
  };
  shoppingList: string[];
};

export type BudgetSpellbookGeneratorOptions = {
  eventType: BudgetSpellbookEventType;
  venueCity: string;
  crewModel: BudgetSpellbookCrewModel;
  markupTarget: number;
  contingencyPct: number;
  includeTravelTrucking: boolean;
};

export type BudgetSpellbookVariant = {
  id: BudgetSpellbookVariantId;
  label: string;
  hint: string;
  lines: BudgetSpellbookLineDraft[];
};

export type BudgetSpellbookTotals = {
  budgeted: number;
  final: number;
  effectiveMarkup: number;
  byCategory: Record<string, number>;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const safeNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const normalizeText = (input: string) =>
  (input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();

const splitToFragments = (input: string): string[] =>
  normalizeText(input)
    .split(/\n+/g)
    .flatMap((line) => line.split(/\s*[•\u2022]|,/g))
    .map((part) => part.trim())
    .filter(Boolean);

const extractPercentNear = (input: string, keyword: RegExp): number | null => {
  const normalized = normalizeText(input);
  const match = normalized.match(new RegExp(`${keyword.source}[^\\d]{0,20}(\\d{1,2}(?:\\.\\d+)?)\\s*%`, "i"));
  if (!match) return null;
  const pct = Number(match[1]);
  if (!Number.isFinite(pct)) return null;
  return clamp(pct / 100, 0, 2);
};

const extractInstallDays = (input: string): number | null => {
  const normalized = normalizeText(input);
  const match =
    normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:days?|day)\s*(?:install|installation|setup|set up|load in|load-in)\b/i) ??
    normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:days?|day)\b/i);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  return clamp(Math.round(num * 10) / 10, 0.5, 30);
};

const extractCrewCount = (input: string): number | null => {
  const normalized = normalizeText(input);
  const match = normalized.match(/\b(\d{1,2})\s*(?:crew|hands|techs?|operators?|loaders?)\b/i);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  return clamp(Math.round(num), 1, 50);
};

const extractDrapeFeet = (input: string): number | null => {
  const normalized = normalizeText(input);
  const match =
    normalized.match(
      /\b(?:pipe\s*&\s*drape|pipe\s+and\s+drape|drape)\b[^\d]{0,20}(\d{2,5})\s*(?:'|ft|feet|lf)(?:\b|$|[\s,.;:])/i,
    );
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  return clamp(Math.round(num), 10, 5000);
};

const extractPercentEitherSide = (input: string, keyword: RegExp): number | null => {
  const direct = extractPercentNear(input, keyword);
  if (direct != null) return direct;
  const normalized = normalizeText(input);
  const reversed = normalized.match(new RegExp(`(\\d{1,2}(?:\\.\\d+)?)\\s*%[^\\n]{0,22}${keyword.source}`, "i"));
  if (!reversed) return null;
  const pct = Number(reversed[1]);
  if (!Number.isFinite(pct)) return null;
  return clamp(pct / 100, 0, 2);
};

const extractCountFor = (input: string, keyword: RegExp): number | null => {
  const normalized = normalizeText(input);
  const match = normalized.match(new RegExp(`\\b(\\d{1,3})\\s*${keyword.source}\\b`, "i"));
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  return clamp(Math.round(num), 1, 500);
};

export function parseBudgetSpellbookInput(input: string): BudgetSpellbookParseResult {
  const normalized = normalizeText(input);
  const fragments = splitToFragments(normalized);

  const shoppingList = fragments
    .filter((line) => line.length >= 3)
    .slice(0, 80);

  const hasScenic = /\b(scenic|set wall|wall|fabrication|fab|build)\b/i.test(normalized);
  const hasGraphics = /\b(graphics?|signage|signs?|vinyl|print|directional)\b/i.test(normalized);
  const hasAv = /\b(av|audio|visual|projector|screen|speakers?|mics?)\b/i.test(normalized);
  const hasTravel = /\b(travel|hotel|flight|airfare|per diem|lodging)\b/i.test(normalized);
  const hasTrucking = /\b(truck|trucking|sprinter|box truck|freight|delivery|load-out)\b/i.test(normalized);

  return {
    input: normalized,
    inferred: {
      installDays: extractInstallDays(normalized),
      markupTarget: extractPercentEitherSide(normalized, /\b(markup|margin)\b/) ?? null,
      contingencyPct: extractPercentEitherSide(normalized, /\bcontingency\b/) ?? null,
      crewCount: extractCrewCount(normalized),
      drapeFeet: extractDrapeFeet(normalized),
      uplightCount: extractCountFor(normalized, /\b(?:uplights?|uplight)\b/) ?? null,
      hasScenic,
      hasGraphics,
      hasAv,
      hasTravel,
      hasTrucking,
    },
    shoppingList,
  };
}

const allocateContingencyLine = (
  baseLines: BudgetSpellbookLineDraft[],
  contingencyPct: number,
): BudgetSpellbookLineDraft[] => {
  const pct = clamp(contingencyPct, 0, 1);
  if (pct <= 0) return baseLines;
  const subtotal = baseLines.reduce((sum, line) => sum + line.quantity * line.itemBudgetedCost, 0);
  const contingencyCost = Math.round(subtotal * pct);
  if (contingencyCost <= 0) return baseLines;
  return [
    ...baseLines,
    {
      id: "contingency",
      category: "CONTINGENCY-MISC",
      description: "CONTINGENCY",
      quantity: 1,
      unit: "Lot",
      itemBudgetedCost: contingencyCost,
      itemMarkUp: 0,
      areaGroup: "PRE-PRO",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Contingency",
      meta: { source: "defaults", confidence: 0.9 },
    },
  ];
};

const toInvoiceGroups = (line: BudgetSpellbookLineDraft, crewModel: BudgetSpellbookCrewModel): BudgetSpellbookLineDraft => {
  if (line.category === "TRAVEL" || line.category === "PARKING-FUEL-TOLLS") {
    return { ...line, invoiceGroup: "CLIENT REIMBURSABLE" };
  }
  if (line.category === "TRUCKING" || line.category === "RENTALS" || line.category === "LIGHTING") {
    return { ...line, invoiceGroup: "VENDORS" };
  }
  if (line.category === "GRAPHICS" || line.category === "DESIGN") {
    return { ...line, invoiceGroup: crewModel === "internal" ? "PRODUCTION" : "VENDORS" };
  }
  if (line.category === "LABOR" || line.category === "PRODUCTION-MGMT" || line.category === "FABRICATION") {
    if (crewModel === "outsourced") return { ...line, invoiceGroup: "VENDORS" };
    return { ...line, invoiceGroup: "PRODUCTION" };
  }
  return line;
};

const summarizeLines = (
  lines: BudgetSpellbookLineDraft[],
  summary: Array<{
    id: string;
    category: BudgetSpellbookLineDraft["category"];
    description: string;
    invoiceGroup: BudgetSpellbookLineDraft["invoiceGroup"];
    areaGroup: BudgetSpellbookLineDraft["areaGroup"];
  }>,
  markupTarget: number,
): BudgetSpellbookLineDraft[] => {
  const totalsByGroup = new Map<string, number>();
  lines.forEach((line) => {
    const key = `${line.invoiceGroup}::${line.areaGroup}`;
    totalsByGroup.set(key, (totalsByGroup.get(key) ?? 0) + line.quantity * line.itemBudgetedCost);
  });

  return summary
    .map((row) => {
      const key = `${row.invoiceGroup}::${row.areaGroup}`;
      const total = totalsByGroup.get(key) ?? 0;
      return {
        id: row.id,
        category: row.category,
        description: row.description,
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: Math.round(total),
        itemMarkUp: clamp(markupTarget, 0, 2),
        areaGroup: row.areaGroup,
        invoiceGroup: row.invoiceGroup,
        packageLabel: "Summary",
        meta: { source: "defaults", confidence: 0.7 },
      } satisfies BudgetSpellbookLineDraft;
    })
    .filter((line) => line.itemBudgetedCost > 0);
};

const baseDefaults = (parsed: BudgetSpellbookParseResult, options: BudgetSpellbookGeneratorOptions) => {
  const inferred = parsed.inferred;
  const installDays = inferred.installDays ?? 1;
  const crewCount = inferred.crewCount ?? (/\bcrew\b/i.test(parsed.input) ? 6 : 4);
  const drapeFeet = inferred.drapeFeet ?? (/\bdrape\b/i.test(parsed.input) ? 200 : 0);
  const uplightCount = inferred.uplightCount ?? (/\buplight\b/i.test(parsed.input) ? 12 : 0);

  const internalCrewDayRate = 520;
  const outsourcedCrewDayRate = 650;
  const leadDayRate = 780;
  const pmDayRate = 850;

  const crewDayRate = options.crewModel === "outsourced" ? outsourcedCrewDayRate : internalCrewDayRate;

  return {
    installDays,
    crewCount,
    drapeFeet,
    uplightCount,
    crewDayRate,
    leadDayRate,
    pmDayRate,
  };
};

const withId = (() => {
  let idx = 0;
  return () => `sb-${(idx++).toString(36)}`;
})();

const makeLine = (partial: Omit<BudgetSpellbookLineDraft, "id">): BudgetSpellbookLineDraft => ({
  id: withId(),
  ...partial,
});

const buildProducerStandard = (parsed: BudgetSpellbookParseResult, options: BudgetSpellbookGeneratorOptions) => {
  const inferred = parsed.inferred;
  const { installDays, crewCount, drapeFeet, uplightCount, crewDayRate, leadDayRate, pmDayRate } = baseDefaults(
    parsed,
    options,
  );

  const lines: BudgetSpellbookLineDraft[] = [];
  const markup = clamp(options.markupTarget, 0, 2);

  lines.push(
    makeLine({
      category: "PRODUCTION-MGMT",
      description: "PRODUCTION – PRE-PRO + COORDINATION",
      quantity: 1,
      unit: "Lot",
      itemBudgetedCost: 1200,
      itemMarkUp: markup,
      areaGroup: "PRE-PRO",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Production",
      meta: { source: "defaults", confidence: 0.7 },
    }),
  );

  if (options.eventType !== "wedding") {
    lines.push(
      makeLine({
        category: "PRODUCTION-MGMT",
        description: "PRODUCER / PM – SHOW DAYS",
        quantity: installDays,
        unit: "Days",
        itemBudgetedCost: pmDayRate,
        itemMarkUp: markup,
        areaGroup: "VENUE",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Production",
        meta: { source: "defaults", confidence: 0.65 },
      }),
    );
  }

  lines.push(
    makeLine({
      category: "LABOR",
      description: "LEAD TECH – INSTALL (DAY-RATE)",
      quantity: installDays,
      unit: "Days",
      itemBudgetedCost: leadDayRate,
      itemMarkUp: markup,
      areaGroup: "VENUE",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Crew",
      meta: { source: "defaults", confidence: 0.7 },
    }),
    makeLine({
      category: "LABOR",
      description: "CREW – INSTALL (DAY-RATE)",
      quantity: crewCount * installDays,
      unit: "Days",
      itemBudgetedCost: crewDayRate,
      itemMarkUp: markup,
      areaGroup: "VENUE",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Crew",
      meta: { source: inferred.crewCount ? "shopping-list" : "defaults", confidence: inferred.crewCount ? 0.8 : 0.6 },
    }),
  );

  if (inferred.hasScenic) {
    lines.push(
      makeLine({
        category: "FABRICATION",
        description: "SCENIC FABRICATION – BUILD",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 6500,
        itemMarkUp: markup,
        areaGroup: "SHOP",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Scenic",
        meta: { source: "inferred", confidence: 0.75 },
      }),
      makeLine({
        category: "FABRICATION",
        description: "SCENIC ASSEMBLY – PREP + PACK",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 950,
        itemMarkUp: markup,
        areaGroup: "SHOP",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Scenic",
        meta: { source: "defaults", confidence: 0.6 },
      }),
    );
  }

  if (drapeFeet > 0) {
    lines.push(
      makeLine({
        category: "RENTALS",
        description: `PIPE & DRAPE RENTAL – ${drapeFeet} LF`,
        quantity: drapeFeet,
        unit: "LF",
        itemBudgetedCost: 9,
        itemMarkUp: clamp(markup, 0, 0.75),
        areaGroup: "VENUE",
        invoiceGroup: "VENDORS",
        packageLabel: "Pipe & Drape",
        meta: { source: inferred.drapeFeet ? "shopping-list" : "inferred", confidence: inferred.drapeFeet ? 0.85 : 0.6 },
      }),
      makeLine({
        category: "LABOR",
        description: "PIPE & DRAPE – INSTALL + STRIKE",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 780,
        itemMarkUp: markup,
        areaGroup: "VENUE",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Pipe & Drape",
        meta: { source: "defaults", confidence: 0.55 },
      }),
    );
  }

  if (uplightCount > 0) {
    lines.push(
      makeLine({
        category: "LIGHTING",
        description: "UPLIGHTS – RENTAL",
        quantity: uplightCount,
        unit: "Each",
        itemBudgetedCost: 45,
        itemMarkUp: clamp(markup, 0, 0.75),
        areaGroup: "VENUE",
        invoiceGroup: "VENDORS",
        packageLabel: "Lighting",
        meta: { source: inferred.uplightCount ? "shopping-list" : "inferred", confidence: inferred.uplightCount ? 0.8 : 0.55 },
      }),
    );
  }

  if (inferred.hasGraphics) {
    lines.push(
      makeLine({
        category: "DESIGN",
        description: "GRAPHICS – DESIGN + PROOFS",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 950,
        itemMarkUp: markup,
        areaGroup: "PRE-PRO",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Graphics",
        meta: { source: "inferred", confidence: 0.75 },
      }),
      makeLine({
        category: "GRAPHICS",
        description: "GRAPHICS – PRINT PRODUCTION",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 1800,
        itemMarkUp: clamp(markup, 0, 0.6),
        areaGroup: "SHOP",
        invoiceGroup: "VENDORS",
        packageLabel: "Graphics",
        meta: { source: "defaults", confidence: 0.6 },
      }),
      makeLine({
        category: "LABOR",
        description: "GRAPHICS – INSTALL + STRIKE",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 520,
        itemMarkUp: markup,
        areaGroup: "VENUE",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Graphics",
        meta: { source: "defaults", confidence: 0.55 },
      }),
    );
  }

  if (inferred.hasAv) {
    lines.push(
      makeLine({
        category: "AUDIO-VISUAL",
        description: "AV PACKAGE – BASICS",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 2400,
        itemMarkUp: clamp(markup, 0, 0.65),
        areaGroup: "VENUE",
        invoiceGroup: "VENDORS",
        packageLabel: "AV",
        meta: { source: "inferred", confidence: 0.7 },
      }),
    );
  }

  const includeTravel =
    options.includeTravelTrucking && (options.venueCity.trim().length > 0 || inferred.hasTravel || inferred.hasTrucking);
  if (includeTravel) {
    lines.push(
      makeLine({
        category: "TRUCKING",
        description: "TRUCKING – LOCAL DELIVERY + RETURN",
        quantity: 1,
        unit: "Days",
        itemBudgetedCost: 650,
        itemMarkUp: clamp(markup, 0, 0.65),
        areaGroup: "TRAVEL",
        invoiceGroup: "VENDORS",
        packageLabel: "Travel / Trucking",
        meta: { source: "inferred", confidence: 0.6 },
      }),
      makeLine({
        category: "TRAVEL",
        description: `TRAVEL – HOTEL + PER DIEM${options.venueCity.trim() ? ` (${options.venueCity.trim()})` : ""}`,
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 950,
        itemMarkUp: 0,
        areaGroup: "TRAVEL",
        invoiceGroup: "CLIENT REIMBURSABLE",
        packageLabel: "Travel / Trucking",
        meta: { source: inferred.hasTravel ? "inferred" : "defaults", confidence: inferred.hasTravel ? 0.65 : 0.5 },
      }),
      makeLine({
        category: "PARKING-FUEL-TOLLS",
        description: "PARKING / FUEL / TOLLS",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 220,
        itemMarkUp: 0,
        areaGroup: "TRAVEL",
        invoiceGroup: "CLIENT REIMBURSABLE",
        packageLabel: "Travel / Trucking",
        meta: { source: "defaults", confidence: 0.5 },
      }),
    );
  }

  lines.push(
    makeLine({
      category: "PERMITS-INSURANCE",
      description: "INSURANCE / CERTIFICATES / PERMITS",
      quantity: 1,
      unit: "Lot",
      itemBudgetedCost: 325,
      itemMarkUp: 0,
      areaGroup: "PRE-PRO",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Fees",
      meta: { source: "defaults", confidence: 0.55 },
    }),
  );

  return allocateContingencyLine(lines, options.contingencyPct);
};

const applyAggressiveMarkup = (lines: BudgetSpellbookLineDraft[], target: number): BudgetSpellbookLineDraft[] => {
  const base = clamp(target, 0, 2);
  return lines.map((line) => {
    if (line.category === "RENTALS" || line.category === "LIGHTING" || line.category === "AUDIO-VISUAL") {
      return { ...line, itemMarkUp: clamp(base - 0.08, 0, 0.75) };
    }
    if (line.category === "TRAVEL" || line.category === "PARKING-FUEL-TOLLS") {
      return { ...line, itemMarkUp: 0 };
    }
    if (line.category === "TRUCKING") {
      return { ...line, itemMarkUp: clamp(base - 0.04, 0, 0.75) };
    }
    if (line.category === "LABOR" || line.category === "FABRICATION" || line.category === "DESIGN") {
      return { ...line, itemMarkUp: clamp(base + 0.12, 0, 1.25) };
    }
    return { ...line, itemMarkUp: clamp(base + 0.04, 0, 1.25) };
  });
};

const expandOpsLines = (lines: BudgetSpellbookLineDraft[], installDays: number, crewCount: number, markup: number) => {
  const ops: BudgetSpellbookLineDraft[] = [
    makeLine({
      category: "LABOR",
      description: "SHOP PREP – CREW",
      quantity: crewCount * Math.max(1, Math.round(installDays / 2)),
      unit: "Days",
      itemBudgetedCost: 420,
      itemMarkUp: markup,
      areaGroup: "SHOP",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Ops",
      meta: { source: "defaults", confidence: 0.55 },
    }),
    makeLine({
      category: "LABOR",
      description: "STRIKE / LOAD-OUT – CREW",
      quantity: crewCount,
      unit: "Days",
      itemBudgetedCost: 520,
      itemMarkUp: markup,
      areaGroup: "VENUE",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Ops",
      meta: { source: "defaults", confidence: 0.55 },
    }),
    makeLine({
      category: "LABOR",
      description: "OVERTIME BUFFER",
      quantity: 1,
      unit: "Lot",
      itemBudgetedCost: 650,
      itemMarkUp: markup,
      areaGroup: "VENUE",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Ops",
      meta: { source: "defaults", confidence: 0.5 },
    }),
  ];

  return [...lines, ...ops];
};

export function buildBudgetSpellbookVariants(
  parsed: BudgetSpellbookParseResult,
  options: BudgetSpellbookGeneratorOptions,
): BudgetSpellbookVariant[] {
  const producerStandard = buildProducerStandard(parsed, options).map((line) => toInvoiceGroups(line, options.crewModel));

  const inferredDays = parsed.inferred.installDays ?? 1;
  const inferredCrew = parsed.inferred.crewCount ?? 4;

  const lean = summarizeLines(
    producerStandard,
    [
      {
        id: "summary-prod",
        category: "PRODUCTION-MGMT",
        description: "PRODUCTION – SUMMARY",
        invoiceGroup: "PRODUCTION",
        areaGroup: "PRE-PRO",
      },
      { id: "summary-vendors", category: "RENTALS", description: "VENDORS – SUMMARY", invoiceGroup: "VENDORS", areaGroup: "VENUE" },
      { id: "summary-travel", category: "TRAVEL", description: "CLIENT REIMBURSABLE – SUMMARY", invoiceGroup: "CLIENT REIMBURSABLE", areaGroup: "TRAVEL" },
    ],
    options.markupTarget,
  );

  const vendorReady = producerStandard.map((line) => toInvoiceGroups(line, options.crewModel));

  const clientFacing = (() => {
    const base = summarizeLines(
      vendorReady,
      [
        { id: "client-prod", category: "PRODUCTION-MGMT", description: "PRODUCTION", invoiceGroup: "PRODUCTION", areaGroup: "PRE-PRO" },
        { id: "client-vendors", category: "RENTALS", description: "VENDORS", invoiceGroup: "VENDORS", areaGroup: "VENUE" },
        { id: "client-travel", category: "TRAVEL", description: "CLIENT REIMBURSABLE", invoiceGroup: "CLIENT REIMBURSABLE", areaGroup: "TRAVEL" },
      ],
      options.markupTarget,
    );
    const contingency = vendorReady.find((l) => l.category === "CONTINGENCY-MISC");
    return contingency ? [...base, contingency] : base;
  })();

  const opsReady = (() => {
    const markup = clamp(options.markupTarget, 0, 2);
    const expanded = expandOpsLines(vendorReady, inferredDays, inferredCrew, markup);
    return expanded;
  })();

  const aggressive = applyAggressiveMarkup(vendorReady, options.markupTarget);

  return [
    {
      id: "lean",
      label: "Lean",
      hint: "High-level lots, calm rows",
      lines: allocateContingencyLine(lean.filter((l) => l.category !== "CONTINGENCY-MISC"), options.contingencyPct),
    },
    {
      id: "producer-standard",
      label: "Producer Standard",
      hint: "Detailed but clean",
      lines: vendorReady,
    },
    {
      id: "vendor-ready",
      label: "Vendor-ready",
      hint: "Invoice groups split for billing",
      lines: vendorReady,
    },
    {
      id: "client-facing",
      label: "Client-facing",
      hint: "Minimal, polished rows",
      lines: clientFacing,
    },
    {
      id: "ops-ready",
      label: "Ops-ready",
      hint: "Adds prep/strike/OT buffers",
      lines: allocateContingencyLine(opsReady.filter((l) => l.category !== "CONTINGENCY-MISC"), options.contingencyPct),
    },
    {
      id: "aggressive-margin",
      label: "Aggressive margin",
      hint: "Rebalances markup across categories",
      lines: allocateContingencyLine(aggressive.filter((l) => l.category !== "CONTINGENCY-MISC"), options.contingencyPct),
    },
  ];
}

export function computeBudgetSpellbookTotals(lines: BudgetSpellbookLineDraft[]): BudgetSpellbookTotals {
  let budgeted = 0;
  let final = 0;
  const byCategory: Record<string, number> = {};

  lines.forEach((line) => {
    const qty = safeNumber(line.quantity) ?? 0;
    const cost = safeNumber(line.itemBudgetedCost) ?? 0;
    const markup = safeNumber(line.itemMarkUp) ?? 0;
    const lineBudgeted = qty * cost;
    const lineFinal = lineBudgeted * (1 + markup);
    budgeted += lineBudgeted;
    final += lineFinal;
    byCategory[line.category] = (byCategory[line.category] ?? 0) + lineFinal;
  });

  const effectiveMarkup = budgeted > 0 ? (final - budgeted) / budgeted : 0;
  return { budgeted, final, effectiveMarkup, byCategory };
}
