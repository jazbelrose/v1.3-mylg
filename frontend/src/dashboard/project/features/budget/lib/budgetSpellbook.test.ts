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

describe("recognizedItems extraction", () => {
  it("extracts line items with currency-prefixed costs ($X,XXX format)", () => {
    const parsed = parseBudgetSpellbookInput(
      "Step and Repeat Photo Opportunity $3,138\nScenic Build $6,500\nDrape rental - $1,200.00",
    );

    expect(parsed.hasStructuredInput).toBe(true);
    expect(parsed.recognizedItems.length).toBe(3);

    const stepAndRepeat = parsed.recognizedItems.find((i) => i.description.includes("Step and Repeat"));
    expect(stepAndRepeat).toBeDefined();
    expect(stepAndRepeat?.cost).toBe(3138);
    expect(stepAndRepeat?.source).toBe("user-provided");
    expect(stepAndRepeat?.confidence).toBeGreaterThanOrEqual(0.85);

    const scenicBuild = parsed.recognizedItems.find((i) => i.description.includes("Scenic Build"));
    expect(scenicBuild).toBeDefined();
    expect(scenicBuild?.cost).toBe(6500);
    expect(scenicBuild?.suggestedCategory).toBe("FABRICATION");

    const drape = parsed.recognizedItems.find((i) => i.description.toLowerCase().includes("drape"));
    expect(drape).toBeDefined();
    expect(drape?.cost).toBe(1200);
  });

  it("extracts line items with bare numbers (4+ digits without $ symbol)", () => {
    const parsed = parseBudgetSpellbookInput("Fabrication build 6500\nGraphics production 2400");

    expect(parsed.hasStructuredInput).toBe(true);
    expect(parsed.recognizedItems.length).toBe(2);

    const fab = parsed.recognizedItems.find((i) => i.description.toLowerCase().includes("fabrication"));
    expect(fab).toBeDefined();
    expect(fab?.cost).toBe(6500);
    expect(fab?.confidence).toBeLessThan(0.85); // Lower confidence for bare numbers

    const graphics = parsed.recognizedItems.find((i) => i.description.toLowerCase().includes("graphics"));
    expect(graphics).toBeDefined();
    expect(graphics?.cost).toBe(2400);
  });

  it("correctly infers categories from descriptions", () => {
    const parsed = parseBudgetSpellbookInput(
      "Scenic backdrop fabrication $5,000\nPipe and drape rental $1,800\nAV equipment package $3,200\nLighting uplights rental $900\nHotel and travel expenses $2,500",
    );

    expect(parsed.recognizedItems.length).toBeGreaterThanOrEqual(4);

    const scenic = parsed.recognizedItems.find((i) => i.description.toLowerCase().includes("scenic"));
    expect(scenic?.suggestedCategory).toBe("FABRICATION");

    const drape = parsed.recognizedItems.find((i) => i.description.toLowerCase().includes("drape"));
    expect(drape?.suggestedCategory).toBe("RENTALS");

    const av = parsed.recognizedItems.find((i) => i.description.toLowerCase().includes("av"));
    expect(av?.suggestedCategory).toBe("AUDIO-VISUAL");

    const travel = parsed.recognizedItems.find((i) => i.description.toLowerCase().includes("travel"));
    expect(travel?.suggestedCategory).toBe("TRAVEL");
  });

  it("handles mixed format input with both structured costs and keywords", () => {
    const parsed = parseBudgetSpellbookInput(
      "MB2 Tahoe event, 2 days install\nStep and Repeat $3,138\nScenic elements $6,500\n8 crew, 25% markup",
    );

    // Should extract both structured items AND infer from keywords
    expect(parsed.hasStructuredInput).toBe(true);
    expect(parsed.recognizedItems.length).toBe(2);
    expect(parsed.inferred.installDays).toBe(2);
    expect(parsed.inferred.crewCount).toBe(8);
  });

  it("includes user-provided items first in variant generation", () => {
    const parsed = parseBudgetSpellbookInput("Custom backdrop fabrication $8,000\nSpecial lighting package $2,500");

    const variants = buildBudgetSpellbookVariants(parsed, {
      eventType: "brand activation",
      venueCity: "NYC",
      crewModel: "internal",
      markupTarget: 0.25,
      contingencyPct: 0.1,
      includeTravelTrucking: false,
    });

    const producerStandard = variants.find((v) => v.id === "producer-standard");
    expect(producerStandard).toBeDefined();

    // User-provided items should appear first
    const userItems = producerStandard!.lines.filter((l) => l.packageLabel === "User Provided");
    expect(userItems.length).toBe(2);

    // Check they have correct costs
    const backdrop = userItems.find((l) => l.description.includes("BACKDROP"));
    expect(backdrop?.itemBudgetedCost).toBe(8000);

    const lighting = userItems.find((l) => l.description.includes("LIGHTING"));
    expect(lighting?.itemBudgetedCost).toBe(2500);
  });

  it("respects included/excluded state for recognized items", () => {
    const parsed = parseBudgetSpellbookInput("Item A $1,000\nItem B $2,000\nItem C $3,000");

    expect(parsed.recognizedItems.length).toBe(3);
    expect(parsed.recognizedItems.every((i) => i.included)).toBe(true);

    // Simulate excluding an item
    const modifiedParsed = {
      ...parsed,
      recognizedItems: parsed.recognizedItems.map((item, idx) => ({
        ...item,
        included: idx !== 1, // Exclude "Item B"
      })),
    };

    const variants = buildBudgetSpellbookVariants(modifiedParsed, {
      eventType: "corporate",
      venueCity: "",
      crewModel: "internal",
      markupTarget: 0.25,
      contingencyPct: 0.1,
      includeTravelTrucking: false,
    });

    const producerStandard = variants.find((v) => v.id === "producer-standard");
    const userItems = producerStandard!.lines.filter((l) => l.packageLabel === "User Provided");

    // Only 2 items should be included (A and C)
    expect(userItems.length).toBe(2);
    expect(userItems.find((l) => l.description.includes("ITEM B"))).toBeUndefined();
  });

  it("deduplicates recognized items with similar descriptions", () => {
    const parsed = parseBudgetSpellbookInput(
      "Scenic Build $6,500\nScenic build fabrication $6,500\nDrape $1,200",
    );

    // Should dedupe the two scenic items
    expect(parsed.recognizedItems.length).toBeLessThanOrEqual(3);
    const scenicItems = parsed.recognizedItems.filter((i) =>
      i.description.toLowerCase().includes("scenic"),
    );
    expect(scenicItems.length).toBeLessThanOrEqual(2);
  });

  it("returns hasStructuredInput=false when no costs are found", () => {
    const parsed = parseBudgetSpellbookInput(
      "scenic + drape + labor, 2 days install, 25% markup\nPipe & drape, 12 uplights, 8 crew",
    );

    expect(parsed.hasStructuredInput).toBe(false);
    expect(parsed.recognizedItems.length).toBe(0);
    // But should still extract inferred values
    expect(parsed.inferred.installDays).toBe(2);
    expect(parsed.inferred.crewCount).toBe(8);
  });

  it("handles comma-separated thousands in costs", () => {
    const parsed = parseBudgetSpellbookInput("Large scenic installation $12,500\nMajor production $125,000");

    expect(parsed.recognizedItems.length).toBe(2);

    const scenic = parsed.recognizedItems.find((i) => i.description.toLowerCase().includes("scenic"));
    expect(scenic?.cost).toBe(12500);

    const production = parsed.recognizedItems.find((i) => i.description.toLowerCase().includes("production"));
    expect(production?.cost).toBe(125000);
  });
});

