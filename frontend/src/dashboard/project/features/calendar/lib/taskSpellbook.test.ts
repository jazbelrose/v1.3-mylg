import { describe, expect, it } from "vitest";
import { buildDoablePlans } from "./doablePlanner";
import {
  buildSpellbookVariants,
  parseSpellbookInput,
  detectInputMode,
  parseNarrativeToCandidates,
  parseStructuredToDraftItems,
  buildTaskSpellbookDraft,
} from "./taskSpellbook";

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
    expect(variants.length).toBe(4);
    expect(variants[0].id).toBe("lean");
    expect(variants[0].focusBlocks.length).toBe(1);
    expect(variants[1].id).toBe("producer-standard");
    expect(variants[1].focusBlocks.length).toBe(1);
  });
});

describe("input mode detection", () => {
  it("detects structured mode for bullet lists", () => {
    const mode = detectInputMode("- Task one\n- Task two\n- Task three");
    expect(mode).toBe("structured");
  });

  it("detects structured mode for numbered lists", () => {
    const mode = detectInputMode("1. First task\n2. Second task\n3. Third task");
    expect(mode).toBe("structured");
  });

  it("detects structured mode for checkbox lists", () => {
    const mode = detectInputMode("[ ] Do this\n[x] Already done\n[ ] Do that");
    expect(mode).toBe("structured");
  });

  it("detects timeline mode for date anchors", () => {
    const mode = detectInputMode("Yesterday we worked on the logo. Today finishing the deck.");
    expect(mode).toBe("timeline");
  });

  it("detects timeline mode for explicit dates", () => {
    const mode = detectInputMode("Jan 15 meeting with client. Jan 16 review feedback.");
    expect(mode).toBe("timeline");
  });

  it("detects narrative mode for paragraphs without dates", () => {
    const mode = detectInputMode("We worked on the logo design and partner A reviewed it. Then we fixed some bugs.");
    expect(mode).toBe("narrative");
  });
});

describe("narrative extraction", () => {
  it("extracts task candidates from narrative text", () => {
    const result = parseNarrativeToCandidates(
      "We worked on the logo design. Partner A fixed the API bug. Then we reviewed the PR.",
      { anchorDate: "2026-01-24" }
    );
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items.some(item => item.title.toLowerCase().includes("logo"))).toBe(true);
    expect(result.items.some(item => item.title.toLowerCase().includes("api"))).toBe(true);
  });

  it("extracts relative date hints", () => {
    const result = parseNarrativeToCandidates(
      "Yesterday I fixed the calendar bug.",
      { anchorDate: "2026-01-24" }
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].dateHint).toBe("2026-01-23");
  });

  it("extracts owner hints from partner patterns", () => {
    const result = parseNarrativeToCandidates(
      "Partner A worked on the slides.",
      { anchorDate: "2026-01-24" }
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].ownerHint).toBe("Partner A");
  });

  it("extracts duration from explicit patterns", () => {
    const result = parseNarrativeToCandidates(
      "We spent 2h on the design review.",
      { anchorDate: "2026-01-24" }
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].durationMinutes).toBe(120);
  });

  it("detects break keywords", () => {
    const result = parseStructuredToDraftItems(
      "- Work on slides\n- Lunch break\n- Continue work",
      { anchorDate: "2026-01-24" }
    );
    const breakItem = result.items.find(item => item.kind === "break");
    expect(breakItem).toBeDefined();
    expect(breakItem?.title.toLowerCase()).toContain("lunch");
  });
});

describe("draft envelope", () => {
  it("builds complete draft envelope with stats", () => {
    const draft = buildTaskSpellbookDraft(
      "- Fix API bug (45m)\n- Review PR (30m)\n- Deploy to staging",
      {
        anchorDate: "2026-01-24",
        windowMinutes: 180,
        startLocalTime: "10:00",
        endLocalTime: "13:00",
      }
    );
    expect(draft.schemaVersion).toBe(1);
    expect(draft.mode).toBe("structured");
    expect(draft.items.length).toBe(3);
    expect(draft.stats.count).toBe(3);
    expect(draft.stats.taskCount).toBeGreaterThanOrEqual(3);
    expect(draft.focusBlock.date).toBe("2026-01-24");
    expect(draft.focusBlock.windowMinutes).toBe(180);
  });

  it("sets narrative mode warning for narrative input", () => {
    const draft = buildTaskSpellbookDraft(
      "We worked on the logo and fixed some bugs in the calendar.",
      {
        anchorDate: "2026-01-24",
        windowMinutes: 180,
        startLocalTime: "10:00",
        endLocalTime: "13:00",
      }
    );
    expect(draft.mode).toBe("narrative");
    expect(draft.warnings.some(w => w.code === "mode_narrative_create_only")).toBe(true);
  });

  it("infers focus block metadata from items", () => {
    const draft = buildTaskSpellbookDraft(
      "Frontend:\n- Polish UI\n- Fix CSS\nBackend:\n- Deploy",
      {
        anchorDate: "2026-01-24",
        windowMinutes: 180,
        startLocalTime: "10:00",
        endLocalTime: "13:00",
      }
    );
    // Frontend has more items, so it should be the cluster
    expect(draft.focusBlock.cluster).toBe("Frontend");
    expect(draft.focusBlock.title).toBe("Frontend: Focus Block");
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
