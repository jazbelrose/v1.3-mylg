// NOTE: In this app, roles are user roles (not org RBAC roles).
// Keep this flexible because backends may emit additional values.
export type OrgRole = "admin" | "designer" | "builder" | "vendor" | "client" | string;
export type MemberStatus = "active" | "invited" | "suspended";

export type MemberRow = {
  id: string; // membershipId (later: orgId+userId)
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  orgRole: OrgRole;
  status: MemberStatus;
  lastActiveAt?: string | null; // ISO
  // Presence (websocket-derived). Optional because not all backends populate it.
  presence?: string | null;
  connectedAt?: string | null; // ISO
  lastSeenAt?: string | null; // ISO
  joinedAt?: string | null; // ISO
  invitedBy?: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  occupation?: string;
};

export type InviteStatus = "pending" | "expired" | "revoked";

export type InviteRow = {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  sentAt: string; // ISO
  status: InviteStatus;
};

export type Project = {
  id: string;
  name: string;
  thumbUrl?: string | null;
  pinned?: boolean;
};

export type MemberAccess = {
  memberId: string;
  projectIds: string[];
};
