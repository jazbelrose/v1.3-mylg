import {
  type TaskDraftItem,
  type TaskDraftKind,
  type TaskDraftExplanation,
  type TaskSpellbookMode,
  type TaskSpellbookDraft,
  type TaskSpellbookWarning,
  type TimeOfDayHint,
  TASK_SPELLBOOK_SCHEMA_VERSION,
  TASK_SPELLBOOK_ENGINE_VERSION,
  generateDraftItemId,
  buildMergeKey,
  computeDraftStats,
  inferFocusBlockMetadata,
} from "./taskSpellbookDraft";

// Re-export draft types for convenience
export type { TaskDraftItem, TaskDraftKind, TaskSpellbookMode, TaskSpellbookDraft };

// Legacy types for backward compatibility
export type SpellbookItemKind = "task" | "intent";

export type SpellbookDraftItem = {
  kind: SpellbookItemKind;
  raw: string;
  title: string;
  cluster: string;
  tags: string[];
  durationMinutes: number;
};

export type SpellbookParseResult = {
  items: SpellbookDraftItem[];
  clusters: string[];
  totalMinutes: number;
  /** Detected input mode */
  mode?: TaskSpellbookMode;
};

export type SpellbookVariantId = "lean" | "producer-standard" | "dispatch-ready" | "bugfix-sprint";

export type SpellbookFocusBlockDraft = {
  title: string;
  cluster: string;
  itemIndexes: number[];
  durationMinutes: number;
};

export type SpellbookVariant = {
  id: SpellbookVariantId;
  label: string;
  hint: string;
  items: SpellbookDraftItem[];
  focusBlocks: SpellbookFocusBlockDraft[];
};

const DEFAULT_CLUSTER = "General";

const TAG_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "Slides", re: /\b(slide|slides|deck|ppt|powerpoint|keynote)\b/i },
  { tag: "Calendar", re: /\b(calendar|schedule|week view|day view|ics|ical)\b/i },
  { tag: "Tasks", re: /\b(task|todo|checklist|inbox|triage)\b/i },
  { tag: "Budget", re: /\b(budget|invoice|estimate|pricing|cost)\b/i },
  { tag: "Backend", re: /\b(api|backend|lambda|ddb|dynamodb|db|server)\b/i },
  { tag: "Frontend", re: /\b(ui|frontend|react|css|layout|polish)\b/i },
  { tag: "Thumbnails", re: /\b(thumb|thumbnail|poster)\b/i },
  { tag: "GitHub", re: /\b(pr|pull request|github|merge|review)\b/i },
];

const DURATION_RULES: Array<{ minutes: number; re: RegExp }> = [
  { minutes: 20, re: /\b(copy|rename|labels?)\b/i },
  { minutes: 30, re: /\b(polish|cleanup|tidy|pass)\b/i },
  { minutes: 45, re: /\b(fix|debug|investigate|review)\b/i },
  { minutes: 60, re: /\b(implement|wire|hook up|connect)\b/i },
  { minutes: 90, re: /\b(refactor|rewrite|migration)\b/i },
  { minutes: 120, re: /\b(design|architecture|system)\b/i },
];

const clampMinutes = (value: number) => Math.max(15, Math.min(240, Math.round(value)));

const cleanLine = (line: string) =>
  line
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/^\s*\[(?: |x|X)\]\s+/, "")
    .trim();

const looksLikeHeader = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (trimmed.length <= 50 && /:$/.test(trimmed) && !/[.?!]$/.test(trimmed)) return true;
  return false;
};

const normalizeCluster = (headerLine: string) => {
  const trimmed = headerLine.trim();
  if (!trimmed) return DEFAULT_CLUSTER;
  const withoutHashes = trimmed.replace(/^#{1,6}\s+/, "");
  return withoutHashes.replace(/:$/, "").trim() || DEFAULT_CLUSTER;
};

const titleCaseFirst = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed[0].toUpperCase() + trimmed.slice(1);
};

