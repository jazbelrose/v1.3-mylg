import { describe, expect, it } from "vitest";
import { buildDoablePlans } from "./doablePlanner";
import { buildSpellbookVariants, parseSpellbookInput } from "./taskSpellbook";

describe("taskSpellbook", () => {
  it("parses headings, durations, and intents", () => {
    const parsed = parseSpellbookInput(`# Calendar\n- polish pass (45m)\nintent: touch base w/ Leah\n\n## Backend:\n1. Fix API auth 2h`);
    expect(parsed.items.length).toBe(3);
    expect(parsed.items[0].cluster).toBe("Calendar");
    expect(parsed.items[0].durationMinutes).toBe(45);
    expect(parsed.items[1].kind).toBe("intent");
    expect(parsed.items[2].cluster).toBe("Backend");
    expect(parsed.items[2].durationMinutes).toBe(120);
  });

  it("builds variants with focus blocks", () => {
    const parsed = parseSpellbookInput(`Thumbnails:\n- cleanup\n- export\nCalendar:\n- week density pass`);
    const variants = buildSpellbookVariants(parsed);
    // Focus blocks are manual-only; Spellbook should not auto-generate them.
    expect(variants.length).toBe(1);
    expect(variants[0].id).toBe("split");
    expect(variants[0].focusBlocks.length).toBe(0);
  });
});

describe("doablePlanner", () => {
  it("packs drafts around busy blocks", () => {
    const plans = buildDoablePlans({
      drafts: [
        { id: "a", title: "A", durationMinutes: 60 },
        { id: "b", title: "B", durationMinutes: 30 },
      ],
      busy: [{ startMinutes: 9 * 60, endMinutes: 10 * 60 }],
    });

    const balanced = plans.find((p) => p.id === "balanced")!;
    expect(balanced.placements.length).toBeGreaterThan(0);
    // First placement should not start inside the busy window.
    expect(balanced.placements[0].startMinutes).toBeGreaterThanOrEqual(10 * 60);
  });
});

