import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BrushCleaning, CheckSquare, ChevronLeft, ChevronRight, Menu, Search, Sparkles } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  normalizeTask as normalizeQuickTask,
  sortTasksForDrawer,
  type QuickTask,
  isSameDay as isSameDayTask,
} from "@/dashboard/project/components/Tasks/components/quickTaskUtils";
import { formatAssigneeDisplay } from "@/dashboard/project/components/Tasks/utils";
import type {
  QuickCreateTaskModalProject,
  QuickCreateTaskModalTask,
} from "@/dashboard/home/components/QuickCreateTaskModal";
import CreateCalendarItemModal, {
  type CreateEventRequest,
} from "../CreateCalendarItemModal";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import {
  createTask,
  createTasksBulk,
  updateTask,
  updateTasksBulk,
  deleteTask,
  reviewTransitionTask,
  fetchProjectOverlapStackTitles,
  setProjectOverlapStackTitle,
  type Task as ApiTask,
  type TimelineEvent as ApiTimelineEvent,
} from "@/shared/utils/api";
import type { Task } from "@/shared/utils/api";
import { notify } from "@/shared/ui/ToastNotifications";
import {
  CalendarEntryChanges,
  CalendarEntryType,
  buildIsoDateTime,
} from "./calendarInteractions";
import type { ContextMenuEntry } from "./CalendarEntryContextMenu";
import { useUser } from "@/app/contexts/useUser";
import { useIsMobile } from "@/dashboard/project/components/Shared/calendar/hooks";

import DayGrid from "./DayGrid";
import EventsAndTasks from "./EventsAndTasks";
import MobileEventsDrawer from "./MobileEventsDrawer";
import CalendarTaskDrawer from "./CalendarTaskDrawer";
import MiniCalendar, { type MiniCalendarActivityItem } from "./MiniCalendar";
import MonthGrid from "./MonthGrid";
import WeekGrid from "./WeekGrid";
import { CalendarEvent, CalendarTask, fmt, fmtLocal, safeDate, isSameDay, formatTimeLabel } from "../utils";
import TaskSpellbookModal, { type TaskSpellbookApplyRequest } from "./TaskSpellbookModal";
import { formatMinutesHHMM } from "../lib/doablePlanner";
import { parseTimeToMinutes } from "./timelineLayout";

import "../calendar-preview.css";

const POINTER_TASK_DEFAULT_DURATION_MINUTES = 30;

