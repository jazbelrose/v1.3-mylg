import type { BudgetTaskLinkType } from "@/shared/utils/budgetTaskLinks";

export const BUDGET_SPELLBOOK_ENGINE_VERSION = "budget-spellbook@1.5.0";
export const BUDGET_SPELLBOOK_SCHEMA_VERSION = 1 as const;
export const BUDGET_SPELLBOOK_DEFAULTS_VERSION = "budget-spellbook-defaults@2026-01-20";

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

export type BudgetSpellbookEstimateRangeBasis = "explicit" | "ratecard" | "default" | "heuristic";

export type BudgetSpellbookVolatilityClass = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type BudgetSpellbookEstimateReasonCode =
  | "LOW_CONFIDENCE"
  | "MISSING_CITY"
  | "MISSING_INSTALL_DAYS"
  | "MISSING_CREW_COUNT"
  | "MISSING_DRAPE_FEET"
  | "MISSING_UPLIGHT_COUNT"
  | "TRAVEL_VOLATILE"
  | "FAB_VOLATILE"
  | "SUMMARY_ROLLUP";

export type BudgetSpellbookEstimateRange = {
  low: number;
  likely: number;
  high: number;
  basis: BudgetSpellbookEstimateRangeBasis;
  spreadPctLow: number;
  spreadPctHigh: number;
  volatilityClass: BudgetSpellbookVolatilityClass;
  reasonCodes: BudgetSpellbookEstimateReasonCode[];
};

export type BudgetSpellbookAnchorRef =
  | { kind: "input_span"; source: "explicit" | "inferred"; start: number; end: number; text: string }
  | { kind: "assumption"; source: "assumption"; key: string }
  | { kind: "default_key"; source: "default"; key: string }
  | { kind: "inferred_value"; source: "inferred"; key: string; value: string };

export type BudgetSpellbookInferenceStep = {
  ruleId: string;
  inputs: string[];
  output: string;
  confidenceDelta?: number;
};

export type BudgetSpellbookCoverageTemplate = "RENTAL_AV" | "SCENIC" | "PRINT" | "PERMITS" | "FEES_ONLY" | "NONE";

export type BudgetSpellbookLineDraft = {
  id: string;
  fingerprint: string;
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
  estimateRange?: BudgetSpellbookEstimateRange;
  meta?: {
    source?: "inferred" | "shopping-list" | "defaults";
    confidence?: number;
    ruleId?: string;
    originVariantId?: BudgetSpellbookVariantId;
    groupKey?: string;
    anchors?: BudgetSpellbookAnchorRef[];
    inference?: BudgetSpellbookInferenceStep[];
    coverageTemplate?: BudgetSpellbookCoverageTemplate;
    coverageSteps?: BudgetTaskLinkType[];
  };
};

export type BudgetSpellbookInputSpan = { start: number; end: number; text: string };

/** Source attribution for traceability */
export type RecognizedItemSource = "user-provided" | "system-default" | "inferred";

/** A recognized line item extracted from user input with cost data */
export type RecognizedLineItem = {
  id: string;
  description: string;
  cost: number | null;
  quantity: number;
  unit: string;
  source: RecognizedItemSource;
  confidence: number;
  span: BudgetSpellbookInputSpan | null;
  originalText: string;
  suggestedCategory: BudgetSpellbookLineDraft["category"] | null;
  included: boolean;
};

