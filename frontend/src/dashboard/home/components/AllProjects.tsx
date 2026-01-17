import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LayoutGrid, List, MoreVertical, Pin, PinOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import SVGThumbnail from './SvgThumbnail';
import Spinner from '../../../shared/ui/Spinner';
import AvatarStack from '../../../shared/ui/AvatarStack';
import { ProjectsFilterMenu } from './ProjectsFilterMenu';
import GlobalSearch from './GlobalSearch';
import QuickCreateTaskModal from './QuickCreateTaskModal';
import Outlook14d, { type OutlookRange, type OutlookDay } from './Outlook14d';
import AllEventsAndTasksPanel from "./AllEventsAndTasksPanel";
import AssignedPopover, { type AssignedPopoverAnchor } from './AssignedPopover';
import { useProjectFilters } from './hooks/useProjectFilters';
import {
  parseProjectStatusToNumber,
  useProjectKpis,
  type ProjectLike,
} from '@/dashboard/home/hooks/useProjectKpis';
import { useTasksOverview } from '@/dashboard/home/hooks/useTasksOverview';
import type { UserLite, TeamMember } from '../../../app/contexts/DataProvider';
import { useData } from '@/app/contexts/useData';
import { useOrg } from '@/app/contexts/useOrg';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { getFileUrl, updateTask } from '../../../shared/utils/api';
import desktopStyles from './ProjectsPanelDesktop.module.css';
import mobileStyles from '@/dashboard/home/components/projects-panel.module.css';
import { MICRO_WOBBLE_SCALE, SPRING_FAST } from '@/shared/ui/motionTokens';
import Squircle from '@/shared/ui/Squircle';
import {
  readPinnedOrder,
  reconcilePinnedOrder,
  writePinnedOrder,
} from '@/dashboard/home/utils/pinnedOrder';
import { arraysEqual, moveIdBeforeTarget } from '@/dashboard/home/utils/reorder';
import { notifyAction, notify } from '@/shared/ui/ToastNotifications';
import commandCenterStyles from './ProjectsCommandCenter.module.css';

const DEFAULT_RECENTS_LIMIT = 12;
const VIEW_MODE_STORAGE_KEY = 'all-projects-view-mode';

