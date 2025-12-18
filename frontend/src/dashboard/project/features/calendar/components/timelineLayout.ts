import type { CalendarEvent, CalendarTask } from "../utils";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import { formatAssigneeDisplay } from "@/dashboard/project/components/Tasks/utils";

export const MINUTES_IN_HOUR = 60;

export type TimelineAvatar = {
  key: string;
  thumb?: string | null;
  name?: string;
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
  thumb: options.thumb,
  name: options.name,
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
    thumb: member.thumbnail ?? undefined,
    name: `${getMemberDisplayName(member)}` || member.userId,
  });

const buildAvatarFromLabel = (label: string, key: string): TimelineAvatar =>
  buildAvatar({
    key,
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

const collectAssigneeCandidates = (task: CalendarTask): string[] => {
  const seen = new Set<string>();
  const entries: string[] = [];
  const push = (value?: string | null) => {
    if (!value) return;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    entries.push(normalized);
  };

  push(task.assignedTo ?? undefined);
  task.assigneeIds?.forEach((candidate) => push(candidate));
  return entries;
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
  type: "event" | "task";
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

export const assignTimelineColumns = <T extends TimelineHourEntry<unknown>>(
  entries: readonly T[],
): Array<T & { columnIndex: number; columnCount: number }> => {
  const sorted = [...entries].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) {
      return a.startMinutes - b.startMinutes;
    }
    return a.endMinutes - b.endMinutes;
  });

  const active: Array<T & { columnIndex: number; columnCount: number }> = [];
  const result: Array<T & { columnIndex: number; columnCount: number }> = [];

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

    const layoutEntry: T & { columnIndex: number; columnCount: number } = {
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
