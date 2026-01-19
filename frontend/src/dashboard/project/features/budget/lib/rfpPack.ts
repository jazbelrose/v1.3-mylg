import {
  computeBudgetSpellbookTotals,
  type BudgetSpellbookGeneratorOptions,
  type BudgetSpellbookParseResult,
  type BudgetSpellbookVariant,
} from "./budgetSpellbook";
import type { PlanDraftAssumptions } from "./planDraft";
import type { SpellbookDraftEnvelope } from "./spellbookDraft";

const formatMoney = (value: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const percentLabel = (value: number) => `${Math.round(value * 100)}%`;

const safeIsoDate = (value: string | null | undefined): string | null => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return trimmed;
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

const firstNonEmpty = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const v = (value ?? "").trim();
    if (v) return v;
  }
  return "";
};

const buildOpenQuestions = (
  parsed: BudgetSpellbookParseResult,
  options: BudgetSpellbookGeneratorOptions,
  variantForQuestions: BudgetSpellbookVariant,
): string[] => {
  const openQuestions: string[] = [];

  const venueCity = options.venueCity.trim();
  if (!venueCity) openQuestions.push("What city/venue is this in (for travel, labor, and vendor rates)?");
  if (parsed.inferred.installDays == null) openQuestions.push("How many load-in/install days and how many strike days?");
  if (parsed.inferred.crewCount == null) openQuestions.push("How many crew/techs are expected onsite?");

  if (/\b(?:pipe\s*&\s*drape|pipe\s+and\s+drape|drape)\b/i.test(parsed.input) && parsed.inferred.drapeFeet == null) {
    openQuestions.push("How many linear feet of pipe & drape?");
  }
  if (/\buplight\b/i.test(parsed.input) && parsed.inferred.uplightCount == null) openQuestions.push("How many uplights?");

  if (options.includeTravelTrucking && !venueCity && !parsed.inferred.hasTravel && !parsed.inferred.hasTrucking) {
    openQuestions.push("Is this a local job, or should we include travel/trucking/hotel/per diem?");
  }

  const lowConfidenceCandidates = variantForQuestions.lines
    .map((line) => ({
      line,
      confidence: typeof line.meta?.confidence === "number" ? line.meta.confidence : 0.55,
      likely: typeof line.estimateRange?.likely === "number" ? line.estimateRange.likely : 0,
    }))
    .filter((row) => row.confidence < 0.6 && row.likely > 0)
    .sort((a, b) => b.likely * (1 - b.confidence) - a.likely * (1 - a.confidence))
    .slice(0, 5);

  lowConfidenceCandidates.forEach((row) => {
    const question = `Confirm scope/quantity for: ${row.line.description}`;
    if (!openQuestions.includes(question)) openQuestions.push(question);
  });

  return openQuestions.slice(0, 8);
};