type DashboardView = 'all' | 'my' | 'team' | 'pinned';
type DashboardKpi = 'overdue' | 'due14d' | 'atRisk' | 'unread' | 'unassigned' | 'noLocation';
type DashboardDateWindow = { start: Date | null; end: Date | null };

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
        {Math.round(value)}%
      </text>
    </svg>
  );
};

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  const copy = new Date(value.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function isDateInWindow(date: Date, window: DashboardDateWindow): boolean {
  if (!window.start || !window.end) return true;
  const d = startOfDay(date).getTime();
  const s = startOfDay(window.start).getTime();
  const e = startOfDay(window.end).getTime();
  const min = Math.min(s, e);
  const max = Math.max(s, e);
  return d >= min && d <= max;
}

const AllProjects: React.FC = () => {
  const {
    projects,
    isLoading,
    fetchProjectDetails,
    projectsError,
    fetchProjects,
    allUsers,
    updateProjectFields,
    userData,
    setUserData,
    updateUserProfile,
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
  const [pinnedOrder, setPinnedOrder] = useState<string[]>(() => {
    const fromProfile = (userData as unknown as { pinnedProjectOrder?: unknown } | null)?.pinnedProjectOrder;
    if (Array.isArray(fromProfile)) {
      return fromProfile.filter((id): id is string => typeof id === 'string');
    }
    return readPinnedOrder();
  });
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);

  const { orgs, activeOrgId, setActiveOrgId } = useOrg();
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);

  const [dashboardView, setDashboardView] = useState<DashboardView>('all');
  const [activeKpi, setActiveKpi] = useState<DashboardKpi | null>(null);
  const [dateWindow, setDateWindow] = useState<DashboardDateWindow>({ start: null, end: null });
  const [outlookStart, setOutlookStart] = useState<Date>(() => startOfDay(new Date()));

  const tasksOverview = useTasksOverview();
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  const [assignedPopover, setAssignedPopover] = useState<{ projectId: string; anchor: AssignedPopoverAnchor } | null>(null);
  const [teamOverrides, setTeamOverrides] = useState<Record<string, string[]>>({});

  const persistPinnedProjectOrder = useCallback(
    (nextOrder: string[]) => {
      if (!userData?.userId) return;
      setUserData((prev) =>
        prev ? ({ ...prev, pinnedProjectOrder: nextOrder } as UserLite) : prev
      );
      void updateUserProfile({ ...(userData as Record<string, unknown>), userId: userData.userId, pinnedProjectOrder: nextOrder }).catch(
        (err: unknown) => {
          console.error('Failed to persist pinned project order', err);
        },
      );
    },
    [setUserData, updateUserProfile, userData],
  );

  // Prefer server-stored pinned order when available (cross-device), falling back to localStorage.
  useEffect(() => {
    const fromProfile = (userData as unknown as { pinnedProjectOrder?: unknown } | null)?.pinnedProjectOrder;
    if (!Array.isArray(fromProfile)) return;

    const profileOrder = fromProfile.filter((id): id is string => typeof id === 'string');
    if (!profileOrder.length) return;

    const pinnedIds = projects
      .filter((project) => project.pinned)
      .map((project) => project.projectId);

    const next = reconcilePinnedOrder(profileOrder, pinnedIds);
    setPinnedOrder((prev) => (arraysEqual(prev, next) ? prev : next));
  }, [projects, userData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const activeOrg = useMemo(() => {
    if (!Array.isArray(orgs) || !orgs.length) return null;
    if (!activeOrgId) return orgs[0] ?? null;
    return orgs.find((o) => o.orgId === activeOrgId) ?? orgs[0] ?? null;
  }, [activeOrgId, orgs]);

  const activeOrgName = (activeOrg?.name || 'Organization').trim() || 'Organization';
  const activeOrgInitial = (activeOrgName[0] || 'O').toUpperCase();

  useEffect(() => {
    if (!orgMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const chip = document.getElementById('projects-org-chip');
      const menu = document.getElementById('projects-org-menu');
      if (chip && chip.contains(target)) return;
      if (menu && menu.contains(target)) return;
      setOrgMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [orgMenuOpen]);

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

  const orderedDisplayedProjects = useMemo(() => {
    const pinnedSet = new Set(pinnedOrder);
    const orderedPinned = pinnedOrder
      .map((id) => displayedProjects.find((project) => project.projectId === id && project.pinned))
      .filter((project): project is Project => Boolean(project));
    const extras = displayedProjects.filter(
      (project) => project.pinned && !pinnedSet.has(project.projectId),
    );
    const rest = displayedProjects.filter((project) => !project.pinned);
    return [...orderedPinned, ...extras, ...rest];
  }, [displayedProjects, pinnedOrder]);

  const kpis = useProjectKpis(projects as ProjectLike[]);

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

  const projectsById = useMemo(() => {
    const map = new Map<string, Project>();
    (projects as Project[]).forEach((p) => {
      if (p?.projectId) map.set(p.projectId, p);
    });
    return map;
  }, [projects]);

  const myUserId = userData?.userId ? String(userData.userId) : null;

  const extractTeamIds = useCallback((project: ProjectLike): string[] => {
    const raw = (project as unknown as { team?: unknown }).team;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((member) => {
        if (typeof member === 'string') return member.trim();
        if (member && typeof member === 'object' && 'userId' in (member as Record<string, unknown>)) {
          return String((member as Record<string, unknown>).userId || '').trim();
        }
        return '';
      })
      .filter(Boolean);
  }, []);

  const getDisplayedTeamIds = useCallback(
    (project: ProjectLike): string[] => {
      const override = teamOverrides[(project as ProjectLike).projectId];
      if (Array.isArray(override)) return override;
      return extractTeamIds(project);
    },
    [extractTeamIds, teamOverrides],
  );

  useEffect(() => {
    setTeamOverrides((prev) => {
      const entries = Object.entries(prev);
      if (!entries.length) return prev;

      let changed = false;
      const next: Record<string, string[]> = { ...prev };

      for (const [projectId, overrideIds] of entries) {
        const project = projectsById.get(projectId);
        if (!project) {
          delete next[projectId];
          changed = true;
          continue;
        }

        const actual = extractTeamIds(project).slice().sort();
        const desired = (overrideIds || []).slice().sort();
        const equal = actual.length === desired.length && actual.every((id, idx) => id === desired[idx]);
        if (equal) {
          delete next[projectId];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [extractTeamIds, projectsById]);

  const resolveTeamMembers = useCallback(
    (project: ProjectLike): NonNullable<Project['team']> => {
      const ids = getDisplayedTeamIds(project);
      return ids
        .map((userId) => {
          const u = usersById.get(userId) || ({} as UserLite);
          return {
            userId,
            firstName: (u.firstName as string) || '',
            lastName: (u.lastName as string) || '',
            thumbnail: (u.thumbnail as string) || (u.thumbnailUrl as string) || undefined,
          };
        })
        .filter((m) => Boolean(m.userId));
    },
    [getDisplayedTeamIds, usersById],
  );

  const isMyProject = useCallback(
    (project: ProjectLike): boolean => {
      if (!myUserId) return false;
      const teamIds = getDisplayedTeamIds(project);
      const ownerId = (project as unknown as { ownerId?: string }).ownerId;
      return teamIds.includes(myUserId) || (ownerId ? String(ownerId) === myUserId : false);
    },
    [getDisplayedTeamIds, myUserId],
  );

  const isTeamProject = useCallback(
    (project: ProjectLike): boolean => {
      const teamIds = getDisplayedTeamIds(project);
      if (!teamIds.length) return false;
      if (!myUserId) return true;
      return !teamIds.includes(myUserId);
    },
    [getDisplayedTeamIds, myUserId],
  );

  const tasksReady = !tasksOverview.loading && !tasksOverview.error;
  const openTasks = tasksOverview.openTasks ?? [];
  const undatedTasks = tasksOverview.undatedTasks ?? [];

  const taskKpiData = useMemo(() => {
    const today = startOfDay(new Date());
    const fourteenEnd = addDays(today, 13);

    const overdue = openTasks.filter((t) => Boolean(t.dueDate && startOfDay(t.dueDate).getTime() < today.getTime()));
    const due14d = openTasks.filter((t) => {
      if (!t.dueDate) return false;
      const d = startOfDay(t.dueDate).getTime();
      return d >= today.getTime() && d <= fourteenEnd.getTime();
    });

    const unassigned = [...openTasks, ...undatedTasks].filter((t) => !t.assigneeId);
    const noLocation = [...openTasks, ...undatedTasks].filter((t) => !t.address && !t.location);

    const overdueProjectIds = new Set(overdue.map((t) => t.projectId));
    const due14ProjectIds = new Set(due14d.map((t) => t.projectId));
    const unassignedProjectIds = new Set(unassigned.map((t) => t.projectId));
    const noLocationProjectIds = new Set(noLocation.map((t) => t.projectId));

    const unreadProjectIds = new Set(
      (projects as Project[])
        .filter((p) => Number((p as { unreadCount?: number }).unreadCount ?? 0) > 0)
        .map((p) => p.projectId),
    );

    const atRiskProjectIds = new Set(
      (projects as Project[]).filter((p) => {
        const finishline = p.finishline ? new Date(p.finishline) : null;
        if (!finishline || Number.isNaN(finishline.getTime())) return false;
        const statusNum = parseProjectStatusToNumber(p.status);
        const isLate = startOfDay(finishline).getTime() < today.getTime() && statusNum < 100;
        const isSoon = startOfDay(finishline).getTime() <= fourteenEnd.getTime() && statusNum < 80;
        return isLate || isSoon;
      }).map((p) => p.projectId),
    );

    return {
      counts: {
        overdue: overdue.length,
        due14d: due14d.length,
        atRisk: atRiskProjectIds.size,
        unread: unreadProjectIds.size,
        unassigned: unassigned.length,
        noLocation: noLocation.length,
      },
      projectSets: {
        overdue: overdueProjectIds,
        due14d: due14ProjectIds,
        atRisk: atRiskProjectIds,
        unread: unreadProjectIds,
        unassigned: unassignedProjectIds,
        noLocation: noLocationProjectIds,
      },
      queues: {
        needsOwner: unassigned.length,
        needsDate: undatedTasks.length,
        needsLocation: noLocation.length,
      },
      today,
      fourteenEnd,
    };
  }, [openTasks, projects, undatedTasks]);

  const selectedWindowProjectIds = useMemo(() => {
    if (!dateWindow.start || !dateWindow.end) return null;
    const set = new Set<string>();
    openTasks.forEach((task) => {
      if (task.dueDate && isDateInWindow(task.dueDate, dateWindow)) {
        set.add(task.projectId);
      }
    });
    return set;
  }, [dateWindow.end, dateWindow.start, openTasks]);

  const filteredOpenTasks = useMemo(() => {
    const list = openTasks.slice();

    const afterView = list.filter((task) => {
      const project = projectsById.get(task.projectId);
      if (!project) return false;
      if (dashboardView === 'pinned') return Boolean(project.pinned);
      if (dashboardView === 'my') return isMyProject(project);
      if (dashboardView === 'team') return isTeamProject(project);
      return true;
    });

    const afterKpi = activeKpi
      ? afterView.filter((task) => {
          const project = projectsById.get(task.projectId);
          if (!project) return false;
          if (activeKpi === 'overdue') return taskKpiData.projectSets.overdue.has(task.projectId);
          if (activeKpi === 'due14d') return taskKpiData.projectSets.due14d.has(task.projectId);
          if (activeKpi === 'atRisk') return taskKpiData.projectSets.atRisk.has(task.projectId);
          if (activeKpi === 'unread') return taskKpiData.projectSets.unread.has(task.projectId);
          if (activeKpi === 'unassigned') return !task.assigneeId;
          if (activeKpi === 'noLocation') return !task.address && !task.location;
          return true;
        })
      : afterView;

    if (!dateWindow.start || !dateWindow.end) return afterKpi;
    return afterKpi.filter((task) => task.dueDate && isDateInWindow(task.dueDate, dateWindow));
  }, [
    activeKpi,
    dashboardView,
    dateWindow.end,
    dateWindow.start,
    isMyProject,
    isTeamProject,
    openTasks,
    projectsById,
    taskKpiData.projectSets,
  ]);

  const filteredUndatedTasks = useMemo(() => {
    const list = undatedTasks.slice();

    const afterView = list.filter((task) => {
      const project = projectsById.get(task.projectId);
      if (!project) return false;
      if (dashboardView === 'pinned') return Boolean(project.pinned);
      if (dashboardView === 'my') return isMyProject(project);
      if (dashboardView === 'team') return isTeamProject(project);
      return true;
    });

    if (!activeKpi) return afterView;
    if (activeKpi === 'unassigned') return afterView.filter((t) => !t.assigneeId);
    if (activeKpi === 'noLocation') return afterView.filter((t) => !t.address && !t.location);
    return [];
  }, [activeKpi, dashboardView, isMyProject, isTeamProject, projectsById, undatedTasks]);

  const outlookDays = useMemo(() => {
    const start = startOfDay(outlookStart);
    const days: OutlookDay[] = Array.from({ length: 14 }, (_, idx) => {
      const date = addDays(start, idx);
      const key = dateKey(date);
      const tasks = openTasks.filter((t) => t.dueDate && dateKey(t.dueDate) === key).length;

      const events = (projects as Project[]).reduce((acc, p) => {
        const list = Array.isArray(p.timelineEvents) ? p.timelineEvents : [];
        const hit = list.filter((ev) => {
          const d = ev?.date ? new Date(String(ev.date)) : ev?.timestamp ? new Date(String(ev.timestamp)) : null;
          return Boolean(d && !Number.isNaN(d.getTime()) && dateKey(d) === key);
        }).length;
        return acc + hit;
      }, 0);

      const exception = idx === 0 && taskKpiData.counts.overdue > 0;
      return { date, tasks, events, exception };
    });
    return days;
  }, [openTasks, outlookStart, projects, taskKpiData.counts.overdue]);

  const dashboardFilteredOrderedProjects = useMemo(() => {
    const hasWindow = Boolean(dateWindow.start && dateWindow.end);

    return orderedDisplayedProjects.filter((project) => {
      if (dashboardView === 'pinned' && !project.pinned) return false;
      if (dashboardView === 'my' && !isMyProject(project)) return false;
      if (dashboardView === 'team' && !isTeamProject(project)) return false;

      if (activeKpi) {
        if (activeKpi === 'overdue' && tasksReady && !taskKpiData.projectSets.overdue.has(project.projectId)) return false;
        if (activeKpi === 'due14d' && tasksReady && !taskKpiData.projectSets.due14d.has(project.projectId)) return false;
        if (activeKpi === 'atRisk' && !taskKpiData.projectSets.atRisk.has(project.projectId)) return false;
        if (activeKpi === 'unread' && !taskKpiData.projectSets.unread.has(project.projectId)) return false;
        if (activeKpi === 'noLocation' && tasksReady && !taskKpiData.projectSets.noLocation.has(project.projectId)) return false;
        if (activeKpi === 'unassigned') {
          const teamIds = getDisplayedTeamIds(project);
          const hasTeam = teamIds.length > 0;
          const hasUnassignedTasks = tasksReady ? taskKpiData.projectSets.unassigned.has(project.projectId) : true;
          if (hasTeam && !hasUnassignedTasks) return false;
        }
      }

      if (hasWindow) {
        if (tasksReady && selectedWindowProjectIds) {
          return selectedWindowProjectIds.has(project.projectId);
        }
        const deadline = project.finishline ? new Date(project.finishline) : null;
        return Boolean(deadline && !Number.isNaN(deadline.getTime()) && isDateInWindow(deadline, dateWindow));
      }

      return true;
    });
  }, [
    activeKpi,
    dashboardView,
    dateWindow,
    getDisplayedTeamIds,
    isMyProject,
    isTeamProject,
    orderedDisplayedProjects,
    selectedWindowProjectIds,
    taskKpiData.projectSets,
    tasksReady,
  ]);

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

  const toggleProjectPin = useCallback(
    (project: Project) => {
      const nextPinned = !project.pinned;
      setPinnedOrder((prev) => {
        const next = nextPinned
          ? [project.projectId, ...prev.filter((id) => id !== project.projectId)]
          : prev.filter((id) => id !== project.projectId);
        persistPinnedProjectOrder(next);
        return next;
      });
      void updateProjectFields(project.projectId, { pinned: nextPinned }).catch((err) => {
        console.error('Failed to update pinned state', err);
      });
    },
    [persistPinnedProjectOrder, updateProjectFields],
  );

  const handleDragStart = useCallback(
    (projectId: string) => (event: React.DragEvent<HTMLLIElement>) => {
      if (!projectId) return;
      event.stopPropagation();
      event.dataTransfer?.setData('text/plain', projectId);
      setDraggedProjectId(projectId);
    },
    [],
  );

  const handleDragOver = useCallback(
    (projectId: string) => (event: React.DragEvent<HTMLLIElement>) => {
      if (!projectId || projectId === draggedProjectId) return;
      event.preventDefault();
      setDragOverProjectId(projectId);
    },
    [draggedProjectId],
  );

  const handleDragLeave = useCallback(
    (projectId: string) => () => {
      if (dragOverProjectId === projectId) {
        setDragOverProjectId(null);
      }
    },
    [dragOverProjectId],
  );

  const handleDrop = useCallback(
    (project: Project) => (event: React.DragEvent<HTMLLIElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!draggedProjectId || project.projectId === draggedProjectId || !project.pinned) {
        return;
      }
      setPinnedOrder((prev) => {
        const next = moveIdBeforeTarget(prev, draggedProjectId, project.projectId);
        persistPinnedProjectOrder(next);
        return next;
      });
      setDragOverProjectId(null);
    },
    [draggedProjectId, persistPinnedProjectOrder],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedProjectId(null);
    setDragOverProjectId(null);
  }, []);

  const handleListDragOver = useCallback(
    (event: React.DragEvent<HTMLUListElement>) => {
      if (!draggedProjectId) return;
      event.preventDefault();
    },
    [draggedProjectId],
  );

  const handleListDrop = useCallback(
    (event: React.DragEvent<HTMLUListElement>) => {
      event.preventDefault();
      if (!draggedProjectId) return;
      if (event.currentTarget === event.target) {
        setPinnedOrder((prev) => {
          const next = moveIdBeforeTarget(prev, draggedProjectId);
          persistPinnedProjectOrder(next);
          return next;
        });
        setDragOverProjectId(null);
      }
    },
    [draggedProjectId, persistPinnedProjectOrder],
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

  useEffect(() => {
    writePinnedOrder(pinnedOrder);
  }, [pinnedOrder]);

  useEffect(() => {
    const pinnedIds = projects
      .filter((project) => project.pinned)
      .map((project) => project.projectId);
    setPinnedOrder((prev) => {
      const next = reconcilePinnedOrder(prev, pinnedIds);
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [projects]);

  const toggleMenu = (id: string) =>
    setMenuOpenId((prev) => (prev === id ? null : id));

  const onAction = (
    action: 'open' | 'pin' | 'unpin' | 'archive',
    id: string,
  ) => {
    if (action === 'open') {
      handleOpenProject(id);
    }
    if (action === 'pin' || action === 'unpin') {
      const project = projects.find((p: Project) => p.projectId === id);
      if (project) {
        toggleProjectPin(project);
      }
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

  const isSingleProject = dashboardFilteredOrderedProjects.length === 1;

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
              draggable={false}
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
  } else if (dashboardFilteredOrderedProjects.length === 0) {
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
          No projects match your Command Center filters
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
        {dashboardFilteredOrderedProjects.map((project: Project) => (
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
    // Helper to parse status to number
    const parseStatusToNumber = (status: unknown): number => {
      if (status === undefined || status === null) return 0;
      const str = typeof status === "string" ? status : String(status);
      const num = parseFloat(str.replace("%", ""));
      return Number.isNaN(num) ? 0 : num;
    };

    content = (
      <ul
        className="projects-list"
        onDragOver={handleListDragOver}
        onDrop={handleListDrop}
      >
        {dashboardFilteredOrderedProjects.map((project: Project) => {
          const team = resolveTeamMembers(project);
          const progress = parseStatusToNumber(project.status);
          const dateLabel = formatShortDate(project.dateCreated || project.date);
          const isMenuOpen = menuOpenId === project.projectId;
          return (
            <li
              key={project.projectId}
              className={[
                'project-list-item',
                draggedProjectId === project.projectId ? 'is-dragging' : '',
                dragOverProjectId === project.projectId ? 'is-drag-over' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="button"
              tabIndex={0}
              draggable={Boolean(project.pinned)}
              onDragStart={project.pinned ? handleDragStart(project.projectId) : undefined}
              onDragOver={project.pinned ? handleDragOver(project.projectId) : undefined}
              onDragLeave={project.pinned ? handleDragLeave(project.projectId) : undefined}
              onDrop={project.pinned ? handleDrop(project) : undefined}
              onDragEnd={project.pinned ? handleDragEnd : undefined}
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
                <ProgressRing value={progress} />
                <div
                  className="project-list-team"
                  role="button"
                  tabIndex={0}
                  aria-label="Edit assigned team"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    setAssignedPopover({
                      projectId: project.projectId,
                      anchor: { x: rect.left + rect.width / 2, y: rect.bottom } as AssignedPopoverAnchor,
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      setAssignedPopover({
                        projectId: project.projectId,
                        anchor: { x: rect.left + rect.width / 2, y: rect.bottom } as AssignedPopoverAnchor,
                      });
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {team.length ? (
                    <AvatarStack members={team} size={24} />
                  ) : (
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Assign</span>
                  )}
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>+</span>
                </div>
                <button
                  type="button"
                  className={`project-list-pin-btn ${
                    project.pinned ? 'project-list-pin-btn--active' : ''
                  }`}
                  aria-pressed={project.pinned}
                  aria-label={project.pinned ? 'Unpin project' : 'Pin project'}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleProjectPin(project);
                  }}
                >
                  {project.pinned ? (
                    <PinOff size={16} />
                  ) : (
                    <Pin size={16} />
                  )}
                </button>
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
        <div className={commandCenterStyles.commandCenter}>
          <div className={commandCenterStyles.headerRow}>
            <div className={commandCenterStyles.leftGroup}>
              <div className={commandCenterStyles.title}>Projects</div>

              <div className={commandCenterStyles.orgChipWrap}>
                <button
                  id="projects-org-chip"
                  type="button"
                  className={commandCenterStyles.orgChip}
                  aria-haspopup="menu"
                  aria-expanded={orgMenuOpen}
                  aria-controls="projects-org-menu"
                  onClick={() => setOrgMenuOpen((prev) => !prev)}
                >
                  <span className={commandCenterStyles.orgDot} aria-hidden>
                    {activeOrgInitial}
                  </span>
                  <span className={commandCenterStyles.orgName}>{activeOrgName}</span>
                </button>

                {orgMenuOpen && orgs.length ? (
                  <div id="projects-org-menu" className={commandCenterStyles.orgMenu} role="menu">
                    {orgs.map((org) => (
                      <button
                        key={org.orgId}
                        type="button"
                        role="menuitem"
                        className={[
                          commandCenterStyles.orgMenuItem,
                          org.orgId === activeOrgId ? commandCenterStyles.orgMenuItemActive : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          setActiveOrgId(org.orgId);
                          setOrgMenuOpen(false);
                        }}
                      >
                        {org.name || org.orgId}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={commandCenterStyles.viewSelector} role="group" aria-label="View selector">
                {[
                  ['all', 'All'],
                  ['my', 'My'],
                  ['team', 'Team'],
                  ['pinned', 'Pinned'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={[
                      commandCenterStyles.viewBtn,
                      dashboardView === (value as DashboardView) ? commandCenterStyles.viewBtnActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={dashboardView === (value as DashboardView)}
                    onClick={() => setDashboardView(value as DashboardView)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className={commandCenterStyles.rightGroup}>
              <div style={{ minWidth: 260, flex: '1 1 320px' }}>
                <GlobalSearch />
              </div>

              <div className={commandCenterStyles.actions}>
                <motion.button
                  type="button"
                  className={commandCenterStyles.actionBtn}
                  whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
                  whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
                  transition={reduceMotion ? undefined : SPRING_FAST}
                  onClick={() => navigate('/dashboard/new')}
                >
                  New project
                </motion.button>
                <motion.button
                  type="button"
                  className={commandCenterStyles.actionBtn}
                  whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
                  whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
                  transition={reduceMotion ? undefined : SPRING_FAST}
                  onClick={() => setTaskModalOpen(true)}
                >
                  New task
                </motion.button>

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
                  triggerLabel="Filters"
                  showScopeSelector={false}
                  popoverAlign="end"
                />

                <div className={desktopStyles.viewToggle} role="group" aria-label="Layout">
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
            </div>
          </div>

          <div className={commandCenterStyles.kpisRow} aria-label="KPI filters">
            {[
              ['overdue', 'Overdue', taskKpiData.counts.overdue],
              ['due14d', 'Due 14d', taskKpiData.counts.due14d],
              ['atRisk', 'At risk', taskKpiData.counts.atRisk],
              ['unread', 'Unread', taskKpiData.counts.unread],
              ['unassigned', 'Unassigned', taskKpiData.counts.unassigned],
              ['noLocation', 'No location', taskKpiData.counts.noLocation],
            ].map(([kpiKey, label, count]) => (
              <button
                key={kpiKey}
                type="button"
                className={[
                  commandCenterStyles.kpiChip,
                  activeKpi === (kpiKey as DashboardKpi) ? commandCenterStyles.kpiChipActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={activeKpi === (kpiKey as DashboardKpi)}
                onClick={() =>
                  setActiveKpi((prev) => (prev === (kpiKey as DashboardKpi) ? null : (kpiKey as DashboardKpi)))
                }
                disabled={!tasksReady && (kpiKey === 'overdue' || kpiKey === 'due14d' || kpiKey === 'unassigned' || kpiKey === 'noLocation')}
                title={!tasksReady && (kpiKey === 'overdue' || kpiKey === 'due14d' || kpiKey === 'unassigned' || kpiKey === 'noLocation') ? 'Loading tasks…' : undefined}
              >
                <span className={commandCenterStyles.kpiLabel}>{label}</span>
                <span className={commandCenterStyles.kpiValue}>{count}</span>
              </button>
            ))}

            <button
              type="button"
              className={[
                commandCenterStyles.kpiChip,
                showPendingOnly ? commandCenterStyles.kpiChipActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={showPendingOnly}
              onClick={() => setShowPendingOnly((prev) => !prev)}
              title="Toggle pending projects"
            >
              <span className={commandCenterStyles.kpiLabel}>Pending</span>
              <span className={commandCenterStyles.kpiValue}>{kpis.pendingProjects}</span>
            </button>
          </div>

          <Outlook14d
            days={outlookDays}
            selected={dateWindow as OutlookRange}
            onPrevRange={() => {
              const nextStart = addDays(outlookStart, -14);
              const rangeStart = startOfDay(outlookStart);
              const rangeEnd = addDays(rangeStart, 13);
              const isRangeSelected = Boolean(
                dateWindow.start &&
                  dateWindow.end &&
                  sameDay(startOfDay(dateWindow.start), rangeStart) &&
                  sameDay(startOfDay(dateWindow.end), rangeEnd),
              );
              setOutlookStart(nextStart);
              if (isRangeSelected) {
                const ns = startOfDay(nextStart);
                setDateWindow({ start: ns, end: addDays(ns, 13) });
              }
            }}
            onNextRange={() => {
              const nextStart = addDays(outlookStart, 14);
              const rangeStart = startOfDay(outlookStart);
              const rangeEnd = addDays(rangeStart, 13);
              const isRangeSelected = Boolean(
                dateWindow.start &&
                  dateWindow.end &&
                  sameDay(startOfDay(dateWindow.start), rangeStart) &&
                  sameDay(startOfDay(dateWindow.end), rangeEnd),
              );
              setOutlookStart(nextStart);
              if (isRangeSelected) {
                const ns = startOfDay(nextStart);
                setDateWindow({ start: ns, end: addDays(ns, 13) });
              }
            }}
            onSelectDay={(day) => setDateWindow({ start: startOfDay(day), end: startOfDay(day) })}
            onToggleSelectRange={() => {
              const rangeStart = startOfDay(outlookStart);
              const rangeEnd = addDays(rangeStart, 13);
              const isRangeSelected = Boolean(
                dateWindow.start &&
                  dateWindow.end &&
                  sameDay(startOfDay(dateWindow.start), rangeStart) &&
                  sameDay(startOfDay(dateWindow.end), rangeEnd),
              );
              setDateWindow(isRangeSelected ? { start: null, end: null } : { start: rangeStart, end: rangeEnd });
            }}
          />
        </div>
      </header>
      <div className="projects-scrollable">
        {content}

        {/*
        <TriageStream
          tasks={filteredOpenTasks}
          undatedTasks={filteredUndatedTasks}
          onOpenProject={(projectId) => handleOpenProject(projectId)}
          onMarkDone={async (task) => {
            const id = task.taskId ?? task.id;
            try {
              await tasksOverview.markTaskDone(id);
              notify('success', 'Task marked done');
            } catch (err) {
              console.error('Failed to mark task done', err);
              notify('error', 'Failed to mark task done');
            }
          }}
          onReschedule={async (task, nextDue) => {
            const taskId = task.taskId ?? (task.rawTask as { taskId?: string; id?: string }).taskId ?? (task.rawTask as { id?: string }).id ?? task.id;
            if (!taskId) return;
            const prev = task.dueDate ? new Date(task.dueDate.getTime()) : null;

            tasksOverview.updateTaskStatus(task.id, task.status, { dueDate: nextDue ?? null });

            const toIso = (d: Date | null) => (d ? new Date(d.getTime()).toISOString() : null);
            const payload = nextDue ? { dueDate: toIso(nextDue), dueAt: toIso(nextDue) } : { dueDate: null, dueAt: null };

            try {
              await updateTask({
                projectId: task.projectId,
                taskId,
                title: task.title,
                ...(payload as unknown as Record<string, unknown>),
              });
              void tasksOverview.refreshTasks();
              notifyAction('info', 'Rescheduled task', 'Undo', () => {
                void (async () => {
                  tasksOverview.updateTaskStatus(task.id, task.status, { dueDate: prev });
                  try {
                    await updateTask({
                      projectId: task.projectId,
                      taskId,
                      title: task.title,
                      ...(prev ? ({ dueDate: toIso(prev), dueAt: toIso(prev) } as unknown as Record<string, unknown>) : ({ dueDate: null, dueAt: null } as unknown as Record<string, unknown>)),
                    });
                    void tasksOverview.refreshTasks();
                  } catch (err) {
                    console.error('Undo reschedule failed', err);
                    notify('error', 'Undo failed');
                  }
                })();
              });
            } catch (err) {
              console.error('Failed to reschedule task', err);
              tasksOverview.updateTaskStatus(task.id, task.status, { dueDate: prev });
              notify('error', 'Failed to reschedule');
            }
          }}
          headerFilters={
            <>
              {(() => {
                const today = startOfDay(new Date());
                const setRange = (start: Date, end: Date) => setDateWindow({ start, end });
                const isActiveRange = (start: Date, end: Date) =>
                  Boolean(
                    dateWindow.start &&
                      dateWindow.end &&
                      sameDay(startOfDay(dateWindow.start), start) &&
                      sameDay(startOfDay(dateWindow.end), end),
                  );

                return (
                  <>
                    <button
                      type="button"
                      className={[commandCenterStyles.kpiChip, isActiveRange(today, today) ? commandCenterStyles.kpiChipActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setRange(today, today)}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className={[commandCenterStyles.kpiChip, isActiveRange(today, addDays(today, 6)) ? commandCenterStyles.kpiChipActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setRange(today, addDays(today, 6))}
                    >
                      Next 7
                    </button>
                    <button
                      type="button"
                      className={[commandCenterStyles.kpiChip, isActiveRange(today, addDays(today, 29)) ? commandCenterStyles.kpiChipActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setRange(today, addDays(today, 29))}
                    >
                      Next 30
                    </button>
                    <button
                      type="button"
                      className={[commandCenterStyles.kpiChip, activeKpi === 'overdue' ? commandCenterStyles.kpiChipActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setActiveKpi((prev) => (prev === 'overdue' ? null : 'overdue'))}
                      disabled={!tasksReady}
                      title={!tasksReady ? 'Loading tasks…' : undefined}
                    >
                      Overdue
                    </button>
                    <button
                      type="button"
                      className={[commandCenterStyles.kpiChip, dashboardView === 'my' ? commandCenterStyles.kpiChipActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setDashboardView('my')}
                    >
                      Me
                    </button>
                    <button
                      type="button"
                      className={[commandCenterStyles.kpiChip, dashboardView === 'team' ? commandCenterStyles.kpiChipActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setDashboardView('team')}
                    >
                      Team
                    </button>
                    <button
                      type="button"
                      className={[commandCenterStyles.kpiChip, dashboardView === 'all' && !activeKpi && !dateWindow.start ? commandCenterStyles.kpiChipActive : ''].filter(Boolean).join(' ')}
                      onClick={() => {
                        setDashboardView('all');
                        setActiveKpi(null);
                        setDateWindow({ start: null, end: null });
                      }}
                    >
                      All
                    </button>
                  </>
                );
              })()}
            </>
          }
          emptyMessage={tasksReady ? 'No tasks due this week.' : 'Loading tasks…'}
          emptyQueues={[
            {
              id: 'needs-owner',
              label: 'Needs owner',
              count: taskKpiData.queues.needsOwner,
              onClick: () => setActiveKpi('unassigned'),
            },
            {
              id: 'needs-date',
              label: 'Needs date',
              count: taskKpiData.queues.needsDate,
              onClick: () => {
                setActiveKpi(null);
                setDateWindow({ start: null, end: null });
              },
            },
            {
              id: 'needs-location',
              label: 'Needs location',
              count: taskKpiData.queues.needsLocation,
              onClick: () => setActiveKpi('noLocation'),
            },
          ]}
        />
        */}

        <AllEventsAndTasksPanel onOpenProject={(projectId) => handleOpenProject(projectId)} />
      </div>

      <QuickCreateTaskModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        projects={(tasksOverview.projectOptions || []).map((p) => ({ id: p.id, name: p.name, color: p.color }))}
        onCreated={() => {
          setTaskModalOpen(false);
          void tasksOverview.refreshTasks();
        }}
      />

      <AssignedPopover
        open={Boolean(assignedPopover)}
        anchor={assignedPopover?.anchor ?? null}
        title="Assigned"
        users={Array.isArray(allUsers) ? allUsers : []}
        selectedUserIds={(() => {
          const projectId = assignedPopover?.projectId;
          if (!projectId) return new Set<string>();
          const project = projectsById.get(projectId);
          if (!project) return new Set<string>();
          return new Set(getDisplayedTeamIds(project));
        })()}
        onToggleUser={(userId) => {
          const projectId = assignedPopover?.projectId;
          if (!projectId) return;
          const project = projectsById.get(projectId);
          if (!project) return;

          const prevIds = getDisplayedTeamIds(project);
          const set = new Set(prevIds);
          if (set.has(userId)) set.delete(userId);
          else set.add(userId);
          const nextIds = Array.from(set);

          setTeamOverrides((prev) => ({ ...prev, [projectId]: nextIds }));
          void updateProjectFields(projectId, { team: nextIds.map((id) => ({ userId: id } as TeamMember)) });

          notifyAction('info', 'Updated assigned', 'Undo', () => {
            setTeamOverrides((prev) => ({ ...prev, [projectId]: prevIds }));
            void updateProjectFields(projectId, { team: prevIds.map((id) => ({ userId: id } as TeamMember)) });
          });
        }}
        onClose={() => setAssignedPopover(null)}
      />
    </div>
  );
};

export default AllProjects;









