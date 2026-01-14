import type { InviteRow, MemberAccess, MemberRow, OrgRole, Project } from "./types";

export const STUB_ORGS = [
  { id: "org_demo", name: "MYLG Studio" },
  { id: "org_alt", name: "Acme Properties" },
] as const;

export const STUB_CURRENT_ORG_ID = "org_demo";
export const STUB_CURRENT_USER_ID = "u_you";

export const STUB_MEMBERS: MemberRow[] = [
  {
    id: "m_1",
    userId: "u_you",
    name: "Avery Harper",
    email: "avery@mylg.app",
    avatarUrl: null,
    orgRole: "admin",
    status: "active",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    joinedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString(),
    invitedBy: null,
    firstName: "Avery",
    lastName: "Harper",
    phone: "",
    company: "MYLG",
    occupation: "Admin",
  },
  {
    id: "m_2",
    userId: "u_2",
    name: "Max Ramirez",
    email: "max.ramirez@example.com",
    avatarUrl: null,
    orgRole: "admin",
    status: "active",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    joinedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 50).toISOString(),
    invitedBy: "Avery Harper",
    firstName: "Max",
    lastName: "Ramirez",
    phone: "",
    company: "MYLG",
    occupation: "Admin",
  },
  {
    id: "m_3",
    userId: "u_3",
    name: "Jules Bennett",
    email: "jules.bennett@example.com",
    avatarUrl: null,
    orgRole: "designer",
    status: "invited",
    lastActiveAt: null,
    joinedAt: null,
    invitedBy: "Max Ramirez",
    firstName: "Jules",
    lastName: "Bennett",
    phone: "",
    company: "",
    occupation: "Designer",
  },
  {
    id: "m_4",
    userId: "u_4",
    name: "Sam Lee",
    email: "sam.lee@example.com",
    avatarUrl: null,
    orgRole: "client",
    status: "suspended",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 26).toISOString(),
    joinedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 200).toISOString(),
    invitedBy: "Avery Harper",
    firstName: "Sam",
    lastName: "Lee",
    phone: "",
    company: "",
    occupation: "Client",
  },
];

export const STUB_INVITES: InviteRow[] = [
  {
    id: "i_1",
    email: "jules.bennett@example.com",
    role: "designer",
    invitedBy: "Max Ramirez",
    sentAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    status: "pending",
  },
  {
    id: "i_2",
    email: "contractor@example.com",
    role: "vendor",
    invitedBy: "Avery Harper",
    sentAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    status: "expired",
  },
];

export const STUB_PROJECTS: Project[] = [
  { id: "p_1", name: "Coastal Kitchen Remodel", thumbUrl: null },
  { id: "p_2", name: "Downtown Loft", thumbUrl: null },
  { id: "p_3", name: "North Ridge Exterior", thumbUrl: null },
  { id: "p_4", name: "Spring Marketing", thumbUrl: null },
];

export const STUB_ACCESS: MemberAccess[] = [
  { memberId: "m_1", projectIds: ["p_1", "p_2", "p_3", "p_4"] },
  { memberId: "m_2", projectIds: ["p_1", "p_2", "p_3"] },
  { memberId: "m_3", projectIds: ["p_2"] },
  { memberId: "m_4", projectIds: ["p_1"] },
];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Admin",
  designer: "Designer",
  builder: "Builder",
  vendor: "Vendor",
  client: "Client",
};
