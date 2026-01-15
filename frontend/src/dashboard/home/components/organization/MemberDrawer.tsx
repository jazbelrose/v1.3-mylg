import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import styles from "./organization.module.css";
import type { MemberAccess, MemberRow, OrgRole, Project } from "./types";
import { formatRelativeTime, initialsFromName } from "./utils";
import ProjectAvatar from "@/shared/ui/ProjectAvatar";
import RoleDropdown from "./RoleDropdown";

type DrawerSectionKey = "identity" | "access" | "audit";

export type MemberDrawerProps = {
  open: boolean;
  onClose: () => void;
  member: MemberRow | null;
  projects: Project[];
  access: MemberAccess | null;
  scrollToSection?: DrawerSectionKey | null;
  canEditRole: boolean;
  canEditProfile: boolean;
  canEditAccess: boolean;
  onRoleChange: (memberId: string, nextRole: OrgRole) => void;
  onSave: (nextMember: MemberRow, nextProjectIds: string[]) => void;
};

function shallowEqualStringArrays(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export default function MemberDrawer({
  open,
  onClose,
  member,
  projects,
  access,
  canEditRole,
  canEditProfile,
  canEditAccess,
  onRoleChange,
  onSave,
}: MemberDrawerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const [draft, setDraft] = useState<MemberRow | null>(null);
  const [draftProjectIds, setDraftProjectIds] = useState<string[]>([]);
  const [projectSearch, setProjectSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    const timer = window.setTimeout(() => setIsLoading(false), 250);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!member) return;
    setDraft({ ...member });
    setDraftProjectIds(access?.projectIds ? [...access.projectIds] : []);
    setProjectSearch("");
  }, [access?.projectIds, member, open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isDirty = useMemo(() => {
    const baselineProjectIds = access?.projectIds ?? [];
    if (!member || !draft) return false;
    if (draft.firstName !== member.firstName) return true;
    if (draft.lastName !== member.lastName) return true;
    if ((draft.phone ?? "") !== (member.phone ?? "")) return true;
    if ((draft.company ?? "") !== (member.company ?? "")) return true;
    if ((draft.occupation ?? "") !== (member.occupation ?? "")) return true;
    return !shallowEqualStringArrays(draftProjectIds, baselineProjectIds);
  }, [access?.projectIds, draft, draftProjectIds, member]);

  const requestClose = useCallback(() => {
    if (isDirty) {
      const ok = window.confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    onClose();
  }, [isDirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projectSearch, projects]);

  if (!open || !member) return null;

  const headerAvatar = (
    <div className={styles.avatar} aria-hidden>
      {member.avatarUrl ? (
        <img className={styles.avatarImg} src={member.avatarUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        initialsFromName(member.name)
      )}
    </div>
  );

  const modal = (
    <>
      <div className={styles.drawerOverlay} onMouseDown={requestClose} />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Member details"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderLeft}>
            {headerAvatar}
            <div className={styles.drawerTitle}>
              <div className={styles.drawerName}>{member.name}</div>
              <div className={styles.drawerEmail}>{member.email}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <RoleDropdown
              value={member.orgRole}
              options={["admin", "designer", "builder", "vendor", "client"]}
              disabled={!canEditRole}
              tooltip={canEditRole ? "Change role" : "Only admins can change roles"}
              onChange={(next) => onRoleChange(member.id, next)}
            />

            <button type="button" className={styles.iconButton} onClick={requestClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className={styles.drawerBody}>
          {isLoading ? (
            <div className={styles.section}>
              <div className={styles.sectionBody}>
                <div className={styles.skeleton} style={{ height: 14, width: "60%" }} />
                <div className={styles.skeleton} style={{ height: 14, width: "85%" }} />
                <div className={styles.skeleton} style={{ height: 14, width: "70%" }} />
              </div>
            </div>
          ) : (
            <>
              <div className={[styles.section, styles.drawerSectionIdentity].filter(Boolean).join(" ")}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>
                    <strong>Identity</strong>
                    <span>Profile and contact details</span>
                  </div>
                </div>

                <div className={styles.sectionBody}>
                  <div className={styles.field}>
                    <div className={styles.label}>Email</div>
                    <input className={styles.input} value={member.email} readOnly />
                  </div>

                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <div className={styles.label}>First name</div>
                      <input
                        className={styles.input}
                        value={draft?.firstName ?? ""}
                        readOnly={!canEditProfile}
                        onChange={(e) => setDraft((d) => (d ? { ...d, firstName: e.target.value } : d))}
                      />
                    </div>
                    <div className={styles.field}>
                      <div className={styles.label}>Last name</div>
                      <input
                        className={styles.input}
                        value={draft?.lastName ?? ""}
                        readOnly={!canEditProfile}
                        onChange={(e) => setDraft((d) => (d ? { ...d, lastName: e.target.value } : d))}
                      />
                    </div>
                  </div>

                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <div className={styles.label}>Phone</div>
                      <input
                        className={styles.input}
                        value={draft?.phone ?? ""}
                        readOnly={!canEditProfile}
                        onChange={(e) => setDraft((d) => (d ? { ...d, phone: e.target.value } : d))}
                      />
                    </div>
                    <div className={styles.field}>
                      <div className={styles.label}>Company</div>
                      <input
                        className={styles.input}
                        value={draft?.company ?? ""}
                        readOnly={!canEditProfile}
                        onChange={(e) => setDraft((d) => (d ? { ...d, company: e.target.value } : d))}
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <div className={styles.label}>Occupation</div>
                    <input
                      className={styles.input}
                      value={draft?.occupation ?? ""}
                      readOnly={!canEditProfile}
                      onChange={(e) => setDraft((d) => (d ? { ...d, occupation: e.target.value } : d))}
                    />
                  </div>
                </div>
              </div>

              <div className={[styles.section, styles.drawerSectionAccess].filter(Boolean).join(" ")}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>
                    <strong>Access</strong>
                    <span>Project access (MVP)</span>
                  </div>
                </div>

                <div className={styles.sectionBody}>
                  <div className={styles.drawerAccessProjectsScroller} aria-label="Project access">
                    <div className={styles.drawerAccessProjectsStickyHeader}>
                      <div className={styles.drawerAccessProjectsHeaderRow}>
                        <input
                          className={styles.drawerAccessProjectsSearchInput}
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          placeholder="Search projects…"
                          aria-label="Search projects"
                        />

                        <div className={styles.drawerAccessProjectsBulkActions}>
                          <button
                            type="button"
                            className={styles.drawerAccessProjectsBulkButton}
                            disabled={!canEditAccess}
                            onClick={() => setDraftProjectIds(projects.map((p) => p.id))}
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            className={styles.drawerAccessProjectsBulkButton}
                            disabled={!canEditAccess}
                            onClick={() => setDraftProjectIds([])}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className={styles.drawerAccessProjectsRows}>
                      {filteredProjects.map((p) => {
                        const checked = draftProjectIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className={[
                              styles.drawerAccessProjectRow,
                              checked ? styles.drawerAccessProjectRowChecked : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <input
                              type="checkbox"
                              className={styles.drawerAccessProjectCheckbox}
                              checked={checked}
                              disabled={!canEditAccess}
                              onChange={() =>
                                setDraftProjectIds((prev) =>
                                  prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                                )
                              }
                            />

                            <ProjectAvatar
                              thumb={p.thumbUrl ?? undefined}
                              name={p.name}
                              className={styles.drawerAccessProjectAvatar}
                              radius={10}
                            />

                            <span className={styles.drawerAccessProjectLabel} title={p.name}>
                              {p.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className={[styles.section, styles.drawerSectionAudit].filter(Boolean).join(" ")}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>
                    <strong>Audit</strong>
                    <span>Joined, invited by, last active</span>
                  </div>
                </div>

                <div className={styles.sectionBody}>
                  <div className={styles.field}>
                    <div className={styles.label}>Joined</div>
                    <div style={{ fontSize: 12.5 }}>
                      {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <div className={styles.label}>Invited by</div>
                    <div style={{ fontSize: 12.5 }}>{member.invitedBy || "—"}</div>
                  </div>
                  <div className={styles.field}>
                    <div className={styles.label}>Last active</div>
                    <div style={{ fontSize: 12.5 }}>{formatRelativeTime(member.lastActiveAt)}</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              requestClose();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!isDirty || (!canEditProfile && !canEditAccess)}
            onClick={() => {
              if (!draft) return;
              onSave(draft, draftProjectIds);
            }}
            title={!canEditProfile && !canEditAccess ? "You do not have permission" : undefined}
          >
            Save changes
          </button>
        </div>
      </aside>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
