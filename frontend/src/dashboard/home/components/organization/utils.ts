import type { MemberRow, OrgRole } from "./types";

export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return "—";
  const then = new Date(dateString);
  if (Number.isNaN(then.getTime())) return "—";
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (diffSeconds <= 0) return "now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function normalizeForSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function roleSortValue(role: OrgRole): number {
  switch (role) {
    case "owner":
      return 0;
    case "admin":
      return 1;
    case "member":
      return 2;
    case "viewer":
      return 3;
    default:
      return 99;
  }
}

export function compareMembers(a: MemberRow, b: MemberRow, sortKey: "name" | "role" | "lastActive"): number {
  if (sortKey === "role") {
    const ra = roleSortValue(a.orgRole);
    const rb = roleSortValue(b.orgRole);
    if (ra !== rb) return ra - rb;
  }
  if (sortKey === "lastActive") {
    const ta = a.lastActiveAt ? Date.parse(a.lastActiveAt) : -1;
    const tb = b.lastActiveAt ? Date.parse(b.lastActiveAt) : -1;
    if (ta !== tb) return tb - ta;
  }
  return a.name.localeCompare(b.name);
}
