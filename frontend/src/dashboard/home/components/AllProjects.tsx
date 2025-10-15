import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LayoutGrid, List, MoreVertical, Pin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import SVGThumbnail from './SvgThumbnail';
import Spinner from '../../../shared/ui/Spinner';
import AvatarStack from '../../../shared/ui/AvatarStack';
import { ProjectsFilterMenu } from './ProjectsFilterMenu';
import { useProjectFilters } from './hooks/useProjectFilters';
import {
  parseProjectStatusToNumber,
  useProjectKpis,
  type ProjectLike,
} from '@/dashboard/home/hooks/useProjectKpis';
import type { UserLite, TeamMember } from '../../../app/contexts/DataProvider';
import { useData } from '@/app/contexts/useData';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { getFileUrl } from '../../../shared/utils/api';
import desktopStyles from './ProjectsPanelDesktop.module.css';
import mobileStyles from '@/dashboard/home/components/projects-panel.module.css';
import { MICRO_WOBBLE_SCALE, SPRING_FAST } from '@/shared/ui/motionTokens';
import Squircle from '@/shared/ui/Squircle';

const DEFAULT_RECENTS_LIMIT = 12;
const VIEW_MODE_STORAGE_KEY = 'all-projects-view-mode';

interface Project extends ProjectLike {
  pinned?: boolean;
  team?: {
    userId: string;
    firstName?: string;
    lastName?: string;
    thumbnail?: string;
  }[];
}

const ProgressRing: React.FC<{ value: number }> = ({ value }) => {
  const radius = 12;
  const stroke = 2;
  const normalized = radius - stroke;
  const circumference = normalized * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg
      className="progress-ring"
      height={radius * 2}
      width={radius * 2}
    >
      <circle
        stroke="#333"
        fill="transparent"
        strokeWidth={stroke}
        r={normalized}
        cx={radius}
        cy={radius}
      />
      <circle
        stroke="var(--brand)"
        fill="transparent"
        strokeWidth={stroke}
        strokeLinecap="round"
        r={normalized}
        cx={radius}
        cy={radius}
        strokeDasharray={`${circumference} ${circumference}`}
        style={{ strokeDashoffset: offset }}
      />
      <text
        x="50%"
        y="50%"
        dy=".3em"
        textAnchor="middle"
        fontSize="8"
        fill="#fff"
      >
        {Math.round(value)}
      </text>
    </svg>
  );
};

