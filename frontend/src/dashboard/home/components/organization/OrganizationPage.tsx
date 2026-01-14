import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal, Pin, PinOff, Plus, Search, Users } from "lucide-react";

import styles from "./organization.module.css";
import type { MemberAccess, MemberRow, OrgRole, Project } from "./types";
import { ORG_ROLE_LABELS } from "./stubData";
import { compareMembers, formatRelativeTime, initialsFromName, normalizeForSearch } from "./utils";
import MemberDrawer from "./MemberDrawer";
import InviteModal from "./InviteModal";
import { notify } from "@/shared/ui/ToastNotifications";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import PageHeader from "@/shared/ui/PageHeader";
import { useData } from "@/app/contexts/useData";
import { useOrg } from "@/app/contexts/useOrg";
import { arraysEqual } from "@/dashboard/home/utils/reorder";
import { readPinnedOrder, reconcilePinnedOrder, writePinnedOrder } from "@/dashboard/home/utils/pinnedOrder";
import {
  acceptCollabInvite,
  cancelCollabInvite,
  declineCollabInvite,
  fetchIncomingCollabInvites,
  fetchOutgoingCollabInvites,
  sendUserInvite,
  updateUserRole,
} from "@/shared/utils/api";

type TabKey = "members" | "invites" | "access";

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

function roleLabel(role: OrgRole): string {
  return ORG_ROLE_LABELS[role] ?? String(role || "").replace(/^./, (c) => c.toUpperCase());
}