const resolveTaskIdentifier = (task: CalendarTask) => {
  const source = task.source as ApiTask;
  return (
    source.taskId ??
    (source as { id?: string }).id ??
    task.id ??
    null
  );
};

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
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<"month" | "week" | "day">("week");
  const [internalDate, setInternalDate] = useState<Date>(currentDate);
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    date: Date;
    event: CalendarEvent | null;
    triggeredFromCalendar?: boolean;
  }>({
    open: false,
    mode: "create",
    date: currentDate,
    event: null,
    triggeredFromCalendar: false,
  });
  const [isEventsDrawerOpen, setIsEventsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSpellbookOpen, setIsSpellbookOpen] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [quickTaskDraft, setQuickTaskDraft] = useState<QuickCreateTaskModalTask | null>(null);
  const [isQuickTaskModalOpen, setIsQuickTaskModalOpen] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(() => new Set());
  const buildSelectionKey = useCallback(
    (type: CalendarEntryType, id: string) => `${type}:${id}`,
    [],
  );
  const handleEntrySelect = useCallback(
    (type: CalendarEntryType, id: string, additive: boolean) => {
      const key = buildSelectionKey(type, id);
      setSelectedEntries((prev) => {
        if (!additive) {
          if (prev.size === 1 && prev.has(key)) {
            return prev;
          }
          return new Set([key]);
        }
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [buildSelectionKey],
  );

  const handleReplaceSelection = useCallback((next: Set<string>) => {
    setSelectedEntries(new Set(next));
  }, []);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  // Multi-user overlap stack titles (persisted to backend per project)
  const [overlapStackTitles, setOverlapStackTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!activeProjectId) {
      setOverlapStackTitles({});
      return;
    }
    let cancelled = false;
    fetchProjectOverlapStackTitles(activeProjectId)
      .then((titles) => {
        if (!cancelled) {
          setOverlapStackTitles(titles);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch overlap stack titles:", error);
        if (!cancelled) {
          setOverlapStackTitles({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const handleRenameOverlapStackTitle = useCallback(
    async (key: string, title: string) => {
      if (!activeProjectId) return;
      try {
        const updated = await setProjectOverlapStackTitle(activeProjectId, key, title);
        setOverlapStackTitles(updated);
        notify("success", "Stack title updated");
      } catch (error) {
        console.error("Failed to save overlap stack title:", error);
        notify("error", "Failed to save stack title");
        throw error;
      }
    },
    [activeProjectId],
  );

  useEffect(() => {
    if (isMobile) {
      setIsSidebarCollapsed(false);
    }
  }, [isMobile]);


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

  const doneCountsByDay = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((task) => {
      if (task.status !== "done" && task.status !== "archived") return;
      const dueDate = task.due ? safeDate(task.due) : null;
      if (!dueDate) return;
      const key = fmtLocal(dueDate);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  const effectiveTasks = useMemo(() => {
    if (!hideCompleted) return visibleTasks;
    return visibleTasks.filter((task) => task.status !== "done" && task.status !== "archived");
  }, [hideCompleted, visibleTasks]);

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
    effectiveTasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [effectiveTasks]);

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

    effectiveTasks.forEach((task) => {
      if (!task.due) return;
      const taskDate = safeDate(task.due) ?? new Date(task.due);
      if (Number.isNaN(taskDate.getTime())) {
        return;
      }
      const key = fmt(taskDate);
      const startLabel = formatTimeLabel(task.start) ?? undefined;
      const endLabel = formatTimeLabel(task.end) ?? undefined;
      const timeLabel = startLabel && endLabel ? `${startLabel} - ${endLabel}` : startLabel ?? undefined;
      const entry: MiniCalendarActivityItem = {
        id: `task-${task.id}`,
        title: task.title,
        time: timeLabel,
        note: undefined,
        type: "task",
        color: defaultColor,
        isCompleted: Boolean(task.done || task.status === 'archived'),
        sortKey: task.start ?? "99:99",
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
  }, [visibleEvents, effectiveTasks, activeProjectColor]);

  const miniCalendarActivityDates = useMemo(
    () => Object.keys(miniCalendarActivityMap),
    [miniCalendarActivityMap],
  );

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
          sourceTask?.endAt ??
          (sourceTask as { end_at?: string | null })?.end_at ??
          sourceTask?.dueDate ??
          (sourceTask as { due_at?: string | null })?.due_at ??
          (sourceTask as { dueAt?: string | number | Date | null })?.dueAt ??
          null,
        startAt:
          sourceTask?.startAt ??
          (sourceTask as { start_at?: string | null })?.start_at ??
          (sourceTask as { startTime?: string | null })?.startTime ??
          (quickTask?.raw as { startAt?: string | number | Date | null } | undefined)?.startAt ??
          null,
        endAt:
          sourceTask?.endAt ??
          (sourceTask as { end_at?: string | null })?.end_at ??
          (sourceTask as { endTime?: string | null })?.endTime ??
          (quickTask?.raw as { endAt?: string | number | Date | null } | undefined)?.endAt ??
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

  const handleOpenQuickTaskModal = useCallback(
    (date: Date, startAt?: Date) => {
      setInternalDate(date);
      const fallbackProjectId = activeProjectId ?? taskProjects[0]?.id ?? null;
      if (!fallbackProjectId) {
        notify("error", "Add a project before creating tasks.");
        return;
      }

      const fallbackProjectName =
        activeProjectName ??
        taskProjects.find((project) => project.id === fallbackProjectId)?.name ??
        null;

      const resolvedStartAt = startAt ?? null;
      const draftEndAt =
        resolvedStartAt != null
          ? new Date(resolvedStartAt.getTime() + POINTER_TASK_DEFAULT_DURATION_MINUTES * 60000)
          : null;

      const draft: QuickCreateTaskModalTask = {
        projectId: fallbackProjectId,
        projectName: fallbackProjectName ?? null,
        dueDate: draftEndAt ?? date,
        startAt: resolvedStartAt ?? undefined,
        endAt: draftEndAt ?? undefined,
        status: "todo",
      };

      setQuickTaskDraft(draft);
      setIsQuickTaskModalOpen(true);
    },
    [activeProjectId, activeProjectName, taskProjects],
  );

  const handleOpenQuickIntentModal = useCallback(
    (date: Date) => {
      setInternalDate(date);
      const fallbackProjectId = activeProjectId ?? taskProjects[0]?.id ?? null;
      if (!fallbackProjectId) {
        notify("error", "Add a project before creating tasks.");
        return;
      }

      const fallbackProjectName =
        activeProjectName ??
        taskProjects.find((project) => project.id === fallbackProjectId)?.name ??
        null;

      const draft: QuickCreateTaskModalTask = {
        projectId: fallbackProjectId,
        projectName: fallbackProjectName ?? null,
        dueDate: date,
        status: "todo",
        kind: "intent",
      };

      setQuickTaskDraft(draft);
      setIsQuickTaskModalOpen(true);
    },
    [activeProjectId, activeProjectName, taskProjects],
  );

  const handleTaskDrawerClose = useCallback(() => {
    setIsQuickTaskModalOpen(false);
    setQuickTaskDraft(null);
  }, []);

  const handleTaskDrawerCreated = useCallback(() => {
    handleRefreshTasks();
    handleTaskDrawerClose();
  }, [handleRefreshTasks, handleTaskDrawerClose]);

  const handleTaskDrawerUpdated = useCallback(() => {
    handleRefreshTasks();
    handleTaskDrawerClose();
  }, [handleRefreshTasks, handleTaskDrawerClose]);

  const handleTaskDrawerRefresh = useCallback(() => {
    handleRefreshTasks();
  }, [handleRefreshTasks]);

  const handleOpenSpellbook = useCallback(() => {
    setIsSpellbookOpen(true);
  }, []);

  const handleCloseSpellbook = useCallback(() => {
    setIsSpellbookOpen(false);
  }, []);

  const handleToggleDoneSweep = useCallback(() => {
    setHideCompleted((prev) => !prev);
  }, []);

  const handleApplySpellbook = useCallback(
    async (request: TaskSpellbookApplyRequest) => {
      if (!activeProjectId) {
        notify("error", "Select a project to create tasks.");
        return;
      }

      const targetDate = request.targetDate;
      try {
        const clampMinutesOfDay = (value: number) => Math.max(0, Math.min(24 * 60, Math.round(value)));

        const mergeBusy = (busy: Array<{ startMinutes: number; endMinutes: number }>) => {
          const sorted = busy
            .map((block) => ({
              startMinutes: clampMinutesOfDay(block.startMinutes),
              endMinutes: clampMinutesOfDay(block.endMinutes),
            }))
            .filter((block) => block.endMinutes > block.startMinutes)
            .sort((a, b) => a.startMinutes - b.startMinutes);

          const merged: Array<{ startMinutes: number; endMinutes: number }> = [];
          for (const block of sorted) {
            const last = merged[merged.length - 1];
            if (!last || block.startMinutes > last.endMinutes) {
              merged.push({ ...block });
              continue;
            }
            last.endMinutes = Math.max(last.endMinutes, block.endMinutes);
          }
          return merged;
        };

        const invertBusy = (
          busy: Array<{ startMinutes: number; endMinutes: number }>,
          dayStart: number,
          dayEnd: number,
        ) => {
          const merged = mergeBusy(busy);
          const clampedStart = clampMinutesOfDay(dayStart);
          const clampedEnd = clampMinutesOfDay(dayEnd);
          if (clampedEnd <= clampedStart) return [];

          const slots: Array<{ startMinutes: number; endMinutes: number }> = [];
          let cursor = clampedStart;
          for (const block of merged) {
            if (block.endMinutes <= clampedStart) continue;
            if (block.startMinutes >= clampedEnd) break;
            const start = Math.max(cursor, clampedStart);
            const end = Math.min(block.startMinutes, clampedEnd);
            if (end > start) slots.push({ startMinutes: start, endMinutes: end });
            cursor = Math.max(cursor, block.endMinutes);
          }
          if (cursor < clampedEnd) {
            slots.push({ startMinutes: cursor, endMinutes: clampedEnd });
          }
          return slots;
        };

        const findNearestSlotStart = (
          busy: Array<{ startMinutes: number; endMinutes: number }>,
          desiredStartMinutes: number,
          durationMinutes: number,
        ) => {
          const desired = clampMinutesOfDay(desiredStartMinutes);
          const duration = Math.max(5, Math.round(durationMinutes));
          const slots = invertBusy(busy, 6 * 60, 22 * 60);
          const candidates = slots
            .filter((slot) => slot.endMinutes - slot.startMinutes >= duration)
            .map((slot) => Math.min(Math.max(desired, slot.startMinutes), slot.endMinutes - duration));

          if (candidates.length === 0) return desired;
          candidates.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b);
          return candidates[0];
        };

        const busyBlocksForDate = (() => {
          const busy: Array<{ startMinutes: number; endMinutes: number }> = [];

          events.forEach((event) => {
            if (event.date !== targetDate) return;
            if (!event.start || !event.end) return;
            const startMinutes = parseTimeToMinutes(event.start);
            const endMinutes = parseTimeToMinutes(event.end);
            if (startMinutes == null || endMinutes == null) return;
            if (endMinutes <= startMinutes) return;
            busy.push({ startMinutes, endMinutes });
          });

          tasks.forEach((task) => {
            if (task.due !== targetDate) return;
            if (!task.start || !task.end) return;
            const startMinutes = parseTimeToMinutes(task.start);
            const endMinutes = parseTimeToMinutes(task.end);
            if (startMinutes == null || endMinutes == null) return;
            if (endMinutes <= startMinutes) return;
            busy.push({ startMinutes, endMinutes });
          });

          return mergeBusy(busy);
        })();

        const resolveFocusBlockTimes = (blockIdx: number, durationMinutes: number) => {
          const placement = request.plan?.placements.find((p) => p.draftId === `block-${blockIdx}`) ?? null;
          if (placement) {
            const startAt = buildIsoDateTime(targetDate, formatMinutesHHMM(placement.startMinutes));
            const endAt = buildIsoDateTime(targetDate, formatMinutesHHMM(placement.endMinutes));
            return { startAt, endAt };
          }

          const startMinutes = findNearestSlotStart(busyBlocksForDate, 12 * 60, durationMinutes);
          const endMinutes = startMinutes + Math.max(15, Math.round(durationMinutes));
          const startAt = buildIsoDateTime(targetDate, formatMinutesHHMM(startMinutes));
          const endAt = buildIsoDateTime(targetDate, formatMinutesHHMM(Math.min(24 * 60, endMinutes)));
          return { startAt, endAt };
        };

        const createFocusBlockWithChildren = async (options: {
          blockIdx: number;
          title: string;
          cluster?: string;
          durationMinutes: number;
          taskChildPayloads: Task[];
        }) => {
          const { startAt, endAt } = resolveFocusBlockTimes(options.blockIdx, options.durationMinutes);
          const focusTask = await createTask({
            projectId: activeProjectId,
            title: options.title,
            status: "todo",
            kind: "focus_block",
            cluster: options.cluster,
            durationMinutes: options.durationMinutes,
            startAt,
            endAt,
            dueDate: endAt ?? targetDate,
            dueAt: endAt ?? targetDate,
            focusChildTaskIds: [],
            focusChecklist: [],
          });

          if (!focusTask.taskId) {
            notify("error", "Unable to create focus block.");
            return;
          }

          const focusId = focusTask.taskId;
          const childPayloads = options.taskChildPayloads.map((task) => ({
            ...task,
            projectId: activeProjectId,
            focusBlockId: focusId,
          }));
          const createdChildren = childPayloads.length > 0 ? await createTasksBulk(activeProjectId, childPayloads) : [];

          const childIds = createdChildren
            .map((task) => task.taskId)
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

          await updateTask({
            projectId: activeProjectId,
            taskId: focusId,
            title: options.title,
            focusChildTaskIds: childIds,
            focusChecklist: createdChildren
              .filter((child) => typeof child.taskId === "string" && child.taskId.trim().length > 0)
              .map((child) => ({
                taskId: child.taskId as string,
                title: child.title,
              })),
          });
        };

        if (request.inputSource === "load-today") {
          const taskById = new Map<string, CalendarTask>();
          tasks.forEach((task) => {
            const id = resolveTaskIdentifier(task);
            if (id) taskById.set(id, task);
          });

          const selected = request.existingTaskIds
            .map((id) => taskById.get(id))
            .filter((task): task is CalendarTask => Boolean(task));

          const eligible = selected.filter((task) => {
            const source = task.source as ApiTask;
            return source.projectId === activeProjectId;
          });

          if (eligible.length === 0) {
            notify("error", "No eligible tasks selected for this project.");
            return;
          }

          const focusTitle = request.variant.focusBlocks[0]?.title ?? "Focus Block";
          const focusCluster = request.variant.focusBlocks[0]?.cluster ?? undefined;
          const durationMinutes =
            request.variant.focusBlocks[0]?.durationMinutes ??
            eligible.reduce((sum, task) => sum + (task.durationMinutes || 30), 0);

          const { startAt, endAt } = resolveFocusBlockTimes(0, durationMinutes);
          const focusTask = await createTask({
            projectId: activeProjectId,
            title: focusTitle,
            status: "todo",
            kind: "focus_block",
            cluster: focusCluster,
            durationMinutes,
            startAt,
            endAt,
            dueDate: endAt ?? targetDate,
            dueAt: endAt ?? targetDate,
            focusChildTaskIds: [],
            focusChecklist: [],
          });

          if (!focusTask.taskId) {
            notify("error", "Unable to create focus block.");
            return;
          }

          const focusId = focusTask.taskId;
          const updates: Array<{ taskId: string; fields: Partial<Task> }> = [];
          const childIds: string[] = [];

          request.existingTaskIds.forEach((id) => {
            const task = taskById.get(id);
            if (!task) return;
            const source = task.source as ApiTask;
            if (source.projectId !== activeProjectId) return;
            const taskId = resolveTaskIdentifier(task);
            if (!taskId) return;
            childIds.push(taskId);
            updates.push({
              taskId,
              fields: {
                focusBlockId: focusId,
                startAt: null,
                endAt: null,
                dueDate: targetDate,
                dueAt: targetDate,
              },
            });
          });

          if (updates.length > 0) {
            await updateTasksBulk(activeProjectId, updates);
          }

          await updateTask({
            projectId: activeProjectId,
            taskId: focusId,
            title: focusTitle,
            focusChildTaskIds: childIds,
            focusChecklist: childIds
              .map((taskId) => ({ taskId, title: taskById.get(taskId)?.title ?? "" }))
              .filter((item) => item.taskId.trim().length > 0),
          });
        } else {
          const baseItems = request.variant.items;
          // Include ALL items (tasks + intents) in focus blocks.
          // Per product decision: Spellbook only creates Focus Blocks.
          // All items become child tasks inside the focus block.
          const allItemIndexes = baseItems.map((_, idx) => idx);

          const focusDrafts =
            request.variant.focusBlocks.length > 0
              ? request.variant.focusBlocks.map((fb) => ({
                  ...fb,
                  // Expand itemIndexes to include ALL items if variant only tracked "task" items
                  itemIndexes: fb.itemIndexes?.length
                    ? [...new Set([...fb.itemIndexes, ...allItemIndexes.filter((idx) => baseItems[idx]?.kind === "intent")])]
                    : allItemIndexes,
                }))
              : [
                  {
                    title: "Focus Block",
                    cluster: "",
                    itemIndexes: allItemIndexes,
                    durationMinutes: allItemIndexes.reduce(
                      (sum, idx) => sum + (baseItems[idx]?.durationMinutes ?? 0),
                      0,
                    ),
                  },
                ];

          for (let blockIdx = 0; blockIdx < focusDrafts.length; blockIdx += 1) {
            const focusDraft = focusDrafts[blockIdx];
            const itemIndexes = focusDraft.itemIndexes ?? [];
            // Convert ALL items (task + intent) into child tasks
            const taskChildPayloads: Task[] = itemIndexes
              .map((idx) => baseItems[idx])
              .filter((item): item is NonNullable<typeof item> => Boolean(item))
              .map((item) => ({
                projectId: activeProjectId,
                title: item.title,
                status: "todo",
                dueDate: targetDate,
                dueAt: targetDate,
                kind: "task", // Always create as regular task, never as "intent"
                cluster: item.cluster,
                tags: item.tags,
                durationMinutes: item.durationMinutes,
              }));

            const durationMinutes =
              focusDraft.durationMinutes ?? taskChildPayloads.reduce((sum, task) => sum + (task.durationMinutes ?? 0), 0);

            await createFocusBlockWithChildren({
              blockIdx,
              title: focusDraft.title ?? "Focus Block",
              cluster: focusDraft.cluster ?? undefined,
              durationMinutes,
              taskChildPayloads,
            });
          }

          // Intent items are included as children in focus blocks above.
          // Per product decision, Spellbook/Conjure should ONLY create Focus Blocks.
          // Standalone "intent" tiles broke trust (grey, uneditable ghost blocks).
          // All items parsed as "intent" are now converted to regular tasks inside the focus block.
        }

        await onRefreshTasks();
        notify("success", "Spellbook applied (Focus Block created).");
      } catch (error) {
        console.error("Failed to apply spellbook", error);
        notify("error", "Unable to apply spellbook. Please try again.");
      }
    },
    [activeProjectId, events, onRefreshTasks, tasks],
  );

  const handleConvertToFocusBlock = useCallback(
    async (selectedTasks: CalendarTask[]) => {
      if (!activeProjectId) {
        notify("error", "Select a project to create a focus block.");
        return;
      }

      const eligible = selectedTasks
        .filter((task) => {
          const source = task.source as ApiTask;
          return source.projectId === activeProjectId;
        })
        .filter((task) => task.kind !== "intent" && task.kind !== "focus_block" && !task.focusBlockId);

      if (eligible.length < 2) {
        notify("error", "Select at least 2 tasks to make a focus block.");
        return;
      }

      const dateIso = eligible[0].due ?? fmtLocal(internalDate);

      const sameDay = eligible.filter((task) => (task.due ?? dateIso) === dateIso);
      if (sameDay.length !== eligible.length) {
        notify("error", "Select time blocks on the same day to make a focus block.");
        return;
      }

      const timed = sameDay
        .map((task) => {
          const startMinutes = task.start ? parseTimeToMinutes(task.start) : null;
          const endMinutes = task.end ? parseTimeToMinutes(task.end) : null;
          if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
          return { task, startMinutes, endMinutes };
        })
        .filter(
          (value): value is { task: CalendarTask; startMinutes: number; endMinutes: number } =>
            value !== null,
        );

      if (timed.length < 2) {
        notify("error", "Select at least 2 scheduled time blocks to make a focus block.");
        return;
      }

      const clusterCounts = new Map<string, number>();
      eligible.forEach((task) => {
        const label = task.cluster?.trim() || "";
        if (!label) return;
        clusterCounts.set(label, (clusterCounts.get(label) ?? 0) + 1);
      });
      const bestCluster = [...clusterCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      const defaultFromFirstTask = timed[0]?.task?.title?.trim() ?? "";
      const title = defaultFromFirstTask || (bestCluster ? `${bestCluster}: focus block` : "Focus block");

      const startMinutes = Math.min(...timed.map((t) => t.startMinutes));
      const endMinutes = Math.max(...timed.map((t) => t.endMinutes));
      const durationMinutes = Math.max(30, endMinutes - startMinutes);
      const startAt = buildIsoDateTime(dateIso, formatMinutesHHMM(startMinutes));
      const endAt = buildIsoDateTime(dateIso, formatMinutesHHMM(endMinutes));

      const childTaskIds = timed
        .map((rec) => resolveTaskIdentifier(rec.task))
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

        try {
          const focusTask = await createTask({
            projectId: activeProjectId,
            title,
            status: "todo",
          kind: "focus_block",
          cluster: bestCluster || undefined,
          durationMinutes,
          startAt,
          endAt,
          dueDate: endAt ?? dateIso,
          dueAt: endAt ?? dateIso,
          focusChildTaskIds: childTaskIds,
          focusChecklist: eligible.map((task) => ({
            taskId: resolveTaskIdentifier(task) ?? task.id,
            title: task.title,
          })),
        });

        if (!focusTask.taskId) {
          notify("error", "Unable to create focus block.");
          return;
        }

        const childUpdates: Array<{ taskId: string; fields: Partial<Task> }> = timed
          .map((rec) => resolveTaskIdentifier(rec.task))
          .filter((value): value is string => Boolean(value))
          .map((taskId) => ({
            taskId,
            fields: {
              focusBlockId: focusTask.taskId!,
            },
          }));

        if (childUpdates.length > 0) {
          await updateTasksBulk(activeProjectId, childUpdates);
        }

        await onRefreshTasks();
        notify("success", "Converted to focus block.");
      } catch (error) {
        console.error("Failed to convert to focus block", error);
        notify("error", "Unable to convert to focus block. Please try again.");
      }
    },
    [activeProjectId, events, internalDate, onRefreshTasks, tasks],
  );

  const handleUngroupFocusBlock = useCallback(
    async (focusBlock: CalendarTask) => {
      const source = focusBlock.source as ApiTask;
      if (!source.projectId || !source.taskId) return;
      // Detect Focus Blocks by kind OR by having child task references (legacy support)
      const isFocusBlock = focusBlock.kind === "focus_block" ||
        (focusBlock.focusChildTaskIds && focusBlock.focusChildTaskIds.length > 0) ||
        (focusBlock.focusChecklist && focusBlock.focusChecklist.length > 0);
      if (!isFocusBlock) return;

      const focusId = source.taskId;
      const declaredChildIds =
        focusBlock.focusChildTaskIds ?? focusBlock.focusChecklist?.map((item) => item.taskId) ?? [];

      const scannedChildIds = tasks
        .filter((task) => task.focusBlockId === focusId)
        .map((task) => resolveTaskIdentifier(task))
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

      const childIds = Array.from(new Set([...declaredChildIds, ...scannedChildIds]));

      const focusDateIso =
        focusBlock.due ??
        (typeof source.dueDate === "string" ? source.dueDate : undefined) ??
        (typeof source.dueAt === "string" ? source.dueAt : undefined) ??
        undefined;

      const focusStartMinutes = focusBlock.start ? parseTimeToMinutes(focusBlock.start) : null;
      const focusEndMinutes = focusBlock.end ? parseTimeToMinutes(focusBlock.end) : null;

      const taskById = new Map<string, CalendarTask>();
      tasks.forEach((task) => {
        const id = resolveTaskIdentifier(task);
        if (id) taskById.set(id, task);
      });

      const checklistOrder = new Map<string, number>();
      (focusBlock.focusChecklist ?? []).forEach((item, idx) => {
        if (item?.taskId) checklistOrder.set(item.taskId, idx);
      });

      try {
        if (childIds.length > 0) {
          const updates: Array<{ taskId: string; fields: Partial<Task> }> = [];

          const shouldReconstructTimes =
            Boolean(focusDateIso) &&
            typeof focusStartMinutes === "number" &&
            typeof focusEndMinutes === "number" &&
            focusEndMinutes > focusStartMinutes;

          let cursorMinutes = typeof focusStartMinutes === "number" ? focusStartMinutes : 0;

          const sortedChildIds = [...childIds].sort((a, b) => {
            const aOrder = checklistOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
            const bOrder = checklistOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.localeCompare(b);
          });

          sortedChildIds.forEach((taskId) => {
            const child = taskById.get(taskId) ?? null;

            const hasTime = Boolean(child?.start && child?.end);
            const shouldSetTime = shouldReconstructTimes && !hasTime;

            const durationMinutes =
              (typeof child?.durationMinutes === "number" && child.durationMinutes > 0
                ? child.durationMinutes
                : typeof (child?.source as { durationMinutes?: unknown } | undefined)?.durationMinutes === "number"
                ? ((child?.source as { durationMinutes?: number }).durationMinutes ?? 30)
                : 30);

            const nextEnd = Math.min(
              typeof focusEndMinutes === "number" ? focusEndMinutes : cursorMinutes + durationMinutes,
              cursorMinutes + Math.max(15, durationMinutes),
            );

            const fields: Partial<Task> = { focusBlockId: null };
            if (shouldSetTime && focusDateIso) {
              fields.startAt = buildIsoDateTime(focusDateIso, formatMinutesHHMM(cursorMinutes));
              fields.endAt = buildIsoDateTime(focusDateIso, formatMinutesHHMM(Math.max(cursorMinutes + 15, nextEnd)));
              fields.dueDate = focusDateIso;
              fields.dueAt = focusDateIso;
              cursorMinutes = Math.max(cursorMinutes + 15, nextEnd);
            }

            updates.push({ taskId, fields });
          });

          await updateTasksBulk(source.projectId, updates);
        }

        await deleteTask({
          projectId: source.projectId,
          taskId: source.taskId,
        });

        await onRefreshTasks();
        notify("success", "Ungrouped focus block.");
      } catch (error) {
        console.error("Failed to ungroup focus block", error);
        notify("error", "Unable to ungroup focus block. Please try again.");
      }
    },
    [onRefreshTasks, tasks],
  );

  const handleRescheduleEntries = useCallback(
    async (changes: CalendarEntryChanges[]) => {
      if (!changes.length) return;

      const eventChanges = changes.filter((change) => change.type === "event");
      const taskChanges = changes.filter((change) => change.type === "task");
      const operations: Promise<unknown>[] = [];

      if (eventChanges.length) {
        eventChanges.forEach((change) => {
          const event = change.entry as CalendarEvent;
          const payload: CreateEventRequest = {
            title: event.title || "Untitled event",
            date: change.date,
            time: change.start,
            endTime: change.end,
            allDay: event.allDay,
            eventType: event.eventType ?? event.category ?? "",
            location: event.location ?? undefined,
            description: event.description ?? event.title ?? undefined,
            tags: event.tags ?? [],
            guests: event.guests ?? [],
          };
          if (change.duplicate) {
            // Create a new event (copy)
            operations.push(onCreateEvent(payload));
          } else {
            operations.push(onUpdateEvent(event.source, payload));
          }
        });
      }

      if (taskChanges.length) {
        const createsByProject = new Map<string, Task[]>();
        const updatesByProject = new Map<string, Array<{ taskId: string; fields: Partial<Task> }>>();

        const isFocusBlockLike = (task: CalendarTask) => {
          if (task.kind === "focus_block") return true;
          const hasChildren =
            (Array.isArray(task.focusChildTaskIds) && task.focusChildTaskIds.length > 0) ||
            (Array.isArray(task.focusChecklist) && task.focusChecklist.length > 0);
          return hasChildren;
        };

        const duplicateFocusBlockWithChildren = async (options: {
          task: CalendarTask;
          targetDate: string;
          start: string;
          end: string;
        }) => {
          const { task, targetDate, start, end } = options;
          const source = task.source as ApiTask;
          const projectId = source.projectId ?? activeProjectId ?? undefined;
          const focusId = resolveTaskIdentifier(task);
          if (!projectId || !focusId) return;

          const focusStart = parseTimeToMinutes(task.start);
          const focusEnd = parseTimeToMinutes(task.end);
          const targetStart = parseTimeToMinutes(start);
          const targetEnd = parseTimeToMinutes(end);
          if (targetStart == null || targetEnd == null) return;

          const startAt = buildIsoDateTime(targetDate, start);
          const endAt = buildIsoDateTime(targetDate, end);
          const dueAt = endAt ?? targetDate;

          const taskById = new Map<string, CalendarTask>();
          tasks.forEach((t) => {
            const id = resolveTaskIdentifier(t);
            if (id) taskById.set(id, t);
          });

          const referencedIds = new Set<string>();
          (task.focusChildTaskIds ?? []).forEach((id) => {
            if (id) referencedIds.add(id);
          });
          (task.focusChecklist ?? []).forEach((item) => {
            if (item?.taskId) referencedIds.add(item.taskId);
          });

          // Include children that link back via focusBlockId as well.
          tasks.forEach((t) => {
            if (t.focusBlockId && t.focusBlockId === focusId) {
              const id = resolveTaskIdentifier(t);
              if (id) referencedIds.add(id);
            }
          });

          const childTasks = Array.from(referencedIds)
            .map((id) => taskById.get(id))
            .filter((t): t is CalendarTask => Boolean(t));

          // Create new Focus Block wrapper first.
          const newFocus = await createTask({
            projectId,
            title: task.title ?? "Focus Block",
            description: task.description ?? undefined,
            // Copying a focus block should create a fresh (not-done) wrapper.
            // The copied children are also reset, so the parent should not remain strikethrough.
            status: "todo",
            kind: "focus_block",
            cluster: (source as { cluster?: string }).cluster,
            durationMinutes: Math.max(15, targetEnd - targetStart),
            startAt,
            endAt,
            dueDate: dueAt,
            dueAt,
            focusChildTaskIds: [],
            focusChecklist: [],
          });

          if (!newFocus.taskId) return;

          // Duplicate the content tasks, preserving relative timing within the block when possible.
          const childPayloads: Task[] = childTasks.map((child) => {
            const childSource = child.source as ApiTask;
            const childStart = parseTimeToMinutes(child.start);
            const childEnd = parseTimeToMinutes(child.end);

            const base: Task = {
              projectId,
              title: child.title ?? "Untitled task",
              description: child.description ?? undefined,
              assigneeId: childSource.assigneeId,
              assigneeIds: childSource.assigneeIds,
              address: childSource.address,
              location: childSource.location,
              focusBlockId: newFocus.taskId,
            };

            if (
              focusStart != null &&
              focusEnd != null &&
              childStart != null &&
              childEnd != null &&
              focusEnd > focusStart
            ) {
              const offsetStart = childStart - focusStart;
              const offsetEnd = childEnd - focusStart;
              const nextStart = Math.max(0, Math.min(24 * 60 - 1, targetStart + offsetStart));
              const nextEnd = Math.max(nextStart + 15, Math.min(24 * 60, targetStart + offsetEnd));
              base.startAt = buildIsoDateTime(targetDate, formatMinutesHHMM(nextStart));
              base.endAt = buildIsoDateTime(targetDate, formatMinutesHHMM(nextEnd));
              base.dueDate = base.endAt ?? targetDate;
              base.dueAt = base.endAt ?? targetDate;
            } else {
              // Default to unscheduled (inherits the day), but still belongs to the new focus block.
              base.dueDate = dueAt;
              base.dueAt = dueAt;
            }

            return base;
          });

          const createdChildren = childPayloads.length > 0 ? await createTasksBulk(projectId, childPayloads) : [];

          const childIds = createdChildren
            .map((t) => t.taskId)
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

          await updateTask({
            projectId,
            taskId: newFocus.taskId,
            focusChildTaskIds: childIds,
            focusChecklist: createdChildren
              .filter((t) => typeof t.taskId === "string" && t.taskId.trim().length > 0)
              .map((t) => ({ taskId: t.taskId as string, title: t.title })),
          });
        };

        taskChanges.forEach((change) => {
          const task = change.entry as CalendarTask;
          const source = task.source as ApiTask;
          const projectId = source.projectId ?? activeProjectId ?? undefined;
          const taskId = resolveTaskIdentifier(task);

          if (!projectId) return;

          const dueDate = change.date;
          const startAt = buildIsoDateTime(dueDate, change.start);
          const endAt = buildIsoDateTime(dueDate, change.end);
          const dueAt = endAt ?? dueDate;

          if (change.duplicate) {
            if (isFocusBlockLike(task)) {
              operations.push(
                duplicateFocusBlockWithChildren({
                  task,
                  targetDate: dueDate,
                  start: change.start,
                  end: change.end,
                }),
              );
              return;
            }
            const payload: Task = {
              projectId,
              title: task.title ?? "Untitled task",
              description: task.description ?? undefined,
              dueDate: dueAt,
              dueAt,
              startAt,
              endAt,
              assigneeId: source.assigneeId,
              assigneeIds: source.assigneeIds,
              address: source.address,
              location: source.location,
            };
            createsByProject.set(projectId, [...(createsByProject.get(projectId) ?? []), payload]);
            return;
          }

          if (!taskId) return;
          const fields: Partial<Task> = {
            title: task.title,
            dueDate: dueAt,
            dueAt,
            startAt,
            endAt,
          };
          updatesByProject.set(projectId, [
            ...(updatesByProject.get(projectId) ?? []),
            { taskId, fields },
          ]);
        });

        createsByProject.forEach((payloads, projectId) => {
          operations.push(createTasksBulk(projectId, payloads));
        });
        updatesByProject.forEach((updates, projectId) => {
          operations.push(updateTasksBulk(projectId, updates));
        });
      }

      try {
        await Promise.all(operations);
        const refreshResult = onRefreshTasks?.();
        if (refreshResult) {
          await refreshResult;
        }
      } catch (error) {
        console.error("Failed to reschedule calendar entries", error);
        notify("error", "Unable to save calendar changes. Please try again.");
      }
    },
    [activeProjectId, onCreateEvent, onRefreshTasks, onUpdateEvent, tasks],
  );

  const handleSelectDate = useCallback((date: Date) => {
    setInternalDate(date);
  }, []);

  const handleSwitchToDayView = useCallback(() => {
    setView("day");
  }, []);

  const handleOpenCreate = useCallback(
    (date: Date, options?: { triggeredFromCalendar?: boolean }) => {
      setInternalDate(date);
      setModalState({
        open: true,
        mode: "create",
        date,
        event: null,
        triggeredFromCalendar: options?.triggeredFromCalendar ?? false,
      });
    },
    [],
  );

  const handleOpenEditEvent = useCallback((event: CalendarEvent) => {
    const eventDate = safeDate(event.date) ?? new Date(event.date);
    setInternalDate(eventDate);
    setModalState({
      open: true,
      mode: "edit",
      date: eventDate,
      event,
      triggeredFromCalendar: false,
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

  // Context menu action handlers for calendar entries
  const handleSubmitForReview = useCallback(
    async (tasks: CalendarTask[]) => {
      for (const task of tasks) {
        const source = task.source as ApiTask;
        if (!source.projectId || !source.taskId) continue;
        try {
          await reviewTransitionTask(source.projectId, source.taskId, {
            action: "submit_for_review",
          });
        } catch (error) {
          console.error("Failed to submit task for review:", error);
          notify("error", `Failed to submit "${task.title}" for review`);
        }
      }
      if (tasks.length > 0) {
        notify("success", tasks.length > 1 ? `${tasks.length} tasks submitted for review` : "Task submitted for review");
        await onRefreshTasks();
      }
    },
    [onRefreshTasks],
  );

  const handleMarkAsDone = useCallback(
    async (tasks: CalendarTask[]) => {
      for (const task of tasks) {
        const source = task.source as ApiTask;
        if (!source.projectId || !source.taskId) continue;
        try {
          await reviewTransitionTask(source.projectId, source.taskId, {
            action: "mark_done",
          });
        } catch (error) {
          console.error("Failed to mark task as done:", error);
          notify("error", `Failed to mark "${task.title}" as done`);
        }
      }
      if (tasks.length > 0) {
        notify("success", tasks.length > 1 ? `${tasks.length} tasks marked as done` : "Task marked as done");
        await onRefreshTasks();
      }
    },
    [onRefreshTasks],
  );

  const handleRenameTaskTitle = useCallback(
    async (task: CalendarTask, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      const source = task.source as ApiTask;
      if (!source.projectId || !source.taskId) return;
      try {
        await updateTask({ projectId: source.projectId, taskId: source.taskId, title: nextTitle } as Task);
        notify("success", "Title updated");
        await onRefreshTasks();
      } catch (error) {
        console.error("Failed to rename task:", error);
        notify("error", "Failed to update title");
      }
    },
    [onRefreshTasks],
  );

  const handleSaveChanges = useCallback(
    (entry: CalendarTask | CalendarEvent) => {
      // Open the edit modal/drawer for the entry to allow saving changes
      if ("startTime" in entry && typeof entry.startTime === "string") {
        // It's a task
        handleOpenEditTask(entry as CalendarTask);
      } else {
        // It's an event
        handleOpenEditEvent(entry as CalendarEvent);
      }
    },
    [handleOpenEditTask, handleOpenEditEvent],
  );

  const handleDeleteEntry = useCallback(
    async (entryType: CalendarEntryType, entry: CalendarTask | CalendarEvent) => {
      if (entryType === "task") {
        const task = entry as CalendarTask;
        const source = task.source as ApiTask;
        if (!source.projectId || !source.taskId) return;
        try {
          await deleteTask({
            projectId: source.projectId,
            taskId: source.taskId,
          });
          notify("success", "Task deleted");
          await onRefreshTasks();
        } catch (error) {
          console.error("Failed to delete task:", error);
          notify("error", "Failed to delete task");
        }
      } else {
        // For events, use the existing delete handler
        const event = entry as CalendarEvent;
        const source = event.source as ApiTimelineEvent;
        if (source) {
          await onDeleteEvent(source);
        }
      }
    },
    [onRefreshTasks, onDeleteEvent],
  );

  // Clear selection handler
  const handleClearSelection = useCallback(() => {
    setSelectedEntries(new Set());
  }, []);

  // Delete multiple entries (for context menu and popover)
  const handleDeleteEntries = useCallback(
    async (entries: ContextMenuEntry[]) => {
      const taskEntries = entries.filter((e) => e.entryType === "task");
      const eventEntries = entries.filter((e) => e.entryType === "event");

      // Delete tasks
      for (const { entry } of taskEntries) {
        const task = entry as CalendarTask;
        const source = task.source as ApiTask;
        if (!source.projectId || !source.taskId) continue;
        try {
          await deleteTask({
            projectId: source.projectId,
            taskId: source.taskId,
          });
        } catch (error) {
          console.error("Failed to delete task:", error);
          notify("error", `Failed to delete "${task.title}"`);
        }
      }

      // Delete events
      for (const { entry } of eventEntries) {
        const event = entry as CalendarEvent;
        const source = event.source as ApiTimelineEvent;
        if (source) {
          await onDeleteEvent(source);
        }
      }

      const total = entries.length;
      if (total > 0) {
        notify("success", total > 1 ? `${total} items deleted` : "Item deleted");
        if (taskEntries.length > 0) await onRefreshTasks();
      }
      setSelectedEntries(new Set());
    },
    [onRefreshTasks, onDeleteEvent],
  );

  // Duplicate entries (placeholder - implement actual duplication logic as needed)
  const handleDuplicateEntries = useCallback(
    async (entries: ContextMenuEntry[]) => {
      // For now, just log - can implement actual duplication
      console.log("Duplicate entries:", entries);
      notify("info", `Duplicating ${entries.length} item(s) - feature coming soon`);
    },
    [],
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
      triggeredFromCalendar: false,
    }));
  }, []);

  return (
    <div className="calendar-surface">
      <div className="calendar-shell">
        <div className="calendar-card">
          <div
            className={`calendar-body${isSidebarCollapsed ? " calendar-body--sidebar-collapsed" : ""}`}
          >
            <div
              className={`calendar-sidebar${isSidebarCollapsed ? " calendar-sidebar--collapsed" : ""}`}
            >
              {!isMobile && (
                <button
                  type="button"
                  className={`calendar-sidebar__collapse-toggle${
                    isSidebarCollapsed ? " is-collapsed" : ""
                  }`}
                  onClick={handleToggleSidebar}
                  aria-expanded={!isSidebarCollapsed}
                  aria-label={
                    isSidebarCollapsed ? "Expand calendar sidebar" : "Collapse calendar sidebar"
                  }
                >
                  {isSidebarCollapsed ? (
                    <ChevronRight size={16} aria-hidden />
                  ) : (
                    <ChevronLeft size={16} aria-hidden />
                  )}
                  <span className="calendar-sidebar__collapse-label">
                    {isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                  </span>
                </button>
              )}
              <div className="calendar-sidebar__inner">
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
                    tasks={effectiveTasks}
                    onToggleTask={onToggleTask}
                    onEditEvent={handleOpenEditEvent}
                    onEditTask={handleOpenEditTask}
                    onOpenTasksOverview={handleOpenTasksOverview}
                  />
                )}
              </div>
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
                <div className="calendar-controls__actions">
                  <button type="button" className="calendar-controls__action-btn" onClick={handleOpenSpellbook}>
                    <Sparkles size={16} aria-hidden />
                    <span>Spellbook</span>
                  </button>
                  <button
                    type="button"
                    className={`calendar-controls__action-btn${hideCompleted ? " calendar-controls__action-btn--active" : ""}`}
                    onClick={handleToggleDoneSweep}
                  >
                    <BrushCleaning size={16} aria-hidden />
                    <span>{hideCompleted ? "Undo sweep" : "Sweep done"}</span>
                  </button>
                </div>
              </div>

              <div className="calendar-view">
                {view === "month" && (
                  <MonthGrid
                    viewDate={internalDate}
                    selectedDate={internalDate}
                    events={visibleEvents}
                    tasks={effectiveTasks}
                    onSelectDate={handleSelectDate}
                    onOpenCreate={handleOpenCreate}
                    onOpenQuickTask={(date) => handleOpenQuickTaskModal(date)}
                    canCreateTasks={canCreateTasks}
                    onEditEvent={handleOpenEditEvent}
                    onEditTask={handleOpenEditTask}
                    onSwitchToDayView={handleSwitchToDayView}
                    teamMembers={teamMembers}
                  />
                )}
                {view === "week" && (
                  <div className="calendar-view__scroller">
                    <WeekGrid
                      anchorDate={internalDate}
                      events={visibleEvents}
                      tasks={effectiveTasks}
                      hideCompleted={hideCompleted}
                      doneCountsByDay={doneCountsByDay}
                      onEditEvent={handleOpenEditEvent}
                      onEditTask={handleOpenEditTask}
                      onRenameTaskTitle={handleRenameTaskTitle}
                      onCreateEvent={handleOpenCreate}
                      onCreateTask={handleOpenQuickTaskModal}
                      canCreateTasks={canCreateTasks}
                      teamMembers={teamMembers}
                      activeProjectId={activeProjectId}
                      activeProjectColor={activeProjectColor}
                      selectedEntryKeys={selectedEntries}
                      onEntrySelect={handleEntrySelect}
                      onClearSelection={handleClearSelection}
                      onReplaceSelection={handleReplaceSelection}
                      onRescheduleEntries={handleRescheduleEntries}
                      onSubmitForReview={handleSubmitForReview}
                      onMarkAsDone={handleMarkAsDone}
                      onConvertToFocusBlock={handleConvertToFocusBlock}
                      onUngroupFocusBlock={handleUngroupFocusBlock}
                      onDuplicateEntries={handleDuplicateEntries}
                      onDeleteEntries={handleDeleteEntries}
                      overlapStackTitles={overlapStackTitles}
                      onRenameOverlapStackTitle={handleRenameOverlapStackTitle}
                    />
                  </div>
                )}
                {view === "day" && (
                  <div className="calendar-view__scroller">
                    <DayGrid
                      date={internalDate}
                      events={visibleEvents}
                      tasks={effectiveTasks}
                      hideCompleted={hideCompleted}
                      doneCountsByDay={doneCountsByDay}
                      onEditEvent={handleOpenEditEvent}
                      onEditTask={handleOpenEditTask}
                      onRenameTaskTitle={handleRenameTaskTitle}
                      onCreateEvent={handleOpenCreate}
                      onCreateTask={handleOpenQuickTaskModal}
                      canCreateTasks={canCreateTasks}
                      teamMembers={teamMembers}
                      activeProjectId={activeProjectId}
                      activeProjectColor={activeProjectColor}
                      selectedEntryKeys={selectedEntries}
                      onEntrySelect={handleEntrySelect}
                      onClearSelection={handleClearSelection}
                      onReplaceSelection={handleReplaceSelection}
                      onRescheduleEntries={handleRescheduleEntries}
                      onSubmitForReview={handleSubmitForReview}
                      onMarkAsDone={handleMarkAsDone}
                      onConvertToFocusBlock={handleConvertToFocusBlock}
                      onUngroupFocusBlock={handleUngroupFocusBlock}
                      onDuplicateEntries={handleDuplicateEntries}
                      onDeleteEntries={handleDeleteEntries}
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
            Click to select • Double-click to edit • Shift/Ctrl+Click to multi-select • Right-click for actions
          </div>
          <div className="calendar-footer__timezone">
            Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ')}
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
        triggeredFromCalendar={modalState.triggeredFromCalendar ?? false}
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

      <TaskSpellbookModal
        isOpen={isSpellbookOpen}
        anchorDate={internalDate}
        events={events}
        tasks={tasks}
        activeProjectId={activeProjectId ?? null}
        onClose={handleCloseSpellbook}
        onApply={handleApplySpellbook}
        accentColor={activeProjectColor}
      />
      <CalendarTaskDrawer
        open={isQuickTaskModalOpen}
        task={quickTaskDraft}
        projects={taskProjects}
        activeProjectId={activeProjectId ?? null}
        activeProjectName={activeProjectName ?? null}
        onClose={handleTaskDrawerClose}
        onCreated={handleTaskDrawerCreated}
        onUpdated={handleTaskDrawerUpdated}
        onDeleted={handleTaskDrawerRefresh}
      />
      {isMobile ? (
        <MobileEventsDrawer
          open={isEventsDrawerOpen}
          events={visibleEvents}
          tasks={effectiveTasks}
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