const extractDurationMinutes = (line: string): { minutes: number | null; stripped: string } => {
  const trimmed = line.trim();
  const re =
    /(?:\(|\b)(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)(?:\)|\b)/i;
  const match = trimmed.match(re);
  if (!match) return { minutes: null, stripped: trimmed };
  const rawNumber = Number(match[1]);
  if (!Number.isFinite(rawNumber) || rawNumber <= 0) return { minutes: null, stripped: trimmed };
  const unit = match[2].toLowerCase();
  const minutes =
    unit.startsWith("h") ? Math.round(rawNumber * 60) : Math.round(rawNumber);
  const stripped = trimmed.replace(match[0], "").replace(/\s{2,}/g, " ").trim();
  return { minutes: clampMinutes(minutes), stripped };
};

const suggestDurationMinutes = (line: string): number => {
  const extracted = extractDurationMinutes(line);
  if (typeof extracted.minutes === "number") return extracted.minutes;
  for (const rule of DURATION_RULES) {
    if (rule.re.test(line)) return rule.minutes;
  }
  return 30;
};

const suggestTags = (line: string): string[] => {
  const tags: string[] = [];
  TAG_RULES.forEach((rule) => {
    if (rule.re.test(line)) tags.push(rule.tag);
  });
  return [...new Set(tags)];
};

const inferKind = (line: string): SpellbookItemKind => {
  const normalized = line.trim().toLowerCase();
  if (normalized.startsWith("intent:") || normalized.startsWith("intent -") || normalized.startsWith("[intent]")) {
    return "intent";
  }
  if (/\b(touch base|check in|follow up|triage|review prs?)\b/i.test(line)) {
    return "intent";
  }
  return "task";
};

const stripIntentPrefix = (line: string) =>
  line
    .replace(/^\s*\[intent\]\s*/i, "")
    .replace(/^\s*intent\s*[:\-]\s*/i, "")
    .trim();

const expandCompoundTitle = (title: string): string[] => {
  const normalized = title.trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/\s*(?:;|\/)\s*/g)
    .flatMap((chunk) => chunk.split(/\s+(?:and|&)\s+/i))
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [normalized];
  if (parts.length > 6) return [normalized];
  return parts;
};

const hasExplicitDuration = (line: string) =>
  /(?:\(|\b)(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)(?:\)|\b)/i.test(line);

const mostCommonCluster = (items: SpellbookDraftItem[]) => {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    if (item.kind !== "task") return;
    const cluster = item.cluster?.trim() || "";
    if (!cluster) return;
    counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_CLUSTER;
};

const buildSingleFocusBlock = (items: SpellbookDraftItem[]): SpellbookFocusBlockDraft[] => {
  const taskIndexes = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.kind === "task")
    .map(({ idx }) => idx);

  const durationMinutes = items
    .filter((item) => item.kind === "task")
    .reduce((sum, item) => sum + (item.durationMinutes || 0), 0);

  const cluster = mostCommonCluster(items);
  const title = cluster && cluster !== DEFAULT_CLUSTER ? `${cluster}: Focus Block` : "Focus Block";

  return [
    {
      title,
      cluster,
      itemIndexes: taskIndexes,
      durationMinutes: Math.max(30, Math.round(durationMinutes)),
    },
  ];
};

const withCompoundSplitting = (items: SpellbookDraftItem[]): SpellbookDraftItem[] => {
  const splitItems: SpellbookDraftItem[] = [];
  items.forEach((item) => {
    if (item.kind !== "task") {
      splitItems.push(item);
      return;
    }
    const expanded = expandCompoundTitle(item.title);
    if (expanded.length <= 1) {
      splitItems.push(item);
      return;
    }
    expanded.forEach((title) => {
      splitItems.push({ ...item, title });
    });
  });
  return splitItems;
};

