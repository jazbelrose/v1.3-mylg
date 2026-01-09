import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { blockMinutesFromWindow, getFocusBlockWindow } from "@/shared/utils/focusBlockWindows";
import { packTasksIntoFocusBlock } from "@/shared/utils/packTasksIntoFocusBlock";

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

const runWithConcurrency = async <T,>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<{ ok: T[]; failed: Array<{ item: T; error: unknown }> }> => {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(concurrency, list.length || 1));

  const ok: T[] = [];
  const failed: Array<{ item: T; error: unknown }> = [];

  let index = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (index < list.length) {
      const currentIndex = index;
      index += 1;
      const item = list[currentIndex];
      try {
        await worker(item);
        ok.push(item);
      } catch (error) {
        failed.push({ item, error });
      }
    }
  });

  await Promise.all(runners);
  return { ok, failed };
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

  // Optimistic task overrides (used to reflect immediate UI changes for status updates)
  const [optimisticTaskOverrides, setOptimisticTaskOverrides] = useState<
    Record<string, Partial<CalendarTask>>
  >({});

  // Undo stack for calendar actions
  type UndoAction = {
    type: "reschedule" | "delete" | "bulk-assign" | "assign";
    label: string;
    undo: () => Promise<void>;
  };
  const undoStackRef = useRef<UndoAction[]>([]);
  const MAX_UNDO_STACK = 20;

  const pushUndo = useCallback((action: UndoAction) => {
    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO_STACK - 1)), action];
  }, []);

  const isFocusBlockSource = useCallback((task: ApiTask | null | undefined) => {
    if (!task) return false;
    if (task.kind === "focus_block") return true;
    if (Array.isArray(task.focusChildTaskIds) && task.focusChildTaskIds.length > 0) return true;
    if (Array.isArray(task.focusChecklist) && task.focusChecklist.length > 0) return true;
    return false;
  }, []);

  const getFocusChildIdsFromSource = useCallback((task: ApiTask | null | undefined) => {
    const ids: string[] = [];
    if (!task) return ids;

    (task.focusChildTaskIds ?? []).forEach((id) => {
      if (typeof id === "string" && id.trim()) ids.push(id);
    });

    (task.focusChecklist ?? []).forEach((item) => {
      const id = item?.taskId;
      if (typeof id === "string" && id.trim()) ids.push(id);
    });

    // Uniqued while preserving insertion order.
    return Array.from(new Set(ids));
  }, []);

  const collectCascadeDeleteSourcesForFocusBlock = useCallback(
    (focusBlock: ApiTask, allCalendarTasks: CalendarTask[]) => {
      const focusTaskId = focusBlock.taskId;
      const projectId = focusBlock.projectId;
      if (!focusTaskId || !projectId) return [] as ApiTask[];

      const referencedChildIds = new Set(getFocusChildIdsFromSource(focusBlock));

      const children: ApiTask[] = [];
      allCalendarTasks.forEach((t) => {
        const src = t.source as ApiTask;
        if (!src || src.projectId !== projectId) return;
        if (!src.taskId || src.taskId === focusTaskId) return;

        const isLinkedByPointer = src.focusBlockId === focusTaskId;
        const isLinkedByChecklist = referencedChildIds.has(src.taskId);
        if (isLinkedByPointer || isLinkedByChecklist) {
          children.push({ ...src });
        }
      });

      // If the focus block references child ids that are not present in the
      // current task list, we can't delete them here (no projectId/taskId source).
      // We'll still delete any children we can see in the current calendar state.
      return Array.from(new Map(children.map((t) => [t.taskId as string, t])).values());
    },
    [getFocusChildIdsFromSource],
  );

  const handleUndo = useCallback(async () => {
    const action = undoStackRef.current.pop();
    if (!action) {
      notify("info", "Nothing to undo");
      return;
    }
    try {
      await action.undo();
      notify("success", `Undid: ${action.label}`);
      await onRefreshTasks();
    } catch (error) {
      console.error("Undo failed:", error);
      // Provide a more helpful message if a task was deleted
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Task not found") || errorMessage.includes("404")) {
        notify("error", "Cannot undo: one or more tasks were deleted or modified");
      } else {
        notify("error", "Failed to undo action");
      }
    }
  }, [onRefreshTasks]);

  // Global Ctrl+Z handler for undo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleUndo]);

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

  const tasksForUi = useMemo(() => {
    if (!optimisticTaskOverrides || Object.keys(optimisticTaskOverrides).length === 0) {
      return tasks;
    }
    return tasks.map((task) => {
      const key = resolveTaskIdentifier(task) ?? task.id;
      if (!key) return task;
      const override = optimisticTaskOverrides[key];
      if (!override) return task;
      return { ...task, ...override };
    });
  }, [optimisticTaskOverrides, tasks]);

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
      return tasksForUi;
    }

    return tasksForUi.filter((task) => {
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
  }, [normalizedSearchTerm, quickTaskById, tasksForUi]);

  const doneCountsByDay = useMemo(() => {
    const map = new Map<string, number>();
    tasksForUi.forEach((task) => {
      if (task.status !== "done" && task.status !== "archived") return;
      const dueDate = task.due ? safeDate(task.due) : null;
      if (!dueDate) return;
      const key = fmtLocal(dueDate);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [tasksForUi]);

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

  // Note: handleOpenQuickIntentModal removed per product decision.
  // Spellbook/Conjure should only create Focus Blocks.
  // "intent" tasks broke trust (grey, uneditable tiles on calendar).

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
        const window = getFocusBlockWindow(request.focusBlockWindowId);
        const startAt = buildIsoDateTime(targetDate, window.startLocalTime);
        const endAt = buildIsoDateTime(targetDate, window.endLocalTime);
        const durationMinutes = blockMinutesFromWindow(window.startLocalTime, window.endLocalTime);

        const focusTitle = "Focus Block";
        const focusTask = await createTask({
          projectId: activeProjectId,
          title: focusTitle,
          status: "todo",
          kind: "focus_block",
          cluster: "Plan",
          durationMinutes,
          startAt,
          endAt,
          dueDate: targetDate,
          dueAt: targetDate,
          focusChildTaskIds: [],
          focusChecklist: [],
        });

        if (!focusTask.taskId) {
          notify("error", "Unable to create focus block.");
          return;
        }

        const focusId = focusTask.taskId;

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

          const packable = eligible
            .map((task) => ({ task, taskId: resolveTaskIdentifier(task) }))
            .filter((rec): rec is { task: CalendarTask; taskId: string } => typeof rec.taskId === "string" && rec.taskId.trim().length > 0)
            .map((rec) => ({ draftId: rec.taskId, title: rec.task.title }));

          const packed = packTasksIntoFocusBlock(durationMinutes, packable, { minTaskMinutes: 20, maxTaskMinutes: 120 });
          const updates: Array<{ taskId: string; fields: Partial<Task> }> = packed.tasks.map((pt) => ({
            taskId: pt.draftId,
            fields: {
              focusBlockId: focusId,
              startAt: null,
              endAt: null,
              dueDate: targetDate,
              dueAt: targetDate,
              plannedMinutes: pt.plannedMinutes,
              order: pt.order,
            },
          }));

          if (updates.length > 0) {
            await updateTasksBulk(activeProjectId, updates);
          }

          const childIds = packed.tasks.map((pt) => pt.draftId);
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
          const byDraftId = new Map<string, (typeof baseItems)[number]>();
          baseItems.forEach((item, idx) => {
            byDraftId.set(`item-${idx}`, item);
          });

          const packed = packTasksIntoFocusBlock(
            durationMinutes,
            baseItems.map((item, idx) => ({ draftId: `item-${idx}`, title: item.title })),
            { minTaskMinutes: 20, maxTaskMinutes: 120 },
          );

          const childPayloads: Task[] = packed.tasks.map((pt) => {
            const parts = pt.draftId.split("__");
            const first = byDraftId.get(parts[0]);
            return {
              projectId: activeProjectId,
              title: pt.title,
              status: "todo",
              dueDate: targetDate,
              dueAt: targetDate,
              kind: "task", // Always create as regular task, never as "intent"
              cluster: first?.cluster,
              tags: first?.tags,
              focusBlockId: focusId,
              plannedMinutes: pt.plannedMinutes,
              order: pt.order,
            };
          });

          const createdChildrenRaw = childPayloads.length > 0 ? await createTasksBulk(activeProjectId, childPayloads) : [];
          const createdChildren = [...createdChildrenRaw].sort(
            (a, b) => (Number((a as any)?.order ?? 0) - Number((b as any)?.order ?? 0)) || String(a.title ?? "").localeCompare(String(b.title ?? "")),
          );

          const childIds = createdChildren
            .map((task) => task.taskId)
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

          await updateTask({
            projectId: activeProjectId,
            taskId: focusId,
            title: focusTitle,
            focusChildTaskIds: childIds,
            focusChecklist: createdChildren
              .filter((child) => typeof child.taskId === "string" && child.taskId.trim().length > 0)
              .map((child) => ({ taskId: child.taskId as string, title: child.title })),
          });
        }

        await onRefreshTasks();
        notify("success", "Spellbook applied (Focus Block created).");
      } catch (error) {
        console.error("Failed to apply spellbook", error);
        notify("error", "Unable to apply spellbook. Please try again.");
      }
    },
    [activeProjectId, onRefreshTasks, tasks],
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
        // Store previous values for undo
        const undoUpdates: Array<{ projectId: string; taskId: string; fields: Partial<Task> }> = [];
        // Track focus block creation requests for same-user overlap
        const focusBlockCreations: Array<{
          projectId: string;
          date: string;
          start: string;
          end: string;
          assigneeId: string | undefined;
          childTaskIds: string[];
          childTitles: Array<{ taskId: string; title: string }>;
        }> = [];

        // Helper to check if a task overlaps with any existing task by the same user
        const findSameUserOverlap = (
          movedTask: CalendarTask,
          targetDate: string,
          targetStart: string,
          targetEnd: string,
        ) => {
          const movedTaskSource = movedTask.source as ApiTask;
          const movedAssignee = movedTaskSource?.assigneeId;
          const movedTaskId = resolveTaskIdentifier(movedTask);

          // Convert times to minutes for comparison
          const startMinutes = parseTimeToMinutes(targetStart);
          const endMinutes = parseTimeToMinutes(targetEnd);
          if (startMinutes == null || endMinutes == null) return null;

          // Find overlapping tasks on the same day with the same assignee
          const overlapping = tasks.filter((t) => {
            // Skip self
            const tid = resolveTaskIdentifier(t);
            if (tid === movedTaskId) return false;
            // Skip Focus Blocks themselves
            if (isFocusBlockLike(t)) return false;
            // Skip tasks already in a Focus Block
            if (t.focusBlockId) return false;

            const tSource = t.source as ApiTask;
            const tAssignee = tSource?.assigneeId;
            // Same assignee check
            if (tAssignee !== movedAssignee) return false;

            // Same day check - use source dueDate or fallback to due
            const tDate = tSource?.dueDate?.split("T")[0] ?? t.due;
            if (tDate !== targetDate) return false;

            // Time overlap check
            const tStart = parseTimeToMinutes(t.start);
            const tEnd = parseTimeToMinutes(t.end);
            if (tStart == null || tEnd == null) return false;

            // Check overlap: ranges overlap if start < otherEnd && end > otherStart
            return startMinutes < tEnd && endMinutes > tStart;
          });

          return overlapping.length > 0 ? overlapping : null;
        };

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
            title: newFocus.title,
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

          // Check for same-user overlap → Focus Block creation
          // Skip this check for tasks that are already in a focus block or are focus blocks
          const taskSource = task.source as ApiTask;
          if (!isFocusBlockLike(task) && !task.focusBlockId) {
            const overlapping = findSameUserOverlap(task, dueDate, change.start, change.end);
            if (overlapping && overlapping.length > 0) {
              // Found same-user overlap! Create a Focus Block instead of just moving.
              const allTasks = [task, ...overlapping];
              const allTaskIds = allTasks
                .map((t) => resolveTaskIdentifier(t))
                .filter((id): id is string => Boolean(id));

              // Compute combined time range (min start, max end)
              const allStarts = allTasks.map((t) => parseTimeToMinutes(t.start) ?? 0);
              const allEnds = allTasks.map((t) => parseTimeToMinutes(t.end) ?? 0);
              const combinedStart = Math.min(parseTimeToMinutes(change.start) ?? 0, ...allStarts);
              const combinedEnd = Math.max(parseTimeToMinutes(change.end) ?? 0, ...allEnds);

              focusBlockCreations.push({
                projectId,
                date: dueDate,
                start: formatMinutesHHMM(combinedStart),
                end: formatMinutesHHMM(combinedEnd),
                assigneeId: taskSource?.assigneeId,
                childTaskIds: allTaskIds,
                childTitles: allTasks.map((t) => ({
                  taskId: resolveTaskIdentifier(t) ?? t.id,
                  title: t.title ?? "Untitled",
                })),
              });
              return; // Skip normal update for this task
            }
          }

          // Store original values for undo
          const taskSourceForUndo = task.source as ApiTask;
          undoUpdates.push({
            projectId,
            taskId,
            fields: {
              dueDate: taskSourceForUndo.dueDate,
              dueAt: taskSourceForUndo.dueAt,
              startAt: taskSourceForUndo.startAt,
              endAt: taskSourceForUndo.endAt,
              focusBlockId: taskSourceForUndo.focusBlockId,
            },
          });

          const fields: Partial<Task> = {
            title: task.title,
            dueDate: dueAt,
            dueAt,
            startAt,
            endAt,
          };

          if (Object.prototype.hasOwnProperty.call(change, "focusBlockId")) {
            fields.focusBlockId = change.focusBlockId ?? null;
          }
          updatesByProject.set(projectId, [
            ...(updatesByProject.get(projectId) ?? []),
            { taskId, fields },
          ]);
        });

        // Register undo action for task moves (non-duplicate only)
        if (undoUpdates.length > 0) {
          pushUndo({
            type: "reschedule",
            label: `Move ${undoUpdates.length} task(s)`,
            undo: async () => {
              // Group by project
              const byProject = new Map<string, Array<{ taskId: string; fields: Partial<Task> }>>();
              undoUpdates.forEach(({ projectId, taskId, fields }) => {
                byProject.set(projectId, [
                  ...(byProject.get(projectId) ?? []),
                  { taskId, fields },
                ]);
              });
              await Promise.all(
                Array.from(byProject.entries()).map(([pid, updates]) =>
                  updateTasksBulk(pid, updates),
                ),
              );
            },
          });
        }

        createsByProject.forEach((payloads, projectId) => {
          operations.push(createTasksBulk(projectId, payloads));
        });
        updatesByProject.forEach((updates, projectId) => {
          operations.push(updateTasksBulk(projectId, updates));
        });

        // Create Focus Blocks for same-user overlaps
        for (const fb of focusBlockCreations) {
          const createFocusBlock = async () => {
            const startAt = buildIsoDateTime(fb.date, fb.start);
            const endAt = buildIsoDateTime(fb.date, fb.end);
            const dueAt = endAt ?? fb.date;
            const startMinutes = parseTimeToMinutes(fb.start) ?? 0;
            const endMinutes = parseTimeToMinutes(fb.end) ?? 0;

            // Create the Focus Block wrapper
            const newFocus = await createTask({
              projectId: fb.projectId,
              title: "Focus Block",
              kind: "focus_block",
              durationMinutes: Math.max(15, endMinutes - startMinutes),
              startAt,
              endAt,
              dueDate: dueAt,
              dueAt,
              assigneeId: fb.assigneeId,
              focusChildTaskIds: fb.childTaskIds,
              focusChecklist: fb.childTitles,
            });

            if (newFocus.taskId) {
              // Update children to link to the focus block
              const childUpdates = fb.childTaskIds.map((childId) => ({
                taskId: childId,
                fields: {
                  focusBlockId: newFocus.taskId,
                },
              }));
              await updateTasksBulk(fb.projectId, childUpdates);
            }

            notify("success", `Created Focus Block with ${fb.childTaskIds.length} tasks`);
          };
          operations.push(createFocusBlock());
        }
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
    [activeProjectId, onCreateEvent, onRefreshTasks, onUpdateEvent, pushUndo, tasks],
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
      const eligible = (Array.isArray(tasks) ? tasks : []).filter(
        (task) => task.status !== "done" && task.status !== "archived",
      );
      if (eligible.length === 0) return;

      // Optimistically update UI
      const keys = eligible
        .map((task) => resolveTaskIdentifier(task) ?? task.id)
        .filter((value): value is string => Boolean(value));
      setOptimisticTaskOverrides((prev) => {
        const next = { ...prev };
        keys.forEach((key) => {
          next[key] = { ...(next[key] ?? {}), status: "done", done: true };
        });
        return next;
      });

      const { ok, failed } = await runWithConcurrency(eligible, 5, async (task) => {
        const source = task.source as ApiTask;
        if (!source.projectId || !source.taskId) return;
        await reviewTransitionTask(source.projectId, source.taskId, { action: "mark_done" });
      });

      if (failed.length > 0) {
        console.error("Failed to mark some tasks as done", failed);
        notify(
          "error",
          failed.length === 1
            ? `Failed to mark "${(failed[0].item as CalendarTask).title}" as done`
            : `Failed to mark ${failed.length} tasks as done`,
        );
      }

      if (ok.length > 0) {
        notify(
          "success",
          ok.length > 1 ? `Marked ${ok.length} items as done` : "Marked 1 item as done",
        );
      }

      await onRefreshTasks();

      // Clear optimistic overrides once the authoritative refresh completes.
      setOptimisticTaskOverrides((prev) => {
        if (!prev || Object.keys(prev).length === 0) return prev;
        const next = { ...prev };
        keys.forEach((key) => {
          delete next[key];
        });
        return next;
      });
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
          const { projectId } = source;
          const isFocusBlock = isFocusBlockSource(source);

          if (isFocusBlock) {
            const childSources = collectCascadeDeleteSourcesForFocusBlock(source, tasks);
            const deletedFocus = { ...source };
            const deletedChildren = childSources.map((t) => ({ ...t }));

            // Delete children first, then the wrapper.
            for (const child of deletedChildren) {
              if (!child.taskId) continue;
              await deleteTask({ projectId, taskId: child.taskId });
            }
            await deleteTask({ projectId, taskId: source.taskId });

            pushUndo({
              type: "delete",
              label: `Delete "${task.title || "Untitled"}"`,
              undo: async () => {
                // Preserve taskIds so the restored focus block still points at its children.
                for (const childData of deletedChildren) {
                  await createTask({ ...(childData as Task), projectId } as Task);
                }
                await createTask({ ...(deletedFocus as Task), projectId } as Task);
              },
            });

            notify("success", "Task deleted (Ctrl+Z to undo)");
            await onRefreshTasks();
            return;
          }

          // Non-focus task delete (existing behavior).
          const deletedTaskData = { ...source };

          await deleteTask({ projectId: source.projectId, taskId: source.taskId });

          pushUndo({
            type: "delete",
            label: `Delete "${task.title || "Untitled"}"`,
            undo: async () => {
              // Remove taskId so the backend generates a new one
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { taskId: _oldTaskId, ...taskPayload } = deletedTaskData;
              await createTask({ ...taskPayload, projectId } as Task);
            },
          });

          notify("success", "Task deleted (Ctrl+Z to undo)");
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
    [
      onRefreshTasks,
      onDeleteEvent,
      pushUndo,
      collectCascadeDeleteSourcesForFocusBlock,
      isFocusBlockSource,
      tasks,
    ],
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

      // Store task data for undo before deleting (deduped)
      const deletedTasksByKey = new Map<string, ApiTask>();
      const focusBlockKeys = new Set<string>();

      // Build the full delete set (including focus block children)
      for (const { entry } of taskEntries) {
        const task = entry as CalendarTask;
        const source = task.source as ApiTask;
        if (!source.projectId || !source.taskId) continue;

        const key = `${source.projectId}::${source.taskId}`;
        deletedTasksByKey.set(key, { ...source });

        if (isFocusBlockSource(source)) {
          focusBlockKeys.add(key);
          const children = collectCascadeDeleteSourcesForFocusBlock(source, tasks);
          children.forEach((child) => {
            if (!child.projectId || !child.taskId) return;
            const childKey = `${child.projectId}::${child.taskId}`;
            deletedTasksByKey.set(childKey, { ...child });
          });
        }
      }

      const deletedTasks = Array.from(deletedTasksByKey.values());
      const hasAnyFocusBlock = deletedTasks.some((t) => isFocusBlockSource(t));

      // Delete tasks (children first, then focus blocks)
      const deleteOrder = [...deletedTasks].sort((a, b) => {
        const aIsFocus = isFocusBlockSource(a);
        const bIsFocus = isFocusBlockSource(b);
        if (aIsFocus === bIsFocus) return 0;
        return aIsFocus ? 1 : -1;
      });

      for (const source of deleteOrder) {
        if (!source.projectId || !source.taskId) continue;
        try {
          await deleteTask({ projectId: source.projectId, taskId: source.taskId });
        } catch (error) {
          console.error("Failed to delete task:", error);
          notify("error", `Failed to delete "${source.title ?? "Untitled"}"`);
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

      // Register undo action for deleted tasks
      if (deletedTasks.length > 0) {
        pushUndo({
          type: "delete",
          label: `Delete ${deletedTasks.length} task(s)`,
          undo: async () => {
            // If any focus block was deleted, preserve taskIds so focus-child links remain valid.
            // Otherwise, keep prior behavior (new ids) for safety.
            if (hasAnyFocusBlock) {
              const restoreOrder = [...deletedTasks].sort((a, b) => {
                const aIsFocus = isFocusBlockSource(a);
                const bIsFocus = isFocusBlockSource(b);
                if (aIsFocus === bIsFocus) return 0;
                return aIsFocus ? 1 : -1;
              });
              for (const taskData of restoreOrder) {
                const projectId = taskData.projectId;
                if (!projectId) continue;
                await createTask({ ...(taskData as Task), projectId } as Task);
              }
              return;
            }

            for (const taskData of deletedTasks) {
              // Remove taskId so the backend generates a new one
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { taskId: _oldTaskId, projectId, ...taskPayload } = taskData;
              await createTask({ ...taskPayload, projectId } as Task);
            }
          },
        });
      }

      const total = entries.length;
      if (total > 0) {
        const undoHint = deletedTasks.length > 0 ? " (Ctrl+Z to undo)" : "";
        notify("success", (total > 1 ? `${total} items deleted` : "Item deleted") + undoHint);
        if (taskEntries.length > 0) await onRefreshTasks();
      }
      setSelectedEntries(new Set());
    },
    [onRefreshTasks, onDeleteEvent, pushUndo, collectCascadeDeleteSourcesForFocusBlock, isFocusBlockSource, tasks],
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

  const buildAssigneeToken = useCallback(
    (userId: string | null): string | null => {
      // IMPORTANT: `null` is the explicit "clear" value for assigneeId.
      // Using `undefined` would omit the field in JSON and may not persist an unassign.
      if (!userId) return null;
      const member = teamMembers?.find((m) => m.userId === userId);
      const compactName = `${member?.firstName ?? ""}${member?.lastName ?? ""}`.replace(/\s+/g, "");
      const safeName = (compactName || userId).replace(/\s+/g, "");
      return `${safeName}__${userId}`;
    },
    [teamMembers],
  );

  // Bulk assign all children of a Focus Block to a user
  const handleBulkAssignChildren = useCallback(
    async (focusBlock: CalendarTask, userId: string | null, children: CalendarTask[]) => {
      if (!activeProjectId) {
        notify("error", "No active project selected");
        return;
      }
      if (children.length === 0) {
        notify("info", "No children to assign");
        return;
      }

      const assigneeToken = buildAssigneeToken(userId);

      // Store previous assignees for undo
      const previousAssignees = children.map((child) => ({
        taskId: child.source?.taskId ?? child.id,
        assigneeId: (child.source as ApiTask)?.assigneeId,
      }));

      // Build updates for all children
      const updates = children.map((child) => ({
        taskId: child.source?.taskId ?? child.id,
        fields: {
          assigneeId: assigneeToken,
        },
      }));

      try {
        await updateTasksBulk(activeProjectId, updates);

        // Find user name for toast
        let userName = "Unassigned";
        if (userId) {
          const member = teamMembers?.find((m) => m.userId === userId);
          if (member) {
            userName = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || member.userId;
          }
        }

        // Register undo action
        const projectId = activeProjectId;
        pushUndo({
          type: "bulk-assign",
          label: `Assign ${children.length} item(s) to ${userName}`,
          undo: async () => {
            const undoUpdates = previousAssignees.map(({ taskId, assigneeId }) => ({
              taskId,
              fields: { assigneeId },
            }));
            await updateTasksBulk(projectId, undoUpdates);
          },
        });

        notify(
          "success",
          userId
            ? `Assigned ${children.length} item(s) to ${userName}`
            : `Unassigned ${children.length} item(s)`,
        );

        await onRefreshTasks();
      } catch (error) {
        console.error("Bulk assign failed:", error);
        notify("error", "Failed to assign items");
      }
    },
    [activeProjectId, buildAssigneeToken, onRefreshTasks, pushUndo, teamMembers],
  );

  // Assign a single time block to a user
  const handleAssignTimeBlock = useCallback(
    async (task: CalendarTask, userId: string | null) => {
      if (!activeProjectId) {
        notify("error", "No active project selected");
        return;
      }

      const source = task.source as ApiTask | undefined;
      const taskId = source?.taskId ?? task.id;
      if (!taskId) {
        notify("error", "Missing task id");
        return;
      }

      const assigneeToken = buildAssigneeToken(userId);
      const previousAssigneeId = source?.assigneeId;

      try {
        await updateTasksBulk(activeProjectId, [
          {
            taskId,
            fields: {
              assigneeId: assigneeToken,
            },
          },
        ]);

        let userName = "Unassigned";
        if (userId) {
          const member = teamMembers?.find((m) => m.userId === userId);
          if (member) {
            userName = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || member.userId;
          } else {
            userName = userId;
          }
        }

        const projectId = activeProjectId;
        pushUndo({
          type: "assign",
          label: userId ? `Assign to ${userName}` : "Unassign",
          undo: async () => {
            await updateTasksBulk(projectId, [
              {
                taskId,
                fields: {
                  assigneeId: previousAssigneeId,
                },
              },
            ]);
          },
        });

        notify("success", userId ? `Assigned to ${userName}` : "Unassigned");
        await onRefreshTasks();
      } catch (error) {
        console.error("Assign time block failed:", error);
        notify("error", "Failed to assign time block");
      }
    },
    [activeProjectId, buildAssigneeToken, onRefreshTasks, pushUndo, teamMembers],
  );

  // Assign selected time blocks (multi-select) to a user
  const handleAssignTimeBlocks = useCallback(
    async (tasksToAssign: CalendarTask[], userId: string | null) => {
      if (!activeProjectId) {
        notify("error", "No active project selected");
        return;
      }

      const tasksList = Array.isArray(tasksToAssign) ? tasksToAssign : [];
      if (tasksList.length === 0) {
        notify("info", "No time blocks selected");
        return;
      }

      const assigneeToken = buildAssigneeToken(userId);

      const previousAssignees: Array<{ taskId: string; assigneeId: string | undefined }> = [];
      const updates: Array<{ taskId: string; fields: { assigneeId: string | undefined } }> = [];

      tasksList.forEach((task) => {
        const source = task.source as ApiTask | undefined;
        const taskId = source?.taskId ?? task.id;
        if (!taskId) return;
        previousAssignees.push({ taskId, assigneeId: source?.assigneeId });
        updates.push({
          taskId,
          fields: {
            assigneeId: assigneeToken,
          },
        });
      });

      if (updates.length === 0) {
        notify("error", "Missing task ids");
        return;
      }

      try {
        await updateTasksBulk(activeProjectId, updates);

        let userName = "Unassigned";
        if (userId) {
          const member = teamMembers?.find((m) => m.userId === userId);
          if (member) {
            userName = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || member.userId;
          } else {
            userName = userId;
          }
        }

        const projectId = activeProjectId;
        pushUndo({
          type: "bulk-assign",
          label: userId ? `Assign ${updates.length} time block(s) to ${userName}` : `Unassign ${updates.length} time block(s)`,
          undo: async () => {
            const undoUpdates = previousAssignees.map(({ taskId, assigneeId }) => ({
              taskId,
              fields: { assigneeId },
            }));
            await updateTasksBulk(projectId, undoUpdates);
          },
        });

        notify(
          "success",
          userId
            ? `Assigned ${updates.length} time block(s) to ${userName}`
            : `Unassigned ${updates.length} time block(s)`,
        );

        await onRefreshTasks();
      } catch (error) {
        console.error("Assign time blocks failed:", error);
        notify("error", "Failed to assign time blocks");
      }
    },
    [activeProjectId, buildAssigneeToken, onRefreshTasks, pushUndo, teamMembers],
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
                      onBulkAssignChildren={handleBulkAssignChildren}
                      onAssignTimeBlock={handleAssignTimeBlock}
                      onAssignTimeBlocks={handleAssignTimeBlocks}
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
                      onAssignTimeBlock={handleAssignTimeBlock}
                      onAssignTimeBlocks={handleAssignTimeBlocks}
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
        teamMembers={teamMembers}
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
