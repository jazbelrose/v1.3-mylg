import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ChevronDown, User as UserIcon } from "lucide-react";
import { Kebab } from "@/shared/icons/Kebab";
import { useData } from "@/app/contexts/useData";
import { useOnlineStatus } from "@/app/contexts/OnlineStatusContext";
import SVGThumbnail from "./SvgThumbnail";
import styles from "./projects-panel.module.css";
import { useProjectKpis, type ProjectLike } from "../hooks/useProjectKpis";
import { getFileUrl } from "../../../shared/utils/api";
import { MICRO_WOBBLE_SCALE, SPRING_FAST } from "@/shared/ui/motionTokens";
import Squircle from "@/shared/ui/Squircle";
import MobileQuickActions from "@/shared/ui/MobileQuickActions";

type Props = {
  onOpenProject: (projectId: string) => void;
};

type ProjectWithMeta = ProjectLike & { _activity: number; _created: number };

const getMaxQuickProjectIcons = (width?: number): number => {
  if (!width) return 5;
  if (width <= 360) return 2;
  if (width <= 400) return 3;
  if (width <= 520) return 4;
  if (width <= 680) return 5;
  if (width <= 840) return 6;
  return 7;
};

const formatShortDate = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString(undefined, { month: "short", day: "numeric" });
};

const getProjectActivityTs = (p: ProjectLike): number => {
  const candidates: (string | undefined)[] = [
    p.updatedAt,
    p.dateUpdated,
    p.lastModified,
    p.date,
    p.dateCreated,
  ];
  if (Array.isArray(p.timelineEvents)) {
    for (const ev of p.timelineEvents) {
      if (ev?.timestamp) candidates.push(ev.timestamp);
      if (ev?.date) candidates.push(ev.date);
    }
  }
  const timestamps = candidates
    .filter(Boolean)
    .map((s) => new Date(s as string).getTime())
    .filter((n) => Number.isFinite(n));
  return timestamps.length ? Math.max(...timestamps) : 0;
};

