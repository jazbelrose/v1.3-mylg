import type { ApiTask, NominatimSuggestion, Status, Task, TeamMember } from "./types";

export const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

export function getDisplayName(member: Partial<TeamMember> = {}): string {
  const first = member.firstName || "";
  const last = member.lastName || "";
  const name = `${first} ${last}`.trim();
  return name || member.displayName || member.username || member.userId || "";
}

export function buildAssigneeOptions(teamProfiles: TeamMember[]): { value: string; label: string }[] {
  if (!Array.isArray(teamProfiles) || teamProfiles.length === 0) {
    return [];
  }

  return teamProfiles.map((profile) => ({
    value: `${profile.firstName || ""}${profile.lastName || ""}__${profile.userId}`,
    label: getDisplayName(profile) || profile.userId,
  }));
}

function toTokenArray(value?: string | string[] | null): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toTokenArray(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

export function extractUserIdFromToken(token: string): string | null {
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (trimmed.includes("__")) {
    const parts = trimmed.split("__");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  return trimmed;
}

export function parseAssigneeTokens(value?: string | string[] | null): string[] {
  const tokens = toTokenArray(value);
  const deduped = Array.from(new Set(tokens.map((token) => token.trim()).filter(Boolean)));
  return deduped;
}

export function tokensToUserIds(tokens: string[]): string[] {
  const ids = tokens
    .map((token) => extractUserIdFromToken(token))
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
  return Array.from(new Set(ids));
}

export function buildBudgetOptions(
  budgetItems: Record<string, unknown>[]
): { value: string; label: string; elementId: string }[] {
  return budgetItems.map((item) => {
    const description = (item.descriptionShort || item.description || "")
      .toString()
      .slice(0, 50);

    return {
      value: (item.budgetItemId as string) || "",
      label: `${(item.elementId as string) || ""} (${description})`,
      elementId: (item.elementId as string) || "",
    };
  });
}

export function buildTaskNameOptions(
  budgetItems: Record<string, unknown>[]
): { label: string; value: string; elementId: string }[] {
  const options = budgetItems.map((item) => {
    const labelBase = ((item.descriptionShort || item.description || "") as string)
      .split(" ")
      .slice(0, 6)
      .join(" ");

    return {
      label: labelBase,
      value: labelBase,
      elementId: (item.elementId as string) || "",
    };
  });

  const dedupedMap = options.reduce<Map<string, (typeof options)[number]>>((map, option) => {
    if (!map.has(option.value)) {
      map.set(option.value, option);
    }
    return map;
  }, new Map());

  return Array.from(dedupedMap.values());
}

export function buildDirectionsLinks(
  address?: string | null,
): { appleMaps: string; googleMaps: string } | null {
  if (!address) return null;

  const trimmed = address.trim();
  if (!trimmed) return null;

  const encoded = encodeURIComponent(trimmed);

  return {
    appleMaps: `https://maps.apple.com/?q=${encoded}`,
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
  };
}

export function sortByProximity(
  suggestions: NominatimSuggestion[],
  userLocation: { lat: number; lng: number } | null
): NominatimSuggestion[] {
  if (!userLocation) return suggestions;

  return [...suggestions].sort((a, b) => {
    const distA = Math.hypot(userLocation.lat - parseFloat(a.lat), userLocation.lng - parseFloat(a.lon));
    const distB = Math.hypot(userLocation.lat - parseFloat(b.lat), userLocation.lng - parseFloat(b.lon));
    return distA - distB;
  });
}

export function mapApiTaskToTask(task: ApiTask, fallbackId?: string): Task {
  const id = task.taskId || task.id || fallbackId || "";
  const tokenCandidates = [
    ...parseAssigneeTokens(task.assigneeTokens || null),
    ...parseAssigneeTokens(task.assignedTo as string | string[] | null),
    ...parseAssigneeTokens(task.assigneeId || null),
  ];
  const tokens = Array.from(new Set(tokenCandidates));
  const ids = Array.from(
    new Set([
      ...(Array.isArray(task.assigneeIds)
        ? task.assigneeIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        : []),
      ...tokensToUserIds(tokens),
    ]),
  );
  const attachments = Array.isArray(task.noteAttachments)
    ? task.noteAttachments.filter(
        (attachment): attachment is NonNullable<Task["noteAttachments"]>[number] =>
          Boolean(attachment && typeof attachment === "object" && typeof attachment.fileName === "string"),
      )
    : undefined;

  return {
    id,
    taskId: task.taskId,
    projectId: task.projectId,
    name: (task.title || task.name || "").toUpperCase(),
    assigneeId:
      ids[0] || (typeof task.assigneeId === "string" && task.assigneeId.trim() ? task.assigneeId.trim() : undefined),
    assigneeIds: ids.length ? ids : undefined,
    assigneeTokens: tokens.length ? tokens : undefined,
    assignedTo: tokens.length
      ? tokens
      : Array.isArray(task.assignedTo)
        ? task.assignedTo
        : task.assignedTo || task.assigneeId,
    dueDate: task.dueDate,
    priority: task.priority,
    budgetItemId: task.budgetItemId || undefined,
    eventId: task.eventId,
    description: task.description || task.comments,
    status: (task.status as Status) || "todo",
    location: task.location,
    address: task.address,
    noteAttachments: attachments && attachments.length ? attachments : undefined,
  };
}

export function formatAssigneeDisplay(value?: string | string[]): string | undefined {
  const tokens = parseAssigneeTokens(value ?? null);
  if (!tokens.length) return undefined;

  const names = tokens
    .map((token) => {
      const trimmed = token.trim();
      if (!trimmed) return null;
      const [namePart] = trimmed.includes("__") ? trimmed.split("__") : [trimmed];
      const normalized = namePart
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return normalized || null;
    })
    .filter((entry): entry is string => Boolean(entry));

  if (!names.length) return undefined;
  return names.join(", ");
}

export function parseDueDate(value: unknown): Date | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isNaN(copy.getTime()) ? null : copy;
  }

  if (typeof value === "number") {
    const byNumber = new Date(value);
    return Number.isNaN(byNumber.getTime()) ? null : byNumber;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const direct = new Date(trimmed);
    if (!Number.isNaN(direct.getTime())) {
      return direct;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const iso = new Date(`${trimmed}T00:00:00`);
      return Number.isNaN(iso.getTime()) ? null : iso;
    }
  }

  return null;
}

export function parseLocation(value: unknown): { lat: number; lng: number } | null {
  if (!value) return null;

  if (Array.isArray(value) && value.length >= 2) {
    const [latRaw, lngRaw] = value;
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng };
    }
  }

  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    const latCandidate = candidate.lat ?? candidate.latitude ?? candidate.y;
    const lngCandidate = candidate.lng ?? candidate.lon ?? candidate.longitude ?? candidate.x;
    const lat = Number(latCandidate);
    const lng = Number(lngCandidate);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng };
    }
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseLocation(parsed);
    } catch {
      const [latPart, lngPart] = value.split(/[,\s]+/);
      const lat = Number(latPart);
      const lng = Number(lngPart);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { lat, lng };
      }
    }
  }

  return null;
}
