import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AssignedPopover.module.css";
import { getFileUrl } from "@/shared/utils/api";
import type { UserLite } from "@/app/contexts/DataProvider";

export type AssignedPopoverAnchor = { x: number; y: number };

export type AssignedPopoverProps = {
  open: boolean;
  anchor: AssignedPopoverAnchor | null;
  title?: string;
  users: UserLite[];
  selectedUserIds: Set<string>;
  onToggleUser: (userId: string) => void;
  onClose: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDisplayName(user: UserLite): string {
  const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return full || user.username || user.email || user.userId;
}

export default function AssignedPopover({
  open,
  anchor,
  title = "Assigned",
  users,
  selectedUserIds,
  onToggleUser,
  onClose,
}: AssignedPopoverProps) {
  const [query, setQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") onClose();
        return;
      }
      const target = e.target as Node | null;
      if (target && popoverRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onDoc);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = getDisplayName(u).toLowerCase();
      const email = String(u.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [query, users]);

  const style = useMemo(() => {
    if (!open || !anchor) return undefined;
    const w = 320;
    const h = 380;
    const left = clamp(anchor.x - w / 2, 8, (typeof window !== "undefined" ? window.innerWidth : 1200) - w - 8);
    const top = clamp(anchor.y + 10, 8, (typeof window !== "undefined" ? window.innerHeight : 800) - h - 8);
    return { left, top } as React.CSSProperties;
  }, [anchor, open]);

  if (!open || !anchor) return null;

  return createPortal(
    <div className={styles.popover} style={style} ref={popoverRef} role="dialog" aria-label="Assigned editor">
      <div className={styles.header}>
        <div className={styles.title}>{title}</div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          {"×"}
        </button>
      </div>
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder="Search people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className={styles.list}>
        {filtered.map((user) => {
          const id = user.userId;
          const name = getDisplayName(user);
          const sub = user.email || user.username || "";
          const initial = (user.firstName?.[0] || user.lastName?.[0] || name[0] || "?").toUpperCase();
          const thumb = user.thumbnail || user.thumbnailUrl;
          const checked = selectedUserIds.has(id);

          return (
            <div
              key={id}
              className={styles.row}
              role="button"
              tabIndex={0}
              onClick={() => onToggleUser(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleUser(id);
                }
              }}
              aria-label={`${checked ? "Unassign" : "Assign"} ${name}`}
            >
              <div className={styles.user}>
                <span className={styles.avatar} aria-hidden>
                  {thumb ? <img className={styles.avatarImg} alt="" src={getFileUrl(thumb)} /> : initial}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.name}>{name}</div>
                  {sub ? <div className={styles.sub}>{sub}</div> : null}
                </div>
              </div>
              <span className={[styles.check, checked ? styles.checkOn : ""].filter(Boolean).join(" ")} aria-hidden>
                {checked ? "✓" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

