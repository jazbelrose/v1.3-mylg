import { describe, expect, it } from "vitest";
import { buildBudgetSpellbookVariants, computeBudgetSpellbookTotals, parseBudgetSpellbookInput } from "./budgetSpellbook";

describe("budgetSpellbook", () => {
  it("parses common producer phrasing and generates variants", () => {
    const parsed = parseBudgetSpellbookInput(
      "MB2 Tahoe, scenic + drape + labor, 2 days install, 25% markup\nPipe & drape 200', 12 uplights, 8 crew",
    );

    expect(parsed.inferred.installDays).toBe(2);
    expect(parsed.inferred.drapeFeet).toBe(200);
    expect(parsed.inferred.uplightCount).toBe(12);
    expect(parsed.inferred.crewCount).toBe(8);
    expect(parsed.inferred.hasScenic).toBe(true);

    const variants = buildBudgetSpellbookVariants(parsed, {
      eventType: "brand activation",
      venueCity: "Tahoe",
      crewModel: "internal",
      markupTarget: 0.25,
      contingencyPct: 0.1,
      includeTravelTrucking: true,
    });

    expect(variants.length).toBeGreaterThanOrEqual(5);
    expect(variants.find((v) => v.id === "producer-standard")?.lines.length).toBeGreaterThan(6);

    const totals = computeBudgetSpellbookTotals(variants[0].lines);
    expect(totals.budgeted).toBeGreaterThan(0);
    expect(totals.final).toBeGreaterThan(totals.budgeted);
  });
});