export type BudgetSpellbookInferred = {
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

export type BudgetSpellbookParseResult = {
  input: string;
  inferred: BudgetSpellbookInferred;
  spans: Partial<Record<keyof BudgetSpellbookInferred, BudgetSpellbookInputSpan>>;
  shoppingList: string[];
  /** Extracted line items with costs from user input */
  recognizedItems: RecognizedLineItem[];
  /** True if we found parseable cost data */
  hasStructuredInput: boolean;
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
  finalRange: { low: number; likely: number; high: number };
  effectiveMarkup: number;
  byCategory: Record<string, number>;
};

export type BudgetSpellbookReadiness = "ready_to_send" | "sendable_with_caveats" | "needs_answers";

export type BudgetSpellbookAnchorKey =
  | "CITY"
  | "INSTALL_DAYS"
  | "CREW_COUNT"
  | "DRAPE_FEET"
  | "UPLIGHT_COUNT"
  | "TRAVEL_TRUCKING_NEEDED";

export type BudgetSpellbookRequiredAnchor = {
  key: BudgetSpellbookAnchorKey;
  status: "known" | "unknown";
  confidence: number; // 0..1
  blocking: boolean;
  suggestedPrompt: string;
};

export type BudgetSpellbookConfidenceSummary = {
  score: number; // 0..1
  readiness: BudgetSpellbookReadiness;
  requiredAnchors: BudgetSpellbookRequiredAnchor[];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const safeNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const hashFNV1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const fingerprintForLine = (line: BudgetSpellbookLineDraft): string => {
  const canonical = [
    line.category,
    line.description.trim().toLowerCase(),
    line.unit.trim().toLowerCase(),
    line.areaGroup,
    line.invoiceGroup,
    line.packageLabel ?? "",
    line.meta?.groupKey ?? "",
    line.meta?.ruleId ?? "",
  ].join("|");
  return `fp_${hashFNV1a(canonical)}`;
};

const coverageForCategory = (
  category: BudgetSpellbookLineDraft["category"],
): { template: BudgetSpellbookCoverageTemplate; steps: BudgetTaskLinkType[] } => {
  if (category === "RENTALS" || category === "AUDIO-VISUAL" || category === "LIGHTING") {
    return { template: "RENTAL_AV", steps: ["quote", "procure", "install", "strike", "invoice"] };
  }
  if (category === "FABRICATION" || category === "DECOR") {
    return { template: "SCENIC", steps: ["build", "install", "strike", "invoice"] };
  }
  if (category === "GRAPHICS") {
    return { template: "PRINT", steps: ["quote", "build", "install", "invoice"] };
  }
  if (category === "PERMITS-INSURANCE") {
    return { template: "PERMITS", steps: ["procure", "invoice"] };
  }
  if (category === "CONTINGENCY-MISC" || category === "TRAVEL" || category === "PARKING-FUEL-TOLLS") {
    return { template: "FEES_ONLY", steps: [] };
  }
  return { template: "NONE", steps: [] };
};

const anchorDefault = (key: string): BudgetSpellbookAnchorRef => ({ kind: "default_key", source: "default", key });
const anchorInferredValue = (key: string, value: unknown): BudgetSpellbookAnchorRef => ({
  kind: "inferred_value",
  source: "inferred",
  key,
  value: typeof value === "string" ? value : String(value),
});
const anchorInputSpan = (span: BudgetSpellbookInputSpan, source: "explicit" | "inferred" = "explicit"): BudgetSpellbookAnchorRef => ({
  kind: "input_span",
  source,
  start: span.start,
  end: span.end,
  text: span.text,
});
const inferenceStep = (ruleId: string, inputs: string[], output: string, confidenceDelta?: number): BudgetSpellbookInferenceStep => ({
  ruleId,
  inputs,
  output,
  confidenceDelta,
});

const computeLineConfidence = (
  line: BudgetSpellbookLineDraft,
  parsed: BudgetSpellbookParseResult,
  options: BudgetSpellbookGeneratorOptions,
): number => {
  if (line.category === "CONTINGENCY-MISC") return 0.9;

  const source = line.meta?.source ?? "defaults";
  const hasLotQty = line.unit === "Lot" && line.quantity === 1;

  let base = 0.55;
  if (source === "shopping-list") base = 0.82;
  if (source === "defaults") base = 0.58;
  if (source === "inferred") base = hasLotQty ? 0.45 : 0.62;

  const inferred = parsed.inferred;
  const venueCity = options.venueCity.trim();

  const needsInstallDays =
    line.category === "LABOR" || line.category === "PRODUCTION-MGMT" || line.category === "FABRICATION";
  if (needsInstallDays && inferred.installDays == null) base -= 0.08;

  if (line.category === "LABOR" && inferred.crewCount == null) base -= 0.06;

  if (line.category === "RENTALS" && /\b(drape)\b/i.test(line.description) && inferred.drapeFeet == null) base -= 0.06;
  if (line.category === "LIGHTING" && /\buplight\b/i.test(line.description) && inferred.uplightCount == null) base -= 0.06;

  if (line.category === "TRAVEL" || line.category === "TRUCKING" || line.category === "PARKING-FUEL-TOLLS") {
    base -= 0.1;
    if (!venueCity && !inferred.hasTravel && !inferred.hasTrucking) base -= 0.12;
  }

  if (line.category === "FABRICATION") base -= 0.06;
  if (line.category === "AUDIO-VISUAL" || line.category === "LIGHTING" || line.category === "RENTALS") base -= 0.03;
  if (line.category === "PERMITS-INSURANCE") base += 0.04;

  if (line.packageLabel === "Summary") base = Math.min(base, 0.75);

  return clamp(base, 0.3, 0.95);
};

const spreadBandForCategory = (
  category: BudgetSpellbookLineDraft["category"],
): { minSpread: number; maxSpread: number; volatilityClass: BudgetSpellbookVolatilityClass } => {
  if (category === "LABOR" || category === "PRODUCTION-MGMT") return { minSpread: 0.15, maxSpread: 0.25, volatilityClass: "LOW" };
  if (category === "RENTALS" || category === "AUDIO-VISUAL" || category === "LIGHTING") {
    return { minSpread: 0.2, maxSpread: 0.35, volatilityClass: "MEDIUM" };
  }
  if (category === "FABRICATION" || category === "DECOR") return { minSpread: 0.3, maxSpread: 0.6, volatilityClass: "HIGH" };
  if (category === "GRAPHICS" || category === "DESIGN") return { minSpread: 0.25, maxSpread: 0.45, volatilityClass: "MEDIUM" };
  if (category === "TRAVEL" || category === "TRUCKING" || category === "PARKING-FUEL-TOLLS") {
    return { minSpread: 0.3, maxSpread: 0.8, volatilityClass: "VERY_HIGH" };
  }
  if (category === "PERMITS-INSURANCE") return { minSpread: 0.15, maxSpread: 0.3, volatilityClass: "LOW" };
  if (category === "CONTINGENCY-MISC") return { minSpread: 0, maxSpread: 0.05, volatilityClass: "LOW" };
  return { minSpread: 0.2, maxSpread: 0.4, volatilityClass: "MEDIUM" };
};

const estimateBasisForLine = (line: BudgetSpellbookLineDraft): BudgetSpellbookEstimateRangeBasis => {
  const source = line.meta?.source ?? "defaults";
  if (source === "inferred") return "heuristic";
  return "default";
};

const computeLineFinalCost = (line: BudgetSpellbookLineDraft): number => {
  const qty = safeNumber(line.quantity) ?? 0;
  const cost = safeNumber(line.itemBudgetedCost) ?? 0;
  const markup = safeNumber(line.itemMarkUp) ?? 0;
  const lineBudgeted = qty * cost;
  return lineBudgeted * (1 + markup);
};

const computeLineEstimateReasonCodes = (
  line: BudgetSpellbookLineDraft,
  parsed?: BudgetSpellbookParseResult,
  options?: BudgetSpellbookGeneratorOptions,
): BudgetSpellbookEstimateReasonCode[] => {
  const codes: BudgetSpellbookEstimateReasonCode[] = [];
  const confidence = safeNumber(line.meta?.confidence) ?? 0.55;
  if (confidence < 0.6) codes.push("LOW_CONFIDENCE");
  if (line.packageLabel === "Summary") codes.push("SUMMARY_ROLLUP");
  if (line.category === "TRAVEL" || line.category === "TRUCKING" || line.category === "PARKING-FUEL-TOLLS") {
    codes.push("TRAVEL_VOLATILE");
  }
  if (line.category === "FABRICATION" || line.category === "DECOR") codes.push("FAB_VOLATILE");

  if (parsed && options) {
    if (!options.venueCity.trim()) codes.push("MISSING_CITY");

    const needsInstallDays =
      line.category === "LABOR" || line.category === "PRODUCTION-MGMT" || line.category === "FABRICATION";
    if (needsInstallDays && parsed.inferred.installDays == null) codes.push("MISSING_INSTALL_DAYS");

    if (line.category === "LABOR" && parsed.inferred.crewCount == null) codes.push("MISSING_CREW_COUNT");

    if (line.category === "RENTALS" && /\b(drape)\b/i.test(line.description) && parsed.inferred.drapeFeet == null) {
      codes.push("MISSING_DRAPE_FEET");
    }
    if (line.category === "LIGHTING" && /\buplight\b/i.test(line.description) && parsed.inferred.uplightCount == null) {
      codes.push("MISSING_UPLIGHT_COUNT");
    }
  }

  return Array.from(new Set(codes));
};

const computeLineEstimateRange = (
  line: BudgetSpellbookLineDraft,
  context?: { parsed: BudgetSpellbookParseResult; options: BudgetSpellbookGeneratorOptions },
): BudgetSpellbookEstimateRange => {
  const likely = computeLineFinalCost(line);
  const confidence = clamp(safeNumber(line.meta?.confidence) ?? 0.55, 0, 1);
  const { minSpread, maxSpread, volatilityClass } = spreadBandForCategory(line.category);
  const spread = clamp(minSpread + (1 - confidence) * (maxSpread - minSpread), 0, 0.95);
  const low = Math.max(0, Math.round(likely * (1 - spread)));
  const high = Math.max(low, Math.round(likely * (1 + spread)));

  const reasonCodes = computeLineEstimateReasonCodes(line, context?.parsed, context?.options);

  return {
    low,
    likely: Math.round(likely),
    high,
    basis: estimateBasisForLine(line),
    spreadPctLow: spread,
    spreadPctHigh: spread,
    volatilityClass,
    reasonCodes,
  };
};

const decorateLinesWithConfidence = (
  lines: BudgetSpellbookLineDraft[],
  parsed: BudgetSpellbookParseResult,
  options: BudgetSpellbookGeneratorOptions,
): BudgetSpellbookLineDraft[] =>
  lines.map((line) => {
    const existingConfidence = safeNumber(line.meta?.confidence);
    const confidence =
      line.packageLabel === "Summary" && existingConfidence != null
        ? existingConfidence
        : computeLineConfidence(line, parsed, options);

    const coverage = coverageForCategory(line.category);
    const metaNext = {
      ...(line.meta ?? {}),
      ruleId: line.meta?.ruleId ?? line.id,
      originVariantId: line.meta?.originVariantId,
      groupKey: line.meta?.groupKey ?? (line.packageLabel ? `pkg:${line.packageLabel}` : undefined),
      source: line.meta?.source ?? "defaults",
      confidence,
      coverageTemplate: line.meta?.coverageTemplate ?? coverage.template,
      coverageSteps: line.meta?.coverageSteps ?? coverage.steps,
    } satisfies NonNullable<BudgetSpellbookLineDraft["meta"]>;

    return {
      ...line,
      fingerprint: line.fingerprint || fingerprintForLine({ ...line, meta: metaNext }),
      estimateRange: computeLineEstimateRange({ ...line, meta: metaNext }, { parsed, options }),
      meta: metaNext,
    };
  });

const normalizeText = (input: string) =>
  (input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[""]/g, '"')
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

const firstSpan = (input: string, regex: RegExp): BudgetSpellbookInputSpan | null => {
  const flags = regex.flags.replace("g", "");
  const re = new RegExp(regex.source, flags);
  const m = re.exec(input);
  if (!m || typeof m.index !== "number") return null;
  return { start: m.index, end: m.index + m[0].length, text: m[0] };
};

/**
 * Infers a budget category from a description string.
 */
const inferCategoryFromDescription = (desc: string): BudgetSpellbookLineDraft["category"] | null => {
  const lower = desc.toLowerCase();

  // Order matters - more specific patterns first
  
  // Production Management (infrastructure, logistics, setup)
  if (/\b(infrastructure|installation|setup|logistics|pickups|delivery\s*&|coordination)\b/.test(lower)) return "PRODUCTION-MGMT";
  
  // Trucking/Shipping
  if (/\b(truck|trucking|freight|shipping|sprinter|box\s*truck|shopping|movements)\b/.test(lower)) return "TRUCKING";
  
  // Rentals/Equipment (booths, furniture, chandeliers, dance floor, PA)
  if (/\b(vr|virtual\s*reality|booth|inflatable|bounce\s*house|ball\s*pit|furniture|sofa|ottoman|bench|cafe\s*table|chandelier|rental|tent|table|chair|linen|seating|dance\s*floor|lounge)\b/.test(lower)) return "RENTALS";
  
  // Audio-Visual (PA, DJ, music, sound)
  if (/\b(av|audio|video|projector|screen|speaker|mic|sound|pa\s*system|dj|music|entertainment)\b/.test(lower)) return "AUDIO-VISUAL";
  
  // Fabrication (custom builds, backdrops, structures, tunnels, displays, stations)
  if (/\b(scenic|fab|build|set\s*wall|backdrop|structure|frame|tunnel|display|station|step\s*and\s*repeat|step-and-repeat|architectural|enclosure)\b/.test(lower)) return "FABRICATION";
  
  // Decor (decorative elements, florals, treatment, dressing)
  if (/\b(decor|floral|prop|centerpiece|arrangement|balloon|treatment|dressing|ceiling|finishing\s*touch|carpet|star\s*pathway)\b/.test(lower)) return "DECOR";
  
  // Drapery (specific rental - check before general drape)
  if (/\b(drape|drapery|pipe\s*&\s*drape|draped)\b/.test(lower)) return "RENTALS";
  
  // Graphics/Signage (cards, posters, collage, polaroid)
  if (/\b(graphic|sign|vinyl|print|banner|directional|signage|card|poster|collage|polaroid)\b/.test(lower)) return "GRAPHICS";
  
  // Lighting (LED, uplights, gobo, wash)
  if (/\b(uplight|gobo|pin\s*spot|lighting|led\s*(?!balloon)|wash|light\s*(?!station))\b/.test(lower)) return "LIGHTING";
  
  // Labor
  if (/\b(labor|crew|install|strike|tech|stagehand|loader)\b/.test(lower)) return "LABOR";
  
  // Travel
  if (/\b(travel|hotel|flight|per\s*diem|lodging|airfare)\b/.test(lower)) return "TRAVEL";
  
  // Permits
  if (/\b(permit|insurance|cert|license|fee)\b/.test(lower)) return "PERMITS-INSURANCE";
  
  // Design
  if (/\b(design|proof|render|creative|artwork)\b/.test(lower)) return "DESIGN";
  
  // Parking/Fuel/Tolls
  if (/\b(parking|fuel|toll|gas|mileage)\b/.test(lower)) return "PARKING-FUEL-TOLLS";
  
  // Contingency
  if (/\b(contingency|misc|buffer|reserve)\b/.test(lower)) return "CONTINGENCY-MISC";

  return null;
};

/**
 * Infers an area group from a category.
 */
const inferAreaGroupFromCategory = (
  category: BudgetSpellbookLineDraft["category"] | null,
): BudgetSpellbookLineDraft["areaGroup"] => {
  if (!category) return "VENUE";
  if (category === "FABRICATION" || category === "GRAPHICS") return "SHOP";
  if (category === "TRAVEL" || category === "TRUCKING" || category === "PARKING-FUEL-TOLLS") return "TRAVEL";
  if (category === "PRODUCTION-MGMT" || category === "DESIGN" || category === "PERMITS-INSURANCE") return "PRE-PRO";
  return "VENUE";
};

/**
 * Infers an invoice group from a category and crew model.
 */
const inferInvoiceGroupFromCategory = (
  category: BudgetSpellbookLineDraft["category"] | null,
  crewModel: BudgetSpellbookCrewModel,
): BudgetSpellbookLineDraft["invoiceGroup"] => {
  if (!category) return "PRODUCTION";
  if (category === "TRAVEL" || category === "PARKING-FUEL-TOLLS") return "CLIENT REIMBURSABLE";
  if (category === "TRUCKING" || category === "RENTALS" || category === "LIGHTING" || category === "AUDIO-VISUAL") {
    return "VENDORS";
  }
  if (category === "GRAPHICS" || category === "DESIGN") {
    return crewModel === "internal" ? "PRODUCTION" : "VENDORS";
  }
  if (category === "LABOR" || category === "PRODUCTION-MGMT" || category === "FABRICATION") {
    return crewModel === "outsourced" ? "VENDORS" : "PRODUCTION";
  }
  return "PRODUCTION";
};

/**
 * Deduplicates recognized items by similar description + cost.
 */
const dedupeRecognizedItems = (items: RecognizedLineItem[]): RecognizedLineItem[] => {
  const seen = new Map<string, RecognizedLineItem>();
  for (const item of items) {
    // Normalize description for deduplication
    const normalizedDesc = item.description.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
    const key = `${normalizedDesc}|${item.cost}`;
    const existing = seen.get(key);
    if (!existing || item.confidence > existing.confidence) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
};

/**
 * Cleans up a raw text segment to extract a usable item name.
 * Handles:
 *   - Concatenated spreadsheet columns: "CategoryItemNameDescription"
 *   - Leading/trailing punctuation and whitespace
 *   - Dimension suffixes that should be removed
 */
const cleanupItemName = (raw: string): string => {
  let text = raw.trim();
  
  // Remove leading bullets, numbers, dashes
  text = text.replace(/^[\s\-–—•·▪◦○●\d.)\]]+\s*/, "");
  
  // Remove trailing punctuation
  text = text.replace(/[\s\-–—:;,.(]+$/, "");
  
  // Remove common category prefixes that get concatenated (spreadsheet headers)
  // Only strip these if they're followed by at least 5 characters of real content
  // This prevents stripping "Item A" but allows stripping "ItemScenic Backdrop..."
  const prefixPatterns = [
    /^(?:Infrastructure\s*&\s*Setup|Entrance\s*Experience|Focal\s*Areas?|Photo\s*Opportunities?|Interactive\s*Activations?|Additional\s*Fun(?:\s*for\s*Kids)?|Entertainment\s*&\s*Ambiance|Decor\s*&\s*Finishing\s*Touches?|Setup|Category|Description|Line\s*Item|Budget\s*Item)(?=[A-Z][a-z])/i,
  ];
  for (const pattern of prefixPatterns) {
    text = text.replace(pattern, "").trim();
  }
  
  // If still too long, try to find a natural break point
  if (text.length > 60) {
    // Look for where a title-case name transitions to lowercase description
    // E.g., "Step and Repeat Photo Opportunity10 ft high" → "Step and Repeat Photo Opportunity"
    
    // Pattern: Title words followed by a digit (dimension)
    const dimMatch = text.match(/^(.{10,55}?)\s*\d+\s*(?:ft|inch|x|'|"|cm|m\b)/i);
    if (dimMatch) return dimMatch[1].trim();
    
    // Pattern: Uppercase/Title case words followed by lowercase sentence
    // Find where a capital word ends and lowercase begins that looks like description start
    const descriptionStarters = /(?:^|\s)(includes?|features?|with|for|full|custom|complete|all|themed|assorted|decorative|our|the|a|an|labor|setup|staff)\s/i;
    const descMatch = text.match(descriptionStarters);
    if (descMatch && descMatch.index && descMatch.index >= 10 && descMatch.index <= 55) {
      return text.slice(0, descMatch.index).trim();
    }
    
    // Pattern: CamelCase boundary (lowercase followed by uppercase)
    // E.g., "EnvironmentFull" → break before "Full"
    const camelMatch = text.match(/^(.{10,50}?[a-z])([A-Z][a-z]{2,})/);
    if (camelMatch) return camelMatch[1].trim();
    
    // Fallback: truncate at word boundary
    const truncated = text.slice(0, 55);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > 15) return truncated.slice(0, lastSpace).trim();
  }
  
  return text.trim();
};

/**
 * Parses a cost string that may include:
 *   - Currency symbol: $3,138 or $1,200.00
 *   - Ranges: $5,000–$7,000 or $5,000-$7,000
 *   - Bare numbers: 3138 or 3,138
 * Returns the cost (higher value for ranges) and whether it was a range.
 */
const parseCost = (costText: string): { cost: number; isRange: boolean } => {
  // Clean up the cost text
  const cleaned = costText.replace(/\s+/g, "");
  
  // Check for range patterns
  const rangeMatch = cleaned.match(/\$?([\d,]+(?:\.\d{1,2})?)[–\-—to]+\$?([\d,]+(?:\.\d{1,2})?)/i);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1].replace(/,/g, ""));
    const high = parseFloat(rangeMatch[2].replace(/,/g, ""));
    return { cost: Math.max(low, high), isRange: true };
  }
  
  // Single value
  const singleMatch = cleaned.match(/\$?([\d,]+(?:\.\d{1,2})?)/);
  if (singleMatch) {
    return { cost: parseFloat(singleMatch[1].replace(/,/g, "")), isRange: false };
  }
  
  return { cost: 0, isRange: false };
};