export function parseSpellbookInput(
  input: string,
  options: { maxItems?: number } = {},
): SpellbookParseResult {
  const maxItems = options.maxItems ?? 60;
  const lines = (input ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());

  const items: SpellbookDraftItem[] = [];
  let currentCluster = DEFAULT_CLUSTER;

  for (const originalLine of lines) {
    if (items.length >= maxItems) break;
    const trimmed = originalLine.trim();
    if (!trimmed) continue;

    if (looksLikeHeader(trimmed)) {
      currentCluster = normalizeCluster(trimmed);
      continue;
    }

    const cleaned = cleanLine(trimmed);
    if (!cleaned) continue;

    if (looksLikeHeader(cleaned)) {
      currentCluster = normalizeCluster(cleaned);
      continue;
    }

    const kind = inferKind(cleaned);
    const withoutKind = kind === "intent" ? stripIntentPrefix(cleaned) : cleaned;
    const extracted = extractDurationMinutes(withoutKind);
    const durationMinutes = extracted.minutes ?? suggestDurationMinutes(withoutKind);
    const title = titleCaseFirst(extracted.stripped.replace(/\s{2,}/g, " ").trim());
    if (!title) continue;

    items.push({
      kind,
      raw: originalLine,
      title,
      cluster: currentCluster || DEFAULT_CLUSTER,
      tags: suggestTags(title),
      durationMinutes,
    });
  }

  const clusters = [...new Set(items.map((item) => item.cluster || DEFAULT_CLUSTER))];
  const totalMinutes = items.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
  return { items, clusters, totalMinutes };
}

export function buildSpellbookVariants(result: SpellbookParseResult): SpellbookVariant[] {
  const baseItems = result.items;

  const leanItems = baseItems.map((item) => {
    if (item.kind !== "task") return item;
    const explicit = hasExplicitDuration(item.raw);
    return {
      ...item,
      durationMinutes: explicit ? item.durationMinutes : 30,
      tags: [],
    };
  });

  const producerItems = withCompoundSplitting(baseItems);

  const dispatchItems: SpellbookDraftItem[] = (() => {
    const items = withCompoundSplitting(baseItems).map((item) => {
      if (item.kind !== "task") return item;
      return { ...item, durationMinutes: clampMinutes(item.durationMinutes + 10) };
    });
    const taskCount = items.filter((item) => item.kind === "task").length;
    if (taskCount === 0) return items;
    return [
      ...items,
      {
        kind: "task",
        raw: "buffer + handoff (30m)",
        title: "Buffer + handoff",
        cluster: "Handoff",
        tags: ["Dispatch"],
        durationMinutes: 30,
      },
    ];
  })();

  const bugfixItems: SpellbookDraftItem[] = (() => {
    const tasks = withCompoundSplitting(baseItems);
    const out: SpellbookDraftItem[] = [];
    let taskCounter = 0;
    tasks.forEach((item) => {
      if (item.kind !== "task") {
        out.push(item);
        return;
      }
      const tightened = clampMinutes(Math.min(60, Math.max(15, item.durationMinutes - 10)));
      out.push({ ...item, durationMinutes: tightened });
      taskCounter += 1;
      if (taskCounter % 2 === 0) {
        out.push({
          kind: "task",
          raw: "break (10m)",
          title: "Break",
          cluster: "Break",
          tags: [],
          durationMinutes: 15,
        });
      }
    });
    // Avoid trailing break if it would be the only/last item after last task.
    if (out.length > 0) {
      const last = out[out.length - 1];
      if (last.kind === "task" && last.title === "Break") {
        out.pop();
      }
    }
    return out;
  })();

  return [
    {
      id: "lean",
      label: "Lean",
      hint: "Just titles, quick durations",
      items: leanItems,
      focusBlocks: buildSingleFocusBlock(leanItems),
    },
    {
      id: "producer-standard",
      label: "Producer Standard",
      hint: "Clean clusters + realistic durations",
      items: producerItems,
      focusBlocks: buildSingleFocusBlock(producerItems),
    },
    {
      id: "dispatch-ready",
      label: "Dispatch-ready",
      hint: "Assignee hints + buffers + handoff",
      items: dispatchItems,
      focusBlocks: buildSingleFocusBlock(dispatchItems),
    },
    {
      id: "bugfix-sprint",
      label: "Bugfix sprint",
      hint: "Short chunks, more breaks, tighter durations",
      items: bugfixItems,
      focusBlocks: buildSingleFocusBlock(bugfixItems),
    },
  ];
}

// ---------------------------------------------------------------------------
// Narrative Extraction (V2)
// ---------------------------------------------------------------------------

