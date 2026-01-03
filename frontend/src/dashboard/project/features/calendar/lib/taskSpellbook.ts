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
};

export type SpellbookVariantId = "split" | "blocks4" | "focus2";

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

const groupIntoBlocks = (
  items: SpellbookDraftItem[],
  blockCount: number,
): SpellbookFocusBlockDraft[] => {
  const byCluster = new Map<string, number[]>();
  items.forEach((item, idx) => {
    if (item.kind !== "task") return;
    const key = item.cluster || DEFAULT_CLUSTER;
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key)!.push(idx);
  });

  const clusterEntries = [...byCluster.entries()].sort((a, b) => b[1].length - a[1].length);
  const blocks: SpellbookFocusBlockDraft[] = [];

  for (const [cluster, indexes] of clusterEntries) {
    if (blocks.length >= blockCount) break;
    const durationMinutes = indexes.reduce((sum, idx) => sum + items[idx].durationMinutes, 0);
    blocks.push({
      title: cluster === DEFAULT_CLUSTER ? "Focus block" : `${cluster}: focus block`,
      cluster,
      itemIndexes: indexes,
      durationMinutes: clampMinutes(durationMinutes || 30),
    });
  }

  if (blocks.length < blockCount) {
    const remainingIndexes: number[] = [];
    items.forEach((item, idx) => {
      if (item.kind !== "task") return;
      if (blocks.some((block) => block.itemIndexes.includes(idx))) return;
      remainingIndexes.push(idx);
    });

    while (blocks.length < blockCount && remainingIndexes.length > 0) {
      const chunk = remainingIndexes.splice(0, Math.ceil(remainingIndexes.length / (blockCount - blocks.length)));
      const durationMinutes = chunk.reduce((sum, idx) => sum + items[idx].durationMinutes, 0);
      blocks.push({
        title: "Focus block",
        cluster: DEFAULT_CLUSTER,
        itemIndexes: chunk,
        durationMinutes: clampMinutes(durationMinutes || 30),
      });
    }
  }

  return blocks.filter((block) => block.itemIndexes.length > 0);
};

export function buildSpellbookVariants(result: SpellbookParseResult): SpellbookVariant[] {
  const baseItems = result.items;
  const splitItems: SpellbookDraftItem[] = [];
  baseItems.forEach((item) => {
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

  const blocks4 = groupIntoBlocks(baseItems, 4);
  const focus2 = groupIntoBlocks(baseItems, 2);

  return [
    {
      id: "split",
      label: `Split into ${splitItems.length}`,
      hint: "Clean titles, durations, clusters",
      items: splitItems,
      focusBlocks: [],
    },
    {
      id: "blocks4",
      label: `Compress into ${Math.max(blocks4.length, 1)} blocks`,
      hint: "Reduce visual density in week view",
      items: baseItems,
      focusBlocks: blocks4,
    },
    {
      id: "focus2",
      label: `Make ${Math.max(focus2.length, 1)} focus sessions`,
      hint: "Two big blocks, checklist inside",
      items: baseItems,
      focusBlocks: focus2,
    },
  ];
}

