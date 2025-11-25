import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, Menu, Search } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  buildMapMarkers as buildTaskMapMarkers,
  buildMarkerThumbnail as buildTaskMarkerThumbnail,
  computeStats as computeTaskStats,
  formatDueLabel as formatDrawerDueLabel,
  formatDueDate as formatDrawerDueDate,
  getViewportHeight as getTaskViewportHeight,
  normalizeTask as normalizeQuickTask,
  sortTasksForDrawer,
  DEFAULT_LOCATION as TASKS_DEFAULT_LOCATION,
  DRAWER_SNAP_POINTS,
  type QuickTask,
  type TaskMapMarker,
  type TaskStats,
  type SnapIndex,
  isSameDay as isSameDayTask,
} from "@/dashboard/project/components/Tasks/components/quickTaskUtils";
import { formatAssigneeDisplay } from "@/dashboard/project/components/Tasks/utils";
import QuickCreateTaskModal, {
  type QuickCreateTaskModalProject,
  type QuickCreateTaskModalTask,
} from "@/dashboard/home/components/QuickCreateTaskModal";
import CreateCalendarItemModal, {
  type CreateEventRequest,
} from "../CreateCalendarItemModal";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import {
  requestTaskReview,
  approveTask,
  type Task as ApiTask,
  type TimelineEvent as ApiTimelineEvent,
} from "@/shared/utils/api";
import { notify } from "@/shared/ui/ToastNotifications";
import { useUser } from "@/app/contexts/useUser";
import { useIsMobile } from "@/dashboard/project/components/Shared/calendar/hooks";

import DayGrid from "./DayGrid";
import EventsAndTasks from "./EventsAndTasks";
import MobileEventsDrawer from "./MobileEventsDrawer";
import MiniCalendar, { type MiniCalendarActivityItem } from "./MiniCalendar";
import MonthGrid from "./MonthGrid";
import WeekGrid from "./WeekGrid";
import { CalendarEvent, CalendarTask, fmt, safeDate, isSameDay, formatTimeLabel } from "../utils";

import "../calendar-preview.css";