/** Action verbs that indicate a task-like sentence */
const ACTION_VERBS = [
  "worked",
  "fixed",
  "reviewed",
  "bought",
  "met",
  "emailed",
  "shipped",
  "merged",
  "refactored",
  "designed",
  "planned",
  "called",
  "created",
  "updated",
  "deleted",
  "deployed",
  "tested",
  "built",
  "wrote",
  "sent",
  "received",
  "discussed",
  "scheduled",
  "completed",
  "finished",
  "started",
  "began",
  "implemented",
  "added",
  "removed",
  "changed",
  "modified",
  "debugged",
  "investigated",
  "researched",
  "analyzed",
  "organized",
  "prepared",
  "submitted",
  "approved",
  "rejected",
  "requested",
  "ordered",
  "delivered",
  "installed",
  "configured",
  "set up",
  "cleaned",
  "polished",
];

const ACTION_VERB_REGEX = new RegExp(`\\b(${ACTION_VERBS.join("|")})\\b`, "i");

/** Date patterns for timeline detection */
const DATE_ANCHOR_PATTERNS = [
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i,
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/,
  /\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/,
  /\b(yesterday|today|tomorrow)\b/i,
  /\b\d{1,2}:\d{2}\s*(am|pm)\b/i,
  /\b(morning|afternoon|evening)\b/i,
];

/** Time of day patterns */
const TIME_OF_DAY_PATTERNS: Array<{ hint: TimeOfDayHint; re: RegExp }> = [
  { hint: "morning", re: /\b(morning|am|a\.m\.|before noon)\b/i },
  { hint: "afternoon", re: /\b(afternoon|pm|p\.m\.|after noon)\b/i },
  { hint: "evening", re: /\b(evening|night|late)\b/i },
];

/** Relative date keywords */
const RELATIVE_DATE_KEYWORDS: Record<string, number> = {
  yesterday: -1,
  today: 0,
  tomorrow: 1,
};

/**
 * Detect the input mode based on content heuristics.
 */
export function detectInputMode(input: string): TaskSpellbookMode {
  const lines = (input ?? "").split(/\r?\n/).filter((line) => line.trim());

  // Check for structured format: lines starting with -, *, 1., [ ]
  const structuredLineCount = lines.filter((line) =>
    /^\s*[-*•]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*\[(?: |x|X)\]\s+/.test(line)
  ).length;

  if (structuredLineCount >= lines.length * 0.5 && structuredLineCount >= 2) {
    return "structured";
  }

  // Check for timeline format: contains date anchors
  const hasDateAnchors = DATE_ANCHOR_PATTERNS.some((pattern) => pattern.test(input));
  if (hasDateAnchors) {
    return "timeline";
  }

  // Default to narrative
  return "narrative";
}

/**
 * Parse a relative date keyword to an ISO date string.
 */
function parseRelativeDate(keyword: string, anchorDate: string): string | null {
  const normalized = keyword.toLowerCase().trim();
  const delta = RELATIVE_DATE_KEYWORDS[normalized];
  if (delta === undefined) return null;

  const [y, m, d] = anchorDate.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + delta);
  const yyyy = String(base.getUTCFullYear());
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Extract date hint from text.
 */
function extractDateHint(text: string, anchorDate: string): { dateHint: string | null; explanation: TaskDraftExplanation | null } {
  // Check relative dates first
  for (const [keyword, _delta] of Object.entries(RELATIVE_DATE_KEYWORDS)) {
    const re = new RegExp(`\\b${keyword}\\b`, "i");
    if (re.test(text)) {
      const dateHint = parseRelativeDate(keyword, anchorDate);
      if (dateHint) {
        return {
          dateHint,
          explanation: {
            type: "inferred_date",
            value: `"${keyword}" → ${dateHint}`,
            confidence: 0.8,
          },
        };
      }
    }
  }

  // Check explicit date patterns
  const isoMatch = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const dateHint = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return {
      dateHint,
      explanation: {
        type: "inferred_date",
        value: dateHint,
        confidence: 0.95,
      },
    };
  }

  return { dateHint: null, explanation: null };
}

/**
 * Extract time of day hint from text.
 */
