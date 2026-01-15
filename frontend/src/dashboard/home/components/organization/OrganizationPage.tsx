import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal, Plus, Search, Users } from "lucide-react";

import styles from "./organization.module.css";
import type { MemberAccess, MemberRow, OrgRole, Project } from "./types";
import { ORG_ROLE_LABELS } from "./stubData";
import { compareMembers, formatRelativeTime, initialsFromName, normalizeForSearch } from "./utils";
import MemberDrawer from "./MemberDrawer";
import InviteModal from "./InviteModal";
import RoleDropdown from "./RoleDropdown";
import { notify } from "@/shared/ui/ToastNotifications";
import PageHeader from "@/shared/ui/PageHeader";
import { useData } from "@/app/contexts/useData";
import { useOrg } from "@/app/contexts/useOrg";
import {
  acceptCollabInvite,
  cancelCollabInvite,
  declineCollabInvite,
  fetchIncomingCollabInvites,
  fetchOutgoingCollabInvites,
  fetchUserProfile as fetchUserProfileApi,
  getFileUrl,
  sendUserInvite,
  updateUserRole,
} from "@/shared/utils/api";

type TabKey = "members" | "invites";

type MemberDrawerSectionKey = "identity" | "access" | "audit";

type SortKey = "name" | "role" | "lastActive";

type RoleFilter = "all" | OrgRole;

type StatusFilter = "all" | MemberRow["status"];

type CollabInvite = {
  id: string;
  fromUserId: string;
  toUserId: string;
  createdAt?: string;
};

const ROLE_OPTIONS: OrgRole[] = ["admin", "designer", "builder", "vendor", "client"];

