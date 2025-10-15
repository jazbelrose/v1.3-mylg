import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Kebab } from "@/shared/icons/Kebab";
import { useData } from "@/app/contexts/useData";
import { ProjectCard } from "@/shared/icons/ProjectCard";
import Squircle from "@/shared/ui/Squircle";
import { getFileUrl } from "../../../shared/utils/api";

const CARD_RADIUS = 18;
const CARD_CORNER_RADII = Object.freeze({ top: CARD_RADIUS + 2, bottom: CARD_RADIUS - 2 });

type ProjectLike = {
  projectId: string;
  title?: string;
  status?: string;
  date?: string;
  dateCreated?: string;
  updatedAt?: string;
  dateUpdated?: string;
  lastModified?: string;
  thumbnails?: string[];
  timelineEvents?: Array<{ id?: string; title?: string; date?: string; timestamp?: string }>;
};

type Props = {
  onOpenProject?: (projectId: string) => void;
};

const formatShortDate = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString(undefined, { month: "short", day: "numeric" });
};

const getProjectActivityTs = (p: ProjectLike): number => {
  const candidates: (string | undefined)[] = [
    p.updatedAt as string | undefined,
    p.dateUpdated as string | undefined,
    p.lastModified as string | undefined,
    p.date as string | undefined,
    p.dateCreated as string | undefined,
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

const ProjectsRecentsCard: React.FC<Props> = ({ onOpenProject }) => {
  const { projects, isLoading, projectsError, fetchProjects } = useData();
  const navigate = useNavigate();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isLoading && projects.length === 0 && !projectsError) {
      fetchProjects();
    }
  }, [isLoading, projects.length, projectsError, fetchProjects]);

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

  const recent = useMemo(() => {
    const enriched = (projects as ProjectLike[]).map((p) => ({
      ...p,
      _ts: getProjectActivityTs(p),
    }));
    enriched.sort((a, b) => b._ts - a._ts);
    return enriched.slice(0, 3);
  }, [projects]);

  const errorText = projectsError ? "Failed to load projects." : undefined;

  const handleOpen = (id: string) => {
    if (onOpenProject) return onOpenProject(id);
    // Fallback: route to projects list, then rely on default flow
    navigate("/dashboard/projects/allprojects");
  };

  const handleKeyRow = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen(id);
    }
  };

  const toggleMenu = (id: string) => {
    setMenuOpenId((prev) => (prev === id ? null : id));
  };

  const onAction = (action: "open" | "pin" | "unpin" | "archive", id: string) => {
    // Callbacks only; integrate with real handlers later
     
    console.log(`Project ${id}: ${action}`);
    if (action === "open") handleOpen(id);
    setMenuOpenId(null);
  };

  return (
    <Squircle
      as="section"
      aria-label="Projects"
      className="projects-recents-card"
      radius={CARD_RADIUS}
      smoothing={0.6}
      cornerRadii={CARD_CORNER_RADII}
    >
      <div className="prc-header">
        <h3 className="prc-title">Projects</h3>
        <button
          type="button"
          className="prc-recents-btn"
          aria-expanded={false}
        >
          Recents <ChevronDown size={16} aria-hidden />
        </button>
      </div>

      {errorText && <div className="prc-inline-error">{errorText}</div>}

      <div className="prc-list" role="list">
        {isLoading ? (
          <div className="prc-row skeleton" aria-hidden>
            <div className="prc-icon skel" />
            <div className="prc-meta">
              <div className="skel-bar" />
            </div>
          </div>
        ) : recent.length === 0 ? (
          <div className="prc-empty" role="note">No recent projects yet</div>
        ) : (
          recent.map((p) => {
            const dateIso = p.updatedAt || p.dateUpdated || p.lastModified || p.date || p.dateCreated;
            const dateLabel = formatShortDate(dateIso);
            const id = p.projectId;
            const title = (p.title || "Untitled project").trim();
            const open = () => handleOpen(id);
            const onKey = (e: React.KeyboardEvent) => handleKeyRow(e, id);
            const isMenuOpen = menuOpenId === id;
            const thumb = Array.isArray(p.thumbnails) && p.thumbnails[0]
              ? p.thumbnails[0] as string
              : undefined;
            return (
              <div key={id} className="prc-row" role="listitem">
                <div
                  className="prc-row-main"
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={onKey}
                  aria-label={`Open project ${title}`}
                >
                  <Squircle as="div" className="prc-icon" aria-hidden radius={10}>
                    {thumb && !imgError[id] ? (
                      <img
                        className="prc-thumb prc-thumbSquircle"
                        src={getFileUrl(thumb)}
                        alt=""
                        onError={() => setImgError((m) => ({ ...m, [id]: true }))}
                      />
                    ) : (
                      <ProjectCard size={16} color="#fff" />
                    )}
                  </Squircle>
                  <div className="prc-meta">
                    <div className="prc-title-row">
                      <div className="prc-title-left">
                        <span className="prc-name">{title}</span>
                      </div>
                      {dateLabel ? <span className="prc-date-inline">{dateLabel}</span> : null}
                    </div>
                  </div>
                </div>

                <div
                  className="prc-menu"
                  ref={(el) => {
                    menuRefs.current[id] = el;
                  }}
                >
                  <button
                    type="button"
                    className="prc-menu-btn"
                    aria-label="Project actions"
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    onClick={() => toggleMenu(id)}
                  >
                    <Kebab size={20} aria-hidden />
                  </button>
                  {isMenuOpen && (
                    <div className="prc-menu-pop" role="menu">
                      <button className="prc-menu-item" role="menuitem" onClick={() => onAction("open", id)}>
                        Open
                      </button>
                      <button className="prc-menu-item" role="menuitem" onClick={() => onAction("pin", id)}>
                        Pin
                      </button>
                      <button className="prc-menu-item" role="menuitem" onClick={() => onAction("archive", id)}>
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

      <button
        type="button"
        className="prc-cta"
        onClick={() => navigate("/dashboard/projects/allprojects")}
      >
        See all projects
      </button>
    </Squircle>
  );
};

export default ProjectsRecentsCard;









