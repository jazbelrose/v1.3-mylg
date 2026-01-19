import {
  BUDGET_SPELLBOOK_DEFAULTS_VERSION,
  BUDGET_SPELLBOOK_ENGINE_VERSION,
  BUDGET_SPELLBOOK_SCHEMA_VERSION,
  computeBudgetSpellbookConfidence,
  computeBudgetSpellbookRequiredAnchors,
  computeBudgetSpellbookTotals,
  type BudgetSpellbookConfidenceSummary,
  type BudgetSpellbookGeneratorOptions,
  type BudgetSpellbookParseResult,
  type BudgetSpellbookRequiredAnchor,
  type BudgetSpellbookVariant,
  type BudgetSpellbookVariantId,
} from "./budgetSpellbook";
import { buildPlanDraft, type PlanDraft, type PlanDraftAssumptions, type PlanDraftOutputs } from "./planDraft";

export type SpellbookDraftEnvelope = {
  schemaVersion: typeof BUDGET_SPELLBOOK_SCHEMA_VERSION;
  engineVersion: typeof BUDGET_SPELLBOOK_ENGINE_VERSION;
  defaultsVersion: typeof BUDGET_SPELLBOOK_DEFAULTS_VERSION;
  createdAtIso: string;

  parsed: BudgetSpellbookParseResult;
  options: BudgetSpellbookGeneratorOptions;
  outputs: PlanDraftOutputs;
  planAssumptions: PlanDraftAssumptions;
  assumptionConfidence: Record<keyof PlanDraftAssumptions, number>;

  requiredAnchors: BudgetSpellbookRequiredAnchor[];

  variants: Array<{
    id: BudgetSpellbookVariantId;
    label: string;
    hint: string;
    lines: BudgetSpellbookVariant["lines"];
    totals: ReturnType<typeof computeBudgetSpellbookTotals>;
    confidence: BudgetSpellbookConfidenceSummary;
  }>;

  selectedVariantId: BudgetSpellbookVariantId;
  planDraft: PlanDraft;
};

export function buildSpellbookDraftEnvelope(params: {
  parsed: BudgetSpellbookParseResult;
  options: BudgetSpellbookGeneratorOptions;
  outputs: PlanDraftOutputs;
  variants: BudgetSpellbookVariant[];
  selectedVariantId: BudgetSpellbookVariantId;
  planAssumptions: PlanDraftAssumptions;
  assumptionConfidence: Record<keyof PlanDraftAssumptions, number>;
}): SpellbookDraftEnvelope {
  const requiredAnchors = computeBudgetSpellbookRequiredAnchors({ parsed: params.parsed, options: params.options });

  const variants = params.variants.map((variant) => ({
    id: variant.id,
    label: variant.label,
    hint: variant.hint,
    lines: variant.lines,
    totals: computeBudgetSpellbookTotals(variant.lines),
    confidence: computeBudgetSpellbookConfidence({ lines: variant.lines, parsed: params.parsed, options: params.options }),
  }));

  const selectedVariant =
    params.variants.find((variant) => variant.id === params.selectedVariantId) ?? params.variants[0];

  const planDraft = buildPlanDraft({
    budgetLines: selectedVariant?.lines ?? [],
    assumptions: params.planAssumptions,
    confidence: params.assumptionConfidence,
  });

  return {
    schemaVersion: BUDGET_SPELLBOOK_SCHEMA_VERSION,
    engineVersion: BUDGET_SPELLBOOK_ENGINE_VERSION,
    defaultsVersion: BUDGET_SPELLBOOK_DEFAULTS_VERSION,
    createdAtIso: new Date().toISOString(),
    parsed: params.parsed,
    options: params.options,
    outputs: params.outputs,
    planAssumptions: params.planAssumptions,
    assumptionConfidence: params.assumptionConfidence,
    requiredAnchors,
    variants,
    selectedVariantId: selectedVariant?.id ?? params.selectedVariantId,
    planDraft,
  };
}