export type CalendarSurfaceProps = {
  events: CalendarEvent[];
  tasks: CalendarTask[];
  taskSources: ApiTask[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onCreateEvent: (input: CreateEventRequest) => Promise<void>;
  onUpdateEvent: (target: ApiTimelineEvent, input: CreateEventRequest) => Promise<void>;
  onDeleteEvent: (target: ApiTimelineEvent) => Promise<void>;
  onToggleTask: (id: string) => void;
  teamMembers: ProjectTeamMember[];
  onRefreshTasks: () => Promise<void> | void;
  taskProjects: QuickCreateTaskModalProject[];
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  activeProjectColor?: string | null;
  activeProjectStartDate?: Date | null;
  activeProjectEndDate?: Date | null;
};

const CalendarSurface: React.FC<CalendarSurfaceProps> = ({
  events,
  tasks,
  taskSources,
  currentDate,
  onDateChange,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onToggleTask,
  teamMembers,
  onRefreshTasks,
  taskProjects,
  activeProjectId,
  activeProjectName,
  activeProjectColor,
  activeProjectStartDate,
  activeProjectEndDate,
}) => {
  const { isAdmin } = useUser();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [internalDate, setInternalDate] = useState<Date>(currentDate);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    date: Date;
    event: CalendarEvent | null;
  }>({
    open: false,
    mode: "create",
    date: currentDate,
    event: null,
  });
  const [isEventsDrawerOpen, setIsEventsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [markingTaskIds, setMarkingTaskIds] = useState<Set<string>>(() => new Set());


  const setTaskMarkingState = useCallback((taskId: string, marking: boolean) => {
    setMarkingTaskIds((current) => {
      const next = new Set(current);
      if (marking) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  const isTaskMarking = useCallback((taskId: string) => markingTaskIds.has(taskId), [markingTaskIds]);
  useEffect(() => {
    setInternalDate((previous) =>
      isSameDay(previous, currentDate) ? previous : new Date(currentDate),
    );
  }, [currentDate]);

  useEffect(() => {
    onDateChange(internalDate);
  }, [internalDate, onDateChange]);

  useEffect(() => {
    if (!isMobile) {
      setIsEventsDrawerOpen(false);
    }
  }, [isMobile]);

  const projectRange = useMemo(() => {
    const start = activeProjectStartDate
      ? new Date(
          activeProjectStartDate.getFullYear(),
          activeProjectStartDate.getMonth(),
          activeProjectStartDate.getDate(),
        )
      : null;
    const end = activeProjectEndDate
      ? new Date(
          activeProjectEndDate.getFullYear(),
          activeProjectEndDate.getMonth(),
          activeProjectEndDate.getDate(),
        )
      : null;

    if (start && end && end.getTime() < start.getTime()) {
      return { start: end, end: start } as const;
    }

    if (start || end) {
      return { start, end } as const;
    }

    return null;
  }, [activeProjectStartDate, activeProjectEndDate]);

  const quickTasks = useMemo<QuickTask[]>(
    () =>
      taskSources
        .map(normalizeQuickTask)
        .filter((task): task is QuickTask => task !== null),
    [taskSources],
  );

  const quickTaskById = useMemo(() => {
    const map = new Map<string, QuickTask>();
    quickTasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [quickTasks]);

  const taskLookup = useMemo(() => {
    const map = new Map<string, ApiTask>();
    taskSources.forEach((task) => {
      const id = task.taskId ?? (task as { id?: string }).id;
      if (id) {
        map.set(id, task);
      }
    });
    return map;
  }, [taskSources]);

  const normalizedSearchTerm = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);

  const visibleEvents = useMemo(() => {
    if (!normalizedSearchTerm) {
      return events;
    }

    return events.filter((event) => {
      const matches = (value?: string | null) =>
        typeof value === "string" && value.toLowerCase().includes(normalizedSearchTerm);

      if (
        matches(event.title) ||
        matches(event.description) ||
        matches(event.eventType) ||
        matches(event.location)
      ) {
        return true;
      }

      if (event.tags.some((tag) => matches(tag))) {
        return true;
      }

      if (event.guests.some((guest) => matches(guest))) {
        return true;
      }

      const sourceDescription = (event.source as { description?: string }).description;
      if (matches(sourceDescription)) {
        return true;
      }

      return false;
    });
  }, [events, normalizedSearchTerm]);

  const visibleTasks = useMemo(() => {
    if (!normalizedSearchTerm) {
      return tasks;
    }

    return tasks.filter((task) => {
      const matches = (value?: string | null) =>
        typeof value === "string" && value.toLowerCase().includes(normalizedSearchTerm);

      if (matches(task.title) || matches(task.description)) {
        return true;
      }

      if (matches(typeof task.status === "string" ? task.status : undefined)) {
        return true;
      }

      if (matches(task.assignedTo)) {
        return true;
      }

      const formattedAssignee = formatAssigneeDisplay(task.assignedTo);
      if (matches(formattedAssignee)) {
        return true;
      }

      const quickTask = quickTaskById.get(task.id);
      if (quickTask) {
        if (matches(quickTask.title) || matches(quickTask.description)) {
          return true;
        }

        const displayAssignee = formatAssigneeDisplay(quickTask.assignedTo ?? task.assignedTo);
        if (matches(displayAssignee)) {
          return true;
        }

        const raw = quickTask.raw ?? {};
        const rawFields: unknown[] = [
          (raw as { address?: string }).address,
          (raw as { createdByName?: string }).createdByName,
          (raw as { createdByUsername?: string }).createdByUsername,
          (raw as { createdByEmail?: string }).createdByEmail,
        ];

        if (rawFields.some((value) => matches(typeof value === "string" ? value : undefined))) {
          return true;
        }
      }

      const source = task.source as Partial<ApiTask>;
      const sourceFields: unknown[] = [
        source.description,
        (source as { comments?: string }).comments,
        (source as { address?: string }).address,
        (source as { name?: string }).name,
        (source as { title?: string }).title,
        (typeof (source as Record<string, unknown>).location === "string" ? (source as Record<string, unknown>).location as string : undefined),
      ];
      return sourceFields.some((value) => matches(typeof value === "string" ? value : undefined));
    });
  }, [tasks, normalizedSearchTerm, quickTaskById]);

  const drawerTasks = useMemo(() => sortTasksForDrawer(quickTasks), [quickTasks]);

  const eventById = useMemo(() => {
    const map = new Map<string, CalendarEvent>();
    visibleEvents.forEach((event) => {
      map.set(event.id, event);
    });
    return map;
  }, [visibleEvents]);

  const taskById = useMemo(() => {
    const map = new Map<string, CalendarTask>();
    visibleTasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [visibleTasks]);

  const miniCalendarActivityMap = useMemo<Record<string, MiniCalendarActivityItem[]>>(() => {
    const map: Record<string, MiniCalendarActivityItem[]> = {};
    const defaultColor = activeProjectColor ?? undefined;

    visibleEvents.forEach((event) => {
      const eventDate = safeDate(event.date) ?? new Date(event.date);
      if (Number.isNaN(eventDate.getTime())) {
        return;
      }
      const key = fmt(eventDate);
      const startLabel = event.allDay ? undefined : formatTimeLabel(event.start) ?? undefined;
      const endLabel = event.allDay ? undefined : formatTimeLabel(event.end) ?? undefined;
      const timeLabel = event.allDay
        ? "All day"
        : [startLabel, endLabel].filter(Boolean).join(" – ") || undefined;
      const entry: MiniCalendarActivityItem = {
        id: `event-${event.id}`,
        title: event.title,
        time: timeLabel,
        note: event.location || event.eventType || undefined,
        type: "event",
        color: defaultColor,
        sortKey: event.allDay ? "00:00" : event.start ?? "99:99",
        eventId: event.id,
      };
      map[key] = [...(map[key] ?? []), entry];
    });

    visibleTasks.forEach((task) => {
      if (!task.due) return;
      const taskDate = safeDate(task.due) ?? new Date(task.due);
      if (Number.isNaN(taskDate.getTime())) {
        return;
      }
      const key = fmt(taskDate);
      const entry: MiniCalendarActivityItem = {
        id: `task-${task.id}`,
        title: task.title,
        time: formatTimeLabel(task.time) ?? undefined,
        note: undefined,
        type: "task",
        color: defaultColor,
        isCompleted: Boolean(task.done),
        sortKey: task.time ?? "99:99",
        taskId: task.id,
      };
      map[key] = [...(map[key] ?? []), entry];
    });

    Object.values(map).forEach((items) => {
      items.sort((a, b) => {
        const aKey = a.sortKey ?? "";
        const bKey = b.sortKey ?? "";
        if (aKey === bKey) {
          if (a.type === b.type) {
            return a.title.localeCompare(b.title);
          }
          return a.type === "event" ? -1 : 1;
        }
        return aKey.localeCompare(bKey);
      });
    });

    return map;
  }, [visibleEvents, visibleTasks, activeProjectColor]);

  const miniCalendarActivityDates = useMemo(
    () => Object.keys(miniCalendarActivityMap),
    [miniCalendarActivityMap],
  );

  const mapTasks = useMemo(
    () =>
      drawerTasks.filter(
        (task): task is QuickTask & { location: { lat: number; lng: number } } =>
          Boolean(task.location && !Number.isNaN(task.location.lat) && !Number.isNaN(task.location.lng)),
      ),
    [drawerTasks],
  );

  const stats = useMemo<TaskStats>(() => computeTaskStats(quickTasks), [quickTasks]);

  const statusMessage = useMemo(() => {
    if (!quickTasks.length) return "No tasks for this project yet.";

    const openTasks = quickTasks.filter((task) => task.status !== "done" && task.status !== "archived");
    if (!openTasks.length) return "You're all caught up.";

    const datedTasks = openTasks.filter(
      (task): task is QuickTask & { dueDate: Date } => Boolean(task.dueDate),
    );

    if (!datedTasks.length) {
      const noun = openTasks.length === 1 ? "task" : "tasks";
      return `${openTasks.length} open ${noun} with no due date yet.`;
    }

    const sorted = datedTasks
      .slice()
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const nextDue = sorted[0];
    const sameDayCount = sorted.filter((task) => isSameDayTask(task.dueDate, nextDue.dueDate)).length;
    const noun = sameDayCount === 1 ? "task" : "tasks";
    return `${sameDayCount} ${noun} due ${formatDrawerDueDate(nextDue.dueDate)}.`;
  }, [quickTasks]);

  const mapStatusMessage = useMemo(() => {
    if (!mapTasks.length) {
      return "Add locations to your tasks to see them appear here.";
    }

    return `${mapTasks.length === 1 ? "One" : mapTasks.length} task${
      mapTasks.length === 1 ? "" : "s"
    } showing on the map.`;
  }, [mapTasks.length]);

  const hasQuickCreateProject = taskProjects.length > 0;

  const markerThumbnail = useMemo(
    () => buildTaskMarkerThumbnail(activeProjectColor ?? undefined),
    [activeProjectColor],
  );

  const mapLocation = mapTasks[0]?.location ?? TASKS_DEFAULT_LOCATION;
  const mapAddress = mapTasks[0]?.address ?? activeProjectName ?? "Project";

  const formatStatValue = useCallback((value: number) => value, []);

  const canCreateTasks = useMemo(
    () => taskProjects.length > 0 || Boolean(activeProjectId),
    [taskProjects, activeProjectId],
  );

  const handleRefreshTasks = useCallback(() => {
    void onRefreshTasks();
  }, [onRefreshTasks]);

  const handleOpenMobileDrawer = useCallback(() => {
    setIsEventsDrawerOpen(true);
  }, []);

  const handleCloseMobileDrawer = useCallback(() => {
    setIsEventsDrawerOpen(false);
  }, []);

  const handleOpenTasksOverview = useCallback(() => {
    // Navigate to global tasks drawer with project filter and calendar context
    const state: { projectId?: string; from?: string; fromContext?: string } = {
      from: location.pathname,
      fromContext: "calendar",
    };
    
    if (activeProjectId) {
      state.projectId = activeProjectId;
    }
    
    navigate("/dashboard/tasks", { state });
  }, [navigate, location.pathname, activeProjectId]);

  const openQuickCreateForTask = useCallback(
    (
      taskId: string,
      overrides?: Partial<QuickCreateTaskModalTask>,
      fallbackSource?: ApiTask,
    ): boolean => {
      const sourceTask = taskLookup.get(taskId) ?? fallbackSource ?? null;
      const quickTask =
        drawerTasks.find((task) => task.id === taskId) ??
        (sourceTask ? normalizeQuickTask(sourceTask) ?? undefined : undefined);

      const fallbackProjectId =
        quickTask?.projectId ??
        sourceTask?.projectId ??
        activeProjectId ??
        (taskProjects[0]?.id ?? "");

      if (!fallbackProjectId) {
        return false;
      }

      const resolvedProjectName =
        activeProjectName ??
        taskProjects.find((project) => project.id === fallbackProjectId)?.name ??
        undefined;

      const payload: QuickCreateTaskModalTask = {
        id: taskId,
        taskId,
        projectId: fallbackProjectId,
        projectName: resolvedProjectName ?? null,
        title: quickTask?.title ?? sourceTask?.title ?? null,
        description:
          quickTask?.description ?? sourceTask?.description ?? null,
        dueDate:
          quickTask?.dueDate ??
          sourceTask?.dueDate ??
          (sourceTask as { due_at?: string | null })?.due_at ??
          (sourceTask as { dueAt?: string | number | Date | null })?.dueAt ??
          null,
        status:
          (sourceTask?.status as string | undefined) ??
          (quickTask?.status as string | undefined) ??
          "todo",
        assigneeId:
          sourceTask?.assigneeId ?? quickTask?.assignedTo ?? null,
        address:
          (sourceTask as { address?: string | null })?.address ??
          quickTask?.address ??
          null,
        location:
          (sourceTask as { location?: QuickCreateTaskModalTask["location"] })?.location ??
          quickTask?.location ??
          null,
        reviewerId:
          (sourceTask as { reviewerId?: string })?.reviewerId ??
          (quickTask?.raw as { reviewerId?: string })?.reviewerId ??
          null,
      };

      setQuickTaskDraft(overrides ? { ...payload, ...overrides } : payload);
      setIsQuickTaskModalOpen(true);
      return true;
    },
    [
      drawerTasks,
      taskLookup,
      activeProjectId,
      activeProjectName,
      taskProjects,
    ],
  );

  const handleTaskMarkDone = useCallback(
    async (taskId: string) => {
      const quickTask = quickTaskById.get(taskId) ?? null;
      const sourceTask = taskLookup.get(taskId) ?? null;
      const normalizedTask = quickTask ?? (sourceTask ? normalizeQuickTask(sourceTask) ?? null : null);
      const resolvedProjectId =
        normalizedTask?.projectId ??
        sourceTask?.projectId ??
        (activeProjectId ? activeProjectId : null) ??
        (taskProjects[0]?.id ?? null);

      if (!normalizedTask || !resolvedProjectId) {
        openQuickCreateForTask(taskId, undefined, sourceTask ?? undefined);
        return;
      }

      setTaskMarkingState(taskId, true);

      const normalizedStatus =
        typeof normalizedTask.status === "string" ? normalizedTask.status.trim().toLowerCase() : "";
      const isAwaitingApproval = normalizedStatus === "in_review";
      const isComplete = normalizedStatus === "done" || normalizedStatus === "archived";
      const canSubmitForReview =
        normalizedStatus === "to_do" ||
        normalizedStatus === "in_progress" ||
        normalizedStatus === "needs_changes";

      if (isComplete) {
        setTaskMarkingState(taskId, false);
        notify("info", "That task is already complete.");
        return;
      }

      if (isAwaitingApproval && !isAdmin) {
        setTaskMarkingState(taskId, false);
        notify("error", "Only admins can approve tasks that are in review.");
        return;
      }

      if (!isAwaitingApproval && !canSubmitForReview) {
        setTaskMarkingState(taskId, false);
        notify("error", "Task status doesn't allow this action.");
        return;
      }

      try {
        const taskIdentifier = normalizedTask.id || taskId;
        if (isAwaitingApproval) {
          await approveTask(resolvedProjectId, taskIdentifier, { note: "" });
          notify("success", "Task marked as done!");
        } else {
          await requestTaskReview(resolvedProjectId, taskIdentifier);
          notify("success", "Task submitted for review!");
        }

        const refreshResult = onRefreshTasks?.();
        if (refreshResult) {
          await refreshResult;
        }
      } catch (error) {
        console.error("Failed to mark calendar task done", error);
        const apiError = error as { status?: number };
        if (apiError?.status === 403) {
          notify("error", "You don't have permission to perform this action.");
        } else if (apiError?.status === 409) {
          notify("error", "Task is not in the correct state for this action.");
        } else {
          notify("error", "Failed to update task. Please try again.");
        }

        try {
          const refreshResult = onRefreshTasks?.();
          if (refreshResult) {
            await refreshResult;
          }
        } catch (refreshError) {
          console.error("Failed to refresh tasks after calendar mark done error", refreshError);
        }
      } finally {
        setTaskMarkingState(taskId, false);
      }
    },
    [
      quickTaskById,
      taskLookup,
      activeProjectId,
      taskProjects,
      openQuickCreateForTask,
      setTaskMarkingState,
      onRefreshTasks,
      isAdmin,
    ],
  );

  const handleOpenQuickCreateFromDrawer = useCallback(() => {
    if (!hasQuickCreateProject) return;

    const state: { 
      projectId?: string; 
      from?: string; 
      fromContext?: string;
      openInCreateMode?: boolean;
      taskDraft?: Partial<QuickCreateTaskModalTask>;
    } = {
      from: location.pathname,
      fromContext: "calendar",
      openInCreateMode: true,
      taskDraft: {
        projectId: activeProjectId ?? undefined,
        projectName: activeProjectName ?? undefined,
        status: "todo",
      },
    };
    
    if (activeProjectId) {
      state.projectId = activeProjectId;
    }
    
    navigate("/dashboard/tasks", { state });
  }, [
    hasQuickCreateProject,
    navigate,
    location.pathname,
    activeProjectId,
    activeProjectName,
  ]);

  const handleOpenQuickTaskModal = useCallback(
    (date: Date) => {
      setInternalDate(date);
      
      const state: { 
        projectId?: string; 
        from?: string; 
        fromContext?: string;
        openInCreateMode?: boolean;
        taskDraft?: Partial<QuickCreateTaskModalTask>;
      } = {
        from: location.pathname,
        fromContext: "calendar",
        openInCreateMode: true,
        taskDraft: {
          projectId: activeProjectId ?? undefined,
          projectName: activeProjectName ?? undefined,
          dueDate: date,
          status: "todo",
        },
      };
      
      if (activeProjectId) {
        state.projectId = activeProjectId;
      }
      
      navigate("/dashboard/tasks", { state });
    },
    [navigate, location.pathname, activeProjectId, activeProjectName],
  );

  const handleSelectDate = useCallback((date: Date) => {
    setInternalDate(date);
  }, []);

  const handleOpenCreate = useCallback((date: Date) => {
    setInternalDate(date);
    setModalState({ open: true, mode: "create", date, event: null });
  }, []);

  const handleOpenEditEvent = useCallback((event: CalendarEvent) => {
    const eventDate = safeDate(event.date) ?? new Date(event.date);
    setInternalDate(eventDate);
    setModalState({
      open: true,
      mode: "edit",
      date: eventDate,
      event,
    });
  }, []);

  const handleOpenEditTask = useCallback(
    (task: CalendarTask) => {
      const taskDate = task.due ? safeDate(task.due) ?? new Date(task.due) : new Date();
      setInternalDate(taskDate);
      openQuickCreateForTask(task.id, undefined, task.source);
    },
    [openQuickCreateForTask],
  );

  const handleOpenMiniCalendarEvent = useCallback(
    (eventId: string) => {
      const target = eventById.get(eventId);
      if (!target) return;
      handleOpenEditEvent(target);
    },
    [eventById, handleOpenEditEvent],
  );

  const handleOpenMiniCalendarTask = useCallback(
    (taskId: string) => {
      const target = taskById.get(taskId);
      if (!target) return;
      handleOpenEditTask(target);
    },
    [taskById, handleOpenEditTask],
  );

  const handleCloseCreate = useCallback(() => {
    setModalState((previous) => ({
      open: false,
      mode: "create",
      date: previous.date,
      event: null,
    }));
  }, []);

  return (
    <div className="calendar-surface">
      <div className="calendar-shell">
        <div className="calendar-card">
          <div className="calendar-body">
            <div className="calendar-sidebar">
              <MiniCalendar
                value={internalDate}
                onChange={setInternalDate}
                rangeStart={projectRange?.start ?? null}
                rangeEnd={projectRange?.end ?? null}
                rangeColor={activeProjectColor ?? null}
                finishLineDate={activeProjectEndDate ?? null}
                activityDates={miniCalendarActivityDates}
                activityMap={miniCalendarActivityMap}
                indicatorColor={activeProjectColor ?? null}
                isMobile={isMobile}
                onOpenEvent={handleOpenMiniCalendarEvent}
                onOpenTask={handleOpenMiniCalendarTask}
              />
              {isMobile ? (
                <button
                  type="button"
                  className="calendar-mobile-toggle"
                  onClick={handleOpenMobileDrawer}
                >
                  <Menu className="calendar-mobile-toggle__icon" aria-hidden />
                  <span>View events & tasks</span>
                </button>
              ) : (
                <EventsAndTasks
                  events={visibleEvents}
                  tasks={visibleTasks}
                  onToggleTask={onToggleTask}
                  onEditEvent={handleOpenEditEvent}
                  onEditTask={handleOpenEditTask}
                  onOpenTasksOverview={handleOpenTasksOverview}
                />
              )}
            </div>

            {!isMobile && (
              <div className="calendar-main">
              <div className="calendar-controls">
                <div className="calendar-controls__search">
                  <Search className="calendar-controls__search-icon" aria-hidden />
                  <input
                    type="search"
                    placeholder="Search events and tasks"
                    aria-label="Search events and tasks"
                    className="calendar-controls__search-input"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <div className="calendar-controls__toggle">
                  <button
                    type="button"
                    onClick={() => setView("day")}
                    className={`calendar-controls__toggle-button ${
                      view === "day" ? "is-active" : ""
                    }`}
                  >
                    Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("week")}
                    className={`calendar-controls__toggle-button ${
                      view === "week" ? "is-active" : ""
                    }`}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("month")}
                    className={`calendar-controls__toggle-button ${
                      view === "month" ? "is-active" : ""
                    }`}
                  >
                    Month
                  </button>
                </div>
              </div>

              <div className="calendar-view">
                {view === "month" && (
                  <MonthGrid
                    viewDate={internalDate}
                    selectedDate={internalDate}
                    events={visibleEvents}
                    tasks={visibleTasks}
                    onSelectDate={handleSelectDate}
                    onOpenCreate={handleOpenCreate}
                    onOpenQuickTask={handleOpenQuickTaskModal}
                    canCreateTasks={canCreateTasks}
                    onEditEvent={handleOpenEditEvent}
                    onEditTask={handleOpenEditTask}
                  />
                )}
                {view === "week" && (
                  <div className="calendar-view__scroller">
                    <WeekGrid
                      anchorDate={internalDate}
                      events={visibleEvents}
                      tasks={visibleTasks}
                      onEditEvent={handleOpenEditEvent}
                      onEditTask={handleOpenEditTask}
                      onCreateEvent={handleOpenCreate}
                      onCreateTask={handleOpenQuickTaskModal}
                      canCreateTasks={canCreateTasks}
                    />
                  </div>
                )}
                {view === "day" && (
                  <div className="calendar-view__scroller">
                    <DayGrid
                      date={internalDate}
                      events={visibleEvents}
                      tasks={visibleTasks}
                      onEditEvent={handleOpenEditEvent}
                      onEditTask={handleOpenEditTask}
                      onCreateEvent={handleOpenCreate}
                      onCreateTask={handleOpenQuickTaskModal}
                      canCreateTasks={canCreateTasks}
                    />
                  </div>
                )}
              </div>
              </div>
            )}
          </div>
        </div>

        <div className="calendar-footer">
          <div className="calendar-footer__note">
            <CheckSquare className="calendar-footer__icon" />
            Connected to project data — events update automatically.
          </div>
          <div className="calendar-footer__timezone">
            Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </div>
        </div>
      </div>

      <CreateCalendarItemModal
        isOpen={modalState.open}
        initialDate={
          modalState.event
            ? safeDate(modalState.event.date) ?? modalState.date
            : modalState.date
        }
        mode={modalState.mode}
        teamMembers={teamMembers}
        initialValues={
          modalState.mode === "edit" && modalState.event
            ? {
                title: modalState.event.title,
                date: modalState.event.date,
                time: modalState.event.start,
                endTime: modalState.event.end,
                allDay: modalState.event.allDay,
                eventType: modalState.event.eventType,
                location:
                  modalState.event.location ??
                  (modalState.event as { platform?: string }).platform,
                description: modalState.event.description,
                tags: modalState.event.tags,
                guests: modalState.event.guests,
              }
            : undefined
        }
        onClose={handleCloseCreate}
        onCreateEvent={onCreateEvent}
        onUpdateEvent={
          modalState.mode === "edit" && modalState.event
            ? (input) => onUpdateEvent(modalState.event!.source, input)
            : undefined
        }
        onDelete={
          modalState.mode === "edit" && modalState.event
            ? () => onDeleteEvent(modalState.event!.source)
            : undefined
        }
      />
      {isMobile ? (
        <MobileEventsDrawer
          open={isEventsDrawerOpen}
          events={visibleEvents}
          tasks={visibleTasks}
          onClose={handleCloseMobileDrawer}
          onToggleTask={onToggleTask}
          onEditEvent={handleOpenEditEvent}
          onEditTask={handleOpenEditTask}
          onOpenTasksOverview={handleOpenTasksOverview}
        />
      ) : null}
    </div>
  );
};

export default CalendarSurface;