export function buildRfpProposalPackMarkdownFromDraft(draft: SpellbookDraftEnvelope): string {
  const parsed = draft.parsed;
  const options = draft.options;
  const variants = draft.variants;

  const good = variants.find((v) => v.id === "lean") ?? variants[0];
  const better = variants.find((v) => v.id === "producer-standard") ?? good;
  const best = variants.find((v) => v.id === "ops-ready") ?? better;
  const clientFacing = variants.find((v) => v.id === "client-facing") ?? better;
  const questionVariant = variants.find((v) => v.id === "producer-standard") ?? better;

  const venueCity = options.venueCity.trim();

  const installDaysAssumed = parsed.inferred.installDays ?? 1;
  const crewCountAssumed = parsed.inferred.crewCount ?? (/\bcrew\b/i.test(parsed.input) ? 6 : 4);
  const drapeFeetAssumed = parsed.inferred.drapeFeet ?? (/\bdrape\b/i.test(parsed.input) ? 200 : 0);
  const uplightCountAssumed = parsed.inferred.uplightCount ?? (/\buplight\b/i.test(parsed.input) ? 12 : 0);

  const scopeSummaryLines = parsed.shoppingList.slice(0, 8);
  const scopeFallback = firstNonEmpty(parsed.input.split("\n")[0], "See line items below.");

  const openQuestions = (() => {
    const fromAnchors = draft.requiredAnchors
      .filter((a) => a.status === "unknown")
      .map((a) => a.suggestedPrompt);

    const fromLowConfidence = questionVariant.lines
      .map((line) => ({
        line,
        confidence: typeof line.meta?.confidence === "number" ? line.meta.confidence : 0.55,
        likely: typeof line.estimateRange?.likely === "number" ? line.estimateRange.likely : 0,
      }))
      .filter((row) => row.confidence < 0.6 && row.likely > 0)
      .sort((a, b) => b.likely * (1 - b.confidence) - a.likely * (1 - a.confidence))
      .slice(0, 5)
      .map((row) => `Confirm scope/quantity for: ${row.line.description}`);

    const merged: string[] = [];
    [...fromAnchors, ...fromLowConfidence].forEach((q) => {
      if (!merged.includes(q)) merged.push(q);
    });

    return merged.slice(0, 8);
  })();

  const eventDate = safeIsoDate(draft.planAssumptions.eventDate ?? null);

  const scheduleLines = (() => {
    if (!eventDate) {
      return [
        "- Pre-pro: ~2 weeks before event (quotes, permitting, confirmations)",
        "- Build/print: ~1 week before event",
        "- Pack: ~2 days before event",
        "- Show day: event date",
        "- Strike/returns: day after event",
      ];
    }
    return [
      `- Pre-pro sprint: ${isoAddDays(eventDate, -14)}`,
      `- Build/print sprint: ${isoAddDays(eventDate, -7)}`,
      `- Packing: ${isoAddDays(eventDate, -2)}`,
      `- Show day: ${eventDate}`,
      `- Strike/returns: ${isoAddDays(eventDate, 1)}`,
    ];
  })();

  const assumptions: string[] = [];
  if (venueCity) assumptions.push(`- Venue city: ${venueCity}`);
  if (eventDate) assumptions.push(`- Event date: ${eventDate}`);
  assumptions.push(
    `- Install/load-in days assumed: ${installDaysAssumed}${parsed.inferred.installDays == null ? " (not provided)" : ""}`,
  );
  assumptions.push(
    `- Crew count assumed: ${crewCountAssumed}${parsed.inferred.crewCount == null ? " (not provided)" : ""}`,
  );
  if (/\bdrape\b/i.test(parsed.input)) {
    assumptions.push(
      `- Pipe & drape LF assumed: ${drapeFeetAssumed}${parsed.inferred.drapeFeet == null ? " (not provided)" : ""}`,
    );
  }
  if (/\buplight\b/i.test(parsed.input)) {
    assumptions.push(
      `- Uplights assumed: ${uplightCountAssumed}${parsed.inferred.uplightCount == null ? " (not provided)" : ""}`,
    );
  }
  assumptions.push(`- Markup target: ${percentLabel(options.markupTarget)}`);
  assumptions.push(`- Contingency: ${percentLabel(options.contingencyPct)}`);
  assumptions.push(`- Travel/trucking included: ${options.includeTravelTrucking ? "yes" : "no"}`);

  const exclusionDefaults = [
    "- Venue labor/rigging/power drops (if required by venue)",
    "- Client-requested changes after approval (billed separately or absorbed into contingency, per agreement)",
    "- Taxes (unless specified)",
  ];

  const clientFacingLineItems = clientFacing.lines
    .map((line) => {
      const range = line.estimateRange;
      const cost = range ? `${formatMoney(range.low)}–${formatMoney(range.high)}` : formatMoney(computeBudgetSpellbookTotals([line]).finalRange.likely);
      return `- ${line.description}: ${cost}`;
    })
    .join("\n");

  return [
    "# Proposal / Budget Estimate",
    "",
    "## Scope summary",
    scopeSummaryLines.length ? scopeSummaryLines.map((s) => `- ${s}`).join("\n") : `- ${scopeFallback}`,
    "",
    "## Budget overview (Good / Better / Best)",
    "",
    "| Option | Variant | Low | Likely | High |",
    "|---|---|---:|---:|---:|",
    `| Good | ${good.label} | ${formatMoney(good.totals.finalRange.low)} | ${formatMoney(good.totals.finalRange.likely)} | ${formatMoney(good.totals.finalRange.high)} |`,
    `| Better | ${better.label} | ${formatMoney(better.totals.finalRange.low)} | ${formatMoney(better.totals.finalRange.likely)} | ${formatMoney(better.totals.finalRange.high)} |`,
    `| Best | ${best.label} | ${formatMoney(best.totals.finalRange.low)} | ${formatMoney(best.totals.finalRange.likely)} | ${formatMoney(best.totals.finalRange.high)} |`,
    "",
    "## Line items (client-facing)",
    clientFacingLineItems || "- (No line items generated yet.)",
    "",
    "## Assumptions",
    assumptions.join("\n"),
    "",
    "## Exclusions",
    exclusionDefaults.join("\n"),
    "",
    "## Risks / open questions",
    openQuestions.length ? openQuestions.map((q) => `- ${q}`).join("\n") : "- None (high confidence).",
    "",
    "## Schedule",
    scheduleLines.join("\n"),
    "",
    "## Next steps",
    openQuestions.length
      ? [
          "- Reply with answers to the open questions above to confirm pricing.",
          "- Approve the selected option to proceed with booking and procurement.",
        ].join("\n")
      : ["- Confirm the selected option.", "- Approve to proceed with booking and procurement."].join("\n"),
    "",
  ].join("\n");
}