function extractTimeOfDayHint(text: string): { hint: TimeOfDayHint; explanation: TaskDraftExplanation | null } {
  for (const pattern of TIME_OF_DAY_PATTERNS) {
    if (pattern.re.test(text)) {
      return {
        hint: pattern.hint,
        explanation: {
          type: "matched_keyword",
          value: `time of day: ${pattern.hint}`,
          confidence: 0.7,
        },
      };
    }
  }
  return { hint: null, explanation: null };
}

/**
 * Extract owner/assignee hint from text.
 * Looks for patterns like "Partner A did...", "John worked on..."
 */
function extractOwnerHint(text: string): { ownerHint: string | null; explanation: TaskDraftExplanation | null } {
  // Pattern: "Partner A/B" or "partner 1/2"
  const partnerMatch = text.match(/\b(partner\s+[a-z0-9]+)\b/i);
  if (partnerMatch) {
    return {
      ownerHint: partnerMatch[1],
      explanation: {
        type: "inferred_owner",
        value: partnerMatch[1],
        confidence: 0.75,
      },
    };
  }

  // Pattern: Capitalized name before action verb
  const nameBeforeVerbMatch = text.match(/\b([A-Z][a-z]+)\s+(?:worked|fixed|reviewed|met|emailed|called|created|updated|designed|planned)\b/);
  if (nameBeforeVerbMatch) {
    return {
      ownerHint: nameBeforeVerbMatch[1],
      explanation: {
        type: "inferred_owner",
        value: nameBeforeVerbMatch[1],
        confidence: 0.6,
      },
    };
  }

  return { ownerHint: null, explanation: null };
}

/**
 * Infer kind from text, including break/buffer detection.
 */
function inferDraftKind(text: string): { kind: TaskDraftKind; explanation: TaskDraftExplanation | null } {
  const normalized = text.trim().toLowerCase();

  // Check for break
  if (/\b(break|lunch|coffee|rest)\b/i.test(text)) {
    return {
      kind: "break",
      explanation: {
        type: "matched_keyword",
        value: "break keyword detected",
        confidence: 0.9,
      },
    };
  }

  // Check for buffer
  if (/\b(buffer|slack|padding|handoff)\b/i.test(text)) {
    return {
      kind: "buffer",
      explanation: {
        type: "matched_keyword",
        value: "buffer keyword detected",
        confidence: 0.85,
      },
    };
  }

  // Check for intent
  if (
    normalized.startsWith("intent:") ||
    normalized.startsWith("intent -") ||
    normalized.startsWith("[intent]")
  ) {
    return {
      kind: "intent",
      explanation: {
        type: "matched_keyword",
        value: "intent prefix detected",
        confidence: 0.95,
      },
    };
  }

  if (/\b(touch base|check in|follow up|triage|review prs?)\b/i.test(text)) {
    return {
      kind: "intent",
      explanation: {
        type: "matched_keyword",
        value: "intent keyword detected",
        confidence: 0.7,
      },
    };
  }

  return { kind: "task", explanation: null };
}

/**
 * Split text into sentences using basic regex.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space/newline
  const sentences = text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  return sentences;
}

/**
 * Check if a sentence looks like a task candidate.
 */
function looksLikeTaskCandidate(sentence: string): boolean {
  // Has action verb?
  if (ACTION_VERB_REGEX.test(sentence)) {
    return true;
  }

  // Has known tag keywords?
  for (const rule of TAG_RULES) {
    if (rule.re.test(sentence)) {
      return true;
    }
  }

  return false;
}

/**
 * Parse narrative text into task candidates.
 */
