/**
 * Task Spellbook Draft Envelope Types
 *
 * This file defines the "Draft Envelope" for Task Spellbook, parallel to Budget Spellbook's
 * spellbookDraft.ts. The key principle: preview output becomes the single source of truth for Apply.
 */

export const TASK_SPELLBOOK_SCHEMA_VERSION = 1 as const;
export const TASK_SPELLBOOK_ENGINE_VERSION = "task-spellbook@2.0.0";

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

export type TaskDraftKind = "task" | "break" | "buffer" | "intent" | "focusBlockSuggestion";

export type TimeOfDayHint = "morning" | "afternoon" | "evening" | null;

export type TaskSpellbookMode = "structured" | "narrative" | "timeline";

export type TaskDraftExplanation = {
  type: "matched_keyword" | "extracted_duration" | "inferred_date" | "inferred_owner" | "inferred_cluster" | "action_verb";
  value: string;
  confidence: number;
};

export type TaskDraftSourceSpan = {
  start: number;
  end: number;
};

/**
 * A single task candidate extracted from input.
 */
export type TaskDraftItem = {
  /** Stable ID derived from sourceSpan hash */
  id: string;
  /** Task title */
  title: string;
  /** Item kind - defaults to "task" but allows breaks/buffers/intents */
  kind: TaskDraftKind;
  /** Topic cluster (e.g., "Frontend", "Backend", "General") */
  cluster: string;
  /** Extracted/inferred tags */
  tags: string[];
  /** Duration in minutes (parsed or guessed) */
  durationMinutes: number | null;
  /** ISO date hint (YYYY-MM-DD) if detected */
  dateHint: string | null;
  /** Time of day hint */
  timeOfDayHint: TimeOfDayHint;
  /** Owner/assignee hint (e.g., "partner A", name before verb) */
  ownerHint: string | null;
  /** Key for merge grouping: ${cluster}|${kind}|${primaryTag} */
  mergeKey: string;
  /** Source span in original input */
  sourceSpan: TaskDraftSourceSpan;
  /** Confidence score 0-1 */
  confidence: number;
  /** Explanations for how values were derived */
  explanations: TaskDraftExplanation[];
  /** Original raw line/sentence */
  raw: string;
};

/**
 * Focus block draft metadata - inferred from items.
 */
export type FocusBlockDraft = {
  /** Title for the focus block */
  title: string;
  /** Primary cluster */
  cluster: string;
  /** Target date (ISO YYYY-MM-DD) */
  date: string;
  /** Window length in minutes */
  windowMinutes: number;
  /** Start time (HH:MM) */
  startLocalTime: string;
  /** End time (HH:MM) */
  endLocalTime: string;
  /** Warnings specific to focus block */
  warnings: TaskSpellbookWarning[];
};

export type TaskSpellbookWarningCode =
  | "mode_narrative_create_only"
  | "date_mismatch"
  | "too_many_tiny_tasks"
  | "truncated_items"
  | "low_confidence"
  | "overflow"
  | "break_buffer_preserved"
  | "merge_key_conflict";

export type TaskSpellbookWarning = {
  code: TaskSpellbookWarningCode;
  message: string;
};

export type TaskSpellbookStats = {
  /** Total items count */
  count: number;
  /** Task items only (excludes breaks/buffers) */
  taskCount: number;
  /** Break/buffer count */
  breakBufferCount: number;
  /** Total duration guess in minutes */
  totalDurationGuess: number;
  /** Average confidence */
  avgConfidence: number;
  /** Detected clusters */
  clusters: string[];
};

/**
 * The full draft envelope for Task Spellbook.
 * Hard rule: Apply uses this envelope only. No recompute.
 */
export type TaskSpellbookDraft = {
  /** Schema version for forward compatibility */
  schemaVersion: typeof TASK_SPELLBOOK_SCHEMA_VERSION;
  /** Engine version for debugging */
  engineVersion: typeof TASK_SPELLBOOK_ENGINE_VERSION;
  /** ISO timestamp when draft was created */
  createdAtIso: string;
  /** Detected input mode */
  mode: TaskSpellbookMode;
  /** All extracted task candidates */
  items: TaskDraftItem[];
  /** Focus block draft (single for V2; multi-block later) */
  focusBlock: FocusBlockDraft;
  /** Top-level warnings */
  warnings: TaskSpellbookWarning[];
  /** Aggregated statistics */
  stats: TaskSpellbookStats;
  /** Original input text for reference */
  originalInput: string;
  /** Selected date (user-provided or anchor date) */
  selectedDate: string;
};

// ---------------------------------------------------------------------------
// Apply Mode Types
// ---------------------------------------------------------------------------