/**
 * Smart line-by-line parser that handles various input formats.
 * Splits input into logical "chunks" and looks for cost associations.
 */
const parseInputIntoChunks = (input: string): Array<{ text: string; start: number; end: number }> => {
  const chunks: Array<{ text: string; start: number; end: number }> = [];
  
  // Split on newlines first
  const lines = input.split(/\n/);
  let pos = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length >= 3) {
      chunks.push({ text: trimmed, start: pos, end: pos + line.length });
    }
    pos += line.length + 1; // +1 for the newline
  }
  
  return chunks;
};

/**
 * MAGICAL extraction - handles many different input formats:
 * 
 * Format 1: "Description $Cost" or "Description: $Cost"
 * Format 2: "Description - $Cost" or "Description — $Cost"
 * Format 3: "Description    $Cost" (tab-separated)
 * Format 4: "$Cost Description" (cost first)
 * Format 5: "Description\n$Cost" (cost on next line)
 * Format 6: "• Description $Cost" (bulleted lists)
 * Format 7: "1. Description $Cost" (numbered lists)
 * Format 8: Spreadsheet paste: "Col1Col2Col3$Cost"
 * Format 9: Ranges: "Description $5,000–$7,000"
 * Format 10: Bare numbers: "Description 5000" (4+ digits)
 * Format 11: Email/prose with inline costs
 */
