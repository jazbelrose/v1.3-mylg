import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, Search } from "lucide-react";

import TaskDrawer from "@/dashboard/project/components/Tasks/components/TaskDrawer";
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
import type { ApiTask, TimelineEvent as ApiTimelineEvent } from "@/shared/utils/api";
import { useIsMobile } from "../../../components/Shared/calendar/hooks";

import DayGrid from "./DayGrid";
import EventsAndTasks from "./EventsAndTasks";
import CalendarEventsDrawer from "./CalendarEventsDrawer";
import MiniCalendar from "./MiniCalendar";
import MonthGrid from "./MonthGrid";
import WeekGrid from "./WeekGrid";
import { CalendarEvent, CalendarTask, safeDate, isSameDay } from "../utils";

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
  const [isQuickTaskModalOpen, setIsQuickTaskModalOpen] = useState(false);
  const [quickTaskDraft, setQuickTaskDraft] = useState<QuickCreateTaskModalTask | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [taskDrawerSnapIndex, setTaskDrawerSnapIndex] = useState<SnapIndex>(2);
  const [taskDrawerViewportHeight, setTaskDrawerViewportHeight] = useState(() => getTaskViewportHeight());
  const [activeDrawerTaskId, setActiveDrawerTaskId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [isDraggingTaskDrawer, setIsDraggingTaskDrawer] = useState(false);
  const [taskDrawerDragStartY, setTaskDrawerDragStartY] = useState<number | null>(null);
  const [taskDrawerCurrentDragY, setTaskDrawerCurrentDragY] = useState(0);
  const [isTaskDrawerDesktop, setIsTaskDrawerDesktop] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const isMobile = useIsMobile();
  const [isEventsDrawerOpen, setIsEventsDrawerOpen] = useState(false);
  const [eventsDrawerSnapIndex, setEventsDrawerSnapIndex] = useState<SnapIndex>(1);
  const [eventsDrawerViewportHeight, setEventsDrawerViewportHeight] = useState(() => getTaskViewportHeight());
  const [isDraggingEventsDrawer, setIsDraggingEventsDrawer] = useState(false);
  const [eventsDrawerDragStartY, setEventsDrawerDragStartY] = useState<number | null>(null);
  const [eventsDrawerCurrentDragY, setEventsDrawerCurrentDragY] = useState(0);
  const drawerTaskListRef = useRef<HTMLUListElement | null>(null);
  const taskDrawerSheetRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneRef = useRef(false);

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
      setIsDraggingEventsDrawer(false);
      setEventsDrawerDragStartY(null);
      setEventsDrawerCurrentDragY(0);
      return;
    }

    setEventsDrawerViewportHeight(getTaskViewportHeight());

    if (!isTaskDrawerOpen) {
      setIsEventsDrawerOpen(true);
    }
  }, [isMobile, isTaskDrawerOpen]);

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
        (source as { location?: string }).location,
      ];
      return sourceFields.some((value) => matches(typeof value === "string" ? value : undefined));
    });
  }, [tasks, normalizedSearchTerm, quickTaskById]);

  const drawerTasks = useMemo(() => sortTasksForDrawer(quickTasks), [quickTasks]);

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

    const openTasks = quickTasks.filter((task) => task.status !== "done");
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

  const mapMarkers = useMemo<TaskMapMarker[]>(() => {
    if (!mapTasks.length) return [];
    return buildTaskMapMarkers(mapTasks, markerThumbnail, activeDrawerTaskId);
  }, [mapTasks, markerThumbnail, activeDrawerTaskId]);

  const selectedTask = useMemo(
    () => drawerTasks.find((task) => task.id === activeDrawerTaskId) ?? null,
    [drawerTasks, activeDrawerTaskId],
  );

  const selectedAssigneeName = useMemo(
    () => formatAssigneeDisplay(selectedTask?.assignedTo),
    [selectedTask],
  );

  const mapLocation = selectedTask?.location ?? mapTasks[0]?.location ?? TASKS_DEFAULT_LOCATION;
  const mapAddress = selectedTask?.address ?? mapTasks[0]?.address ?? activeProjectName ?? "Project";

  const formatStatValue = useCallback((value: number) => value, []);

  const taskDrawerSheetHeights = useMemo(
    () => DRAWER_SNAP_POINTS.map((point) => taskDrawerViewportHeight * point),
    [taskDrawerViewportHeight],
  );

  const taskDrawerBaseTargetY = taskDrawerViewportHeight ? taskDrawerViewportHeight - taskDrawerSheetHeights[taskDrawerSnapIndex] : 0;
  const taskDrawerTargetY = isDraggingTaskDrawer ? taskDrawerBaseTargetY + taskDrawerCurrentDragY : taskDrawerBaseTargetY;

  const eventsDrawerSheetHeights = useMemo(
    () => DRAWER_SNAP_POINTS.map((point) => eventsDrawerViewportHeight * point),
    [eventsDrawerViewportHeight],
  );

  const eventsDrawerBaseTargetY = eventsDrawerViewportHeight
    ? eventsDrawerViewportHeight - eventsDrawerSheetHeights[eventsDrawerSnapIndex]
    : 0;
  const eventsDrawerTargetY = isDraggingEventsDrawer
    ? eventsDrawerBaseTargetY + eventsDrawerCurrentDragY
    : eventsDrawerBaseTargetY;

  const canCreateTasks = useMemo(
    () => taskProjects.length > 0 || Boolean(activeProjectId),
    [taskProjects, activeProjectId],
  );

  const handleRefreshTasks = useCallback(() => {
    void onRefreshTasks();
  }, [onRefreshTasks]);

  const handleOpenTasksOverview = useCallback(() => {
    setIsTaskDrawerOpen(true);
    setTaskDrawerSnapIndex(2);
    setTaskDrawerViewportHeight(getTaskViewportHeight());
    setMapFocus(null);
    initialScrollDoneRef.current = false;

    if (!activeDrawerTaskId && drawerTasks.length) {
      setActiveDrawerTaskId(drawerTasks[0].id);
    }
    if (isMobile) {
      setIsEventsDrawerOpen(false);
    }
  }, [activeDrawerTaskId, drawerTasks, isMobile]);

  const handleCloseTasksOverview = useCallback(() => {
    setIsTaskDrawerOpen(false);
    setTaskDrawerSnapIndex(2);
    setMapFocus(null);
    setIsDraggingTaskDrawer(false);
    setTaskDrawerDragStartY(null);
    setTaskDrawerCurrentDragY(0);
    initialScrollDoneRef.current = false;
    if (isMobile) {
      setIsEventsDrawerOpen(true);
      setEventsDrawerViewportHeight(getTaskViewportHeight());
    }
  }, [isMobile]);

  useEffect(() => {
    if (!drawerTasks.length) {
      setActiveDrawerTaskId(null);
      return;
    }

    if (!activeDrawerTaskId || !drawerTasks.some((task) => task.id === activeDrawerTaskId)) {
      setActiveDrawerTaskId(drawerTasks[0].id);
    }
  }, [drawerTasks, activeDrawerTaskId]);

  useEffect(() => {
    if (!isTaskDrawerOpen || typeof window === "undefined") return;

    const update = () => setTaskDrawerViewportHeight(getTaskViewportHeight());
    update();

    window.addEventListener("resize", update);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
    };
  }, [isTaskDrawerOpen]);

  useEffect(() => {
    if (!isEventsDrawerOpen || typeof window === "undefined") return;

    const update = () => setEventsDrawerViewportHeight(getTaskViewportHeight());
    update();

    window.addEventListener("resize", update);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
    };
  }, [isEventsDrawerOpen]);

  useEffect(() => {
    if (!(isTaskDrawerOpen || isEventsDrawerOpen) || typeof document === "undefined") {
      return;
    }
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [isTaskDrawerOpen, isEventsDrawerOpen]);

  useEffect(() => {
    if (!isTaskDrawerOpen) return;
    if (typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseTasksOverview();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCloseTasksOverview, isTaskDrawerOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setIsTaskDrawerDesktop(false);
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateMatch = () => setIsTaskDrawerDesktop(mediaQuery.matches);
    updateMatch();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMatch);
      return () => mediaQuery.removeEventListener("change", updateMatch);
    }

    mediaQuery.addListener(updateMatch);
    return () => mediaQuery.removeListener(updateMatch);
  }, []);

  useEffect(() => {
    if (!isTaskDrawerOpen || !activeDrawerTaskId || !drawerTaskListRef.current) return;

    const container = drawerTaskListRef.current;
    const target = container.querySelector<HTMLLIElement>(
      `[data-task-id="${activeDrawerTaskId}"]`,
    );

    if (target) {
      const behavior: ScrollBehavior = initialScrollDoneRef.current ? "smooth" : "auto";
      target.scrollIntoView({ block: "center", behavior });
      initialScrollDoneRef.current = true;
    }
  }, [isTaskDrawerOpen, activeDrawerTaskId, drawerTasks]);

  useEffect(() => {
    if (!isTaskDrawerOpen) return;
    const current = drawerTasks.find((task) => task.id === activeDrawerTaskId);
    if (current?.location) {
      setMapFocus(current.location);
    } else {
      setMapFocus(null);
    }
  }, [isTaskDrawerOpen, drawerTasks, activeDrawerTaskId]);

  const handleTaskDrawerHandleClick = useCallback(() => {
    setTaskDrawerSnapIndex((current) => {
      if (current === 2) return 1;
      if (current === 1) return 2;
      return 1;
    });
  }, []);

  const handleTaskDrawerTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 1) {
      setIsDraggingTaskDrawer(true);
      setTaskDrawerDragStartY(event.touches[0].clientY);
      setTaskDrawerCurrentDragY(0);
    }
  }, []);

  const handleTaskDrawerTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (isDraggingTaskDrawer && taskDrawerDragStartY !== null && event.touches.length === 1) {
        const deltaY = event.touches[0].clientY - taskDrawerDragStartY;
        setTaskDrawerCurrentDragY(deltaY);
        event.preventDefault();
      }
    },
    [isDraggingTaskDrawer, taskDrawerDragStartY],
  );

  const handleTaskDrawerTouchEnd = useCallback(() => {
    if (isDraggingTaskDrawer) {
      setIsDraggingTaskDrawer(false);
      setTaskDrawerDragStartY(null);

      const threshold = taskDrawerViewportHeight * 0.15;
      if (Math.abs(taskDrawerCurrentDragY) > threshold) {
        if (taskDrawerCurrentDragY > 0) {
          setTaskDrawerSnapIndex((current) => Math.max(0, current - 1) as SnapIndex);
        } else {
          setTaskDrawerSnapIndex((current) => Math.min(2, current + 1) as SnapIndex);
        }
      }

      setTaskDrawerCurrentDragY(0);
    }
  }, [isDraggingTaskDrawer, taskDrawerCurrentDragY, taskDrawerViewportHeight]);

  const handleEventsDrawerHandleClick = useCallback(() => {
    setEventsDrawerSnapIndex((current) => {
      if (current === 2) return 1;
      if (current === 1) return 2;
      return 1;
    });
  }, []);

  const handleEventsDrawerTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 1) {
      setIsDraggingEventsDrawer(true);
      setEventsDrawerDragStartY(event.touches[0].clientY);
      setEventsDrawerCurrentDragY(0);
    }
  }, []);

  const handleEventsDrawerTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (isDraggingEventsDrawer && eventsDrawerDragStartY !== null && event.touches.length === 1) {
        const deltaY = event.touches[0].clientY - eventsDrawerDragStartY;
        setEventsDrawerCurrentDragY(deltaY);
        event.preventDefault();
      }
    },
    [isDraggingEventsDrawer, eventsDrawerDragStartY],
  );

  const handleEventsDrawerTouchEnd = useCallback(() => {
    if (isDraggingEventsDrawer) {
      setIsDraggingEventsDrawer(false);
      setEventsDrawerDragStartY(null);

      const threshold = eventsDrawerViewportHeight * 0.15;
      if (Math.abs(eventsDrawerCurrentDragY) > threshold) {
        if (eventsDrawerCurrentDragY > 0) {
          setEventsDrawerSnapIndex((current) => Math.max(0, current - 1) as SnapIndex);
        } else {
          setEventsDrawerSnapIndex((current) => Math.min(2, current + 1) as SnapIndex);
        }
      }

      setEventsDrawerCurrentDragY(0);
    }
  }, [
    isDraggingEventsDrawer,
    eventsDrawerCurrentDragY,
    eventsDrawerViewportHeight,
  ]);

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

  const handleTaskSelect = useCallback(
    (taskId: string) => {
      if (activeDrawerTaskId === taskId) {
        openQuickCreateForTask(taskId);
      } else {
        setActiveDrawerTaskId(taskId);
        setTaskDrawerSnapIndex((current) => (current === 0 ? 1 : current) as SnapIndex);
      }
    },
    [activeDrawerTaskId, openQuickCreateForTask],
  );

  const handleTaskEdit = useCallback(
    (taskId: string) => {
      setActiveDrawerTaskId(taskId);
      openQuickCreateForTask(taskId);
    },
    [openQuickCreateForTask],
  );

  const handleTaskMarkDone = useCallback(
    (taskId: string) => {
      setActiveDrawerTaskId(taskId);
      openQuickCreateForTask(taskId, { status: "done" });
    },
    [openQuickCreateForTask],
  );

  const handleMarkerClick = useCallback(
    (markerId: string) => {
      handleTaskSelect(markerId);
      const locatedTask = drawerTasks.find((task) => task.id === markerId);
      if (locatedTask?.location) {
        setMapFocus(locatedTask.location);
      }
    },
    [drawerTasks, handleTaskSelect],
  );

  const handleOpenQuickCreateFromDrawer = useCallback(() => {
    if (!hasQuickCreateProject) return;

    const fallbackProjectId =
      activeProjectId ?? taskProjects[0]?.id ?? (drawerTasks[0]?.projectId ?? "");
    if (!fallbackProjectId) return;

    const fallbackProjectName =
      activeProjectName ??
      taskProjects.find((project) => project.id === fallbackProjectId)?.name ??
      undefined;

    setQuickTaskDraft({
      projectId: fallbackProjectId,
      projectName: fallbackProjectName ?? null,
      status: "todo",
      dueDate: null,
    });
    setIsQuickTaskModalOpen(true);
  }, [
    hasQuickCreateProject,
    activeProjectId,
    taskProjects,
    activeProjectName,
    drawerTasks,
  ]);

  const handleOpenQuickTaskModal = useCallback(
    (date: Date) => {
      setInternalDate(date);
      const fallbackProjectId =
        (typeof activeProjectId === "string" && activeProjectId) ||
        (taskProjects.length > 0 ? taskProjects[0].id : "");
      const fallbackProjectName =
        activeProjectName ??
        taskProjects.find((project) => project.id === fallbackProjectId)?.name ??
        (taskProjects.length === 1 ? taskProjects[0].name : undefined);

      setQuickTaskDraft({
        projectId: fallbackProjectId || "",
        projectName: fallbackProjectName ?? undefined,
        dueDate: date,
        status: "todo",
      });
      setIsQuickTaskModalOpen(true);
    },
    [activeProjectId, activeProjectName, taskProjects],
  );

  const handleCloseQuickTaskModal = useCallback(() => {
    setIsQuickTaskModalOpen(false);
    setQuickTaskDraft(null);
  }, []);

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
      setActiveDrawerTaskId(task.id);
      openQuickCreateForTask(task.id, undefined, task.source);
    },
    [openQuickCreateForTask],
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
              />
              {!isMobile ? (
                <EventsAndTasks
                  events={visibleEvents}
                  tasks={visibleTasks}
                  onToggleTask={onToggleTask}
                  onEditEvent={handleOpenEditEvent}
                  onEditTask={handleOpenEditTask}
                  onOpenTasksOverview={handleOpenTasksOverview}
                />
              ) : null}
            </div>

            {!isMobile ? (
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
            ) : null}
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
      <CalendarEventsDrawer
        open={isMobile && isEventsDrawerOpen}
        viewportHeight={eventsDrawerViewportHeight}
        targetY={eventsDrawerTargetY}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        events={visibleEvents}
        tasks={visibleTasks}
        onToggleTask={onToggleTask}
        onEditEvent={handleOpenEditEvent}
        onEditTask={handleOpenEditTask}
        onOpenTasksOverview={handleOpenTasksOverview}
        onHandleClick={handleEventsDrawerHandleClick}
        onTouchStart={handleEventsDrawerTouchStart}
        onTouchMove={handleEventsDrawerTouchMove}
        onTouchEnd={handleEventsDrawerTouchEnd}
      />
      <TaskDrawer
        open={isTaskDrawerOpen}
        isDesktop={isTaskDrawerDesktop}
        viewportHeight={taskDrawerViewportHeight}
        targetY={taskDrawerTargetY}
        projectName={activeProjectName ?? undefined}
        mapLocation={mapLocation}
        mapAddress={mapAddress}
        mapMarkers={mapMarkers}
        mapFocus={mapFocus}
        mapStatusMessage={mapStatusMessage}
        hasQuickCreateProject={hasQuickCreateProject}
        loading={false}
        error={null}
        stats={stats}
        formatValue={formatStatValue}
        statusMessage={statusMessage}
        tasks={drawerTasks}
        activeTaskId={activeDrawerTaskId}
        onTaskSelect={handleTaskSelect}
        onTaskEdit={handleTaskEdit}
        onTaskMarkDone={handleTaskMarkDone}
        formatDueLabel={formatDrawerDueLabel}
        selectedTask={selectedTask}
        selectedAssigneeName={selectedAssigneeName}
        onMarkerClick={handleMarkerClick}
        onClose={handleCloseTasksOverview}
        onOpenQuickCreate={handleOpenQuickCreateFromDrawer}
        onHandleClick={handleTaskDrawerHandleClick}
        onTouchStart={handleTaskDrawerTouchStart}
        onTouchMove={handleTaskDrawerTouchMove}
        onTouchEnd={handleTaskDrawerTouchEnd}
        sheetRef={taskDrawerSheetRef}
        taskListRef={drawerTaskListRef}
      />
      <QuickCreateTaskModal
        open={isQuickTaskModalOpen}
        onClose={handleCloseQuickTaskModal}
        projects={taskProjects}
        onCreated={handleRefreshTasks}
        onUpdated={handleRefreshTasks}
        onDeleted={handleRefreshTasks}
        activeProjectId={activeProjectId ?? null}
        activeProjectName={activeProjectName ?? undefined}
        scopedProjectId={activeProjectId ?? null}
        task={quickTaskDraft}
      />
    </div>
  );
};

export default CalendarSurface;
