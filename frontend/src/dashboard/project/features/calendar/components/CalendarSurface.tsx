import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, ChevronLeft, ChevronRight, Menu, Search, Sparkles } from "lucide-react";
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
  updateTask,
  deleteTask,
  reviewTransitionTask,
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
import { buildDoablePlans, formatMinutesHHMM } from "../lib/doablePlanner";
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

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

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
  }, [visibleEvents, visibleTasks, activeProjectColor]);

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

  const handleApplySpellbook = useCallback(
    async (request: TaskSpellbookApplyRequest) => {
      if (!activeProjectId) {
        notify("error", "Select a project to create tasks.");
        return;
      }

      const targetDate = request.targetDate;
      const createdChildTasks: Array<{ itemIndex: number; task: Task }> = [];

      const createChildOps = request.variant.items.map(async (item, itemIndex) => {
        if (item.kind === "intent") {
          const payload: Task = {
            projectId: activeProjectId,
            title: item.title,
            status: "todo",
            dueDate: targetDate,
            dueAt: targetDate,
            kind: "intent",
            cluster: item.cluster,
            tags: item.tags,
            durationMinutes: item.durationMinutes,
          };
          await createTask(payload);
          return;
        }

        const payload: Task = {
          projectId: activeProjectId,
          title: item.title,
          status: "todo",
          dueDate: targetDate,
          dueAt: targetDate,
          kind: "task",
          cluster: item.cluster,
          tags: item.tags,
          durationMinutes: item.durationMinutes,
        };

        const created = await createTask(payload);
        createdChildTasks.push({ itemIndex, task: created });
      });

      try {
        await Promise.all(createChildOps);

        const childByIndex = new Map(createdChildTasks.map((entry) => [entry.itemIndex, entry.task]));

        if (request.variant.focusBlocks.length > 0 && request.plan) {
          const focusBlockOps = request.plan.placements.map(async (placement) => {
            const match = placement.draftId.match(/^block-(\d+)$/);
            if (!match) return;
            const blockIndex = Number(match[1]);
            const block = request.variant.focusBlocks[blockIndex];
            if (!block) return;

            const startTime = formatMinutesHHMM(placement.startMinutes);
            const endTime = formatMinutesHHMM(placement.endMinutes);
            const startAt = buildIsoDateTime(targetDate, startTime);
            const endAt = buildIsoDateTime(targetDate, endTime);

            const childTasks = block.itemIndexes
              .map((idx) => childByIndex.get(idx))
              .filter((value): value is Task => Boolean(value));

            const payload: Task = {
              projectId: activeProjectId,
              title: block.title,
              status: "todo",
              dueDate: endAt ?? targetDate,
              dueAt: endAt ?? targetDate,
              startAt,
              endAt,
              kind: "focus_block",
              cluster: block.cluster,
              durationMinutes: block.durationMinutes,
              focusChildTaskIds: childTasks.map((task) => task.taskId!).filter(Boolean),
              focusChecklist: childTasks.map((task) => ({ taskId: task.taskId!, title: task.title })),
            };

            const createdFocus = await createTask(payload);

            const focusTaskId = createdFocus.taskId;
            if (!focusTaskId) return;

            const linkOps = childTasks.map((task) => {
              if (!task.taskId) return Promise.resolve(null);
              return updateTask({
                projectId: activeProjectId,
                taskId: task.taskId,
                focusBlockId: focusTaskId,
                startAt: null,
                endAt: null,
                dueDate: targetDate,
                dueAt: targetDate,
              });
            });

            await Promise.all(linkOps);
          });

          await Promise.all(focusBlockOps);
        } else if (request.plan) {
          const placementOps = request.plan.placements.map(async (placement) => {
            const match = placement.draftId.match(/^item-(\d+)$/);
            if (!match) return;
            const itemIndex = Number(match[1]);
            const created = childByIndex.get(itemIndex);
            if (!created?.taskId) return;

            const startTime = formatMinutesHHMM(placement.startMinutes);
            const endTime = formatMinutesHHMM(placement.endMinutes);
            const startAt = buildIsoDateTime(targetDate, startTime);
            const endAt = buildIsoDateTime(targetDate, endTime);

            await updateTask({
              projectId: activeProjectId,
              taskId: created.taskId,
              startAt,
              endAt,
              dueDate: endAt ?? targetDate,
              dueAt: endAt ?? targetDate,
            });
          });

          await Promise.all(placementOps);
        }

        await onRefreshTasks();
        notify("success", "Spellbook applied.");
      } catch (error) {
        console.error("Failed to apply spellbook", error);
        notify("error", "Unable to apply spellbook. Please try again.");
      }
    },
    [activeProjectId, onRefreshTasks],
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

      const clusterCounts = new Map<string, number>();
      eligible.forEach((task) => {
        const label = task.cluster?.trim() || "";
        if (!label) return;
        clusterCounts.set(label, (clusterCounts.get(label) ?? 0) + 1);
      });
      const bestCluster = [...clusterCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      const title = bestCluster ? `${bestCluster}: focus block` : "Focus block";

      const durationMinutes = Math.max(
        30,
        Math.min(
          240,
          eligible.reduce((sum, task) => {
            if (typeof task.durationMinutes === "number" && Number.isFinite(task.durationMinutes)) {
              return sum + task.durationMinutes;
            }
            const startMinutes = task.start ? parseTimeToMinutes(task.start) : null;
            const endMinutes = task.end ? parseTimeToMinutes(task.end) : null;
            if (startMinutes != null && endMinutes != null && endMinutes > startMinutes) {
              return sum + (endMinutes - startMinutes);
            }
            return sum + POINTER_TASK_DEFAULT_DURATION_MINUTES;
          }, 0),
        ),
      );

      const selectedIds = new Set(eligible.map((task) => task.id));
      const busy = [
        ...events
          .filter((event) => event.date === dateIso && Boolean(event.start) && Boolean(event.end) && !event.allDay)
          .map((event) => {
            const start = event.start ? parseTimeToMinutes(event.start) : null;
            const end = event.end ? parseTimeToMinutes(event.end) : null;
            if (start == null || end == null || end <= start) return null;
            return { startMinutes: start, endMinutes: end };
          })
          .filter((block): block is { startMinutes: number; endMinutes: number } => block !== null),
        ...tasks
          .filter((task) => task.due === dateIso && Boolean(task.start) && Boolean(task.end))
          .filter((task) => !selectedIds.has(task.id))
          .map((task) => {
            const start = task.start ? parseTimeToMinutes(task.start) : null;
            const end = task.end ? parseTimeToMinutes(task.end) : null;
            if (start == null || end == null || end <= start) return null;
            return { startMinutes: start, endMinutes: end };
          })
          .filter((block): block is { startMinutes: number; endMinutes: number } => block !== null),
      ];

      const plan = buildDoablePlans({
        drafts: [{ id: "focus", title, durationMinutes }],
        busy,
      })[0];
      const placement = plan?.placements?.[0] ?? null;

      const startMinutes = placement?.startMinutes ?? 9 * 60;
      const endMinutes = placement?.endMinutes ?? Math.min(17 * 60, startMinutes + durationMinutes);
      const startAt = buildIsoDateTime(dateIso, formatMinutesHHMM(startMinutes));
      const endAt = buildIsoDateTime(dateIso, formatMinutesHHMM(endMinutes));

      const childTaskIds = eligible
        .map((task) => resolveTaskIdentifier(task))
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

        await Promise.all(
          eligible.map((task) => {
            const taskId = resolveTaskIdentifier(task);
            if (!taskId) return Promise.resolve(null);
            return updateTask({
              projectId: activeProjectId,
              taskId,
              focusBlockId: focusTask.taskId!,
              startAt: null,
              endAt: null,
              dueDate: dateIso,
              dueAt: dateIso,
            });
          }),
        );

        await onRefreshTasks();
        notify("success", "Converted to focus block.");
      } catch (error) {
        console.error("Failed to convert to focus block", error);
        notify("error", "Unable to convert to focus block. Please try again.");
      }
    },
    [activeProjectId, events, internalDate, onRefreshTasks, tasks],
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
        taskChanges.forEach((change) => {
          const task = change.entry as CalendarTask;
          const source = task.source as ApiTask;
          const projectId = source.projectId ?? activeProjectId ?? undefined;
          const taskId = resolveTaskIdentifier(task);

          if (!projectId) return;

          const dueDate = change.date;
          const startIso = buildIsoDateTime(dueDate, change.start);
          const endIso = buildIsoDateTime(dueDate, change.end);

          if (change.duplicate) {
            const payload: Task = {
              projectId,
              title: task.title ?? "Untitled task",
              description: task.description ?? undefined,
              dueDate: endIso ?? dueDate,
              startAt: startIso,
              endAt: endIso,
              assigneeId: source.assigneeId,
              assigneeIds: source.assigneeIds,
              address: source.address,
              location: source.location,
            };
            operations.push(createTask(payload));
          } else if (taskId) {
            const payload: Task = {
              projectId,
              taskId,
              title: task.title,
              dueDate: endIso ?? dueDate,
              ...(startIso !== null ? { startAt: startIso } : {}),
              ...(endIso !== null ? { endAt: endIso } : {}),
            };
            operations.push(updateTask(payload));
          }
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
    [activeProjectId, onCreateEvent, onRefreshTasks, onUpdateEvent],
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
                    tasks={visibleTasks}
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
                      tasks={visibleTasks}
                      onEditEvent={handleOpenEditEvent}
                      onEditTask={handleOpenEditTask}
                      onCreateEvent={handleOpenCreate}
                      onCreateTask={handleOpenQuickTaskModal}
                      onCreateIntent={handleOpenQuickIntentModal}
                      canCreateTasks={canCreateTasks}
                      teamMembers={teamMembers}
                      activeProjectId={activeProjectId}
                      activeProjectColor={activeProjectColor}
                      selectedEntryKeys={selectedEntries}
                      onEntrySelect={handleEntrySelect}
                      onClearSelection={handleClearSelection}
                      onRescheduleEntries={handleRescheduleEntries}
                      onSubmitForReview={handleSubmitForReview}
                      onMarkAsDone={handleMarkAsDone}
                      onConvertToFocusBlock={handleConvertToFocusBlock}
                      onDuplicateEntries={handleDuplicateEntries}
                      onDeleteEntries={handleDeleteEntries}
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
                      onCreateIntent={handleOpenQuickIntentModal}
                      canCreateTasks={canCreateTasks}
                      teamMembers={teamMembers}
                      activeProjectId={activeProjectId}
                      activeProjectColor={activeProjectColor}
                      selectedEntryKeys={selectedEntries}
                      onEntrySelect={handleEntrySelect}
                      onClearSelection={handleClearSelection}
                      onRescheduleEntries={handleRescheduleEntries}
                      onSubmitForReview={handleSubmitForReview}
                      onMarkAsDone={handleMarkAsDone}
                      onConvertToFocusBlock={handleConvertToFocusBlock}
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
        onClose={handleCloseSpellbook}
        onApply={handleApplySpellbook}
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