export function parseNarrativeToCandidates(
  text: string,
  options: {
    maxItems?: number;
    anchorDate: string;
  },
): { items: TaskDraftItem[]; warnings: TaskSpellbookWarning[] } {
  const maxItems = options.maxItems ?? 60;
  const warnings: TaskSpellbookWarning[] = [];

  const sentences = splitIntoSentences(text);
  const items: TaskDraftItem[] = [];

  let charOffset = 0;

  for (const sentence of sentences) {
    if (items.length >= maxItems) {
      warnings.push({
        code: "truncated_items",
        message: `Input truncated at ${maxItems} items`,
      });
      break;
    }

    // Find position in original text
    const start = text.indexOf(sentence, charOffset);
    const end = start >= 0 ? start + sentence.length : charOffset + sentence.length;
    charOffset = end;

    // Skip if doesn't look like a task
    if (!looksLikeTaskCandidate(sentence)) {
      continue;
    }

    const explanations: TaskDraftExplanation[] = [];

    // Check for action verb match
    const verbMatch = sentence.match(ACTION_VERB_REGEX);
    if (verbMatch) {
      explanations.push({
        type: "action_verb",
        value: verbMatch[1].toLowerCase(),
        confidence: 0.7,
      });
    }

    // Extract metadata
    const { kind, explanation: kindExplanation } = inferDraftKind(sentence);
    if (kindExplanation) explanations.push(kindExplanation);

    const { dateHint, explanation: dateExplanation } = extractDateHint(sentence, options.anchorDate);
    if (dateExplanation) explanations.push(dateExplanation);

    const { hint: timeOfDayHint, explanation: timeExplanation } = extractTimeOfDayHint(sentence);
    if (timeExplanation) explanations.push(timeExplanation);

    const { ownerHint, explanation: ownerExplanation } = extractOwnerHint(sentence);
    if (ownerExplanation) explanations.push(ownerExplanation);

    // Extract duration
    const extracted = extractDurationMinutes(sentence);
    const durationMinutes = extracted.minutes ?? suggestDurationMinutes(sentence);
    if (extracted.minutes) {
      explanations.push({
        type: "extracted_duration",
        value: `${extracted.minutes}m`,
        confidence: 0.9,
      });
    }

    // Extract tags and cluster
    const tags = suggestTags(sentence);
    const cluster = tags[0] || DEFAULT_CLUSTER;
    if (tags.length > 0) {
      explanations.push({
        type: "inferred_cluster",
        value: cluster,
        confidence: 0.6,
      });
    }

    // Build title from sentence (clean it up)
    const title = titleCaseFirst(extracted.stripped.replace(/\s{2,}/g, " ").trim());
    if (!title || title.length < 3) continue;

    const sourceSpan = { start, end };
    const mergeKey = buildMergeKey(cluster, kind, tags);
    const confidence = explanations.reduce((sum, e) => sum + e.confidence, 0) / Math.max(1, explanations.length);

    items.push({
      id: generateDraftItemId(sourceSpan, title),
      title,
      kind,
      cluster,
      tags,
      durationMinutes,
      dateHint,
      timeOfDayHint,
      ownerHint,
      mergeKey,
      sourceSpan,
      confidence: Math.min(1, confidence),
      explanations,
      raw: sentence,
    });
  }

  return { items, warnings };
}

/**
 * Parse structured input (lists) into task draft items.
 */