const AllProjects: React.FC = () => {
  const {
    projects,
    isLoading,
    fetchProjectDetails,
    projectsError,
    fetchProjects,
    allUsers,
  } = useData();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === 'grid' || stored === 'list' ? stored : 'list';
  });
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const queryMatcher = useCallback(
    (
      project: ProjectLike,
      normalizedQuery: string,
    ): boolean => {
      const title = (project.title || '').toLowerCase();
      const description = (project.description || '').toLowerCase();
      return title.includes(normalizedQuery) || description.includes(normalizedQuery);
    },
    [],
  );

  const statusFilterPredicate = useCallback((status: string) => !isPercentageStatus(status), []);

  const {
    filtersOpen,
    toggleFilters,
    filtersRef,
    filtersId,
    scope,
    setScope,
    query,
    setQuery,
    statusOptions,
    statusTriggerLabel,
    statusDropdown,
    showStatusDropdown,
    setStatusFilter,
    sortOptions,
    sortTriggerLabel,
    sortDropdown,
    filteredProjects: filteredProjectsWithMeta,
  } = useProjectFilters({
    projects: projects as ProjectLike[],
    recentsLimit: Math.max(DEFAULT_RECENTS_LIMIT, projects.length || DEFAULT_RECENTS_LIMIT),
    defaultScope: 'all',
    defaultSortOption: 'titleAsc',
    queryMatcher,
    statusFilterPredicate,
  });

  const filteredProjects = useMemo(
    () => filteredProjectsWithMeta as Project[],
    [filteredProjectsWithMeta],
  );

  const displayedProjects = useMemo(
    () =>
      showPendingOnly
        ? filteredProjects.filter(
            (project) => parseProjectStatusToNumber(project.status) < 100,
          )
        : filteredProjects,
    [filteredProjects, showPendingOnly],
  );

  const kpis = useProjectKpis(projects as ProjectLike[]);

  const nextDueProject = useMemo(() => {
    const today = new Date();
    return (projects as Project[])
      .filter((project) => {
        if (!project.finishline) return false;
        const deadline = new Date(project.finishline);
        return !Number.isNaN(deadline.getTime()) && deadline > today;
      })
      .sort((a, b) => {
        const aDate = new Date(a.finishline || 0).getTime();
        const bDate = new Date(b.finishline || 0).getTime();
        return aDate - bDate;
      })[0] ?? null;
  }, [projects]);

  const handleThumbnailError = useCallback((projectId: string) => {
    setImageErrors((prev) => {
      if (prev[projectId]) return prev;
      return { ...prev, [projectId]: true };
    });
  }, []);

  // Ensure projects are loaded when this view is displayed
  useEffect(() => {
    if (!isLoading && projects.length === 0 && !projectsError) {
      fetchProjects();
    }
  }, [isLoading, projects.length, projectsError, fetchProjects]);

  const onSelectProject = useCallback(
    (project: Project): void => {
      navigate(getProjectDashboardPath(project.projectId, project.title));

      const fetchPromise = fetchProjectDetails(project.projectId).catch((err) => {
        console.error('Error loading project', err);
      });

      void fetchPromise;
    },
    [navigate, fetchProjectDetails],
  );

  // Preload project thumbnails
  useEffect(() => {
    projects.forEach((p: Project) => {
      if (p.thumbnails && p.thumbnails[0]) {
        const img = new Image();
        img.src = p.thumbnails[0];
      }
    });
  }, [projects]);

  // Quick map for user lookups (thumbnails/names)
  const usersById = useMemo(() => {
    const map = new Map<string, UserLite>();
    (Array.isArray(allUsers) ? allUsers : []).forEach((u: UserLite) => {
      if (u?.userId) map.set(u.userId, u);
    });
    return map;
  }, [allUsers]);

  const handleProjectClick = useCallback(
    (project: Project): void => {
      onSelectProject(project);
    },
    [onSelectProject],
  );

  const handleKeyDown = (e: React.KeyboardEvent, project: Project): void => {
    if (e.key === 'Enter') {
      handleProjectClick(project);
    }
  };

  const handleOpenProject = useCallback(
    (projectId: string) => {
      const proj = projects.find((p: Project) => p.projectId === projectId);
      if (proj) {
        handleProjectClick(proj);
      }
    },
    [projects, handleProjectClick],
  );

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuOpenId) {
        const el = menuRefs.current[menuOpenId];
        if (el && e.target instanceof Node && !el.contains(e.target)) {
          setMenuOpenId(null);
        }
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpenId]);

  const toggleMenu = (id: string) =>
    setMenuOpenId((prev) => (prev === id ? null : id));

  const onAction = (
    action: 'open' | 'pin' | 'unpin' | 'archive',
    id: string,
  ) => {
    if (action === 'open') {
      handleOpenProject(id);
    }
    console.log(`Project ${id}: ${action}`);
    setMenuOpenId(null);
  };

  const isPercentageStatus = (s: string): boolean => {
    const cleaned = s.replace('%', '').trim();
    const num = Number(cleaned);
    return cleaned !== '' && !Number.isNaN(num) && num >= 0 && num <= 100;
  };

  const formatShortDate = (iso?: string): string | undefined => {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    if (!filteredProjects.length) {
      setShowPendingOnly(false);
    }
  }, [filteredProjects.length]);

  const handleShowAllProjectsChip = useCallback(() => {
    setScope('all');
    setQuery('');
    setStatusFilter('');
    setShowPendingOnly(false);
  }, [setQuery, setScope, setStatusFilter]);

  const handleTogglePendingChip = useCallback(() => {
    setScope('all');
    setQuery('');
    setStatusFilter('');
    setShowPendingOnly((prev) => !prev);
  }, [setQuery, setScope, setStatusFilter]);

  const handleOpenNextProject = useCallback(() => {
    if (!nextDueProject) return;
    onSelectProject(nextDueProject);
  }, [nextDueProject, onSelectProject]);

  const isSingleProject = displayedProjects.length === 1;

  const renderProjectThumbnail = useCallback(
    (project: Project, variant: 'grid' | 'list') => {
      const hasImage =
        !imageErrors[project.projectId] &&
        Array.isArray(project.thumbnails) &&
        project.thumbnails.length > 0;
      const thumbnailKey = hasImage ? project.thumbnails?.[0] : undefined;
      const altText = `Thumbnail of ${project.title?.trim() || 'Untitled project'}`;
      const baseClass = variant === 'grid' ? 'project-thumbnail' : 'project-list-thumb';
      const mediaClass =
        variant === 'grid' ? 'project-thumbnail-media' : 'project-list-thumb-media';
      const roundness = variant === 'grid' ? 0.92 : 0.88;
      const smoothing = variant === 'grid' ? 0.96 : 0.92;
      const containerClassName = hasImage
        ? baseClass
        : `${baseClass} ${baseClass}--placeholder`;

      return (
        <Squircle
          roundness={roundness}
          smoothing={smoothing}
          className={containerClassName}
        >
          {thumbnailKey ? (
            <img
              src={getFileUrl(thumbnailKey)}
              alt={altText}
              className={mediaClass}
              loading="lazy"
              decoding="async"
              onError={() => handleThumbnailError(project.projectId)}
            />
          ) : (
            <SVGThumbnail
              initial={project.title?.trim()?.charAt(0)?.toUpperCase() || '#'}
              className={mediaClass}
              roundness={roundness}
            />
          )}
        </Squircle>
      );
    },
    [handleThumbnailError, imageErrors],
  );

  let content: React.ReactNode;

  if (isLoading) {
    content = (
      <div
        className="all-projects-container-welcome"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          width: '100%',
        }}
      >
        <Spinner />
      </div>
    );
  } else if (projectsError) {
    content = (
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <p style={{ fontSize: '14px', color: '#aaa', textAlign: 'center' }}>
          Failed to load projects.
        </p>
      </div>
    );
  } else if (projects.length === 0) {
    content = (
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <p style={{ fontSize: '14px', color: '#aaa', textAlign: 'center' }}>
          No projects yet!
        </p>
      </div>
    );
  } else if (filteredProjects.length === 0) {
    content = (
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <p style={{ fontSize: '14px', color: '#aaa', textAlign: 'center' }}>
          No matching projects
        </p>
      </div>
    );
  } else if (showPendingOnly && displayedProjects.length === 0) {
    content = (
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <p style={{ fontSize: '14px', color: '#aaa', textAlign: 'center' }}>
          No pending projects
        </p>
      </div>
    );
  } else if (viewMode === 'grid') {
    content = (
      <div
        className={`all-projects-container-welcome ${
          isSingleProject ? 'single-item' : ''
        }`}
      >
        {displayedProjects.map((project: Project) => (
          <div
            key={project.projectId}
            className={`project-container-welcome ${
              isSingleProject ? 'single-item' : ''
            }`}
            role="button"
            tabIndex={0}
            onClick={() => handleProjectClick(project)}
            onKeyDown={(e) => handleKeyDown(e, project)}
            aria-label={`Open project ${
              project.title?.trim() || 'Untitled project'
            }`}
          >
            {renderProjectThumbnail(project, 'grid')}
            <h6 className="project-title">
              {project.title?.trim() || 'Untitled project'}
            </h6>
          </div>
        ))}
      </div>
    );
  } else {
    // Helper to normalize status text (append % if it's a bare number)
    const formatStatus = (s?: string) => {
      const raw = (s || '').trim();
      if (!raw) return '';
      const num = Number(raw);
      if (!Number.isNaN(num) && /%/.test(raw) === false && num >= 0 && num <= 100) {
        return `${num}%`;
      }
      return raw;
    };

    const normalizeTeam = (team?: Project['team']) => {
      if (!Array.isArray(team)) return [] as NonNullable<Project['team']>;
      return team.map((m: TeamMember) => {
        const u = usersById.get(m.userId) || {} as UserLite;
        return {
          userId: m.userId,
          firstName: (m.firstName || u.firstName) as string,
          lastName: (m.lastName || u.lastName) as string,
          // prefer member thumbnail, then user profile variants
          thumbnail:
            (m.thumbnail ||
            u.thumbnail ||
            m.photoUrl ||
            u.photoUrl ||
            m.avatar ||
            u.avatar ||
            m.avatarUrl ||
            u.avatarUrl ||
            m.image ||
            u.image ||
            m.profileImage ||
            u.profileImage ||
            m.profilePicture ||
            u.profilePicture ||
            m.picture ||
            u.picture) as string | undefined,
        };
      });
    };

    content = (
      <ul className="projects-list">
        {displayedProjects.map((project: Project) => {
          const statusText = formatStatus(String(project.status || ''));
          const team = normalizeTeam(project.team);
          const progress = Number(statusText.replace('%', ''));
          const showProgress =
            !Number.isNaN(progress) && progress >= 0 && progress <= 100;
          const dateLabel = formatShortDate(project.dateCreated || project.date);
          const isMenuOpen = menuOpenId === project.projectId;
          return (
            <li
              key={project.projectId}
              className="project-list-item"
              role="button"
              tabIndex={0}
              onClick={() => handleProjectClick(project)}
              onKeyDown={(e) => handleKeyDown(e, project)}
              aria-label={`Open project ${
                project.title?.trim() || 'Untitled project'
              }`}
            >
              {renderProjectThumbnail(project, 'list')}
              <div className="project-list-info">
                <div className="project-title-row">
                  <span className="project-list-title">
                    {project.title?.trim() || 'Untitled project'}
                  </span>
                  {dateLabel && (
                    <span className="project-list-date">{dateLabel}</span>
                  )}
                </div>
              </div>
              <div className="project-list-actions">
                {showProgress && <ProgressRing value={progress} />}
                {!showProgress && statusText && (
                  <span className="project-list-status">{statusText}</span>
                )}
                {team.length > 0 && (
                  <div className="project-list-team">
                    <AvatarStack members={team} size={24} />
                  </div>
                )}
                {project.pinned && <Pin size={14} className="pin-indicator" />}
              </div>
              <div
                className="project-menu"
                ref={(el) => {
                  menuRefs.current[project.projectId] = el;
                }}
              >
                <button
                  type="button"
                  className="project-menu-btn"
                  aria-label="Project actions"
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMenu(project.projectId);
                  }}
                >
                  <MoreVertical size={16} />
                </button>
                {isMenuOpen && (
                  <div className="project-menu-pop" role="menu">
                    <button
                      className="project-menu-item"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction('open', project.projectId);
                      }}
                    >
                      Open
                    </button>
                    <button
                      className="project-menu-item"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction(
                          project.pinned ? 'unpin' : 'pin',
                          project.projectId,
                        );
                      }}
                    >
                      {project.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      className="project-menu-item"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction('archive', project.projectId);
                      }}
                    >
                      Archive
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="welcome project-view">
      <header className={`projects-header ${desktopStyles.header}`}>
        <div className={desktopStyles.headerTop}>
          <ProjectsFilterMenu
            filtersOpen={filtersOpen}
            filtersRef={filtersRef}
            filtersId={filtersId}
            scope={scope}
            onScopeChange={setScope}
            query={query}
            onQueryChange={setQuery}
            toggleFilters={toggleFilters}
            statusOptions={statusOptions}
            statusTriggerLabel={statusTriggerLabel}
            statusDropdown={statusDropdown}
            showStatusDropdown={showStatusDropdown}
            sortOptions={sortOptions}
            sortTriggerLabel={sortTriggerLabel}
            sortDropdown={sortDropdown}
            triggerLabel="Filter"
            showScopeSelector={false}
            popoverAlign="start"
          />

          <div
            className={desktopStyles.viewToggle}
            role="group"
            aria-label="Change project view"
          >
            <button
              type="button"
              className={desktopStyles.toggleButton}
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid size={16} />
              Grid
            </button>
            <button
              type="button"
              className={desktopStyles.toggleButton}
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
            >
              <List size={16} />
              List
            </button>
          </div>
        </div>

        <div className={mobileStyles.kpis}>
          <motion.button
            type="button"
            className={mobileStyles.chip}
            whileHover={
              reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }
            }
            whileFocus={
              reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }
            }
            transition={reduceMotion ? undefined : SPRING_FAST}
            onClick={handleShowAllProjectsChip}
          >
            {kpis.totalProjects} Projects
          </motion.button>
          <span className={mobileStyles.dot} />
          <motion.button
            type="button"
            className={`${mobileStyles.chip} ${
              showPendingOnly ? mobileStyles.chipActive : ''
            }`}
            aria-pressed={showPendingOnly}
            whileHover={
              reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }
            }
            whileFocus={
              reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }
            }
            transition={reduceMotion ? undefined : SPRING_FAST}
            onClick={handleTogglePendingChip}
          >
            {kpis.pendingProjects} Pending
          </motion.button>
          <span className={mobileStyles.dot} />
          <motion.button
            type="button"
            className={`${mobileStyles.chip} ${mobileStyles.chipNext}`}
            whileHover={
              reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }
            }
            whileFocus={
              reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }
            }
            transition={reduceMotion ? undefined : SPRING_FAST}
            onClick={handleOpenNextProject}
            disabled={!nextDueProject}
          >
            {kpis.nextProject
              ? `Next: ${kpis.nextProject.title} ${kpis.nextProject.date}`
              : 'No upcoming projects'}
          </motion.button>
        </div>
      </header>
      <div className="projects-scrollable">{content}</div>
    </div>
  );
};

export default AllProjects;