const extractRecognizedLineItems = (input: string): RecognizedLineItem[] => {
  const normalized = normalizeText(input);
  const items: RecognizedLineItem[] = [];
  let idCounter = 0;
  
  // Strategy: Find all costs first, then look backward/around for descriptions
  
  // Find all cost occurrences (with optional ranges)
  const costPattern = /\$\s*([\d,]+(?:\.\d{1,2})?)(?:\s*[–\-—]\s*\$?\s*([\d,]+(?:\.\d{1,2})?))?/g;
  const costs: Array<{ 
    match: string; 
    cost: number; 
    isRange: boolean; 
    start: number; 
    end: number 
  }> = [];
  
  let costMatch: RegExpExecArray | null;
  while ((costMatch = costPattern.exec(normalized)) !== null) {
    const { cost, isRange } = parseCost(costMatch[0]);
    if (cost > 0) {
      costs.push({
        match: costMatch[0],
        cost,
        isRange,
        start: costMatch.index,
        end: costMatch.index + costMatch[0].length,
      });
    }
  }
  
  // For each cost, find the best description
  for (let i = 0; i < costs.length; i++) {
    const costInfo = costs[i];
    const prevCostEnd = i > 0 ? costs[i - 1].end : 0;
    
    // Look at text between this cost and previous cost (or start)
    const beforeText = normalized.slice(prevCostEnd, costInfo.start);
    
    // Try to extract a meaningful description
    let description = "";
    let confidence = 0.88;
    
    // Check if there's a clear line/segment before the cost
    const segments = beforeText.split(/\n/).filter((s) => s.trim().length > 0);
    
    if (segments.length > 0) {
      // Take the last segment (closest to the cost)
      const lastSegment = segments[segments.length - 1].trim();
      
      // Clean it up
      description = cleanupItemName(lastSegment);
      
      // If the segment was very long (concatenated spreadsheet), lower confidence
      if (lastSegment.length > 100) confidence = 0.78;
    }
    
    // If no good description found, skip this cost
    if (description.length < 3) continue;
    
    // Check if description is mostly just punctuation or numbers
    const alphaRatio = (description.match(/[a-zA-Z]/g) || []).length / description.length;
    if (alphaRatio < 0.5) continue;
    
    items.push({
      id: `recognized-${idCounter++}`,
      description,
      cost: costInfo.cost,
      quantity: 1,
      unit: "Lot",
      source: "user-provided",
      confidence: costInfo.isRange ? confidence - 0.05 : confidence,
      span: { 
        start: Math.max(0, costInfo.start - description.length - 10), 
        end: costInfo.end, 
        text: `${description} ${costInfo.match}` 
      },
      originalText: `${description} ${costInfo.match}`,
      suggestedCategory: inferCategoryFromDescription(description),
      included: true,
    });
  }
  
  // Also look for bare numbers (no $ sign) that look like costs
  // Only if they're 4+ digits and follow text
  const barePattern = /([A-Za-z][^$\n]{3,80}?)\s+(\d{1,3}(?:,\d{3})+|\d{4,})(?:\s*$|\s*\n|[,;.])/g;
  const seenDescriptions = new Set(items.map((i) => i.description.toLowerCase().slice(0, 20)));
  
  let bareMatch: RegExpExecArray | null;
  while ((bareMatch = barePattern.exec(normalized)) !== null) {
    const rawDesc = bareMatch[1].trim();
    const description = cleanupItemName(rawDesc);
    const costStr = bareMatch[2].replace(/,/g, "");
    const cost = parseFloat(costStr);
    
    // Skip if too small or we already have this description
    if (cost < 100) continue;
    if (seenDescriptions.has(description.toLowerCase().slice(0, 20))) continue;
    
    items.push({
      id: `recognized-${idCounter++}`,
      description,
      cost,
      quantity: 1,
      unit: "Lot",
      source: "user-provided",
      confidence: 0.68, // Lower confidence for bare numbers
      span: { start: bareMatch.index, end: bareMatch.index + bareMatch[0].length, text: bareMatch[0] },
      originalText: bareMatch[0].trim(),
      suggestedCategory: inferCategoryFromDescription(description),
      included: true,
    });
  }
  
  // Look for "qty x unit @ cost" patterns
  const qtyPattern = /(\d+)\s*(?:x\s*)?([A-Za-z]+)\s*[@at]\s*\$?([\d,]+(?:\.\d{1,2})?)/gi;
  let qtyMatch: RegExpExecArray | null;
  
  while ((qtyMatch = qtyPattern.exec(normalized)) !== null) {
    const quantity = parseInt(qtyMatch[1], 10);
    const unit = qtyMatch[2];
    const cost = parseFloat(qtyMatch[3].replace(/,/g, ""));
    
    if (!Number.isFinite(cost) || cost <= 0) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    
    // Try to find a description before this
    const beforeText = normalized.slice(Math.max(0, qtyMatch.index - 80), qtyMatch.index);
    const descParts = beforeText.split(/\n/).filter((s) => s.trim());
    const description = descParts.length > 0 
      ? cleanupItemName(descParts[descParts.length - 1])
      : `${quantity} ${unit}`;
    
    if (seenDescriptions.has(description.toLowerCase().slice(0, 20))) continue;
    
    items.push({
      id: `recognized-${idCounter++}`,
      description,
      cost,
      quantity,
      unit: unit.charAt(0).toUpperCase() + unit.slice(1).toLowerCase(),
      source: "user-provided",
      confidence: 0.85,
      span: { start: qtyMatch.index, end: qtyMatch.index + qtyMatch[0].length, text: qtyMatch[0] },
      originalText: qtyMatch[0].trim(),
      suggestedCategory: inferCategoryFromDescription(description),
      included: true,
    });
  }
  
  // Deduplicate and return
  return dedupeRecognizedItems(items);
};