function renderAvatar(
  opts: { name: string; avatarUrl?: string | null }
): React.ReactNode {
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
      const status: MemberRow["status"] = u.pending ? "invited" : "active";

      return {
        id: u.userId,
        userId: u.userId,
        name,
        email: String(u.email || ""),
        avatarUrl: (u.thumbnailUrl as string | undefined) ?? null,
        orgRole: role,
        status,
        lastActiveAt: null,
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

  const access = useMemo<MemberAccess[]>(() => members.map((m) => ({ memberId: m.id, projectIds: projectIdsForUser(m.userId) })), [members, projectIdsForUser]);

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

  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const [projectSearchQuery, setProjectSearchQuery] = useState("");

  const [pinnedOrder, setPinnedOrder] = useState<string[]>(() => {
    const fromProfile = (userData as unknown as { pinnedProjectOrder?: unknown } | null)?.pinnedProjectOrder;
    if (Array.isArray(fromProfile)) {
      return fromProfile.filter((id): id is string => typeof id === "string");
    }
    return readPinnedOrder();
  });

  useEffect(() => {
    writePinnedOrder(pinnedOrder);
  }, [pinnedOrder]);

  useEffect(() => {
    const fromProfile = (userData as unknown as { pinnedProjectOrder?: unknown } | null)?.pinnedProjectOrder;
    if (!Array.isArray(fromProfile)) return;

    const profileOrder = fromProfile.filter((id): id is string => typeof id === "string");
    if (!profileOrder.length) return;

    const pinnedIds = projects.filter((p) => p.pinned).map((p) => p.id);
    const next = reconcilePinnedOrder(profileOrder, pinnedIds);
    setPinnedOrder((prev) => (arraysEqual(prev, next) ? prev : next));
  }, [projects, userData]);

  useEffect(() => {
    const pinnedIds = projects.filter((p) => p.pinned).map((p) => p.id);
    setPinnedOrder((prev) => {
      const next = reconcilePinnedOrder(prev, pinnedIds);
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev;
      return next;
    });
  }, [projects]);

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
      try {
        await updateUserRole(member.userId, String(nextRole));
        notify("success", `Role updated to ${roleLabel(nextRole)}.`);
        await refreshUsers();
      } catch {
        notify("error", "Failed to update role.");
      }
    },
    [canEditRoles, members, refreshUsers]
  );

  const onDrawerSave = useCallback(
    async (nextMember: MemberRow, _nextProjectIds: string[]) => {
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
        });
        notify("success", "Saved changes.");
        await refreshUsers();
        setSelectedMemberId(null);
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

  const [accessProjectId, setAccessProjectId] = useState<string>(projects[0]?.id ?? "");
  useEffect(() => {
    if (accessProjectId) return;
    if (projects[0]?.id) setAccessProjectId(projects[0].id);
  }, [accessProjectId, projects]);
  const accessProject = useMemo(() => projects.find((p) => p.id === accessProjectId) ?? null, [accessProjectId, projects]);

  const projectMemberCounts = useMemo(() => {
    const map = new Map<string, number>();
    projects.forEach((p) => map.set(p.id, 0));
    access.forEach((a) => {
      a.projectIds.forEach((pid) => {
        map.set(pid, (map.get(pid) ?? 0) + 1);
      });
    });
    return map;
  }, [access, projects]);

  const filteredProjects = useMemo(() => {
    const q = normalizeForSearch(projectSearchQuery);
    if (!q) return projects;
    return projects.filter((p) => normalizeForSearch(p.name).includes(q));
  }, [projectSearchQuery, projects]);

  const orderedFilteredProjects = useMemo(() => {
    const pinnedSet = new Set(pinnedOrder);
    const orderedPinned = pinnedOrder
      .map((id) => filteredProjects.find((p) => p.id === id && p.pinned))
      .filter((p): p is Project => Boolean(p));
    const extras = filteredProjects.filter((p) => p.pinned && !pinnedSet.has(p.id));
    const rest = filteredProjects.filter((p) => !p.pinned);
    return {
      pinned: [...orderedPinned, ...extras],
      all: rest,
    };
  }, [filteredProjects, pinnedOrder]);

  const persistPinnedProjectOrder = useCallback(
    (nextOrder: string[]) => {
      if (!userData?.userId) return;
      setUserData?.((prev) => (prev ? ({ ...prev, pinnedProjectOrder: nextOrder } as any) : prev));
      void updateUserProfile({ ...(userData as Record<string, unknown>), userId: userData.userId, pinnedProjectOrder: nextOrder }).catch(
        (err: unknown) => {
          console.error("Failed to persist pinned project order", err);
        }
      );
    },
    [setUserData, updateUserProfile, userData]
  );

  const toggleProjectPin = useCallback(
    (project: Project) => {
      const nextPinned = !project.pinned;
      setPinnedOrder((prev) => {
        const next = nextPinned ? [project.id, ...prev.filter((id) => id !== project.id)] : prev.filter((id) => id !== project.id);
        persistPinnedProjectOrder(next);
        return next;
      });
      void updateProjectFields?.(project.id, { pinned: nextPinned }).catch((err: unknown) => {
        console.error("Failed to update pinned state", err);
      });
    },
    [persistPinnedProjectOrder, updateProjectFields]
  );

  const membersInSelectedProject = useMemo(() => {
    if (!accessProjectId) return [] as MemberRow[];
    const memberIds = new Set(access.filter((a) => a.projectIds.includes(accessProjectId)).map((a) => a.memberId));
    return members.filter((m) => memberIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [access, accessProjectId, members]);

  return (
    <div className={styles.shell}>
      <div className={styles.page}>
        <PageHeader
          sticky
          className={styles.orgPageHeader}
          title="Organization"
          subtitle="Members, invites, roles, and access"
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
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "access"}
                className={`${styles.tab} ${activeTab === "access" ? styles.tabActive : ""}`}
                onClick={() => setActiveTab("access")}
              >
                Access
              </button>
            </div>
          }
          controls={
            activeTab === "access" ? null : (
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
            )
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
              {filteredMembers.map((m) => {
                const isYou = Boolean(currentUserId && m.userId === currentUserId);
                return (
                  <div
                    key={m.id}
                    className={styles.row}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedMemberId(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelectedMemberId(m.id);
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
                        <div className={styles.email}>{m.email}</div>
                      </div>
                    </div>

                    <div className={styles.chips}>
                      <button
                        type="button"
                        className={`${styles.chip} ${styles.chipButton}`}
                        disabled={!canEditRoles}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canEditRoles) return;
                          const idx = ROLE_OPTIONS.indexOf(m.orgRole);
                          const next = ROLE_OPTIONS[(idx + 1) % ROLE_OPTIONS.length];
                          void onInlineRoleChange(m.id, next);
                        }}
                        title={canEditRoles ? "Click to change role" : "No permission"}
                      >
                        {roleLabel(m.orgRole)} <ChevronDown size={14} />
                      </button>

                      <span
                        className={`${styles.chip} ${
                          m.status === "active"
                            ? styles.chipStatusActive
                            : m.status === "invited"
                              ? styles.chipStatusInvited
                              : styles.chipStatusSuspended
                        }`}
                      >
                        {statusLabel(m.status)}
                      </span>
                    </div>

                    <div className={styles.meta}>{formatRelativeTime(m.lastActiveAt)}</div>

                    <div style={{ position: "relative", display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className={styles.menuButton}
                        aria-label="Actions"
                        onClick={(e) => {
                          e.stopPropagation();
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
                          {m.status === "invited" ? (
                            <button
                              type="button"
                              className={styles.menuItem}
                              onClick={() => {
                                setOpenMenuForMemberId(null);
                                notify("info", "Resend invite is not wired yet.");
                              }}
                            >
                              Resend invite
                            </button>
                          ) : null}
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
                );
              })}
            </div>
          )}

          <MemberDrawer
            open={!!selectedMember}
            onClose={() => setSelectedMemberId(null)}
            member={selectedMember}
            projects={projects}
            access={selectedAccess}
            canEditRole={canEditRoles}
            canEditProfile={canManage}
            canEditAccess={false}
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
                                await updateUserProfile({ userId: uid, collaborators: updated });
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

      {activeTab === "access" ? (
        <section className={`${styles.panel} ${styles.panelFlex}`} aria-label="Access">
          <div className={styles.listHeader}>
            <div className={styles.listTitle}>
              <h3 className={styles.accessTitle}>Access</h3>
              <p className={styles.accessSubtitle}>Project-centric access management</p>
            </div>
          </div>

          <div className={styles.accessGrid}>
            <div className={styles.accessProjectsPane}>
              <div className={styles.accessProjectsScroll}>
                <div className={styles.accessProjectsHeader}>
                  <div className={styles.accessProjectsHeaderRow}>
                    <div className={styles.accessProjectsTitle}>Projects</div>
                    <div className={`${styles.pill} ${styles.accessProjectsCountPill}`} aria-label="Project count">
                      {projectSearchQuery.trim() ? `${filteredProjects.length} / ${projects.length}` : `${projects.length}`}
                    </div>
                  </div>
                  <div className={`${styles.search} ${styles.accessProjectsSearch}`}>
                    <Search size={16} />
                    <input
                      className={`${styles.searchInput} ${styles.accessProjectsSearchInput}`}
                      placeholder="Search projects…"
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.accessProjectsList}>
                  {orderedFilteredProjects.pinned.length ? (
                    <div className={styles.accessProjectsSection}>
                      <div className={styles.accessProjectsSectionLabel}>
                        <span>Pinned</span>
                        <span className={styles.accessProjectsSectionCount}>{orderedFilteredProjects.pinned.length}</span>
                      </div>
                      {orderedFilteredProjects.pinned.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`${styles.accessProjectRow} ${p.id === accessProjectId ? styles.accessProjectRowActive : ""}`}
                          onClick={() => setAccessProjectId(p.id)}
                          title={p.name}
                        >
                          <ProjectAvatar thumb={p.thumbUrl ?? undefined} name={p.name} className={styles.accessProjectAvatar} />
                          <span className={styles.accessProjectName}>{p.name}</span>
                          <span className={styles.accessProjectRowActions}>
                            <button
                              type="button"
                              className={`${styles.accessProjectPinButton} ${p.pinned ? styles.accessProjectPinButtonActive : ""}`}
                              aria-label={p.pinned ? "Unpin project" : "Pin project"}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleProjectPin(p);
                              }}
                            >
                              {p.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}
                            </button>
                            <span className={styles.accessProjectMemberCount} aria-label="Members with access">
                              {projectMemberCounts.get(p.id) ?? 0}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className={styles.accessProjectsSection}>
                    <div className={styles.accessProjectsSectionLabel}>
                      <span>All</span>
                      <span className={styles.accessProjectsSectionCount}>{orderedFilteredProjects.all.length}</span>
                    </div>
                    {orderedFilteredProjects.all.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`${styles.accessProjectRow} ${p.id === accessProjectId ? styles.accessProjectRowActive : ""}`}
                        onClick={() => setAccessProjectId(p.id)}
                        title={p.name}
                      >
                        <ProjectAvatar thumb={p.thumbUrl ?? undefined} name={p.name} className={styles.accessProjectAvatar} />
                        <span className={styles.accessProjectName}>{p.name}</span>
                        <span className={styles.accessProjectRowActions}>
                          <button
                            type="button"
                            className={`${styles.accessProjectPinButton} ${p.pinned ? styles.accessProjectPinButtonActive : ""}`}
                            aria-label={p.pinned ? "Unpin project" : "Pin project"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleProjectPin(p);
                            }}
                          >
                            {p.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}
                          </button>
                          <span className={styles.accessProjectMemberCount} aria-label="Members with access">
                            {projectMemberCounts.get(p.id) ?? 0}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>

                  {filteredProjects.length === 0 ? (
                    <div className={styles.accessProjectsEmpty}>
                      <div style={{ fontWeight: 650 }}>No matching projects</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>Try a different search term.</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={styles.accessMembersPane}>
              <div className={styles.accessMembersHeader}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontWeight: 650 }}>{accessProject?.name ?? "Select a project"}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Members with access</div>
                </div>
                <div className={styles.pill}>{membersInSelectedProject.length}</div>
              </div>

              <div className={styles.accessMembersBody}>
                {membersInSelectedProject.length === 0 ? (
                  <div className={styles.empty}>
                    <p className={styles.emptyTitle}>No one has access</p>
                    <p className={styles.emptySubtitle}>Access editing is coming next.</p>
                  </div>
                ) : (
                  <div className={styles.list}>
                    {membersInSelectedProject.map((m) => (
                      <div
                        key={m.id}
                        className={styles.row}
                        style={{ gridTemplateColumns: "1fr 220px" }}
                        onClick={() => setSelectedMemberId(m.id)}
                      >
                        <div className={styles.identity}>
                          <div className={styles.avatar} aria-hidden>
                            {renderAvatar({ name: m.name, avatarUrl: m.avatarUrl })}
                          </div>
                          <div className={styles.nameEmail}>
                            <div className={styles.nameLine}>
                              <div className={styles.name}>{m.name}</div>
                            </div>
                            <div className={styles.email}>{m.email}</div>
                          </div>
                        </div>
                        <div className={styles.chips} style={{ justifyContent: "flex-end" }}>
                          <span className={styles.chip}>{roleLabel(m.orgRole)}</span>
                          <span className={styles.chip} style={{ opacity: 0.72 }}>
                            Per-project roles later
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <MemberDrawer
                open={!!selectedMember}
                onClose={() => setSelectedMemberId(null)}
                member={selectedMember}
                projects={projects}
                access={selectedAccess}
                canEditRole={canEditRoles}
                canEditProfile={canManage}
                canEditAccess={false}
                onRoleChange={onInlineRoleChange}
                onSave={onDrawerSave}
              />
            </div>
          </div>
        </section>
      ) : null}

      <InviteModal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} onSend={sendInvite} />
      </div>
    </div>
  );
}
