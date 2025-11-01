export interface MoodboardAuditDecision {
  /** Whether the moodboard experience should merge into the shared canvas. */
  migrateToCanvas: boolean;
  /** Features that block migration today. */
  blockers: string[];
  /** Additional implementation notes. */
  notes: string[];
}

export const moodboardAuditDecision: MoodboardAuditDecision = {
  migrateToCanvas: false,
  blockers: [
    "Palette quick-toggle logic lives in the dedicated moodboard store and has no analogue in the Fabric canvas",
    "Sticker z-ordering relies on moodboard-specific drag/drop affordances and persistence",
    "Theming variables (brand gradients, overlay tints) diverge from the canvas surface and require design parity work",
  ],
  notes: [
    "Keep the moodboard route in place until canvas tooling supports palette switching, sticker layering semantics, and theme tokens",
    "Revisit migration after the Fabric stage exposes equivalent inspector controls and serialization hooks",
  ],
};