const ProjectsPanelMobile: React.FC<Props> = ({ onOpenProject }) => {
  const reduceMotion = useReducedMotion();
  const { projects, isLoading, projectsError, fetchProjects, userData } = useData();
  const { isOnline } = useOnlineStatus();
  const navigate = useNavigate();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [imgError, setImgError] = useState<Record<string, boolean>>({});
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const [maxQuickIcons, setMaxQuickIcons] = useState(() =>
    getMaxQuickProjectIcons(
      typeof window === "undefined" ? undefined : window.innerWidth
    )
  );
  const skeletonRows = useMemo(() => Array.from({ length: 4 }), []);
  const skeletonQuickIcons = useMemo(
    () => Array.from({ length: Math.min(Math.max(maxQuickIcons, 3), 6) }),
    [maxQuickIcons]
  );

  const thumbnailKey = userData?.thumbnail?.trim();
  const thumbnailUrl = userData?.thumbnailUrl?.trim();
  const avatarSrc = useMemo(() => {
    if (!thumbnailKey && !thumbnailUrl) return undefined;

    if (thumbnailKey) {
      try {
        return getFileUrl(thumbnailKey);
      } catch {
        return thumbnailUrl;
      }
    }

    return thumbnailUrl;
  }, [thumbnailKey, thumbnailUrl]);

  const avatarInitial = useMemo(() => {
    const initial =
      userData?.firstName?.trim()?.[0] ||
      userData?.lastName?.trim()?.[0] ||
      userData?.email?.trim()?.[0] ||
      "";
    return initial.toUpperCase();
  }, [userData?.email, userData?.firstName, userData?.lastName]);

  const userId = userData?.userId;
  const isUserOnline = userId ? isOnline(String(userId)) : false;

  // Compact filter/sort options (mirrors AllProjects)
  type SortOption = "titleAsc" | "titleDesc" | "dateNewest" | "dateOldest";
  const [sortOption, setSortOption] = useState<SortOption>("dateNewest");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [scope, setScope] = useState<"recents" | "all">("all");
  // Icons-only strip lives next to the title; main list remains compact list rows

  useEffect(() => {
    if (!isLoading && projects.length === 0 && !projectsError) {
      fetchProjects();
    }
  }, [isLoading, projects.length, projectsError, fetchProjects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () =>
      setMaxQuickIcons(getMaxQuickProjectIcons(window.innerWidth));
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuOpenId) return;
      const el = menuRefs.current[menuOpenId];
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpenId]);

  // Close filters popover on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!filtersOpen) return;
      if (
        filtersRef.current &&
        e.target instanceof Node &&
        !filtersRef.current.contains(e.target)
      ) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [filtersOpen]);

  const statuses = useMemo(() => {
    try {
      return Array.from(
        new Set(
          (projects as ProjectLike[])
            .map((p) => String(p.status || "").toLowerCase())
            .filter(Boolean)
        )
      );
    } catch {
      return [] as string[];
    }
  }, [projects]);

  const items = useMemo(() => {
    const list: ProjectWithMeta[] = (projects as ProjectLike[]).map((p) => ({
      ...p,
      _activity: getProjectActivityTs(p),
      _created: new Date(p.dateCreated || p.date || 0).getTime() || 0,
    }));

    // Base ordering by scope
    let ordered = list.slice();
    if (scope === "recents") {
      ordered.sort((a, b) => b._activity - a._activity);
    }

    // Filters
    const q = query.trim().toLowerCase();
    if (q) {
      ordered = ordered.filter((p) =>
        (p.title || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      ordered = ordered.filter(
        (p) => String(p.status || "").toLowerCase() === statusFilter
      );
    }

    // Sort
    const byTitle = (a: ProjectLike, b: ProjectLike) =>
      (a.title || "").localeCompare(b.title || "", undefined, {
        sensitivity: "base",
      });
    const byCreated = (a: ProjectWithMeta, b: ProjectWithMeta) =>
      b._created - a._created; // newest first
    const byCreatedAsc = (a: ProjectWithMeta, b: ProjectWithMeta) =>
      a._created - b._created; // oldest first

    switch (sortOption) {
      case "titleAsc":
        ordered.sort(byTitle);
        break;
      case "titleDesc":
        ordered.sort((a, b) => -byTitle(a, b));
        break;
      case "dateOldest":
        ordered.sort(byCreatedAsc);
        break;
      case "dateNewest":
      default:
        ordered.sort(byCreated);
        break;
    }

    return ordered;
  }, [projects, sortOption, statusFilter, query, scope]);

  const kpis = useProjectKpis(projects as ProjectLike[]);

  const nextProjectLabel = (() => {
    if (!kpis.nextProject) return "No upcoming projects";
    const title = kpis.nextProject.title.trim() || "N/A";
    const date = (kpis.nextProject.date || "").trim();
    return `Next: ${title}${date ? ` ${date}` : ""}`;
  })();

  const nextProjectTitle =
    nextProjectLabel !== "No upcoming projects" ? nextProjectLabel : undefined;
  const pendingLabel = `${kpis.pendingProjects} Pending`;

  const errorText = projectsError ? "Failed to load projects." : undefined;

  const handleOpen = (id: string) => onOpenProject(id);

  const handleKeyRow = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen(id);
    }
  };

  const toggleMenu = (id: string) =>
    setMenuOpenId((prev) => (prev === id ? null : id));
  const onAction = (
    action: "open" | "pin" | "unpin" | "archive",
    id: string
  ) => {
    console.log(`Project ${id}: ${action}`);
    if (action === "open") handleOpen(id);
    setMenuOpenId(null);
  };

  const scopeLabel = scope === "recents" ? "Recents" : "All projects";

  return (
    <section
      aria-label="Projects"
      className={`${styles.panel} ${styles.panelFullBleed}`}
    >
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <h3 className={styles.title}>Projects</h3>
          {/* Icons strip: ultra-compact, icons only */}
          {(() => {
            const allProjects = projects as ProjectLike[];
            const shown = allProjects.slice(0, maxQuickIcons);
            const more = Math.max(0, allProjects.length - shown.length);

            return (
              <div className={styles.iconsStrip} aria-label="Quick projects">
                {shown.map((p) => {
                  const id = p.projectId;
                  const title = (p.title || "Untitled project").trim();
                  const thumb =
                    Array.isArray(p.thumbnails) && p.thumbnails[0]
                      ? p.thumbnails[0]
                      : undefined;
                  return (
                    <Squircle
                      key={`icon-${id}`}
                      as="button"
                      type="button"
                      className={styles.iconBtnSm}
                      aria-label={`Open project ${title}`}
                      title={title}
                      onClick={() => handleOpen(id)}
                      radius={8}
                    >
                      {thumb && !imgError[id] ? (
                        <img
                          className={`${styles.thumbSm} ${styles.thumbSquircle}`}
                          src={getFileUrl(thumb)}
                          alt=""
                          onError={() =>
                            setImgError((m) => ({ ...m, [id]: true }))
                          }
                        />
                      ) : (
                        <SVGThumbnail
                          initial={
                            (p.title || "Untitled project")
                              .trim()
                              .charAt(0)
                              .toUpperCase() || "#"
                          }
                          className={`${styles.thumbSm} ${styles.thumbSquircle}`}
                        />
                      )}
                    </Squircle>
                  );
                })}
                {more > 0 && (
                  <span className={styles.iconsMore} aria-hidden>
                    +{more}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
        <div className={styles.headerControls}>
          <MobileQuickActions className={styles.quickActions} iconSize={18} />
          <button
            type="button"
            className={`header-icon-btn ${styles.avatarButton}`}
            aria-label="Open profile"
            title={userData?.firstName || userData?.email || undefined}
            onClick={() => navigate("/settings")}
          >
            <span
              className={`welcome-header-avatar welcome-header-avatar--compact ${styles.avatar}`}
            >
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="welcome-header-avatar__img" />
              ) : avatarInitial ? (
                <span className="welcome-header-avatar__placeholder" aria-hidden>
                  {avatarInitial}
                </span>
              ) : (
                <span className="welcome-header-avatar__placeholder" aria-hidden>
                  <UserIcon size={18} />
                </span>
              )}
              {isUserOnline ? (
                <span
                  className="welcome-header-avatar__status welcome-header-avatar__status--compact"
                  aria-label="Online"
                />
              ) : null}
            </span>
          </button>

          <div className={styles.recentsWrap} ref={filtersRef}>
            <button
              type="button"
              className={styles.recents}
              aria-expanded={filtersOpen}
              aria-haspopup="menu"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              {scopeLabel} <ChevronDown size={14} aria-hidden />
            </button>
            {filtersOpen && (
              <div className={styles.filterPop} role="menu">
                <div className={styles.filterSection}>
                <div
                  className={styles.scopeBtns}
                  role="group"
                  aria-label="Scope"
                >
                  <button
                    type="button"
                    className={`${styles.scopeBtn} ${
                      scope === "recents" ? styles.scopeBtnActive : ""
                    }`}
                    onClick={() => setScope("recents")}
                  >
                    Recents
                  </button>
                  <button
                    type="button"
                    className={`${styles.scopeBtn} ${
                      scope === "all" ? styles.scopeBtnActive : ""
                    }`}
                    onClick={() => setScope("all")}
                  >
                    All projects
                  </button>
                </div>

                <input
                  className={styles.input}
                  placeholder="Filter projects..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Filter projects"
                />

                {statuses.length > 0 && (
                  <select
                    className={styles.select}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                  >
                    <option value="">All statuses</option>
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  className={styles.select}
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  aria-label="Sort projects"
                >
                  <option value="titleAsc">Title (A-Z)</option>
                  <option value="titleDesc">Title (Z-A)</option>
                  <option value="dateNewest">Date (Newest)</option>
                  <option value="dateOldest">Date (Oldest)</option>
                </select>
              </div>
            </div>
          )}
        </div>
        </div>

        <div className={styles.kpis}>
          <motion.span
            className={`${styles.chip} ${styles.chipNext}`}
            title={nextProjectTitle}
            whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
            whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
            transition={reduceMotion ? undefined : SPRING_FAST}
          >
            {nextProjectLabel}
          </motion.span>
          <motion.span
            className={`${styles.chip} ${styles.chipNoWrap}`}
            title={pendingLabel}
            whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
            whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
            transition={reduceMotion ? undefined : SPRING_FAST}
          >
            {pendingLabel}
          </motion.span>
        </div>
      </header>

      {errorText && <div className={styles.inlineError}>{errorText}</div>}

      <div className={styles.list} role="list">
        {isLoading ? (
          <div className={styles.skeletonList} aria-hidden>
            <div className={styles.skeletonIconsStrip}>
              {skeletonQuickIcons.map((_, index) => (
                <div
                  key={`skeleton-icon-${index}`}
                  className={styles.skeletonIconBtn}
                />
              ))}
            </div>
            {skeletonRows.map((_, index) => (
              <div
                key={`skeleton-row-${index}`}
                className={`${styles.row} ${styles.skeletonRow}`}
              >
                <div className={`${styles.rowMain} ${styles.skeletonRowMain}`}>
                  <div className={styles.skeletonThumb} />
                  <div className={styles.skeletonMeta}>
                    <div className={styles.skeletonLine} />
                    <div className={styles.skeletonLineShort} />
                  </div>
                </div>
                <div className={styles.skeletonMenu} />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className={styles.empty} role="note">
            No projects match filters
          </div>
        ) : (
          items.map((p) => {
            const dateIso =
              p.updatedAt ||
              p.dateUpdated ||
              p.lastModified ||
              p.date ||
              p.dateCreated;
            const dateLabel = formatShortDate(dateIso);
            const id = p.projectId;
            const title = (p.title || "Untitled project").trim();
            const isMenuOpen = menuOpenId === id;
            const onKey = (e: React.KeyboardEvent) => handleKeyRow(e, id);
            const thumb =
              Array.isArray(p.thumbnails) && p.thumbnails[0]
                ? p.thumbnails[0]
                : undefined;
            return (
              <div key={id} className={styles.row} role="listitem">
                <div
                  className={styles.rowMain}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpen(id)}
                  onKeyDown={onKey}
                  aria-label={`Open project ${title}`}
                >
                  <Squircle as="div" className={styles.icon} aria-hidden radius={10}>
                    {thumb && !imgError[id] ? (
                      <img
                        className={`${styles.thumb} ${styles.thumbSquircle}`}
                        src={getFileUrl(thumb)}
                        alt=""
                        onError={() =>
                          setImgError((m) => ({ ...m, [id]: true }))
                        }
                      />
                    ) : (
                      <SVGThumbnail
                        initial={
                          title.charAt(0).toUpperCase() || "#"
                        }
                        className={`${styles.thumb} ${styles.thumbSquircle}`}
                      />
                    )}
                  </Squircle>
                  <div className={styles.meta}>
                    <div className={styles.titleRow}>
                      <div className={styles.titleLeft}>
                        <span className={styles.name}>{title}</span>
                      </div>
                      {dateLabel ? (
                        <span className={styles.dateInline}>{dateLabel}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div
                  className={`${styles.menu} ${
                    isMenuOpen ? styles.menuOpen : ""
                  }`}
                  ref={(el) => {
                    menuRefs.current[id] = el;
                  }}
                >
                  <button
                    type="button"
                    className={styles.menuBtn}
                    aria-label="Project actions"
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    onClick={() => toggleMenu(id)}
                  >
                    <Kebab size={20} aria-hidden />
                  </button>
                  {isMenuOpen && (
                    <div className={styles.menuPop} role="menu">
                      <button
                        className={styles.menuItem}
                        role="menuitem"
                        onClick={() => onAction("open", id)}
                      >
                        Open
                      </button>
                      <button
                        className={styles.menuItem}
                        role="menuitem"
                        onClick={() => onAction("pin", id)}
                      >
                        Pin
                      </button>
                      <button
                        className={styles.menuItem}
                        role="menuitem"
                        onClick={() => onAction("archive", id)}
                      >
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.ctaWrap}>
        <button
          type="button"
          className={styles.cta}
          onClick={() => navigate("/dashboard/projects/allprojects")}
        >
          See all projects
        </button>
      </div>
    </section>
  );
};

export default ProjectsPanelMobile;