export function parseStructuredToDraftItems(
  input: string,
  options: {
    maxItems?: number;
    anchorDate: string;
  },
): { items: TaskDraftItem[]; warnings: TaskSpellbookWarning[] } {
  const maxItems = options.maxItems ?? 60;
  const warnings: TaskSpellbookWarning[] = [];
  const lines = (input ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());

  const items: TaskDraftItem[] = [];
  let currentCluster = DEFAULT_CLUSTER;
  let charOffset = 0;

  for (const originalLine of lines) {
    const lineStart = input.indexOf(originalLine, charOffset);
    const lineEnd = lineStart >= 0 ? lineStart + originalLine.length : charOffset + originalLine.length;
    charOffset = lineEnd;

    if (items.length >= maxItems) {
      warnings.push({
        code: "truncated_items",
        message: `Input truncated at ${maxItems} items`,
      });
      break;
    }

    const trimmed = originalLine.trim();
    if (!trimmed) continue;

    if (looksLikeHeader(trimmed)) {
      currentCluster = normalizeCluster(trimmed);
      continue;
    }

    const cleaned = cleanLine(trimmed);
    if (!cleaned) continue;

    if (looksLikeHeader(cleaned)) {
      currentCluster = normalizeCluster(cleaned);
      continue;
    }

    const explanations: TaskDraftExplanation[] = [];

    const { kind, explanation: kindExplanation } = inferDraftKind(cleaned);
    if (kindExplanation) explanations.push(kindExplanation);

    const withoutKind = kind === "intent" ? stripIntentPrefix(cleaned) : cleaned;

    const { dateHint, explanation: dateExplanation } = extractDateHint(withoutKind, options.anchorDate);
    if (dateExplanation) explanations.push(dateExplanation);

    const { hint: timeOfDayHint, explanation: timeExplanation } = extractTimeOfDayHint(withoutKind);
    if (timeExplanation) explanations.push(timeExplanation);

    const { ownerHint, explanation: ownerExplanation } = extractOwnerHint(withoutKind);
    if (ownerExplanation) explanations.push(ownerExplanation);

    const extracted = extractDurationMinutes(withoutKind);
    const durationMinutes = extracted.minutes ?? suggestDurationMinutes(withoutKind);
    if (extracted.minutes) {
      explanations.push({
        type: "extracted_duration",
        value: `${extracted.minutes}m`,
        confidence: 0.9,
      });
    }

    const title = titleCaseFirst(extracted.stripped.replace(/\s{2,}/g, " ").trim());
    if (!title) continue;

    const tags = suggestTags(title);
    const cluster = currentCluster || DEFAULT_CLUSTER;
    if (tags.length > 0) {
      explanations.push({
        type: "inferred_cluster",
        value: tags[0],
        confidence: 0.6,
      });
    }

    const sourceSpan = { start: lineStart >= 0 ? lineStart : 0, end: lineEnd };
    const mergeKey = buildMergeKey(cluster, kind, tags);
    const confidence = Math.max(0.5, explanations.reduce((sum, e) => sum + e.confidence, 0) / Math.max(1, explanations.length));

    items.push({
      id: generateDraftItemId(sourceSpan, title),
      title,
      kind,
      cluster,
      tags,
      durationMinutes,
      dateHint,
      timeOfDayHint,
      ownerHint,
      mergeKey,
      sourceSpan,
      confidence,
      explanations,
      raw: originalLine,
    });
  }

  return { items, warnings };
}

/**
 * Build a full TaskSpellbookDraft envelope from input.
 */
export function buildTaskSpellbookDraft(
  input: string,
  options: {
    anchorDate: string;
    maxItems?: number;
    focusBlockWindowId?: string;
    startLocalTime?: string;
    endLocalTime?: string;
    windowMinutes?: number;
  },
): TaskSpellbookDraft {
  const mode = detectInputMode(input);
  const warnings: TaskSpellbookWarning[] = [];

  // Parse based on mode
  let parseResult: { items: TaskDraftItem[]; warnings: TaskSpellbookWarning[] };
  if (mode === "narrative") {
    parseResult = parseNarrativeToCandidates(input, {
      maxItems: options.maxItems,
      anchorDate: options.anchorDate,
    });
    warnings.push({
      code: "mode_narrative_create_only",
      message: "Narrative mode: defaulting to Create-only",
    });
  } else {
    parseResult = parseStructuredToDraftItems(input, {
      maxItems: options.maxItems,
      anchorDate: options.anchorDate,
    });
  }

  warnings.push(...parseResult.warnings);

  const stats = computeDraftStats(parseResult.items);
  const focusBlock = inferFocusBlockMetadata(
    parseResult.items,
    options.anchorDate,
    options.windowMinutes ?? 180,
    options.startLocalTime ?? "10:00",
    options.endLocalTime ?? "13:00",
  );
  warnings.push(...focusBlock.warnings);

  return {
    schemaVersion: TASK_SPELLBOOK_SCHEMA_VERSION,
    engineVersion: TASK_SPELLBOOK_ENGINE_VERSION,
    createdAtIso: new Date().toISOString(),
    mode,
    items: parseResult.items,
    focusBlock,
    warnings,
    stats,
    originalInput: input,
    selectedDate: options.anchorDate,
  };
}

/**
 * Convert TaskDraftItem[] to legacy SpellbookDraftItem[] for backward compatibility.
 */
export function draftItemsToLegacy(items: TaskDraftItem[]): SpellbookDraftItem[] {
  return items.map((item) => ({
    kind: item.kind === "task" || item.kind === "intent" ? item.kind : "task",
    raw: item.raw,
    title: item.title,
    cluster: item.cluster,
    tags: item.tags,
    durationMinutes: item.durationMinutes ?? 30,
  }));
}