export type TaskSpellbookApplyMode = "CREATE_ONLY" | "SCHEDULE_IN_WINDOW";

export type TaskSpellbookApplyOptions = {
  mode: TaskSpellbookApplyMode;
  /** Project ID */
  projectId: string;
  /** Target date for scheduling (YYYY-MM-DD) */
  targetDate: string;
};

// ---------------------------------------------------------------------------
// Packed Item Types (after packing algorithm runs)
// ---------------------------------------------------------------------------

export type PackedTaskItem = {
  /** Reference to draft item ID */
  draftItemId: string;
  /** Final title (may be merged) */
  title: string;
  /** Kind preserved from draft */
  kind: TaskDraftKind;
  /** Final planned minutes */
  plannedMinutes: number;
  /** Order within focus block */
  order: number;
  /** Cluster */
  cluster: string;
  /** Tags */
  tags: string[];
  /** MergeKey used */
  mergeKey: string;
  /** Was this item merged with others? */
  wasMerged: boolean;
  /** IDs of items merged into this one */
  mergedFromIds: string[];
};

export type PackedFocusBlock = {
  /** Draft focus block reference */
  draft: FocusBlockDraft;
  /** Packed children */
  children: PackedTaskItem[];
  /** Packing warnings */
  packingWarnings: TaskSpellbookWarning[];
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Generate a stable ID from source span using FNV-1a hash.
 */
export function generateDraftItemId(sourceSpan: TaskDraftSourceSpan, title: string): string {
  const input = `${sourceSpan.start}:${sourceSpan.end}:${title}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `draft-${(hash >>> 0).toString(36)}`;
}

/**
 * Build a merge key from cluster, kind, and primary tag.
 */
export function buildMergeKey(cluster: string, kind: TaskDraftKind, tags: string[]): string {
  const primaryTag = tags[0] ?? "none";
  return `${cluster}|${kind}|${primaryTag}`;
}

/**
 * Compute statistics from draft items.
 */
export function computeDraftStats(items: TaskDraftItem[]): TaskSpellbookStats {
  const taskItems = items.filter((item) => item.kind === "task" || item.kind === "intent");
  const breakBufferItems = items.filter((item) => item.kind === "break" || item.kind === "buffer");
  const clusters = [...new Set(items.map((item) => item.cluster).filter(Boolean))];
  const totalDuration = items.reduce((sum, item) => sum + (item.durationMinutes ?? 30), 0);
  const avgConfidence = items.length > 0
    ? items.reduce((sum, item) => sum + item.confidence, 0) / items.length
    : 0;

  return {
    count: items.length,
    taskCount: taskItems.length,
    breakBufferCount: breakBufferItems.length,
    totalDurationGuess: totalDuration,
    avgConfidence,
    clusters,
  };
}

/**
 * Infer focus block metadata from items.
 */
export function inferFocusBlockMetadata(
  items: TaskDraftItem[],
  selectedDate: string,
  windowMinutes: number,
  startLocalTime: string,
  endLocalTime: string,
): FocusBlockDraft {
  const warnings: TaskSpellbookWarning[] = [];

  // Find most common cluster among task items
  const clusterCounts = new Map<string, number>();
  items.forEach((item) => {
    if (item.kind !== "task" && item.kind !== "intent") return;
    const cluster = item.cluster?.trim() || "General";
    clusterCounts.set(cluster, (clusterCounts.get(cluster) ?? 0) + 1);
  });

  const sortedClusters = [...clusterCounts.entries()].sort((a, b) => b[1] - a[1]);
  const bestCluster = sortedClusters[0]?.[0] ?? "General";

  // Build title from cluster
  const title = bestCluster && bestCluster !== "General"
    ? `${bestCluster}: Focus Block`
    : "Focus Block";

  // Check if any items have date hints that differ from selected date
  const mismatchedDates = items.filter(
    (item) => item.dateHint && item.dateHint !== selectedDate
  );
  if (mismatchedDates.length > 0) {
    warnings.push({
      code: "date_mismatch",
      message: `${mismatchedDates.length} item(s) have dates different from selected day`,
    });
  }

  return {
    title,
    cluster: bestCluster,
    date: selectedDate,
    windowMinutes,
    startLocalTime,
    endLocalTime,
    warnings,
  };
}

/**
 * Check if a TaskDraftKind should never be merged.
 */
export function isNonMergeable(kind: TaskDraftKind): boolean {
  return kind === "break" || kind === "buffer";
}

/**
 * Default apply mode based on detected input mode.
 */
export function getDefaultApplyMode(mode: TaskSpellbookMode): TaskSpellbookApplyMode {
  if (mode === "narrative" || mode === "timeline") {
    return "CREATE_ONLY";
  }
  return "SCHEDULE_IN_WINDOW";
}