/**
 * Converts recognized line items to budget line drafts.
 */
const buildLinesFromRecognizedItems = (
  items: RecognizedLineItem[],
  options: BudgetSpellbookGeneratorOptions,
): BudgetSpellbookLineDraft[] => {
  return items
    .filter((item) => item.included && item.cost != null)
    .map((item) => {
      const category = item.suggestedCategory ?? "CONTINGENCY-MISC";
      const areaGroup = inferAreaGroupFromCategory(category);
      const invoiceGroup = inferInvoiceGroupFromCategory(category, options.crewModel);

      return {
        id: item.id,
        fingerprint: "",
        category,
        description: item.description.toUpperCase(),
        quantity: item.quantity,
        unit: item.unit,
        itemBudgetedCost: item.cost!,
        itemMarkUp: clamp(options.markupTarget, 0, 2),
        areaGroup,
        invoiceGroup,
        packageLabel: "User Provided",
        meta: {
          source: "shopping-list" as const,
          confidence: item.confidence,
          ruleId: item.id,
          anchors: item.span ? [anchorInputSpan(item.span, "explicit")] : [],
        },
      };
    });
};

/**
 * Checks if a default line overlaps with a user-provided item (by similar description).
 */
const hasOverlappingUserItem = (
  line: BudgetSpellbookLineDraft,
  userLines: BudgetSpellbookLineDraft[],
): boolean => {
  const lineDescLower = line.description.toLowerCase();
  return userLines.some((userLine) => {
    const userDescLower = userLine.description.toLowerCase();
    // Check for significant word overlap
    const lineWords = lineDescLower.split(/\s+/).filter((w) => w.length >= 3);
    const userWords = new Set(userDescLower.split(/\s+/).filter((w) => w.length >= 3));
    const overlap = lineWords.filter((w) => userWords.has(w)).length;
    return overlap >= 2 || lineDescLower.includes(userDescLower) || userDescLower.includes(lineDescLower);
  });
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

  const installDaysSpan =
    firstSpan(normalized, /\b(\d+(?:\.\d+)?)\s*(?:days?|day)\s*(?:install|installation|setup|set up|load in|load-in)\b/i) ??
    firstSpan(normalized, /\b(\d+(?:\.\d+)?)\s*(?:days?|day)\b/i);

  const crewCountSpan = firstSpan(normalized, /\b(\d{1,2})\s*(?:crew|hands|techs?|operators?|loaders?)\b/i);
  const drapeFeetSpan = firstSpan(
    normalized,
    /\b(?:pipe\s*&\s*drape|pipe\s+and\s+drape|drape)\b[^\d]{0,20}(\d{2,5})\s*(?:'|ft|feet|lf)(?:\b|$|[\s,.;:])/i,
  );
  const uplightCountSpan = firstSpan(normalized, /\b(\d{1,3})\s*(?:uplights?|uplight)\b/i);
  const markupSpan =
    firstSpan(normalized, /\b(?:markup|margin)\b[^\d]{0,20}(\d{1,2}(?:\.\d+)?)\s*%/i) ??
    firstSpan(normalized, /(\d{1,2}(?:\.\d+)?)\s*%[^\n]{0,22}\b(?:markup|margin)\b/i);
  const contingencySpan =
    firstSpan(normalized, /\bcontingency\b[^\d]{0,20}(\d{1,2}(?:\.\d+)?)\s*%/i) ??
    firstSpan(normalized, /(\d{1,2}(?:\.\d+)?)\s*%[^\n]{0,22}\bcontingency\b/i);

  // Extract recognized line items with costs
  const recognizedItems = extractRecognizedLineItems(normalized);
  const hasStructuredInput = recognizedItems.length > 0;

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
    spans: {
      ...(installDaysSpan ? { installDays: installDaysSpan } : {}),
      ...(crewCountSpan ? { crewCount: crewCountSpan } : {}),
      ...(drapeFeetSpan ? { drapeFeet: drapeFeetSpan } : {}),
      ...(uplightCountSpan ? { uplightCount: uplightCountSpan } : {}),
      ...(markupSpan ? { markupTarget: markupSpan } : {}),
      ...(contingencySpan ? { contingencyPct: contingencySpan } : {}),
    },
    shoppingList,
    recognizedItems,
    hasStructuredInput,
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
      fingerprint: "",
      category: "CONTINGENCY-MISC",
      description: "CONTINGENCY",
      quantity: 1,
      unit: "Lot",
      itemBudgetedCost: contingencyCost,
      itemMarkUp: 0,
      areaGroup: "PRE-PRO",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Contingency",
      meta: { source: "defaults", confidence: 0.9, ruleId: "contingency", anchors: [{ kind: "default_key", source: "default", key: "DEFAULTS:contingencyPct" }] },
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

const tagOriginVariant = (variantId: BudgetSpellbookVariantId, lines: BudgetSpellbookLineDraft[]): BudgetSpellbookLineDraft[] =>
  lines.map((line) => ({ ...line, meta: { ...(line.meta ?? {}), originVariantId: variantId } }));

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
  const confidenceByGroup = new Map<string, { weighted: number; total: number }>();
  lines.forEach((line) => {
    const key = `${line.invoiceGroup}::${line.areaGroup}`;
    const subtotal = line.quantity * line.itemBudgetedCost;
    totalsByGroup.set(key, (totalsByGroup.get(key) ?? 0) + subtotal);
    const weight = Math.max(1, Math.abs(subtotal));
    const confidence = safeNumber(line.meta?.confidence) ?? 0.55;
    const bucket = confidenceByGroup.get(key) ?? { weighted: 0, total: 0 };
    bucket.weighted += confidence * weight;
    bucket.total += weight;
    confidenceByGroup.set(key, bucket);
  });

  return summary
    .map((row) => {
      const key = `${row.invoiceGroup}::${row.areaGroup}`;
      const total = totalsByGroup.get(key) ?? 0;
      const confBucket = confidenceByGroup.get(key);
      const confidence = confBucket && confBucket.total > 0 ? confBucket.weighted / confBucket.total : 0.55;
      return {
        id: row.id,
        fingerprint: "",
        category: row.category,
        description: row.description,
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: Math.round(total),
        itemMarkUp: clamp(markupTarget, 0, 2),
        areaGroup: row.areaGroup,
        invoiceGroup: row.invoiceGroup,
        packageLabel: "Summary",
        meta: { source: "inferred", confidence: clamp(confidence, 0.35, 0.85), ruleId: row.id, groupKey: `summary:${row.id}` },
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

const makeLine = (ruleId: string, partial: Omit<BudgetSpellbookLineDraft, "id" | "fingerprint">): BudgetSpellbookLineDraft => ({
  id: ruleId,
  fingerprint: "",
  ...partial,
  meta: {
    ...(partial.meta ?? {}),
    ruleId,
  },
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
    makeLine("producerStandard.productionPrepro", {
      category: "PRODUCTION-MGMT",
      description: "PRODUCTION - PRE-PRO + COORDINATION",
      quantity: 1,
      unit: "Lot",
      itemBudgetedCost: 1200,
      itemMarkUp: markup,
      areaGroup: "PRE-PRO",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Production",
      meta: {
        source: "defaults",
        confidence: 0.7,
        anchors: [anchorDefault("DEFAULTS:productionPreproLot")],
        inference: [inferenceStep("producerStandard.productionPrepro", ["defaults"], "pre-pro lot")],
      },
    }),
  );

  if (options.eventType !== "wedding") {
    lines.push(
      makeLine("producerStandard.pmShowDays", {
        category: "PRODUCTION-MGMT",
        description: "PRODUCER / PM - SHOW DAYS",
        quantity: installDays,
        unit: "Days",
        itemBudgetedCost: pmDayRate,
        itemMarkUp: markup,
        areaGroup: "VENUE",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Production",
      meta: {
        source: "defaults",
        confidence: 0.65,
        anchors: [
          parsed.spans.installDays ? anchorInputSpan(parsed.spans.installDays) : anchorInferredValue("installDays", installDays),
          anchorDefault("DEFAULTS:pmDayRate"),
        ],
        inference: [inferenceStep("producerStandard.pmShowDays", ["installDays", "pmDayRate"], "qty=installDays, cost=pmDayRate")],
      },
    }),
  );
}

  lines.push(
    makeLine("producerStandard.leadInstall", {
      category: "LABOR",
      description: "LEAD TECH - INSTALL (DAY-RATE)",
      quantity: installDays,
      unit: "Days",
      itemBudgetedCost: leadDayRate,
      itemMarkUp: markup,
      areaGroup: "VENUE",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Crew",
      meta: {
        source: "defaults",
        confidence: 0.7,
        anchors: [
          parsed.spans.installDays ? anchorInputSpan(parsed.spans.installDays) : anchorInferredValue("installDays", installDays),
          anchorDefault("DEFAULTS:leadDayRate"),
        ],
        inference: [inferenceStep("producerStandard.leadInstall", ["installDays", "leadDayRate"], "qty=installDays, cost=leadDayRate")],
      },
    }),
    makeLine("producerStandard.crewInstall", {
      category: "LABOR",
      description: "CREW - INSTALL (DAY-RATE)",
      quantity: crewCount * installDays,
      unit: "Days",
      itemBudgetedCost: crewDayRate,
      itemMarkUp: markup,
      areaGroup: "VENUE",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Crew",
      meta: {
        source: inferred.crewCount ? "shopping-list" : "defaults",
        confidence: inferred.crewCount ? 0.8 : 0.6,
        anchors: [
          parsed.spans.installDays ? anchorInputSpan(parsed.spans.installDays) : anchorInferredValue("installDays", installDays),
          parsed.spans.crewCount ? anchorInputSpan(parsed.spans.crewCount) : anchorInferredValue("crewCount", crewCount),
          anchorDefault("DEFAULTS:crewDayRate"),
        ],
        inference: [inferenceStep("producerStandard.crewInstall", ["crewCount", "installDays", "crewDayRate"], "qty=crewCount*installDays")],
      },
    }),
  );

  if (inferred.hasScenic) {
    lines.push(
      makeLine("producerStandard.scenicBuild", {
        category: "FABRICATION",
        description: "SCENIC FABRICATION - BUILD",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 6500,
        itemMarkUp: markup,
        areaGroup: "SHOP",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Scenic",
        meta: {
          source: "inferred",
          confidence: 0.75,
          anchors: [anchorDefault("DEFAULTS:scenicBuildLot")],
          inference: [inferenceStep("producerStandard.scenicBuild", ["hasScenic"], "include scenic build")],
        },
      }),
      makeLine("producerStandard.scenicAssembly", {
        category: "FABRICATION",
        description: "SCENIC ASSEMBLY - PREP + PACK",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 950,
        itemMarkUp: markup,
        areaGroup: "SHOP",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Scenic",
        meta: {
          source: "defaults",
          confidence: 0.6,
          anchors: [anchorDefault("DEFAULTS:scenicAssemblyLot")],
          inference: [inferenceStep("producerStandard.scenicAssembly", ["hasScenic"], "include scenic prep/pack")],
        },
      }),
    );
  }

  if (drapeFeet > 0) {
    lines.push(
      makeLine("producerStandard.drapeRental", {
        category: "RENTALS",
        description: `PIPE & DRAPE RENTAL - ${drapeFeet} LF`,
        quantity: drapeFeet,
        unit: "LF",
        itemBudgetedCost: 9,
        itemMarkUp: clamp(markup, 0, 0.75),
        areaGroup: "VENUE",
        invoiceGroup: "VENDORS",
        packageLabel: "Pipe & Drape",
        meta: {
          source: inferred.drapeFeet ? "shopping-list" : "inferred",
          confidence: inferred.drapeFeet ? 0.85 : 0.6,
          anchors: [
            parsed.spans.drapeFeet ? anchorInputSpan(parsed.spans.drapeFeet) : anchorInferredValue("drapeFeet", drapeFeet),
            anchorDefault("DEFAULTS:drapeCostPerLf"),
          ],
          inference: [inferenceStep("producerStandard.drapeRental", ["drapeFeet", "costPerLf=9"], "qty=drapeFeet")],
        },
      }),
      makeLine("producerStandard.drapeLabor", {
        category: "LABOR",
        description: "PIPE & DRAPE - INSTALL + STRIKE",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 780,
        itemMarkUp: markup,
        areaGroup: "VENUE",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Pipe & Drape",
        meta: {
          source: "defaults",
          confidence: 0.55,
          anchors: [anchorInferredValue("drapeFeet", drapeFeet), anchorDefault("DEFAULTS:drapeInstallLot")],
          inference: [inferenceStep("producerStandard.drapeLabor", ["drapeFeet>0"], "include drape labor lot")],
        },
      }),
    );
  }

  if (uplightCount > 0) {
    lines.push(
      makeLine("producerStandard.uplightsRental", {
        category: "LIGHTING",
        description: "UPLIGHTS - RENTAL",
        quantity: uplightCount,
        unit: "Each",
        itemBudgetedCost: 45,
        itemMarkUp: clamp(markup, 0, 0.75),
        areaGroup: "VENUE",
        invoiceGroup: "VENDORS",
        packageLabel: "Lighting",
        meta: {
          source: inferred.uplightCount ? "shopping-list" : "inferred",
          confidence: inferred.uplightCount ? 0.8 : 0.55,
          anchors: [
            parsed.spans.uplightCount ? anchorInputSpan(parsed.spans.uplightCount) : anchorInferredValue("uplightCount", uplightCount),
            anchorDefault("DEFAULTS:uplightUnitCost"),
          ],
          inference: [inferenceStep("producerStandard.uplightsRental", ["uplightCount", "unitCost=45"], "qty=uplightCount")],
        },
      }),
    );
  }

  if (inferred.hasGraphics) {
    lines.push(
      makeLine("producerStandard.graphicsDesign", {
        category: "DESIGN",
        description: "GRAPHICS - DESIGN + PROOFS",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 950,
        itemMarkUp: markup,
        areaGroup: "PRE-PRO",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Graphics",
        meta: {
          source: "inferred",
          confidence: 0.75,
          anchors: [anchorDefault("DEFAULTS:graphicsDesignLot")],
          inference: [inferenceStep("producerStandard.graphicsDesign", ["hasGraphics"], "include design")],
        },
      }),
      makeLine("producerStandard.graphicsPrint", {
        category: "GRAPHICS",
        description: "GRAPHICS - PRINT PRODUCTION",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 1800,
        itemMarkUp: clamp(markup, 0, 0.6),
        areaGroup: "SHOP",
        invoiceGroup: "VENDORS",
        packageLabel: "Graphics",
        meta: {
          source: "defaults",
          confidence: 0.6,
          anchors: [anchorDefault("DEFAULTS:graphicsPrintLot")],
          inference: [inferenceStep("producerStandard.graphicsPrint", ["hasGraphics"], "include print production")],
        },
      }),
      makeLine("producerStandard.graphicsInstall", {
        category: "LABOR",
        description: "GRAPHICS - INSTALL + STRIKE",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 520,
        itemMarkUp: markup,
        areaGroup: "VENUE",
        invoiceGroup: "PRODUCTION",
        packageLabel: "Graphics",
        meta: {
          source: "defaults",
          confidence: 0.55,
          anchors: [anchorDefault("DEFAULTS:graphicsInstallLot")],
          inference: [inferenceStep("producerStandard.graphicsInstall", ["hasGraphics"], "include graphics install labor")],
        },
      }),
    );
  }

  if (inferred.hasAv) {
    lines.push(
      makeLine("producerStandard.avBasics", {
        category: "AUDIO-VISUAL",
        description: "AV PACKAGE - BASICS",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 2400,
        itemMarkUp: clamp(markup, 0, 0.65),
        areaGroup: "VENUE",
        invoiceGroup: "VENDORS",
        packageLabel: "AV",
        meta: {
          source: "inferred",
          confidence: 0.7,
          anchors: [anchorDefault("DEFAULTS:avBasicsLot")],
          inference: [inferenceStep("producerStandard.avBasics", ["hasAv"], "include AV basics")],
        },
      }),
    );
  }

  const includeTravel =
    options.includeTravelTrucking && (options.venueCity.trim().length > 0 || inferred.hasTravel || inferred.hasTrucking);
  if (includeTravel) {
    lines.push(
      makeLine("producerStandard.truckingLocal", {
        category: "TRUCKING",
        description: "TRUCKING - LOCAL DELIVERY + RETURN",
        quantity: 1,
        unit: "Days",
        itemBudgetedCost: 650,
        itemMarkUp: clamp(markup, 0, 0.65),
        areaGroup: "TRAVEL",
        invoiceGroup: "VENDORS",
        packageLabel: "Travel / Trucking",
        meta: {
          source: "inferred",
          confidence: 0.6,
          anchors: [anchorDefault("DEFAULTS:truckingLocalDay"), ...(options.venueCity.trim() ? [anchorInferredValue("venueCity", options.venueCity.trim())] : [])],
          inference: [inferenceStep("producerStandard.truckingLocal", ["includeTravelTrucking"], "include trucking")],
        },
      }),
      makeLine("producerStandard.travelPerDiem", {
        category: "TRAVEL",
        description: `TRAVEL - HOTEL + PER DIEM${options.venueCity.trim() ? ` (${options.venueCity.trim()})` : ""}`,
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 950,
        itemMarkUp: 0,
        areaGroup: "TRAVEL",
        invoiceGroup: "CLIENT REIMBURSABLE",
        packageLabel: "Travel / Trucking",
        meta: {
          source: inferred.hasTravel ? "inferred" : "defaults",
          confidence: inferred.hasTravel ? 0.65 : 0.5,
          anchors: [anchorDefault("DEFAULTS:travelHotelPerDiemLot"), ...(options.venueCity.trim() ? [anchorInferredValue("venueCity", options.venueCity.trim())] : [])],
          inference: [inferenceStep("producerStandard.travelPerDiem", ["includeTravelTrucking", "venueCity?"], "include travel reimbursables")],
        },
      }),
      makeLine("producerStandard.parkingFuelTolls", {
        category: "PARKING-FUEL-TOLLS",
        description: "PARKING / FUEL / TOLLS",
        quantity: 1,
        unit: "Lot",
        itemBudgetedCost: 220,
        itemMarkUp: 0,
        areaGroup: "TRAVEL",
        invoiceGroup: "CLIENT REIMBURSABLE",
        packageLabel: "Travel / Trucking",
        meta: {
          source: "defaults",
          confidence: 0.5,
          anchors: [anchorDefault("DEFAULTS:parkingFuelTollsLot")],
          inference: [inferenceStep("producerStandard.parkingFuelTolls", ["includeTravelTrucking"], "include reimbursable buffer")],
        },
      }),
    );
  }

  lines.push(
    makeLine("producerStandard.insurancePermits", {
      category: "PERMITS-INSURANCE",
      description: "INSURANCE / CERTIFICATES / PERMITS",
      quantity: 1,
      unit: "Lot",
      itemBudgetedCost: 325,
      itemMarkUp: 0,
      areaGroup: "PRE-PRO",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Fees",
      meta: {
        source: "defaults",
        confidence: 0.55,
        anchors: [anchorDefault("DEFAULTS:insurancePermitsLot")],
        inference: [inferenceStep("producerStandard.insurancePermits", ["defaults"], "include insurance/permitting placeholder")],
      },
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
    makeLine("ops.shopPrepCrew", {
      category: "LABOR",
      description: "SHOP PREP - CREW",
      quantity: crewCount * Math.max(1, Math.round(installDays / 2)),
      unit: "Days",
      itemBudgetedCost: 420,
      itemMarkUp: markup,
      areaGroup: "SHOP",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Ops",
      meta: {
        source: "defaults",
        confidence: 0.55,
        anchors: [anchorInferredValue("crewCount", crewCount), anchorInferredValue("installDays", installDays), anchorDefault("DEFAULTS:shopPrepCrewDay")],
        inference: [inferenceStep("ops.shopPrepCrew", ["crewCount", "installDays"], "qty=crewCount*ceil(installDays/2)")],
      },
    }),
    makeLine("ops.strikeLoadOutCrew", {
      category: "LABOR",
      description: "STRIKE / LOAD-OUT - CREW",
      quantity: crewCount,
      unit: "Days",
      itemBudgetedCost: 520,
      itemMarkUp: markup,
      areaGroup: "VENUE",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Ops",
      meta: {
        source: "defaults",
        confidence: 0.55,
        anchors: [anchorInferredValue("crewCount", crewCount), anchorDefault("DEFAULTS:crewDayRate")],
        inference: [inferenceStep("ops.strikeLoadOutCrew", ["crewCount"], "qty=crewCount")],
      },
    }),
    makeLine("ops.overtimeBuffer", {
      category: "LABOR",
      description: "OVERTIME BUFFER",
      quantity: 1,
      unit: "Lot",
      itemBudgetedCost: 650,
      itemMarkUp: markup,
      areaGroup: "VENUE",
      invoiceGroup: "PRODUCTION",
      packageLabel: "Ops",
      meta: {
        source: "defaults",
        confidence: 0.5,
        anchors: [anchorDefault("DEFAULTS:overtimeBufferLot")],
        inference: [inferenceStep("ops.overtimeBuffer", ["defaults"], "include overtime buffer")],
      },
    }),
  ];

  return [...lines, ...ops];
};

export function buildBudgetSpellbookVariants(
  parsed: BudgetSpellbookParseResult,
  options: BudgetSpellbookGeneratorOptions,
): BudgetSpellbookVariant[] {
  // 1. Convert recognized user items to budget lines (these take priority)
  const userProvidedLines = buildLinesFromRecognizedItems(parsed.recognizedItems, options);

  // 2. Build default template lines
  const defaultLines = buildProducerStandard(parsed, options).map((line) => toInvoiceGroups(line, options.crewModel));

  // 3. Filter out defaults that overlap with user-provided items
  const filteredDefaults = defaultLines.filter((line) => !hasOverlappingUserItem(line, userProvidedLines));

  // 4. Merge: user items first, then filtered defaults
  const combinedLines = [...userProvidedLines, ...filteredDefaults];

  const producerStandard = tagOriginVariant(
    "producer-standard",
    decorateLinesWithConfidence(combinedLines, parsed, options),
  );

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

  const vendorReady = tagOriginVariant("vendor-ready", producerStandard);

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
      lines: tagOriginVariant(
        "lean",
        decorateLinesWithConfidence(
          allocateContingencyLine(lean.filter((l) => l.category !== "CONTINGENCY-MISC"), options.contingencyPct),
          parsed,
          options,
        ),
      ),
    },
    {
      id: "producer-standard",
      label: "Producer Standard",
      hint: "Detailed but clean",
      lines: producerStandard,
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
      lines: tagOriginVariant("client-facing", decorateLinesWithConfidence(clientFacing, parsed, options)),
    },
    {
      id: "ops-ready",
      label: "Ops-ready",
      hint: "Adds prep/strike/OT buffers",
      lines: tagOriginVariant(
        "ops-ready",
        decorateLinesWithConfidence(
          allocateContingencyLine(opsReady.filter((l) => l.category !== "CONTINGENCY-MISC"), options.contingencyPct),
          parsed,
          options,
        ),
      ),
    },
    {
      id: "aggressive-margin",
      label: "Aggressive margin",
      hint: "Rebalances markup across categories",
      lines: tagOriginVariant(
        "aggressive-margin",
        decorateLinesWithConfidence(
          allocateContingencyLine(aggressive.filter((l) => l.category !== "CONTINGENCY-MISC"), options.contingencyPct),
          parsed,
          options,
        ),
      ),
    },
  ];
}

export function computeBudgetSpellbookTotals(lines: BudgetSpellbookLineDraft[]): BudgetSpellbookTotals {
  let budgeted = 0;
  let final = 0;
  let finalLow = 0;
  let finalHigh = 0;
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

    const range = line.estimateRange ?? computeLineEstimateRange(line);
    finalLow += range.low;
    finalHigh += range.high;
  });

  const effectiveMarkup = budgeted > 0 ? (final - budgeted) / budgeted : 0;
  return { budgeted, final, finalRange: { low: finalLow, likely: final, high: finalHigh }, effectiveMarkup, byCategory };
}

export function computeBudgetSpellbookConfidence(params: {
  lines: BudgetSpellbookLineDraft[];
  parsed: BudgetSpellbookParseResult;
  options: BudgetSpellbookGeneratorOptions;
}): BudgetSpellbookConfidenceSummary {
  const { lines, parsed, options } = params;

  let weighted = 0;
  let totalWeight = 0;

  lines.forEach((line) => {
    const w = Math.max(1, Math.abs(computeLineFinalCost(line)));
    const c = clamp(safeNumber(line.meta?.confidence) ?? 0.55, 0, 1);
    weighted += c * w;
    totalWeight += w;
  });

  let score = totalWeight > 0 ? weighted / totalWeight : 0.55;

  const requiredAnchors = computeBudgetSpellbookRequiredAnchors({ parsed, options });
  const blockingUnknownCount = requiredAnchors.filter((a) => a.blocking && a.status === "unknown").length;

  requiredAnchors.forEach((anchor) => {
    if (anchor.status === "known") return;
    if (anchor.key === "CITY") score -= 0.06;
    if (anchor.key === "INSTALL_DAYS") score -= 0.05;
    if (anchor.key === "CREW_COUNT") score -= 0.05;
    if (anchor.key === "DRAPE_FEET") score -= 0.03;
    if (anchor.key === "UPLIGHT_COUNT") score -= 0.03;
    if (anchor.key === "TRAVEL_TRUCKING_NEEDED") score -= 0.02;
  });
  score -= Math.min(0.12, Math.max(0, blockingUnknownCount - 1) * 0.02);

  score = clamp(score, 0, 1);

  const readiness: BudgetSpellbookReadiness =
    score >= 0.78 && blockingUnknownCount === 0
      ? "ready_to_send"
      : score >= 0.62
        ? "sendable_with_caveats"
        : "needs_answers";

  return { score, readiness, requiredAnchors };
}

export function computeBudgetSpellbookRequiredAnchors(params: {
  parsed: BudgetSpellbookParseResult;
  options: BudgetSpellbookGeneratorOptions;
}): BudgetSpellbookRequiredAnchor[] {
  const { parsed, options } = params;

  const normalizedInput = parsed.input;
  const wantsDrape = /\b(?:pipe\s*&\s*drape|pipe\s+and\s+drape|drape)\b/i.test(normalizedInput);
  const wantsUplights = /\buplight\b/i.test(normalizedInput);

  const venueCity = options.venueCity.trim();
  const anchors: BudgetSpellbookRequiredAnchor[] = [
    {
      key: "CITY",
      status: venueCity ? "known" : "unknown",
      confidence: venueCity ? 0.85 : 0.25,
      blocking: false,
      suggestedPrompt: "What city/venue is this in?",
    },
    {
      key: "INSTALL_DAYS",
      status: parsed.inferred.installDays != null ? "known" : "unknown",
      confidence: parsed.inferred.installDays != null ? 0.8 : 0.25,
      blocking: true,
      suggestedPrompt: "How many load-in/install days and how many strike days?",
    },
    {
      key: "CREW_COUNT",
      status: parsed.inferred.crewCount != null ? "known" : "unknown",
      confidence: parsed.inferred.crewCount != null ? 0.8 : 0.25,
      blocking: true,
      suggestedPrompt: "How many crew/techs are expected onsite?",
    },
  ];

  if (wantsDrape) {
    anchors.push({
      key: "DRAPE_FEET",
      status: parsed.inferred.drapeFeet != null ? "known" : "unknown",
      confidence: parsed.inferred.drapeFeet != null ? 0.8 : 0.25,
      blocking: true,
      suggestedPrompt: "How many linear feet of pipe & drape?",
    });
  }

  if (wantsUplights) {
    anchors.push({
      key: "UPLIGHT_COUNT",
      status: parsed.inferred.uplightCount != null ? "known" : "unknown",
      confidence: parsed.inferred.uplightCount != null ? 0.8 : 0.25,
      blocking: true,
      suggestedPrompt: "How many uplights?",
    });
  }

  const travelIntentKnown = Boolean(venueCity) || parsed.inferred.hasTravel || parsed.inferred.hasTrucking;
  if (options.includeTravelTrucking && !travelIntentKnown) {
    anchors.push({
      key: "TRAVEL_TRUCKING_NEEDED",
      status: "unknown",
      confidence: 0.2,
      blocking: false,
      suggestedPrompt: "Is this local, or should we include travel/trucking/hotel/per diem?",
    });
  }

  return anchors;
}