function extractLastSeenIso(user: Record<string, unknown>): string | null {
  const candidates = [
    user.lastActiveAt,
    user.lastLoginAt,
    user.lastLoggedAt,
    user.lastSeenAt,
    user.lastSeenAt,
    user.lastSeen,
    user.lastLogin,
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function extractConnectedAtIso(user: Record<string, unknown>): string | null {
  const candidates = [user.connectedAt, user.presenceConnectedAt];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function roleLabel(role: OrgRole): string {
  return ORG_ROLE_LABELS[role] ?? String(role || "").replace(/^./, (c) => c.toUpperCase());
}

function renderAvatar(opts: { name: string; avatarUrl?: string | null }): React.ReactNode {
  if (opts.avatarUrl) {
    return <img className={styles.avatarImg} src={opts.avatarUrl} alt="" referrerPolicy="no-referrer" />;
  }
  return initialsFromName(opts.name);
}

function statusLabel(status: MemberRow["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "invited":
      return "Invited";
    case "suspended":
      return "Suspended";
    default:
      return status;
  }
}

function useClickOutside(handler: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      handler();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [handler]);

  return ref;
}

export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("members");

  const {
    allUsers,
    userData,
    isAdmin,
    refreshUsers,
    updateUserProfile,
    setUserData,
    updateProjectFields,
    projects: rawProjects,
  } = useData();
  const { orgs, activeOrgId, setActiveOrgId, isLoading: orgsLoading } = useOrg();

  const currentOrgName = useMemo(() => {
    if (orgsLoading) return "Loading…";
    const match = orgs.find((o) => o.orgId === activeOrgId);
    return match?.name?.trim() || "Organization";
  }, [activeOrgId, orgs, orgsLoading]);

  const currentUserId = userData?.userId ?? null;
  const collaborators = useMemo(() => (Array.isArray(userData?.collaborators) ? userData!.collaborators! : []), [userData]);

  const collabUsers = useMemo(() => {
    if (!collaborators.length) return [];
    return collaborators
      .map((id) => allUsers.find((u) => u.userId === id || u.username === id))
      .filter(Boolean);
  }, [allUsers, collaborators]);

  const displayUsers = useMemo(() => {
    const base = isAdmin ? allUsers : collabUsers;
    const me = currentUserId ? allUsers.find((u) => u.userId === currentUserId) : null;
    const combined = me ? [me, ...base] : base;
    const dedup = new Map<string, (typeof combined)[number]>();
    combined.forEach((u) => {
      if (!u?.userId) return;
      if (!dedup.has(u.userId)) dedup.set(u.userId, u);
    });
    return Array.from(dedup.values());
  }, [allUsers, collabUsers, currentUserId, isAdmin]);

  const projects = useMemo<Project[]>(() => {
    return (rawProjects || [])
      .filter(Boolean)
      .map((p) => ({
        id: p.projectId,
        name: p.title || "Untitled project",
        thumbUrl: (Array.isArray(p.thumbnails) ? p.thumbnails[0] : null) as string | null,
        pinned: Boolean((p as unknown as { pinned?: unknown })?.pinned),
      }));
  }, [rawProjects]);

  const projectIdsForUser = useCallback(
    (uid: string): string[] => {
      const user = allUsers.find((u) => u.userId === uid || u.username === uid);
      const idsFromProfile = Array.isArray(user?.projects) ? user.projects : [];
      const idsFromTeam = (rawProjects || [])
        .filter((p) => Array.isArray(p.team) && p.team.some((m) => m.userId === uid))
        .map((p) => p.projectId);
      return Array.from(new Set([...(idsFromProfile || []), ...(idsFromTeam || [])]));
    },
    [allUsers, rawProjects]
  );

  const members = useMemo<MemberRow[]>(() => {
    return displayUsers.map((u) => {
      const first = String(u.firstName || "").trim();
      const last = String(u.lastName || "").trim();
      const name = (first || last) ? `${first}${last ? ` ${last}` : ""}`.trim() : (u.username || u.email || u.userId);
      const rawRole = String(u.role || u.occupation || "").toLowerCase();
      const role = (rawRole || "client") as OrgRole;
      // In this app, `pending` is used as an access gate. Treat it as access revoked.
      const status: MemberRow["status"] = u.pending ? "suspended" : "active";
      const record = u as unknown as Record<string, unknown>;
      const lastSeenIso = extractLastSeenIso(record);
      const connectedAtIso = extractConnectedAtIso(record);
      const presence = typeof record.presence === "string" ? record.presence : null;

      return {
        id: u.userId,
        userId: u.userId,
        name,
        email: String(u.email || ""),
        avatarUrl: (u.thumbnailUrl as string | undefined) ?? null,
        orgRole: role,
        status,
        lastActiveAt: lastSeenIso,
        lastSeenAt: lastSeenIso,
        connectedAt: connectedAtIso,
        presence,
        joinedAt: null,
        invitedBy: null,
        firstName: u.firstName as string | undefined,
        lastName: u.lastName as string | undefined,
        phone: (u.phoneNumber as string | undefined) ?? "",
        company: (u.company as string | undefined) ?? "",
        occupation: (u.occupation as string | undefined) ?? (u.role as string | undefined) ?? "",
      };
    });
  }, [displayUsers]);

  const projectsById = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  const [roleUpdatingMemberId, setRoleUpdatingMemberId] = useState<string | null>(null);
  const [accessUpdatingMemberId, setAccessUpdatingMemberId] = useState<string | null>(null);

  const access = useMemo<MemberAccess[]>(
    () => members.map((m) => ({ memberId: m.id, projectIds: projectIdsForUser(m.userId) })),
    [members, projectIdsForUser]
  );

  const [outgoingInvites, setOutgoingInvites] = useState<CollabInvite[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<CollabInvite[]>([]);

  const getUserName = useCallback(
    (id: string) => {
      const u = allUsers.find((x) => x.userId === id || x.username === id);
      const first = String(u?.firstName || "").trim();
      const last = String(u?.lastName || "").trim();
      if (first || last) return `${first}${last ? ` ${last}` : ""}`.trim();
      return u?.email || u?.username || id;
    },
    [allUsers]
  );

  const getUserAvatarUrl = useCallback(
    (id: string): string | null => {
      const u = allUsers.find((x) => x.userId === id || x.username === id);
      return (u?.thumbnailUrl as string | undefined) ?? null;
    },
    [allUsers]
  );

  const loadInvites = useCallback(async () => {
    const uid = userData?.userId;
    if (!uid) {
      setOutgoingInvites([]);
      setIncomingInvites([]);
      return;
    }
    try {
      const [out, inc] = await Promise.all([
        fetchOutgoingCollabInvites(uid),
        fetchIncomingCollabInvites(uid),
      ]);
      setOutgoingInvites((Array.isArray(out) ? out : []) as CollabInvite[]);
      setIncomingInvites((Array.isArray(inc) ? inc : []) as CollabInvite[]);
    } catch {
      setOutgoingInvites([]);
      setIncomingInvites([]);
    }
  }, [userData?.userId]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [drawerScrollToSection, setDrawerScrollToSection] = useState<MemberDrawerSectionKey | null>(null);

  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const [openMenuForMemberId, setOpenMenuForMemberId] = useState<string | null>(null);
  const menuRef = useClickOutside(() => setOpenMenuForMemberId(null));

  const canManage = isAdmin;
  const canEditRoles = isAdmin;

  const selectedMember = useMemo(
    () => (selectedMemberId ? members.find((m) => m.id === selectedMemberId) ?? null : null),
    [members, selectedMemberId]
  );

  const selectedAccess = useMemo(
    () => (selectedMemberId ? access.find((a) => a.memberId === selectedMemberId) ?? null : null),
    [access, selectedMemberId]
  );

  const filteredMembers = useMemo(() => {
    const q = normalizeForSearch(searchQuery);
    return members
      .filter((m) => {
        if (roleFilter !== "all" && m.orgRole !== roleFilter) return false;
        if (statusFilter !== "all" && m.status !== statusFilter) return false;
        if (!q) return true;
        return (
          normalizeForSearch(m.name).includes(q) ||
          normalizeForSearch(m.email).includes(q) ||
          normalizeForSearch(m.occupation ?? "").includes(q)
        );
      })
      .sort((a, b) => compareMembers(a, b, sortKey));
  }, [members, roleFilter, searchQuery, sortKey, statusFilter]);

  const memberCountLabel = useMemo(() => `${filteredMembers.length} member${filteredMembers.length === 1 ? "" : "s"}`, [filteredMembers.length]);

  const onInlineRoleChange = useCallback(
    async (memberId: string, nextRole: OrgRole) => {
      if (!canEditRoles) return;
      const member = members.find((m) => m.id === memberId);
      if (!member) return;

      const isDemotingAdmin = member.orgRole === "admin" && nextRole !== "admin";
      const isSelfDemotion = Boolean(currentUserId && member.userId === currentUserId) && isDemotingAdmin;
      if (isDemotingAdmin) {
        const ok = window.confirm(
          isSelfDemotion
            ? "Change your own role away from Admin? You may lose access to admin actions."
            : `Change ${member.name}'s role away from Admin?`
        );
        if (!ok) return;
      }

      try {
        setRoleUpdatingMemberId(memberId);
        await updateUserRole(member.userId, String(nextRole));
        notify("success", `Role updated to ${roleLabel(nextRole)}.`);
        await refreshUsers();
      } catch {
        notify("error", "Failed to update role.");
      } finally {
        setRoleUpdatingMemberId((prev) => (prev === memberId ? null : prev));
      }
    },
    [canEditRoles, currentUserId, members, refreshUsers]
  );

  const canEditAccess = canManage;

  const onInlineAccessToggle = useCallback(
    async (memberId: string, nextGranted: boolean) => {
      if (!canEditAccess) return;
      const member = members.find((m) => m.id === memberId);
      if (!member) return;

      const isAdminTarget = member.orgRole === "admin";
      const isSelf = Boolean(currentUserId && member.userId === currentUserId);
      if (!nextGranted && (isAdminTarget || isSelf)) {
        const ok = window.confirm(
          isSelf
            ? "Revoke your own access? This may lock you out."
            : `Revoke access for ${isAdminTarget ? "Admin " : ""}${member.name}?`
        );
        if (!ok) return;
      }

      try {
        setAccessUpdatingMemberId(memberId);
        // Access is modeled via `pending` flag in user profiles.
        // IMPORTANT: The backend profile update is a PUT; sending a partial payload can wipe fields.
        // Always merge against the existing profile first.
        let currentProfile: any = allUsers.find((u) => u.userId === member.userId || u.username === member.userId);
        if (!currentProfile) currentProfile = await fetchUserProfileApi(member.userId);
        if (!currentProfile) throw new Error("User profile not found");
        await updateUserProfile({ ...currentProfile, userId: member.userId, pending: !nextGranted } as any);
        notify("success", nextGranted ? "Access granted." : "Access revoked.");
        await refreshUsers();
      } catch {
        notify("error", "Failed to update access.");
      } finally {
        setAccessUpdatingMemberId((prev) => (prev === memberId ? null : prev));
      }
    },
    [allUsers, canEditAccess, currentUserId, members, refreshUsers, updateUserProfile]
  );

  const onDrawerSave = useCallback(
    async (nextMember: MemberRow, nextProjectIds: string[]) => {
      if (!canManage) {
        notify("error", "You do not have permission.");
        return;
      }
      try {
        await updateUserProfile({
          userId: nextMember.userId,
          firstName: nextMember.firstName,
          lastName: nextMember.lastName,
          phoneNumber: nextMember.phone,
          company: nextMember.company,
          occupation: nextMember.occupation,
          projects: nextProjectIds,
        });
        notify("success", "Saved changes.");
        await refreshUsers();
        setSelectedMemberId(null);
        setDrawerScrollToSection(null);
      } catch {
        notify("error", "Failed to save changes.");
      }
    },
    [canManage, refreshUsers, updateUserProfile]
  );

  const copyEmail = useCallback(async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      notify("success", "Copied email.");
    } catch {
      notify("error", "Could not copy email.");
    }
  }, []);

  const removeMember = useCallback(
    (memberId: string) => {
      const m = members.find((x) => x.id === memberId);
      if (!m) return;
      if (!canManage) return;
      notify("info", "Remove member is not wired yet.");
    },
    [canManage, members]
  );

  const sendInvite = useCallback(
    async ({ email, role }: { email: string; role: OrgRole }) => {
      if (!canManage) {
        notify("error", "You do not have permission.");
        return;
      }
      try {
        await sendUserInvite(email, String(role));
        notify("success", `Invite sent to ${email}.`);
        setIsInviteOpen(false);
        setActiveTab("invites");
      } catch {
        notify("error", "Failed to send invite.");
      }
    },
    [canManage]
  );

  return (
    <div className={styles.shell}>
      <div className={styles.page}>
        <PageHeader
          sticky
          className={styles.orgPageHeader}
          title="Organization"
          subtitle="Who is in your org and what they can access"
          actions={
            <div className={styles.topActions}>
              <button
                type="button"
                className={`${styles.pill} ${styles.pillButton}`}
                onClick={() => {
                  if (!orgs.length) return;
                  const idx = orgs.findIndex((o) => o.orgId === activeOrgId);
                  const next = orgs[(idx + 1) % orgs.length];
                  if (!next?.orgId) return;
                  setActiveOrgId(next.orgId);
                  notify("info", `Switched to ${next.name || "Organization"}.`);
                }}
                disabled={orgsLoading || orgs.length <= 1}
              >
                {currentOrgName} <ChevronDown size={14} />
              </button>

              {canManage ? (
                <button type="button" className={styles.primaryButton} onClick={() => setIsInviteOpen(true)}>
                  <Plus size={16} /> Invite
                </button>
              ) : null}

              <button type="button" className={styles.iconButton} aria-label="Organization settings">
                <MoreHorizontal size={18} />
              </button>
            </div>
          }
          nav={
            <div className={styles.tabs} role="tablist" aria-label="Organization sections">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "members"}
                className={`${styles.tab} ${activeTab === "members" ? styles.tabActive : ""}`}
                onClick={() => setActiveTab("members")}
              >
                Members
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "invites"}
                className={`${styles.tab} ${activeTab === "invites" ? styles.tabActive : ""}`}
                onClick={() => setActiveTab("invites")}
              >
                Invites
              </button>
            </div>
          }
          controls={
            <div className={styles.headerControls}>
              <div className={styles.search}>
                <Search size={16} />
                <input
                  className={styles.searchInput}
                  placeholder={activeTab === "invites" ? "Search invites…" : "Search members…"}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className={styles.controls}>
                <select className={styles.select} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}>
                  <option value="all">Role ▾ (All)</option>
                  <option value="admin">Admin</option>
                  <option value="designer">Designer</option>
                  <option value="builder">Builder</option>
                  <option value="vendor">Vendor</option>
                  <option value="client">Client</option>
                </select>

                <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                  <option value="all">Status ▾ (All)</option>
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="suspended">Suspended</option>
                </select>

                <select className={styles.select} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                  <option value="name">Sort: Name</option>
                  <option value="role">Sort: Role</option>
                  <option value="lastActive">Sort: Last active</option>
                </select>
              </div>
            </div>
          }
        />

      {activeTab === "members" ? (
        <section className={styles.panel} aria-label="Members">
          <div className={styles.listHeader}>
            <div className={styles.listTitle}>
              <h3>Members</h3>
              <p>{memberCountLabel}</p>
            </div>
            <div className={styles.pill} aria-label="Members summary">
              <Users size={16} /> {members.length}
            </div>
          </div>

          {filteredMembers.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No matching members</p>
              <p className={styles.emptySubtitle}>Try clearing filters or searching a different term.</p>
            </div>
          ) : (
            <div className={styles.list}>
              <div className={styles.membersHeaderRow} aria-hidden>
                <div className={styles.membersHeaderCell}>Member</div>
                <div className={styles.membersHeaderCellRight}>Projects</div>
                <div className={styles.membersHeaderCellRight}>Role</div>
                <div className={styles.membersHeaderCellRight}>Access</div>
                <div className={styles.membersHeaderCellRight} />
              </div>
              {filteredMembers.map((m) => {
                const isYou = Boolean(currentUserId && m.userId === currentUserId);
                const accessGranted = m.status === "active";
                const accessDisabled = !canEditAccess;
                const roleDisabled = !canEditRoles || !accessGranted;
                const memberProjectIds = access.find((a) => a.memberId === m.id)?.projectIds ?? [];
                const memberProjects = memberProjectIds.map((id) => projectsById.get(id)).filter(Boolean) as Project[];
                const hasAllProjects = projects.length > 0 && memberProjects.length >= projects.length;
                const visibleProjectThumbs = memberProjects.slice(0, 3);
                const remainingProjects = hasAllProjects ? 0 : Math.max(0, memberProjects.length - visibleProjectThumbs.length);

                const presence = String(m.presence || "").toLowerCase();
                const connectedAt = m.connectedAt || null;
                const lastSeenAt = m.lastSeenAt || m.lastActiveAt || null;
                const isOnline = presence === "online" && Boolean(connectedAt);

                const timeTitle = isOnline
                  ? connectedAt
                    ? `Connected since ${new Date(connectedAt).toLocaleString()}`
                    : "Online"
                  : lastSeenAt
                    ? `Last seen ${new Date(lastSeenAt).toLocaleString()}`
                    : "No activity recorded";

                const timeText = isOnline
                  ? connectedAt
                    ? `Connected ${formatRelativeTime(connectedAt)}`
                    : "Online"
                  : lastSeenAt
                    ? formatRelativeTime(lastSeenAt)
                    : null;
                return (
                  <div
                    key={m.id}
                    className={`${styles.row} ${!accessGranted ? styles.rowAccessRevoked : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setDrawerScrollToSection(null);
                      setSelectedMemberId(m.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setDrawerScrollToSection(null);
                        setSelectedMemberId(m.id);
                      }
                    }}
                    aria-label={`Open ${m.name}`}
                  >
                    <div className={styles.identity}>
                      <div className={styles.avatar} aria-hidden>
                        {renderAvatar({ name: m.name, avatarUrl: m.avatarUrl })}
                      </div>
                      <div className={styles.nameEmail}>
                        <div className={styles.nameLine}>
                          <div className={styles.name}>{m.name}</div>
                          {isYou ? <span className={styles.youPill}>You</span> : null}
                        </div>
                        <div className={styles.metaLine}>
                          <div className={styles.email}>{m.email}</div>
                          {timeText ? (
                            <div
                              className={styles.lastSeenInline}
                              title={timeTitle}
                              aria-label={isOnline ? "Online" : "Last seen"}
                            >
                              {isOnline ? <span className={styles.onlineDot} aria-hidden /> : null}
                              <span>{isOnline ? `Online • ${timeText}` : timeText}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className={styles.colProjects} aria-label="Projects" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.projectsIndicator}
                        onClick={() => {
                          setDrawerScrollToSection("access");
                          setSelectedMemberId(m.id);
                        }}
                        title={hasAllProjects ? "All projects" : `${memberProjects.length} project${memberProjects.length === 1 ? "" : "s"}`}
                        aria-label={`Edit project access for ${m.name}`}
                      >
                        {hasAllProjects ? (
                          <span className={styles.projectsAll}>All projects</span>
                        ) : (
                          <span className={styles.projectStack} aria-hidden>
                            {visibleProjectThumbs.map((p) => {
                              const thumb = p.thumbUrl ? getFileUrl(p.thumbUrl) : "";
                              const initial = (p.name || "P").trim().slice(0, 1).toUpperCase();
                              return (
                                <span key={p.id} className={styles.projectAvatar} title={p.name}>
                                  {thumb ? <img className={styles.projectAvatarImg} src={thumb} alt="" loading="lazy" /> : initial}
                                </span>
                              );
                            })}
                            {remainingProjects > 0 ? <span className={styles.projectMore}>+{remainingProjects}</span> : null}
                          </span>
                        )}
                      </button>
                    </div>

                    <div className={styles.colRole} aria-label="Role" onClick={(e) => e.stopPropagation()}>
                      <RoleDropdown
                        value={m.orgRole}
                        options={ROLE_OPTIONS}
                        disabled={roleDisabled}
                        loading={roleUpdatingMemberId === m.id}
                        tooltip={
                          !canEditRoles
                            ? "Only admins can change roles"
                            : !accessGranted
                              ? "Role changes are disabled while access is revoked"
                              : "Change role"
                        }
                        onChange={(next) => void onInlineRoleChange(m.id, next)}
                      />
                    </div>

                    <div className={styles.colAccess} aria-label="Access" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.accessToggle}
                        role="switch"
                        aria-checked={accessGranted}
                        disabled={accessDisabled}
                        title={accessDisabled ? "Only admins can revoke access" : "Toggle access"}
                        onClick={() => void onInlineAccessToggle(m.id, !accessGranted)}
                      >
                        <span className={styles.accessToggleLabel}>Access</span>
                        <span
                          className={`${styles.accessToggleTrack} ${
                            accessGranted ? styles.accessToggleTrackOn : styles.accessToggleTrackOff
                          } ${accessUpdatingMemberId === m.id ? styles.accessToggleTrackLoading : ""}`}
                          aria-hidden
                        >
                          <span className={styles.accessToggleThumb} />
                        </span>
                      </button>
                    </div>

                    <div className={styles.colMenu} aria-label="Menu" onClick={(e) => e.stopPropagation()}>
                      <div style={{ position: "relative", display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className={styles.menuButton}
                          aria-label="Actions"
                          onClick={() => {
                            setOpenMenuForMemberId((prev) => (prev === m.id ? null : m.id));
                          }}
                        >
                          <MoreHorizontal size={16} />
                        </button>

                        {openMenuForMemberId === m.id ? (
                          <div ref={menuRef} className={styles.menu} style={{ right: 0, top: 36 }}>
                            <button
                              type="button"
                              className={styles.menuItem}
                              onClick={() => {
                                setOpenMenuForMemberId(null);
                                setSelectedMemberId(m.id);
                              }}
                            >
                              View profile
                            </button>
                            <button
                              type="button"
                              className={styles.menuItem}
                              onClick={() => {
                                setOpenMenuForMemberId(null);
                                void copyEmail(m.email);
                              }}
                            >
                              Copy email
                            </button>
                            <button
                              type="button"
                              className={`${styles.menuItem} ${styles.menuItemDanger}`}
                              onClick={() => {
                                setOpenMenuForMemberId(null);
                                if (!canManage) return;
                                removeMember(m.id);
                              }}
                            >
                              Remove from org
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <MemberDrawer
            open={!!selectedMember}
            onClose={() => {
              setSelectedMemberId(null);
              setDrawerScrollToSection(null);
            }}
            member={selectedMember}
            projects={projects}
            access={selectedAccess}
            scrollToSection={drawerScrollToSection}
            canEditRole={canEditRoles}
            canEditProfile={canManage}
            canEditAccess={canManage}
            onRoleChange={onInlineRoleChange}
            onSave={onDrawerSave}
          />
        </section>
      ) : null}

      {activeTab === "invites" ? (
        <section className={styles.panel} aria-label="Invites">
          <div className={styles.listHeader}>
            <div className={styles.listTitle}>
              <h3>Invites & Requests</h3>
              <p>
                {incomingInvites.length + outgoingInvites.length} open request
                {incomingInvites.length + outgoingInvites.length === 1 ? "" : "s"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className={styles.secondaryButton} onClick={() => void loadInvites()}>
                Refresh
              </button>
              {canManage ? (
                <button type="button" className={styles.primaryButton} onClick={() => setIsInviteOpen(true)}>
                  <Plus size={16} /> Invite
                </button>
              ) : null}
            </div>
          </div>

          {incomingInvites.length === 0 && outgoingInvites.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No pending collaboration requests</p>
              <p className={styles.emptySubtitle}>Incoming and outgoing collaborator requests will appear here.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {outgoingInvites
                .filter((inv) => {
                  const q = normalizeForSearch(searchQuery);
                  if (!q) return true;
                  return normalizeForSearch(getUserName(inv.toUserId)).includes(q);
                })
                .map((inv) => (
                  <div key={inv.id} className={styles.row} style={{ gridTemplateColumns: "1fr 200px 200px" }}>
                    <div className={styles.identity} style={{ cursor: "default" }}>
                      <div className={styles.avatar} aria-hidden>
                        {renderAvatar({ name: getUserName(inv.toUserId), avatarUrl: getUserAvatarUrl(inv.toUserId) })}
                      </div>
                      <div className={styles.nameEmail}>
                        <div className={styles.nameLine}>
                          <div className={styles.name}>{getUserName(inv.toUserId)}</div>
                        </div>
                        <div className={styles.email}>Outgoing request</div>
                      </div>
                    </div>

                    <div className={styles.meta}>Sent {formatRelativeTime(inv.createdAt)}</div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          void (async () => {
                            try {
                              await cancelCollabInvite(inv.id);
                              notify("success", "Request canceled.");
                              await loadInvites();
                            } catch {
                              notify("error", "Failed to cancel request.");
                            }
                          })();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}

              {incomingInvites
                .filter((inv) => {
                  const q = normalizeForSearch(searchQuery);
                  if (!q) return true;
                  return normalizeForSearch(getUserName(inv.fromUserId)).includes(q);
                })
                .map((inv) => (
                  <div key={inv.id} className={styles.row} style={{ gridTemplateColumns: "1fr 200px 200px" }}>
                    <div className={styles.identity} style={{ cursor: "default" }}>
                      <div className={styles.avatar} aria-hidden>
                        {renderAvatar({ name: getUserName(inv.fromUserId), avatarUrl: getUserAvatarUrl(inv.fromUserId) })}
                      </div>
                      <div className={styles.nameEmail}>
                        <div className={styles.nameLine}>
                          <div className={styles.name}>{getUserName(inv.fromUserId)}</div>
                        </div>
                        <div className={styles.email}>Incoming request</div>
                      </div>
                    </div>

                    <div className={styles.meta}>Received {formatRelativeTime(inv.createdAt)}</div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          void (async () => {
                            try {
                              await acceptCollabInvite(inv.id);
                              const uid = userData?.userId;
                              if (uid && !collaborators.includes(inv.fromUserId)) {
                                const updated = [...collaborators, inv.fromUserId];
                                // IMPORTANT: backend profile update is a PUT; avoid partial payloads.
                                let currentProfile: any = userData;
                                if (!currentProfile) currentProfile = allUsers.find((u) => u.userId === uid || u.username === uid);
                                if (!currentProfile) currentProfile = await fetchUserProfileApi(uid);
                                if (!currentProfile) throw new Error("User profile not found");
                                await updateUserProfile({ ...currentProfile, userId: uid, collaborators: updated } as any);
                                setUserData?.((prev) => (prev ? { ...prev, collaborators: updated } : prev));
                              }
                              notify("success", "Request accepted.");
                              await loadInvites();
                              await refreshUsers();
                            } catch {
                              notify("error", "Failed to accept request.");
                            }
                          })();
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          void (async () => {
                            try {
                              await declineCollabInvite(inv.id);
                              notify("success", "Request declined.");
                              await loadInvites();
                            } catch {
                              notify("error", "Failed to decline request.");
                            }
                          })();
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      ) : null}

      <InviteModal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} onSend={sendInvite} />
      </div>
    </div>
  );
}