export function buildRfpProposalPackMarkdown(params: {
  parsed: BudgetSpellbookParseResult;
  options: BudgetSpellbookGeneratorOptions;
  variants: BudgetSpellbookVariant[];
  planAssumptions?: PlanDraftAssumptions;
}): string {
  const { parsed, options, variants } = params;
  const venueCity = options.venueCity.trim();

  const good = variants.find((v) => v.id === "lean") ?? variants[0];
  const better = variants.find((v) => v.id === "producer-standard") ?? good;
  const best = variants.find((v) => v.id === "ops-ready") ?? better;
  const clientFacing = variants.find((v) => v.id === "client-facing") ?? better;
  const questionVariant = variants.find((v) => v.id === "producer-standard") ?? better;

  const goodTotals = computeBudgetSpellbookTotals(good.lines);
  const betterTotals = computeBudgetSpellbookTotals(better.lines);
  const bestTotals = computeBudgetSpellbookTotals(best.lines);

  const installDaysAssumed = parsed.inferred.installDays ?? 1;
  const crewCountAssumed = parsed.inferred.crewCount ?? (/\bcrew\b/i.test(parsed.input) ? 6 : 4);
  const drapeFeetAssumed = parsed.inferred.drapeFeet ?? (/\bdrape\b/i.test(parsed.input) ? 200 : 0);
  const uplightCountAssumed = parsed.inferred.uplightCount ?? (/\buplight\b/i.test(parsed.input) ? 12 : 0);

  const scopeSummaryLines = parsed.shoppingList.slice(0, 8);
  const scopeFallback = firstNonEmpty(parsed.input.split("\n")[0], "See line items below.");

  const openQuestions = buildOpenQuestions(parsed, options, questionVariant);

  const eventDate = safeIsoDate(params.planAssumptions?.eventDate ?? null);

  const scheduleLines = (() => {
    if (!eventDate) {
      return [
        "- Pre-pro: ~2 weeks before event (quotes, permitting, confirmations)",
        "- Build/print: ~1 week before event",
        "- Pack: ~2 days before event",
        "- Show day: event date",
        "- Strike/returns: day after event",
      ];
    }
    return [
      `- Pre-pro sprint: ${isoAddDays(eventDate, -14)}`,
      `- Build/print sprint: ${isoAddDays(eventDate, -7)}`,
      `- Packing: ${isoAddDays(eventDate, -2)}`,
      `- Show day: ${eventDate}`,
      `- Strike/returns: ${isoAddDays(eventDate, 1)}`,
    ];
  })();

  const assumptions: string[] = [];
  if (venueCity) assumptions.push(`- Venue city: ${venueCity}`);
  if (eventDate) assumptions.push(`- Event date: ${eventDate}`);
  assumptions.push(`- Install/load-in days assumed: ${installDaysAssumed}${parsed.inferred.installDays == null ? " (not provided)" : ""}`);
  assumptions.push(`- Crew count assumed: ${crewCountAssumed}${parsed.inferred.crewCount == null ? " (not provided)" : ""}`);
  if (/\bdrape\b/i.test(parsed.input)) assumptions.push(`- Pipe & drape LF assumed: ${drapeFeetAssumed}${parsed.inferred.drapeFeet == null ? " (not provided)" : ""}`);
  if (/\buplight\b/i.test(parsed.input)) assumptions.push(`- Uplights assumed: ${uplightCountAssumed}${parsed.inferred.uplightCount == null ? " (not provided)" : ""}`);
  assumptions.push(`- Markup target: ${percentLabel(options.markupTarget)}`);
  assumptions.push(`- Contingency: ${percentLabel(options.contingencyPct)}`);
  assumptions.push(`- Travel/trucking included: ${options.includeTravelTrucking ? "yes" : "no"}`);

  const exclusionDefaults = [
    "- Venue labor/rigging/power drops (if required by venue)",
    "- Client-requested changes after approval (billed separately or absorbed into contingency, per agreement)",
    "- Taxes (unless specified)",
  ];

  const clientFacingLineItems = clientFacing.lines
    .map((line) => {
      const range = line.estimateRange;
      const cost = range
        ? `${formatMoney(range.low)}–${formatMoney(range.high)}`
        : formatMoney(computeBudgetSpellbookTotals([line]).finalRange.likely);
      return `- ${line.description}: ${cost}`;
    })
    .join("\n");

  return [
    "# Proposal / Budget Estimate",
    "",
    "## Scope summary",
    scopeSummaryLines.length ? scopeSummaryLines.map((s) => `- ${s}`).join("\n") : `- ${scopeFallback}`,
    "",
    "## Budget overview (Good / Better / Best)",
    "",
    "| Option | Variant | Low | Likely | High |",
    "|---|---|---:|---:|---:|",
    `| Good | ${good.label} | ${formatMoney(goodTotals.finalRange.low)} | ${formatMoney(goodTotals.finalRange.likely)} | ${formatMoney(goodTotals.finalRange.high)} |`,
    `| Better | ${better.label} | ${formatMoney(betterTotals.finalRange.low)} | ${formatMoney(betterTotals.finalRange.likely)} | ${formatMoney(betterTotals.finalRange.high)} |`,
    `| Best | ${best.label} | ${formatMoney(bestTotals.finalRange.low)} | ${formatMoney(bestTotals.finalRange.likely)} | ${formatMoney(bestTotals.finalRange.high)} |`,
    "",
    "## Line items (client-facing)",
    clientFacingLineItems || "- (No line items generated yet.)",
    "",
    "## Assumptions",
    assumptions.join("\n"),
    "",
    "## Exclusions",
    exclusionDefaults.join("\n"),
    "",
    "## Risks / open questions",
    openQuestions.length ? openQuestions.map((q) => `- ${q}`).join("\n") : "- None (high confidence).",
    "",
    "## Schedule",
    scheduleLines.join("\n"),
    "",
    "## Next steps",
    openQuestions.length
      ? ["- Reply with answers to the open questions above to confirm pricing.", "- Approve the selected option to proceed with booking and procurement."].join("\n")
      : ["- Confirm the selected option.", "- Approve to proceed with booking and procurement."].join("\n"),
    "",
  ].join("\n");
}
