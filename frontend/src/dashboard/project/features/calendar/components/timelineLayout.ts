import type { CalendarEvent, CalendarTask } from "../utils";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import { formatAssigneeDisplay } from "@/dashboard/project/components/Tasks/utils";

export const MINUTES_IN_HOUR = 60;

export type TimelineAvatar = {
  key: string;
  /** Stable identity for de-duping across entries (e.g., user:<userId> or label:<name>) */
  entityId?: string;
  thumb?: string | null;
  name?: string;
  /** Optional aggregate count (e.g., same user appears multiple times in a stack) */
  count?: number;
};

type MemberLookup = {
  byId: Map<string, ProjectTeamMember>;
  byDisplayName: Map<string, ProjectTeamMember>;
};

const getMemberDisplayName = (member: ProjectTeamMember): string => {
  const normalized = `${member.firstName || ""} ${member.lastName || ""}`.trim();
  return normalized || member.userId || "";
};

const normalizeLabel = (value?: string): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const buildAvatar = (options: TimelineAvatar): TimelineAvatar => ({
  key: options.key,
  entityId: options.entityId,
  thumb: options.thumb,
  name: options.name,
  count: options.count,
});

export const buildTeamMemberLookup = (teamMembers: ProjectTeamMember[] = []): MemberLookup => {
  const byId = new Map<string, ProjectTeamMember>();
  const byDisplayName = new Map<string, ProjectTeamMember>();
  teamMembers.forEach((member) => {
    if (member.userId) {
      byId.set(member.userId, member);
    }
    const displayName = getMemberDisplayName(member);
    if (displayName) {
      byDisplayName.set(displayName.toLowerCase(), member);
    }
  });
  return { byId, byDisplayName };
};

export const parseAssigneeUserId = (value?: string): string | undefined => {
  const normalized = normalizeLabel(value);
  if (!normalized) return undefined;
  const parts = normalized.split("__");
  return parts.length > 1 ? parts[parts.length - 1] : normalized;
};

const formatFallbackName = (value?: string): string | undefined => {
  const normalized = normalizeLabel(value);
  if (!normalized) return undefined;
  return formatAssigneeDisplay(normalized) ?? normalized;
};

const buildAvatarFromMember = (member: ProjectTeamMember, key: string): TimelineAvatar =>
  buildAvatar({
    key,
    entityId: member.userId ? `user:${member.userId}` : undefined,
    thumb: member.thumbnail ?? undefined,
    name: `${getMemberDisplayName(member)}` || member.userId,
  });

const buildAvatarFromLabel = (label: string, key: string): TimelineAvatar =>
  buildAvatar({
    key,
    entityId: `label:${label.toLowerCase()}`,
    name: label,
  });

export const getAvatarForAssignee = (
  assignee?: string,
  lookup?: MemberLookup,
  keyPrefix = "assignee",
): TimelineAvatar | null => {
  if (!assignee) return null;
  const userId = parseAssigneeUserId(assignee);
  if (lookup && userId) {
    const member = lookup.byId.get(userId);
    if (member) {
      return buildAvatarFromMember(member, `${keyPrefix}-${member.userId}`);
    }
  }
  const fallback = formatFallbackName(assignee);
  if (fallback) {
    return buildAvatarFromLabel(fallback, `${keyPrefix}-${fallback}`);
  }
  return null;
};

export const getAvatarForGuest = (
  guest?: string,
  lookup?: MemberLookup,
  keyPrefix = "guest",
): TimelineAvatar | null => {
  if (!guest) return null;
  const userId = parseAssigneeUserId(guest);
  if (lookup && userId) {
    const member = lookup.byId.get(userId);
    if (member) {
      return buildAvatarFromMember(member, `${keyPrefix}-${member.userId}`);
    }
  }
  const fallback = formatFallbackName(guest);
  if (fallback) {
    return buildAvatarFromLabel(fallback, `${keyPrefix}-${fallback}`);
  }
  return null;
};

