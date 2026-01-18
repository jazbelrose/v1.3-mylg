import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, List } from "lucide-react";
import { useData } from "@/app/contexts/useData";
import { UserLite } from "@/app/contexts/DataProvider";
import { useOrg } from "@/app/contexts/useOrg";
import { slugify } from "@/shared/utils/slug";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { prefetchBudgetData } from "@/dashboard/project/features/budget/context/useBudget";
import ProjectsPanelMobile from "@/dashboard/home/components/ProjectsPanelMobile";
import NotificationsPage from "@/dashboard/home/components/NotificationsPage";
import Messages from "@/dashboard/features/messages";
import Settings from "@/dashboard/home/components/Settings";
import Organization from "@/dashboard/home/components/organization";
import SpinnerScreen from "@/shared/ui/SpinnerScreen";
import PendingApprovalScreen from "@/shared/ui/PendingApprovalScreen";
import AllProjectsWeekWidget from "@/dashboard/home/components/AllProjectsWeekWidget";
import Outlook14d, { type OutlookDay, type OutlookRange } from "@/dashboard/home/components/Outlook14d";
import AllEventsAndTasksPanel from "@/dashboard/home/components/AllEventsAndTasksPanel";
import { ProjectsFilterMenu } from "@/dashboard/home/components/ProjectsFilterMenu";
import { useProjectFilters } from "@/dashboard/home/components/hooks/useProjectFilters";
import { useTasksOverview } from "@/dashboard/home/hooks/useTasksOverview";
import { parseProjectStatusToNumber, type ProjectLike } from "@/dashboard/home/hooks/useProjectKpis";
import { getColor } from "@/shared/utils/colorUtils";
import NavigationDrawer from "@/shared/ui/NavigationDrawer";
import DashboardNavPanel from "@/shared/ui/DashboardNavPanel";
import AppHeaderCard from "@/shared/ui/AppHeaderCard";
import ProjectsPanelDesktop from "@/dashboard/home/components/ProjectsPanelDesktop";
import { useNavCollapsed } from "@/shared/hooks/useNavCollapsed";
import commandCenterStyles from "@/dashboard/home/components/ProjectsCommandCenter.module.css";
import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";
import ProjectsIconGrid, { type IconSize } from "@/dashboard/home/components/ProjectsIconGrid";
import iconGridStyles from "@/dashboard/home/components/ProjectsIconGrid.module.css";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import "./dashboard-styles.css";

type Project = { projectId: string; title: string };

declare global {
  interface Window {
    hasUnsavedChanges?: () => boolean;
    unsavedChanges?: boolean;
  }
}

type TimelineEvent = { date?: string; timestamp?: string; description?: string };
type ProjectWithDetails = {
  projectId: string;
  title?: string;
  color?: string;
  dateCreated?: string;
  finishline?: string;
  timelineEvents?: TimelineEvent[];
};

type DashboardView = "all" | "my" | "team" | "pinned";
type DashboardKpi = "overdue" | "due14d" | "atRisk" | "unread" | "unassigned" | "noLocation";
type DashboardDateWindow = { start: Date | null; end: Date | null };

type ProjectsViewMode = "list" | "icon";
const VIEW_MODE_KEY = "mylg:projects-view-mode";
const ICON_SIZE_KEY = "mylg:projects-icon-size";

function readViewMode(): ProjectsViewMode {
  try {
    const val = localStorage.getItem(VIEW_MODE_KEY);
    if (val === "icon" || val === "list") return val;
  } catch {}
  return "list";
}

function writeViewMode(mode: ProjectsViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {}
}

function readIconSize(): IconSize {
  try {
    const val = localStorage.getItem(ICON_SIZE_KEY);
    if (val === "S" || val === "M" || val === "L") return val;
  } catch {}
  return "M";
}

function writeIconSize(size: IconSize): void {
  try {
    localStorage.setItem(ICON_SIZE_KEY, size);
  } catch {}
}

function formatShortDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  const copy = new Date(value.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function sameDay(a: Date | null, b: Date | null) {
  return !!(a && b) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
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

export const PROJECTS_OVERVIEW_VIEW = "projects-overview" as const;
export const PROJECTS_LIST_VIEW = "projects-list" as const;

// eslint-disable-next-line react-refresh/only-export-components
export const parseDashboardPath = (
  pathname: string
): { view: string; userSlug: string | null } => {
  const segments = pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("dashboard");

  if (idx === -1) {
    return { view: PROJECTS_OVERVIEW_VIEW, userSlug: null };
  }

  let view = segments[idx + 1] || PROJECTS_OVERVIEW_VIEW;
  let userSlug = segments[idx + 2] || null;

  if (view === "projects") {
    const subSegment = segments[idx + 2];
    if (!subSegment) {
      return { view: PROJECTS_OVERVIEW_VIEW, userSlug: null };
    }

    if (subSegment === "allprojects") {
      return { view: PROJECTS_LIST_VIEW, userSlug: null };
    }

    if (subSegment === "features") {
      return {
        view: segments[idx + 3] || PROJECTS_OVERVIEW_VIEW,
        userSlug: segments[idx + 4] || null,
      };
    }

    if (subSegment === "welcome") {
      const nestedView = segments[idx + 3];
      if (nestedView) {
        return {
          view: nestedView,
          userSlug: segments[idx + 4] || null,
        };
      }

      return { view: PROJECTS_OVERVIEW_VIEW, userSlug: null };
    }

    return {
      view: subSegment,
      userSlug: segments[idx + 3] || null,
    };
  }

  if (view === "features") {
    view = segments[idx + 2] || PROJECTS_OVERVIEW_VIEW;
    userSlug = segments[idx + 3] || null;
  }

  if (view === "welcome") {
    const nestedView = segments[idx + 2];
    if (nestedView) {
      view = nestedView;
      userSlug = segments[idx + 3] || null;
    } else {
      view = PROJECTS_OVERVIEW_VIEW;
      userSlug = null;
    }
  }

  return { view, userSlug };
};

const WelcomeScreen: React.FC = () => {
  const {
    userData,
    userName,
    loadingProfile,
    inbox,
    allUsers,
    projects,
    fetchProjectDetails,
  } = useData();

  const { orgs, activeOrgId, setActiveOrgId, isLoading: orgsLoading } = useOrg();

  const activeOrgName = useMemo(() => {
    const match = orgs.find((org) => org.orgId === activeOrgId);
    return match?.name || match?.orgId || null;
  }, [activeOrgId, orgs]);

  const orgDropdown = (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={[commandCenterStyles.orgCreateButton, commandCenterStyles.orgDropdownTrigger].join(" ")}
          aria-haspopup="menu"
          aria-label="Switch organization"
          title="Switch org"
          disabled={orgsLoading}
        >
          <span className={commandCenterStyles.orgDropdownValue}>
            {activeOrgName ?? (orgs.length ? "Select…" : "No orgs")}
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={commandCenterStyles.orgMenu}
          sideOffset={8}
          align="start"
          collisionPadding={12}
        >
          <DropdownMenu.Label className={commandCenterStyles.orgMenuLabel}>Org</DropdownMenu.Label>
          <DropdownMenu.Separator className={commandCenterStyles.orgMenuSeparator} />

          {orgs.length ? (
            <DropdownMenu.RadioGroup value={activeOrgId ?? ""} onValueChange={(v) => setActiveOrgId(v)}>
              {orgs.map((org) => (
                <DropdownMenu.RadioItem key={org.orgId} value={org.orgId} className={commandCenterStyles.orgMenuRadioItem}>
                  <span className={commandCenterStyles.orgMenuRadioLabel}>{org.name || org.orgId}</span>
                  <DropdownMenu.ItemIndicator className={commandCenterStyles.orgMenuRadioIndicator}>✓</DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          ) : (
            <div className={commandCenterStyles.orgMenuHint}>No orgs yet.</div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  const location = useLocation();
  const navigate = useNavigate();


  // 👉 Tooltip data for a tapped day (projects running that day + same-day events)


  const tasksOverview = useTasksOverview();
  const tasksReady = !tasksOverview.loading && !tasksOverview.error;
  const openTasks = tasksOverview.openTasks ?? [];
  const undatedTasks = tasksOverview.undatedTasks ?? [];

  const [dashboardView, setDashboardView] = useState<DashboardView>("all");
  const [activeKpi, setActiveKpi] = useState<DashboardKpi | null>(null);
  const [dateWindow, setDateWindow] = useState<DashboardDateWindow>({ start: null, end: null });
  const [outlookStart, setOutlookStart] = useState<Date>(() => startOfDay(new Date()));
  const [showPendingProjectsOnly, setShowPendingProjectsOnly] = useState(false);
  const [projectsViewMode, setProjectsViewMode] = useState<ProjectsViewMode>(readViewMode);
  const [projectsIconSize, setProjectsIconSize] = useState<IconSize>(readIconSize);

  // Persist view mode and icon size
  useEffect(() => {
    writeViewMode(projectsViewMode);
  }, [projectsViewMode]);

  useEffect(() => {
    writeIconSize(projectsIconSize);
  }, [projectsIconSize]);

  const panelsRef = useRef<HTMLDivElement | null>(null);
  const PROJECTS_HEIGHT_PX_STORAGE_KEY = "dashboardProjects.split.projectsHeightPx";
  // Reduced minimums to allow more flexibility and ensure both panels are visible
  const projectsMin = 220;
  const tasksMin = 200;
  const splitHandleHeight = 14;

  const myUserId = userData?.userId ? String(userData.userId) : null;

  const [splitContainerHeightPx, setSplitContainerHeightPx] = useState(0);
  const [projectsPanelHeightPx, setProjectsPanelHeightPx] = useState<number | null>(null);
  const projectsPanelHeightPxRef = useRef<number | null>(null);

  useEffect(() => {
    projectsPanelHeightPxRef.current = projectsPanelHeightPx;
  }, [projectsPanelHeightPx]);

  const readStoredProjectsHeightPx = useCallback(
    (userId: string | null) => {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(PROJECTS_HEIGHT_PX_STORAGE_KEY);
      if (!raw) return null;

      const parseAny = (value: string): unknown => {
        try {
          return JSON.parse(value);
        } catch {
          const n = Number.parseFloat(value);
          return Number.isFinite(n) ? n : null;
        }
      };

      const parsed = parseAny(raw);
      if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed;
      if (parsed && typeof parsed === "object" && userId) {
        const byUser = parsed as Record<string, unknown>;
        const v = byUser[userId];
        if (typeof v === "number" && Number.isFinite(v)) return v;
      }

      return null;
    },
    [PROJECTS_HEIGHT_PX_STORAGE_KEY],
  );

  useEffect(() => {
    const stored = readStoredProjectsHeightPx(myUserId);
    setProjectsPanelHeightPx(stored);
  }, [myUserId, readStoredProjectsHeightPx]);

  const clampProjectsHeight = useCallback(
    (value: number, containerHeight: number) => {
      const maxProjects = Math.max(projectsMin, containerHeight - tasksMin - splitHandleHeight);
      return Math.min(maxProjects, Math.max(projectsMin, Math.round(value)));
    },
    [projectsMin, tasksMin, splitHandleHeight],
  );

  const getDefaultProjectsHeight = useCallback(
    (containerHeight: number) => {
      // Default to ~48% of container for projects panel (smaller default)
      const raw = Math.round(containerHeight * 0.48);
      return clampProjectsHeight(raw, containerHeight);
    },
    [clampProjectsHeight],
  );

  const effectiveProjectsHeightPx = useMemo(() => {
    if (projectsPanelHeightPx != null) return projectsPanelHeightPx;
    if (!splitContainerHeightPx) return null;
    return getDefaultProjectsHeight(splitContainerHeightPx);
  }, [getDefaultProjectsHeight, projectsPanelHeightPx, splitContainerHeightPx]);

  const persistProjectsHeightPx = useCallback(
    (value: number) => {
      if (typeof window === "undefined") return;

      try {
        if (!myUserId) {
          window.localStorage.setItem(PROJECTS_HEIGHT_PX_STORAGE_KEY, String(value));
          return;
        }

        const raw = window.localStorage.getItem(PROJECTS_HEIGHT_PX_STORAGE_KEY);
        let next: Record<string, number> = {};
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (parsed && typeof parsed === "object") {
              Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
                if (typeof v === "number" && Number.isFinite(v)) next[k] = v;
              });
            } else if (typeof parsed === "number" && Number.isFinite(parsed)) {
              // Compatibility: previously stored as a plain number
              next = { [myUserId]: parsed };
            }
          } catch {
            const parsedNumber = Number.parseFloat(raw);
            if (Number.isFinite(parsedNumber)) next = { [myUserId]: parsedNumber };
          }
        }

        next[myUserId] = value;
        window.localStorage.setItem(PROJECTS_HEIGHT_PX_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
    },
    [myUserId],
  );

  useEffect(() => {
    const el = panelsRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextHeight = Math.round(entry?.contentRect?.height ?? 0);
      setSplitContainerHeightPx(nextHeight);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!splitContainerHeightPx) return;
    setProjectsPanelHeightPx((prev) => {
      const next =
        prev == null
          ? getDefaultProjectsHeight(splitContainerHeightPx)
          : clampProjectsHeight(prev, splitContainerHeightPx);
      return prev === next ? prev : next;
    });
  }, [splitContainerHeightPx, clampProjectsHeight, getDefaultProjectsHeight]);

  const draggingSplitRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleSplitHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!panelsRef.current) return;
      if (event.button !== 0) return;
      if (!splitContainerHeightPx) return;

      const effectiveStartHeight =
        projectsPanelHeightPx == null
          ? getDefaultProjectsHeight(splitContainerHeightPx)
          : clampProjectsHeight(projectsPanelHeightPx, splitContainerHeightPx);

      draggingSplitRef.current = { startY: event.clientY, startHeight: effectiveStartHeight };
      (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);

      const onMove = (e: PointerEvent) => {
        const state = draggingSplitRef.current;
        if (!state) return;
        const dy = e.clientY - state.startY;
        const next = clampProjectsHeight(state.startHeight + dy, splitContainerHeightPx);
        setProjectsPanelHeightPx(next);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const latest = projectsPanelHeightPxRef.current;
        const finalHeight = latest == null
          ? getDefaultProjectsHeight(splitContainerHeightPx)
          : clampProjectsHeight(latest, splitContainerHeightPx);
        persistProjectsHeightPx(finalHeight);
        draggingSplitRef.current = null;
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
      event.preventDefault();
    },
    [
      clampProjectsHeight,
      getDefaultProjectsHeight,
      persistProjectsHeightPx,
      projectsPanelHeightPx,
      splitContainerHeightPx,
    ],
  );

  const handleSplitHandleDoubleClick = useCallback(() => {
    if (!splitContainerHeightPx) return;
    const next = getDefaultProjectsHeight(splitContainerHeightPx);
    setProjectsPanelHeightPx(next);
    persistProjectsHeightPx(next);
  }, [getDefaultProjectsHeight, persistProjectsHeightPx, splitContainerHeightPx]);

  const projectsById = useMemo(() => {
    const map = new Map<string, ProjectWithDetails>();
    (projects as ProjectWithDetails[]).forEach((p) => {
      if (p?.projectId) map.set(p.projectId, p);
    });
    return map;
  }, [projects]);


  const extractTeamIds = useCallback((project: ProjectWithDetails): string[] => {
    const raw = (project as unknown as { team?: unknown }).team;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((member) => {
        if (typeof member === "string") return member.trim();
        if (member && typeof member === "object" && "userId" in (member as Record<string, unknown>)) {
          return String((member as Record<string, unknown>).userId || "").trim();
        }
        return "";
      })
      .filter(Boolean);
  }, []);

  const isMyProject = useCallback(
    (project: ProjectWithDetails): boolean => {
      if (!myUserId) return false;
      const teamIds = extractTeamIds(project);
      const ownerId = (project as unknown as { ownerId?: string }).ownerId;
      return teamIds.includes(myUserId) || (ownerId ? String(ownerId) === myUserId : false);
    },
    [extractTeamIds, myUserId],
  );

  const isTeamProject = useCallback(
    (project: ProjectWithDetails): boolean => {
      const teamIds = extractTeamIds(project);
      if (!teamIds.length) return false;
      if (!myUserId) return true;
      return !teamIds.includes(myUserId);
    },
    [extractTeamIds, myUserId],
  );

  const isPercentageStatus = useCallback((value: string): boolean => {
    const cleaned = value.replace("%", "").trim();
    const num = Number(cleaned);
    return cleaned !== "" && !Number.isNaN(num) && num >= 0 && num <= 100;
  }, []);

  const queryMatcher = useCallback((project: { title?: string; description?: string }, normalizedQuery: string): boolean => {
    const title = (project.title || "").toLowerCase();
    const description = (project.description || "").toLowerCase();
    return title.includes(normalizedQuery) || description.includes(normalizedQuery);
  }, []);

  const statusFilterPredicate = useCallback((status: string) => !isPercentageStatus(status), [isPercentageStatus]);

  const projectsForHeaderFilters = useMemo(() => {
    const list = projects as ProjectWithDetails[];
    if (dashboardView === "pinned") return list.filter((p) => Boolean((p as { pinned?: unknown }).pinned));
    if (dashboardView === "my") return list.filter((p) => isMyProject(p));
    if (dashboardView === "team") return list.filter((p) => isTeamProject(p));
    return list;
  }, [dashboardView, isMyProject, isTeamProject, projects]);

  const projectFilters = useProjectFilters({
    projects: projectsForHeaderFilters as unknown as ProjectLike[],
    recentsLimit: Math.max(12, projectsForHeaderFilters.length || 12),
    defaultScope: "all",
    defaultSortOption: "titleAsc",
    queryMatcher: queryMatcher as unknown as (project: any, normalizedQuery: string) => boolean,
    statusFilterPredicate,
  });

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
      (projects as ProjectWithDetails[])
        .filter((p) => Number((p as { unreadCount?: number }).unreadCount ?? 0) > 0)
        .map((p) => p.projectId),
    );

    const atRiskProjectIds = new Set(
      (projects as ProjectWithDetails[])
        .filter((p) => {
          const finishline = p.finishline ? new Date(p.finishline) : null;
          if (!finishline || Number.isNaN(finishline.getTime())) return false;
          const statusNum = parseProjectStatusToNumber((p as unknown as { status?: unknown }).status);
          const isLate = startOfDay(finishline).getTime() < today.getTime() && statusNum < 100;
          const isSoon = startOfDay(finishline).getTime() <= fourteenEnd.getTime() && statusNum < 80;
          return isLate || isSoon;
        })
        .map((p) => p.projectId),
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

    const startKey = dateKey(dateWindow.start);
    const endKey = dateKey(dateWindow.end);
    const minKey = startKey < endKey ? startKey : endKey;
    const maxKey = startKey < endKey ? endKey : startKey;
    const inKeyRange = (key: string) => key >= minKey && key <= maxKey;
    const parseEventDayKey = (ev: unknown): string | null => {
      const raw = ev as { date?: unknown; timestamp?: unknown };
      if (typeof raw?.date === "string") {
        const s = raw.date.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) return dateKey(d);
      }
      if (raw?.timestamp != null) {
        const d = new Date(String(raw.timestamp));
        if (!Number.isNaN(d.getTime())) return dateKey(d);
      }
      return null;
    };

    for (const p of projects as ProjectWithDetails[]) {
      const list = Array.isArray(p.timelineEvents) ? p.timelineEvents : [];
      for (const ev of list) {
        const key = parseEventDayKey(ev);
        if (!key || !inKeyRange(key)) continue;
        set.add(p.projectId);
        break;
      }
    }

    return set;
  }, [dateWindow.end, dateWindow.start, openTasks, projects]);

  const selectedDayKey = useMemo(() => {
    if (!dateWindow.start || !dateWindow.end) return null;
    if (!sameDay(dateWindow.start, dateWindow.end)) return null;
    return dateKey(dateWindow.start);
  }, [dateWindow.end, dateWindow.start]);

  const filteredOpenTasks = useMemo(() => {
    const afterView = openTasks.filter((task) => {
      const project = projectsById.get(task.projectId);
      if (!project) return false;
      if (dashboardView === "pinned") return Boolean((project as { pinned?: boolean }).pinned);
      if (dashboardView === "my") return isMyProject(project);
      if (dashboardView === "team") return isTeamProject(project);
      return true;
    });

    const afterKpi = activeKpi
      ? afterView.filter((task) => {
          if (activeKpi === "overdue") return taskKpiData.projectSets.overdue.has(task.projectId);
          if (activeKpi === "due14d") return taskKpiData.projectSets.due14d.has(task.projectId);
          if (activeKpi === "atRisk") return taskKpiData.projectSets.atRisk.has(task.projectId);
          if (activeKpi === "unread") return taskKpiData.projectSets.unread.has(task.projectId);
          if (activeKpi === "unassigned") return !task.assigneeId;
          if (activeKpi === "noLocation") return !task.address && !task.location;
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
    const afterView = undatedTasks.filter((task) => {
      const project = projectsById.get(task.projectId);
      if (!project) return false;
      if (dashboardView === "pinned") return Boolean((project as { pinned?: boolean }).pinned);
      if (dashboardView === "my") return isMyProject(project);
      if (dashboardView === "team") return isTeamProject(project);
      return true;
    });

    if (!activeKpi) return afterView;
    if (activeKpi === "unassigned") return afterView.filter((t) => !t.assigneeId);
    if (activeKpi === "noLocation") return afterView.filter((t) => !t.address && !t.location);
    return [];
  }, [activeKpi, dashboardView, isMyProject, isTeamProject, projectsById, undatedTasks]);

  const outlookDays = useMemo(() => {
    const start = startOfDay(outlookStart);
    const daysInRange = Array.from({ length: 14 }, (_, idx) => addDays(start, idx));
    const keys = daysInRange.map((d) => dateKey(d));
    const keysSet = new Set(keys);

    const MAX_PROJECTS = 5;

    const projectTitleById = new Map<string, string>();
    const projectColorById = new Map<string, string>();

    const outlookProjects = (projects as ProjectWithDetails[]).filter((project) => {
      if (showPendingProjectsOnly && parseProjectStatusToNumber((project as unknown as { status?: unknown }).status) >= 100) {
        return false;
      }
      if (dashboardView === "pinned" && !Boolean((project as { pinned?: boolean }).pinned)) return false;
      if (dashboardView === "my" && !isMyProject(project)) return false;
      if (dashboardView === "team" && !isTeamProject(project)) return false;

      if (activeKpi) {
        if (activeKpi === "overdue" && tasksReady && !taskKpiData.projectSets.overdue.has(project.projectId)) return false;
        if (activeKpi === "due14d" && tasksReady && !taskKpiData.projectSets.due14d.has(project.projectId)) return false;
        if (activeKpi === "atRisk" && !taskKpiData.projectSets.atRisk.has(project.projectId)) return false;
        if (activeKpi === "unread" && !taskKpiData.projectSets.unread.has(project.projectId)) return false;
        if (activeKpi === "noLocation" && tasksReady && !taskKpiData.projectSets.noLocation.has(project.projectId)) return false;
        if (activeKpi === "unassigned") {
          const hasUnassignedTasks = tasksReady ? taskKpiData.projectSets.unassigned.has(project.projectId) : true;
          if (!hasUnassignedTasks) return false;
        }
      }

      return true;
    });

    for (const p of outlookProjects) {
      const title = (p.title || (p as unknown as { name?: string }).name || p.projectId) as string;
      projectTitleById.set(p.projectId, title);
      projectColorById.set(p.projectId, p.color || getColor(p.projectId));
    }

    type BucketCounts = { tasksCount: number; eventsCount: number };
    const buckets = new Map<string, Map<string, BucketCounts>>();
    const taskCounts = new Map<string, number>();
    const eventCounts = new Map<string, number>();

    const getBucket = (key: string, projectId: string): BucketCounts | null => {
      const pMap = buckets.get(key);
      if (!pMap) return null;
      const existing = pMap.get(projectId);
      if (existing) return existing;
      const next: BucketCounts = { tasksCount: 0, eventsCount: 0 };
      pMap.set(projectId, next);
      return next;
    };

    for (const key of keys) buckets.set(key, new Map());

    const tasksForScope = openTasks.filter((task) => {
      const project = projectsById.get(task.projectId);
      if (!project) return false;
      if (dashboardView === "pinned") return Boolean((project as { pinned?: boolean }).pinned);
      if (dashboardView === "my") return isMyProject(project);
      if (dashboardView === "team") return isTeamProject(project);

      if (activeKpi) {
        if (activeKpi === "overdue" && tasksReady && !taskKpiData.projectSets.overdue.has(task.projectId)) return false;
        if (activeKpi === "due14d" && tasksReady && !taskKpiData.projectSets.due14d.has(task.projectId)) return false;
        if (activeKpi === "atRisk" && !taskKpiData.projectSets.atRisk.has(task.projectId)) return false;
        if (activeKpi === "unread" && !taskKpiData.projectSets.unread.has(task.projectId)) return false;
        if (activeKpi === "unassigned") return !task.assigneeId;
        if (activeKpi === "noLocation") return !task.address && !task.location;
      }

      return true;
    });

    for (const task of tasksForScope) {
      const due = task.dueDate;
      if (!due) continue;
      const key = dateKey(due);
      if (!keysSet.has(key)) continue;
      const bucket = getBucket(key, task.projectId);
      if (!bucket) continue;
      bucket.tasksCount += 1;
      taskCounts.set(key, (taskCounts.get(key) || 0) + 1);
    }

    // Optional (v1): overdue open tasks count only on today.
    const todayStart = startOfDay(new Date());
    const todayKey = dateKey(todayStart);
    let overdueCount = 0;
    if (keysSet.has(todayKey)) {
      for (const task of tasksForScope) {
        const due = task.dueDate;
        if (!due) continue;
        if (due.getTime() >= todayStart.getTime()) continue;
        overdueCount += 1;
        const bucket = getBucket(todayKey, task.projectId);
        if (bucket) bucket.tasksCount += 1;
      }
      if (overdueCount > 0) taskCounts.set(todayKey, (taskCounts.get(todayKey) || 0) + overdueCount);
    }

    for (const p of outlookProjects) {
      const list = Array.isArray(p.timelineEvents) ? p.timelineEvents : [];
      for (const ev of list) {
        const rawDate = (ev as { date?: unknown })?.date;
        const rawTs = (ev as { timestamp?: unknown })?.timestamp;
        let key: string | null = null;

        if (typeof rawDate === "string") {
          const s = rawDate.trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            key = s;
          } else {
            const d = new Date(s);
            if (!Number.isNaN(d.getTime())) key = dateKey(d);
          }
        } else if (rawTs != null) {
          const d = new Date(String(rawTs));
          if (!Number.isNaN(d.getTime())) key = dateKey(d);
        }

        if (!key) continue;
        if (!keysSet.has(key)) continue;
        const bucket = getBucket(key, p.projectId);
        if (!bucket) continue;
        bucket.eventsCount += 1;
        eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
      }
    }

    const days: OutlookDay[] = daysInRange.map((date) => {
      const key = dateKey(date);
      const pMap = buckets.get(key) || new Map<string, BucketCounts>();
      const entries = Array.from(pMap.entries())
        .map(([projectId, counts]) => {
          const tasksCount = counts.tasksCount;
          const eventsCount = counts.eventsCount;
          const total = tasksCount + eventsCount;
          return { projectId, tasksCount, eventsCount, total };
        })
        .filter((e) => e.total > 0)
        .sort((a, b) => {
          if (b.total !== a.total) return b.total - a.total;
          if (b.tasksCount !== a.tasksCount) return b.tasksCount - a.tasksCount;
          const aLabel = projectTitleById.get(a.projectId) || a.projectId;
          const bLabel = projectTitleById.get(b.projectId) || b.projectId;
          return aLabel.localeCompare(bLabel);
        });

      const overflowCount = Math.max(0, entries.length - MAX_PROJECTS);
      const projects = entries.map((e) => ({
        ...e,
        color: projectColorById.get(e.projectId) || getColor(e.projectId),
        label: projectTitleById.get(e.projectId) || e.projectId,
      }));

      const exception = key === todayKey && overdueCount > 0;
      return {
        date,
        tasks: taskCounts.get(key) || 0,
        events: eventCounts.get(key) || 0,
        exception,
        workload: { projects, overflowCount },
      };
    });

    return days;
  }, [
    activeKpi,
    dashboardView,
    isMyProject,
    isTeamProject,
    openTasks,
    outlookStart,
    projects,
    projectsById,
    showPendingProjectsOnly,
    taskKpiData.projectSets,
    tasksReady,
  ]);

  const projectExternalFilter = useCallback(
    (project: { projectId: string; finishline?: string; pinned?: boolean; unreadCount?: number } & ProjectWithDetails) => {
      const hasWindow = Boolean(dateWindow.start && dateWindow.end);

      if (showPendingProjectsOnly && parseProjectStatusToNumber((project as unknown as { status?: unknown }).status) >= 100) {
        return false;
      }
      if (dashboardView === "pinned" && !project.pinned) return false;
      if (dashboardView === "my" && !isMyProject(project)) return false;
      if (dashboardView === "team" && !isTeamProject(project)) return false;

      if (activeKpi) {
        if (activeKpi === "overdue" && tasksReady && !taskKpiData.projectSets.overdue.has(project.projectId)) return false;
        if (activeKpi === "due14d" && tasksReady && !taskKpiData.projectSets.due14d.has(project.projectId)) return false;
        if (activeKpi === "atRisk" && !taskKpiData.projectSets.atRisk.has(project.projectId)) return false;
        if (activeKpi === "unread" && !taskKpiData.projectSets.unread.has(project.projectId)) return false;
        if (activeKpi === "noLocation" && tasksReady && !taskKpiData.projectSets.noLocation.has(project.projectId)) return false;
        if (activeKpi === "unassigned") {
          const teamIds = extractTeamIds(project);
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
    },
    [
      activeKpi,
      dashboardView,
      dateWindow,
      extractTeamIds,
      isMyProject,
      isTeamProject,
      showPendingProjectsOnly,
      selectedWindowProjectIds,
      taskKpiData.projectSets,
      tasksReady,
    ],
  );

  const parsePath = () => parseDashboardPath(location.pathname);

  const { view: initialView, userSlug: initialDMUserSlug } = parsePath();
  const normalizeView = useCallback((view: string) => {
    if (view === "welcome") return PROJECTS_OVERVIEW_VIEW;
    if (view === "projects") return PROJECTS_OVERVIEW_VIEW;
    if (view === "allprojects") return PROJECTS_LIST_VIEW;
    return view;
  }, []);
  const [activeView, setActiveView] = useState<string>(() =>
    normalizeView(initialView)
  );
  const [dmUserSlug, setDmUserSlug] = useState<string | null>(
    initialDMUserSlug
  );
  const computeViewportFlags = React.useCallback(() => {
    if (typeof window === "undefined") {
      return { isMobile: false, isDesktop: false };
    }

    const width = window.innerWidth;

    return {
      isMobile: width < 768,
      isDesktop: width >= 1024,
    };
  }, []);
  const [{ isMobile, isDesktop }, setViewportFlags] = useState(() =>
    computeViewportFlags()
  );
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [isNavCollapsed, setIsNavCollapsed] = useNavCollapsed("dashboard");
  const rawDrawerId = useId();
  const drawerId = React.useMemo(
    () => `dashboard-nav-${rawDrawerId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawDrawerId]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setViewportFlags(computeViewportFlags());
    };

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [computeViewportFlags]);

  useEffect(() => {
    if (isDesktop) {
      setIsNavigationOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      setIsNavCollapsed(false);
    }
  }, [isDesktop, setIsNavCollapsed]);

  const handleNavigateToProject = async ({
    projectId,
  }: {
    projectId?: string;
  }) => {
    if (!projectId) return;

    const hasUnsaved =
      (typeof window.hasUnsavedChanges === "function" &&
        window.hasUnsavedChanges()) ||
      window.unsavedChanges === true;

    if (hasUnsaved) {
      const confirmLeave = window.confirm(
        "You have unsaved changes, continue?"
      );
      if (!confirmLeave) return;
    }

    const proj = projects.find((p: Project) => p.projectId === projectId);
    const path = getProjectDashboardPath(projectId, proj?.title);

    navigate(path);

    const fetchPromise = Promise.all([
      fetchProjectDetails(projectId),
      prefetchBudgetData(projectId),
    ]).catch((error) => {
      console.error("Failed to prefetch project resources", error);
    });

    void fetchPromise;
  };

  useEffect(() => {
    const { view, userSlug } = parsePath();
    const normalizedView = normalizeView(view);
    if (normalizedView !== activeView) setActiveView(normalizedView);
    if (userSlug !== dmUserSlug) setDmUserSlug(userSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, normalizeView]);

  useEffect(() => {
    if (
      !isMobile &&
      activeView === "messages" &&
      !dmUserSlug &&
      inbox &&
      inbox.length > 0 &&
      userData
    ) {
      const sorted = [...inbox].sort(
        (a, b) =>
          new Date(b.lastMsgTs).getTime() - new Date(a.lastMsgTs).getTime()
      );
      const lastThread = sorted[0];

      if (lastThread) {
        const otherId =
          lastThread.otherUserId ||
          lastThread.conversationId
            .replace("dm#", "")
            .split("___")
            .find((id) => id !== userData.userId);

        if (otherId) {
          const user = allUsers.find((u: UserLite) => u.userId === otherId);
          const slug = user
            ? slugify(`${user.firstName}-${user.lastName}`)
            : otherId;
          setDmUserSlug(slug);
          navigate(`/dashboard/features/messages/${slug}`, { replace: true });
        }
      }
    }
  }, [activeView, dmUserSlug, inbox, userData, allUsers, navigate, isMobile]);

  if (loadingProfile) return <SpinnerScreen />;
  if (userData?.pending) return <PendingApprovalScreen />;


  const renderWelcomeView = () => {
    if (isDesktop) {
      const maxProjectsHeightPx = Math.max(
        projectsMin,
        splitContainerHeightPx - tasksMin - splitHandleHeight,
      );
      const projectsList = projects as Array<
        ProjectWithDetails & { status?: unknown; finishline?: string; title?: string }
      >;
      const totalProjectsCount = projectsList.length;
      const ongoingProjectsCount = projectsList.filter((p) => parseProjectStatusToNumber(p.status) < 100).length;
      const nextDueProject = projectsList
        .filter((p) => {
          if (!p.finishline) return false;
          const dt = new Date(p.finishline);
          if (Number.isNaN(dt.getTime())) return false;
          return dt.getTime() > Date.now();
        })
        .sort((a, b) => new Date(a.finishline as string).getTime() - new Date(b.finishline as string).getTime())[0];
      const nextDueLabel = nextDueProject
        ? `${(nextDueProject.title || "Untitled").trim()} ${formatShortDate(nextDueProject.finishline) || ""}`.trim()
        : null;
      const scopeLabel =
        dashboardView === "all"
          ? "All projects"
          : dashboardView === "my"
            ? "My projects"
            : dashboardView === "team"
              ? "Team projects"
              : "Pinned";

      return (
        <div className="welcome-desktop-layout">
          <section id="projects" className="welcome-section-anchor welcome-desktop-command-shell">
              <div className="projects-command-shell">
              <div className="projects-command-center">
                <div className={commandCenterStyles.commandCenter}>
                  <div className={commandCenterStyles.headerRow}>
                    <div className={commandCenterStyles.leftGroup}>
                      <div className={mobileStyles.titleWrap}>
                        <h3 className={commandCenterStyles.pageTitle}>Projects</h3>
                      </div>

                      {orgDropdown}
                    </div>

                    <div className={mobileStyles.projectsHeaderRight} aria-label="Project summary">
                      {/* MetaCluster: Ongoing · Next · Projects */}
                      <div className={mobileStyles.metaCluster}>
                        <button
                          type="button"
                          className={`${mobileStyles.metaItem} ${showPendingProjectsOnly ? mobileStyles.metaItemActive : ""}`}
                          aria-pressed={showPendingProjectsOnly}
                          onClick={() => setShowPendingProjectsOnly((prev) => !prev)}
                          title="Toggle ongoing projects"
                        >
                          {ongoingProjectsCount} Ongoing
                        </button>
                        {nextDueLabel && (
                          <button
                            type="button"
                            className={mobileStyles.metaItem}
                            onClick={() => {
                              if (nextDueProject?.projectId) {
                                void handleNavigateToProject({ projectId: nextDueProject.projectId });
                              }
                            }}
                            title={nextDueProject ? "Open next project" : "No upcoming projects"}
                          >
                            Next: {nextDueLabel}
                          </button>
                        )}
                        <button
                          type="button"
                          className={mobileStyles.metaItem}
                          onClick={() => {
                            setDashboardView("all");
                            setActiveKpi(null);
                            setDateWindow({ start: null, end: null });
                            setShowPendingProjectsOnly(false);
                          }}
                          title="Clear filters"
                        >
                          {totalProjectsCount} Projects
                        </button>
                      </div>

                      {/* ViewPrefsCluster: dropdown, view mode, density */}
                      <div className={mobileStyles.viewPrefsCluster}>
                        <ProjectsFilterMenu
                          filtersOpen={projectFilters.filtersOpen}
                          filtersRef={projectFilters.filtersRef}
                          filtersId={projectFilters.filtersId}
                          scope={projectFilters.scope}
                          onScopeChange={projectFilters.setScope}
                          query={projectFilters.query}
                          onQueryChange={projectFilters.setQuery}
                          toggleFilters={projectFilters.toggleFilters}
                          statusOptions={projectFilters.statusOptions}
                          statusTriggerLabel={projectFilters.statusTriggerLabel}
                          statusDropdown={projectFilters.statusDropdown}
                          showStatusDropdown={projectFilters.showStatusDropdown}
                          sortOptions={projectFilters.sortOptions}
                          sortTriggerLabel={projectFilters.sortTriggerLabel}
                          sortDropdown={projectFilters.sortDropdown}
                          triggerLabel={scopeLabel}
                          showScopeSelector={false}
                          popoverAlign="end"
                          wrapperClassName={mobileStyles.kpiScopeWrap}
                          triggerClassName={mobileStyles.kpiScopeTrigger}
                          headerContent={
                            <div className={mobileStyles.scopeBtns} role="group" aria-label="View">
                              {[
                                ["all", "All"],
                                ["my", "My"],
                                ["team", "Team"],
                                ["pinned", "Pinned"],
                              ].map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  className={`${mobileStyles.scopeBtn} ${
                                    dashboardView === (value as DashboardView) ? mobileStyles.scopeBtnActive : ""
                                  }`}
                                  aria-pressed={dashboardView === (value as DashboardView)}
                                  onClick={() => setDashboardView(value as DashboardView)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          }
                        />

                        {/* View switcher */}
                        <div className={iconGridStyles.viewSwitcher} role="group" aria-label="View mode">
                          <button
                            type="button"
                            className={`${iconGridStyles.viewBtn} ${projectsViewMode === "icon" ? iconGridStyles.viewBtnActive : ""}`}
                            onClick={() => setProjectsViewMode("icon")}
                            aria-pressed={projectsViewMode === "icon"}
                            title="Icon view"
                          >
                            <LayoutGrid size={14} />
                          </button>
                          <button
                            type="button"
                            className={`${iconGridStyles.viewBtn} ${projectsViewMode === "list" ? iconGridStyles.viewBtnActive : ""}`}
                            onClick={() => setProjectsViewMode("list")}
                            aria-pressed={projectsViewMode === "list"}
                            title="List view"
                          >
                            <List size={14} />
                          </button>
                        </div>

                        {/* Size control (only in icon view) */}
                        {projectsViewMode === "icon" && (
                          <div className={iconGridStyles.sizeControl} role="group" aria-label="Icon size">
                            {(["S", "M", "L"] as const).map((s) => (
                              <button
                                key={s}
                                type="button"
                                className={`${iconGridStyles.sizeBtn} ${projectsIconSize === s ? iconGridStyles.sizeBtnActive : ""}`}
                                onClick={() => setProjectsIconSize(s)}
                                aria-pressed={projectsIconSize === s}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
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
                onSelectDay={(day) => {
                  const d = startOfDay(day);
                  const isSelected = sameDay(dateWindow.start, d) && sameDay(dateWindow.end, d);
                  setDateWindow(isSelected ? { start: null, end: null } : { start: d, end: d });
                }}
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
                onToday={() => {
                  setOutlookStart(startOfDay(new Date()));
                  setDateWindow({ start: null, end: null });
                }}
              />
            </div>
          </div>

              <div className="projects-command-panels" ref={panelsRef}>
                <div className="projects-command-projects" style={{ height: effectiveProjectsHeightPx ?? undefined }}>
                  <div className="projects-command-panel-body">
                    <ProjectsPanelDesktop
                      onOpenProject={(projectId) => handleNavigateToProject({ projectId })}
                      hideHeader
                      externalProjectFilter={projectExternalFilter}
                      projectsOverride={projectFilters.filteredProjects as unknown as ProjectLike[]}
                      variant="embedded"
                      viewMode={projectsViewMode}
                      iconSize={projectsIconSize}
                    />
                  </div>
                </div>

                <div
                  className="projects-command-splitHandle"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Drag to resize projects and tasks panels"
                  aria-valuemin={projectsMin}
                  aria-valuemax={maxProjectsHeightPx}
                  aria-valuenow={effectiveProjectsHeightPx ?? undefined}
                  tabIndex={0}
                  onPointerDown={handleSplitHandlePointerDown}
                  onDoubleClick={handleSplitHandleDoubleClick}
                  title="Drag to resize • Double-click to reset"
                >
                  <div className="projects-command-splitHandleLine" aria-hidden="true" />
                  <div className="projects-command-splitHandleGrip" aria-hidden="true" />
                </div>

                <div className="projects-command-triage" style={{ flex: "1 1 auto" }}>
                  <div className="projects-command-panel-body projects-command-panel-body--triage">
                    <AllEventsAndTasksPanel
                      className="projects-command-triage-fill"
                      selectedDayKey={selectedDayKey}
                      onOpenProject={(projectId) => handleNavigateToProject({ projectId })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="mobile-welcome-layout">
        <div className="mobile-calendar-section">
          <AllProjectsWeekWidget />
        </div>
        <div className="mobile-projects-tasks">
          <div className="mobile-projects-section">
            <div className="mobile-projects-panel">
              <ProjectsPanelMobile onOpenProject={(projectId) => handleNavigateToProject({ projectId })} />
            </div>
          </div>
          <div className="mobile-tasks-section dashboard-footer">
            <AllEventsAndTasksPanel selectedDayKey={selectedDayKey} onOpenProject={(projectId) => handleNavigateToProject({ projectId })} />
          </div>
        </div>
      </div>
    );
  };

  const renderActiveView = () => {
    switch (activeView) {
      case PROJECTS_OVERVIEW_VIEW:
      case PROJECTS_LIST_VIEW:
      case "welcome":
      case "projects":
        // PROJECTS_LIST_VIEW (allprojects) now redirects to the unified overview
        return renderWelcomeView();
      case "notifications":
        return (
          <NotificationsPage
            onNavigateToProject={(projectId: string) =>
              handleNavigateToProject({ projectId })
            }
          />
        );
      case "messages":
        return <Messages initialUserSlug={dmUserSlug || undefined} />;
      case "settings":
        return <Settings />;
      case "collaborators":
        return <Organization />;
      default:
        return null;
    }
  };

  const handleOpenNavigation = () => setIsNavigationOpen(true);
  const handleCloseNavigation = () => setIsNavigationOpen(false);
  const handleToggleNavigationCollapse = () =>
    setIsNavCollapsed((previous) => !previous);

  const mainContent = (
    <main className="dashboard-main">
      {!isDesktop ? (
        <AppHeaderCard
          leftMode="menu"
          onLeftAction={handleOpenNavigation}
          navigationDrawerId={drawerId}
          isNavigationOpen={isNavigationOpen}
          centerMode="search"
        />
      ) : null}
      <div className="dashboard-wrapper welcome-screen no-vertical-center">
        <div className="row-layout">
          <div className="welcome-screen-details">
            <div className="dashboard-content">
              <div
                className={`main-content${
                  (activeView === PROJECTS_OVERVIEW_VIEW || activeView === "welcome") &&
                  isDesktop
                    ? " main-content--welcome"
                    : ""
                }`}
              >
                {renderActiveView()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );

  if (isDesktop) {
    return (
      <div
        className={`dashboard-root${
          isNavCollapsed ? " dashboard-root--nav-collapsed" : ""
        }`}
      >
        <aside>
          <DashboardNavPanel
            variant="persistent"
            setActiveView={setActiveView}
            isCollapsed={isNavCollapsed}
            onToggleCollapse={handleToggleNavigationCollapse}
          />
        </aside>
        {mainContent}
      </div>
    );
  }

  return (
    <>
      <NavigationDrawer
        open={isNavigationOpen}
        onClose={handleCloseNavigation}
        setActiveView={setActiveView}
        drawerId={drawerId}
      />
      {mainContent}
    </>
  );
};

export default WelcomeScreen;