const collectAssigneeCandidates = (task: CalendarTask): string[] => {
  const source = task.source as unknown as {
    assigneeId?: string | null;
    assigneeIds?: string[];
    assigneeTokens?: string[];
  };

  const orderedUserIds: string[] = [];
  const bestLabelByUserId = new Map<string, string>();

  const consider = (value?: string | null) => {
    if (!value || typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;

    const userId = parseAssigneeUserId(trimmed);
    if (!userId) return;

    if (!bestLabelByUserId.has(userId)) {
      bestLabelByUserId.set(userId, trimmed);
      orderedUserIds.push(userId);
      return;
    }

    const existing = bestLabelByUserId.get(userId) ?? userId;
    const existingId = parseAssigneeUserId(existing) ?? existing;
    const nextId = parseAssigneeUserId(trimmed) ?? trimmed;
    const existingIsBareId = existingId === existing;
    const nextIsBareId = nextId === trimmed;
    if (existingIsBareId && !nextIsBareId) {
      bestLabelByUserId.set(userId, trimmed);
    }
  };

  consider(task.assignedTo ?? undefined);
  consider(source.assigneeId ?? undefined);

  task.assigneeIds?.forEach((candidate) => consider(candidate));
  source.assigneeIds?.forEach((candidate) => consider(candidate));
  source.assigneeTokens?.forEach((candidate) => consider(candidate));

  return orderedUserIds.map((id) => bestLabelByUserId.get(id) ?? id);
};

export const buildTaskAvatars = (
  task: CalendarTask,
  lookup?: MemberLookup,
): TimelineAvatar[] => {
  const candidates = collectAssigneeCandidates(task);
  const avatars: TimelineAvatar[] = [];
  candidates.forEach((candidate, index) => {
    if (avatars.length >= 3) return;
    const avatar = getAvatarForAssignee(candidate, lookup, `${task.id}-${index}`);
    if (avatar) {
      avatars.push(avatar);
    }
  });
  return avatars;
};

export const buildEventAvatars = (
  event: CalendarEvent,
  lookup?: MemberLookup,
): TimelineAvatar[] => {
  if (!event.guests || event.guests.length === 0) {
    return [];
  }
  const avatars: TimelineAvatar[] = [];
  event.guests.forEach((guest, index) => {
    const avatar = getAvatarForGuest(guest, lookup, `${event.id}-${index}`);
    if (avatar) {
      avatars.push(avatar);
    }
  });
  return avatars.slice(0, 3);
};

export const parseTimeToMinutes = (value?: string): number | undefined => {
  if (!value) return undefined;
  const [hoursRaw, minutesRaw] = value.split(":").map((part) => part.trim());
  const hours = Number(hoursRaw);
  const minutes = minutesRaw === undefined ? 0 : Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return undefined;
  const clampedHours = Math.max(0, Math.min(23, hours));
  const clampedMinutes = Math.max(0, Math.min(59, minutes));
  return clampedHours * MINUTES_IN_HOUR + clampedMinutes;
};

export type TimelineBaseEntry<T> = {
  id: string;
  type: "event" | "task" | "taskStack" | "overlapStack";
  payload: T;
  title: string;
  timeLabel?: string;
  startMinutes: number;
  endMinutes: number;
  avatars: TimelineAvatar[];
  colorClass?: string;
  projectColor?: string;
  completed?: boolean;
};

export type TimelineHourEntry<T> = TimelineBaseEntry<T> & {
  hour: number;
};

export const assignTimelineColumns = <T>(
  entries: readonly TimelineHourEntry<T>[],
): Array<TimelineHourEntry<T> & { columnIndex: number; columnCount: number }> => {
  const sorted = [...entries].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) {
      return a.startMinutes - b.startMinutes;
    }
    return a.endMinutes - b.endMinutes;
  });

  const active: Array<TimelineHourEntry<T> & { columnIndex: number; columnCount: number }> = [];
  const result: Array<TimelineHourEntry<T> & { columnIndex: number; columnCount: number }> = [];

  sorted.forEach((entry) => {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (active[i].endMinutes <= entry.startMinutes) {
        active.splice(i, 1);
      }
    }

    const usedColumns = new Set(active.map((item) => item.columnIndex));
    let columnIndex = 0;
    while (usedColumns.has(columnIndex) && columnIndex < 2) {
      columnIndex += 1;
    }
    if (columnIndex >= 2) {
      columnIndex = 1; // Force to second column or something, but since we limit, maybe skip or stack
    }

    const layoutEntry: TimelineHourEntry<T> & { columnIndex: number; columnCount: number } = {
      ...entry,
      columnIndex,
      columnCount: 1,
    };

    active.push(layoutEntry);

    let maxColumns = active.reduce(
      (max, activeEntry) => Math.max(max, activeEntry.columnIndex + 1),
      0,
    );
    if (maxColumns === 0) {
      maxColumns = 1;
    }
    maxColumns = Math.min(maxColumns, 2); // Limit to 2 columns max

    active.forEach((activeEntry) => {
      activeEntry.columnCount = Math.max(activeEntry.columnCount, maxColumns);
    });

    result.push(layoutEntry);
  });

  return result;
};

export const snapDateToHalfHour = (date: Date) => {
  const snapped = new Date(date);
  const minutes = snapped.getMinutes();
  const snappedMinutes = Math.round(minutes / 30) * 30;
  if (snappedMinutes >= MINUTES_IN_HOUR) {
    snapped.setHours(snapped.getHours() + 1, 0, 0, 0);
  } else {
    snapped.setMinutes(snappedMinutes, 0, 0);
  }
  return snapped;
};
