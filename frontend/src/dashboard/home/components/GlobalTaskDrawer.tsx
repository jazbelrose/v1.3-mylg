import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, ChevronLeft, MapPin, Plus, Search, Trash } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import MapComponent from "@/shared/ui/Map";
import { useTasksOverview, type TasksOverviewListItem } from "../hooks/useTasksOverview";
import QuickCreateTaskModal, {
  type QuickCreateTaskModalEvent,
  type QuickCreateTaskModalTask,
  type TaskNoteAttachment,
} from "./QuickCreateTaskModal";
import SvgThumbnail from "./SvgThumbnail";
import { getSquirclePath } from "@/shared/ui/squircle/getSquirclePath";
import TaskSummary from "@/dashboard/project/components/Tasks/components/TaskSummary";
import { type FilterOption } from "./TaskMobileFilter";
import { useDropdown, type DropdownOption } from "./hooks/useDropdown";
import { useUser } from "@/app/contexts/useUser";
import {
  createTaskStatusContext,
  getTaskStatusBadge,
  getTaskStatusTone,
} from "@/dashboard/project/components/Tasks/components/quickTaskUtils";
import { buildDirectionsLinks } from "@/dashboard/project/components/Tasks/utils";
import { formatTaskName } from "@/shared/utils/taskNameFormatting";
import desktopFilterStyles from "@/dashboard/home/components/ProjectsPanelDesktop.module.css";
import { notify } from "@/shared/ui/ToastNotifications";
import {
  requestTaskReview,
  approveTask,
  requestTaskChanges,
  archiveTask,
  unarchiveTask,
  deleteTask,
  getFileUrl,
} from "@/shared/utils/api";

import styles from "@/dashboard/project/components/Tasks/TasksComponentMobile.module.css";

type TaskMapMarker = {
  id: string;
  lat: number;
  lng: number;
  iconUrl: string;
  title: string;
  isActive: boolean;
};

type AssignedPersonOption = {
  id: string;
  name: string;
};

type StatusFilterOption = "active" | "all" | "archived";

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilterOption; label: string }> = [
  { value: "active", label: "Active" },
  { value: "all", label: "All" },
  { value: "archived", label: "Archived" },
];

type GlobalTaskDrawerProps = {
  open: boolean;
  onClose: () => void;
  initialProjectFilter?: string;
  fullPage?: boolean;
  backLabel?: string;
  calendarAction?: { label: string; onClick: () => void };
  openInCreateMode?: boolean;
  initialTaskDraft?: Partial<QuickCreateTaskModalTask>;
};

const DRAWER_SNAP_POINTS = [0.1, 0.45, 0.9] as const;
type SnapIndex = 0 | 1 | 2;
const DEFAULT_LOCATION = { lat: 37.7749, lng: -122.4194 };

function getViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}

function buildMarkerThumbnail(color: string): string {
  const fill = color || "#fa3356";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 2C11.163 2 4 9.163 4 18c0 11.046 16 30 16 30s16-18.954 16-30C36 9.163 28.837 2 20 2z" fill="${fill}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="18" r="7" fill="#ffffff"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function parseTaskLocation(task: TasksOverviewListItem): { lat: number; lng: number } | null {
  const loc = task.location;
  if (!loc) return null;

  if (typeof loc === "object" && loc !== null) {
    const record = loc as Record<string, unknown>;
    const lat = typeof record.lat === "number" ? record.lat : typeof record.latitude === "number" ? record.latitude : null;
    const lng = typeof record.lng === "number" ? record.lng : typeof record.longitude === "number" ? record.longitude : null;
    
    if (lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng };
    }
  }

  return null;
}

function normalizeUserId(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split("__").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : trimmed;
}

const GlobalTaskDrawer: React.FC<GlobalTaskDrawerProps> = ({ open, onClose, initialProjectFilter, fullPage = false, backLabel, calendarAction, openInCreateMode = false, initialTaskDraft }) => {
  const {
    loading,
    error,
    stats,
    openTasks,
    completedTasks,
    archivedTasks,
    refreshTasks,
    updateTaskStatus,
    projectOptions,
  } = useTasksOverview();
  const { user, isAdmin } = useUser();
  const navigate = useNavigate();

  const [isDesktop, setIsDesktop] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(getViewportHeight());
  const [snapIndex, setSnapIndex] = useState<SnapIndex>(2);
  const [isDragging, setIsDragging] = useState(false);
  const [currentDragY, setCurrentDragY] = useState(0);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<QuickCreateTaskModalTask | null>(null);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [detailsTask, setDetailsTask] = useState<QuickCreateTaskModalTask | null>(null);

  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string | null>("dueDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>("asc");
  const [activeFilter, setActiveFilter] = useState<FilterOption>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("active");
  const [assignedByFilter, setAssignedByFilter] = useState<string | null>(null);
  const [assignedToFilter, setAssignedToFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(initialProjectFilter ?? null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());

  const quickFilterOptions: DropdownOption<FilterOption>[] = useMemo(
    () => [
      { value: "all", label: "All" },
      { value: "due", label: "Due" },
      { value: "completed", label: "Completed" },
      { value: "completedToday", label: "Completed Today" },
      { value: "overdue", label: "Overdue" },
      { value: "mine", label: "Mine" },
    ],
    [],
  );

  const quickFilterLabel = useMemo(
    () => quickFilterOptions.find((option) => option.value === activeFilter)?.label ?? "All",
    [activeFilter, quickFilterOptions],
  );

  const quickFilterDropdown = useDropdown<FilterOption>({
    options: quickFilterOptions,
    selectedValue: activeFilter,
    onSelect: (value) => setActiveFilter(value),
    idPrefix: "global-tasks-quick-filter",
  });

  const sortDropdownOptions: DropdownOption<string>[] = useMemo(
    () => [
      { value: "default", label: "Default order" },
      { value: "dueDate-asc", label: "Due Date (Earliest)" },
      { value: "dueDate-desc", label: "Due Date (Latest)" },
      { value: "title-asc", label: "Title (A–Z)" },
      { value: "title-desc", label: "Title (Z–A)" },
    ],
    [],
  );

  const sortSelectedValue =
    sortField && sortOrder ? `${sortField}-${sortOrder}` : "default";

  const sortDropdown = useDropdown<string>({
    options: sortDropdownOptions,
    selectedValue: sortSelectedValue,
    onSelect: (value) => {
      if (value === "default") {
        handleSortChange(null, null);
        return;
      }
      const [field, order] = value.split("-");
      handleSortChange(field, order as "asc" | "desc");
    },
    idPrefix: "global-tasks-sort",
  });

  const sheetRef = useRef<HTMLDivElement>(null);
  const taskListRef = useRef<HTMLUListElement>(null);
  const initialScrollDoneRef = useRef(false);
  const touchStartY = useRef(0);
  const hasFocusedTaskRef = useRef(false);

  // Combine open/completed tasks and archived tasks for filtering
  const activeTaskPool = useMemo(() => [...openTasks, ...completedTasks].filter(task => task.status !== 'archived'), [openTasks, completedTasks]);
  const archivedTaskPool = useMemo(() => [...archivedTasks].filter(task => task.status === 'archived'), [archivedTasks]);
  const allKnownTasks = useMemo(
    () => [...activeTaskPool, ...archivedTaskPool],
    [activeTaskPool, archivedTaskPool],
  );

  const { assignedByOptions, assignedToOptions } = useMemo<{
    assignedByOptions: AssignedPersonOption[];
    assignedToOptions: AssignedPersonOption[];
  }>(() => {
    const assignedByMap = new Map<string, string>();
    const assignedToMap = new Map<string, string>();

    allKnownTasks.forEach((task) => {
      const assignedByValue = task.createdById ?? task.createdByName;
      if (assignedByValue) {
        assignedByMap.set(assignedByValue, task.createdByName ?? assignedByValue);
      }

      if (task.assigneeId) {
        const assignedToLabel = task.assigneeName ?? task.assigneeId;
        assignedToMap.set(task.assigneeId, assignedToLabel);
      }
    });

    const assignedByOptions = Array.from(assignedByMap)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const assignedToOptions = Array.from(assignedToMap)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { assignedByOptions, assignedToOptions };
  }, [allKnownTasks]);

  const assignedByDropdownOptions: DropdownOption<string>[] = useMemo(
    () => [
      { value: "", label: "All creators" },
      ...assignedByOptions.map((option) => ({
        value: option.id,
        label: option.name,
      })),
    ],
    [assignedByOptions],
  );

  const assignedBySelectedValue = assignedByFilter ?? "";

  const assignedByDropdown = useDropdown<string>({
    options: assignedByDropdownOptions,
    selectedValue: assignedBySelectedValue,
    onSelect: (value) => setAssignedByFilter(value || null),
    idPrefix: "global-tasks-assigned-by",
  });

  const assignedToDropdownOptions: DropdownOption<string>[] = useMemo(
    () => [
      { value: "", label: "All assignees" },
      ...assignedToOptions.map((option) => ({
        value: option.id,
        label: option.name,
      })),
    ],
    [assignedToOptions],
  );

  const assignedToSelectedValue = assignedToFilter ?? "";

  const assignedToDropdown = useDropdown<string>({
    options: assignedToDropdownOptions,
    selectedValue: assignedToSelectedValue,
    onSelect: (value) => setAssignedToFilter(value || null),
    idPrefix: "global-tasks-assigned-to",
  });

  const projectFilterDropdownOptions: DropdownOption<string>[] = useMemo(
    () => [
      { value: "", label: "All projects" },
      ...projectOptions.map((option) => ({
        value: option.id,
        label: option.name,
      })),
    ],
    [projectOptions],
  );

  const projectFilterSelectedValue = projectFilter ?? "";

  const projectFilterDropdown = useDropdown<string>({
    options: projectFilterDropdownOptions,
    selectedValue: projectFilterSelectedValue,
    onSelect: (value) => setProjectFilter(value || null),
    idPrefix: "global-tasks-project-filter",
  });

  // Filter/sort handlers
  const handleSortChange = useCallback((field: string | null, order: "asc" | "desc" | null) => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  // Apply filters and sorting
  const filteredTasks = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let filtered: TasksOverviewListItem[] = [];

    if (statusFilter === "archived") {
      filtered = [...archivedTaskPool];
    } else {
      switch (activeFilter) {
        case "due":
          filtered = activeTaskPool.filter((task) => task.dueDate && task.status !== "done");
          break;
        case "completed":
          filtered = activeTaskPool.filter((task) => task.status === "done");
          break;
        case "completedToday": {
          const today = new Date();
          filtered = activeTaskPool.filter(
            (task) => task.status === "done" && task.completedAt && task.completedAt.toDateString() === today.toDateString(),
          );
          break;
        }
        case "overdue":
          filtered = activeTaskPool.filter(
            (task) => task.dueDate && task.dueDate < todayStart && task.status !== "done",
          );
          break;
        case "mine":
          filtered = user?.userId
            ? activeTaskPool.filter(
                (task) => task.assigneeId === user.userId || task.createdById === user.userId,
              )
            : activeTaskPool;
          break;
        case "all":
        default:
          filtered = activeTaskPool;
          break;
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.projectName?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query),
      );
    }

    if (assignedByFilter) {
      filtered = filtered.filter(
        (task) => (task.createdById ?? task.createdByName) === assignedByFilter,
      );
    }
    if (assignedToFilter) {
      filtered = filtered.filter((task) => task.assigneeId === assignedToFilter);
    }
    if (projectFilter) {
      filtered = filtered.filter((task) => task.projectId === projectFilter);
    }

    if (sortField && sortOrder) {
      filtered.sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;

        if (sortField === "dueDate") {
          aVal = a.dueDate?.getTime() ?? Infinity;
          bVal = b.dueDate?.getTime() ?? Infinity;
        } else if (sortField === "title") {
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
        } else {
          return 0;
        }

        if (sortOrder === "asc") {
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        }
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      });
    }

    return filtered;
  }, [
    activeTaskPool,
    archivedTaskPool,
    searchQuery,
    activeFilter,
    sortField,
    sortOrder,
    user?.userId,
    assignedByFilter,
    assignedToFilter,
    statusFilter,
    projectFilter,
  ]);

  const tasksWithLocation = useMemo(() => {
    return filteredTasks
      .map((task) => {
        const location = parseTaskLocation(task);
        return location ? { ...task, parsedLocation: location } : null;
      })
      .filter((task): task is TasksOverviewListItem & { parsedLocation: { lat: number; lng: number } } => task !== null);
  }, [filteredTasks]);

  const mapLocation = tasksWithLocation[0]?.parsedLocation ?? DEFAULT_LOCATION;
  const mapAddress = tasksWithLocation[0]?.address || "Global tasks";

  const mapMarkers = useMemo<TaskMapMarker[]>(() => {
    return tasksWithLocation.map((task) => {
      const formattedTitle = task.title?.trim()
        ? formatTaskName(task.title)
        : "Untitled task";
      return {
        id: task.id,
        lat: task.parsedLocation.lat,
        lng: task.parsedLocation.lng,
        iconUrl: buildMarkerThumbnail(task.projectColor),
        title: formattedTitle,
        isActive: task.id === activeTaskId,
      };
    });
  }, [tasksWithLocation, activeTaskId]);

  useEffect(() => {
    if (!open) return;
    const update = () => setViewportHeight(getViewportHeight());
    update();
    window.addEventListener("resize", update);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    
    initialScrollDoneRef.current = false;

    if (tasksWithLocation.length) {
      setActiveTaskId(tasksWithLocation[0].id);
    } else if (filteredTasks.length) {
      setActiveTaskId(filteredTasks[0].id);
    } else {
      setActiveTaskId(null);
    }
  }, [open, tasksWithLocation, filteredTasks]);

  useEffect(() => {
    if (!open || !activeTaskId) {
      setMapFocus(null);
      return;
    }

    const locatedTask = tasksWithLocation.find((task) => task.id === activeTaskId);
    if (!locatedTask?.parsedLocation) {
      setMapFocus(null);
      return;
    }

    if (!hasFocusedTaskRef.current) {
      hasFocusedTaskRef.current = true;
      return;
    }

    setMapFocus(locatedTask.parsedLocation);

    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => setMapFocus(null), 420);
    return () => window.clearTimeout(timeout);
  }, [activeTaskId, tasksWithLocation, open]);

  useEffect(() => {
    if (!open) {
      hasFocusedTaskRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !activeTaskId || !taskListRef.current) return;
    const container = taskListRef.current;
    const target = container.querySelector<HTMLLIElement>(`[data-task-id="${activeTaskId}"]`);
    if (!target) return;

    const behavior: ScrollBehavior = initialScrollDoneRef.current ? "smooth" : "auto";
    target.scrollIntoView({ block: "center", behavior });
    initialScrollDoneRef.current = true;
  }, [activeTaskId, open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setIsDesktop(false);
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateMatch = () => setIsDesktop(mediaQuery.matches);
    updateMatch();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMatch);
      return () => mediaQuery.removeEventListener("change", updateMatch);
    }

    mediaQuery.addListener(updateMatch);
    return () => mediaQuery.removeListener(updateMatch);
  }, []);

  const sheetHeights = useMemo(() => DRAWER_SNAP_POINTS.map((point) => viewportHeight * point), [viewportHeight]);
  const baseTargetY = viewportHeight ? viewportHeight - sheetHeights[snapIndex] : 0;
  const targetY = isDragging ? baseTargetY + currentDragY : baseTargetY;

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = event.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const currentY = event.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;
    setIsDragging(true);
    setCurrentDragY(deltaY);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    const dragThreshold = viewportHeight * 0.15;

    if (currentDragY > dragThreshold && snapIndex > 0) {
      setSnapIndex((prev) => Math.max(0, prev - 1) as SnapIndex);
    } else if (currentDragY < -dragThreshold && snapIndex < 2) {
      setSnapIndex((prev) => Math.min(2, prev + 1) as SnapIndex);
    }

    setCurrentDragY(0);
  }, [currentDragY, snapIndex, viewportHeight]);

  const handleClick = useCallback(() => {
    setSnapIndex((current) => {
      if (current === 0) return 1;
      if (current === 1) return 2;
      return 1;
    });
  }, []);

  const toModalTask = useCallback(
    (task: TasksOverviewListItem): QuickCreateTaskModalTask => ({
      id: task.id,
      taskId: task.taskId ?? task.id,
      projectId: task.projectId,
      projectName: task.projectName,
      title: task.title,
      description: task.description ?? undefined,
      dueDate: task.dueDateInput ?? (task.dueDate ? task.dueDate.toISOString() : null),
      status: task.status,
      assigneeId: task.assigneeId ?? undefined,
      address: task.address ?? undefined,
      location: task.location as QuickCreateTaskModalTask["location"],
      noteAttachments: (task.rawTask as { noteAttachments?: TaskNoteAttachment[] }).noteAttachments ?? undefined,
      reviewerId: (task.rawTask as { reviewerId?: string }).reviewerId ?? undefined,
      createdById: task.createdById ?? undefined,
      createdByName: task.createdByName ?? undefined,
      createdByThumbnail: task.createdByThumbnail ?? undefined,
    }),
    [],
  );

  const handleTaskEdit = useCallback(
    (task: TasksOverviewListItem) => {
      const modalTask = toModalTask(task);
      if (isDesktop) {
        setDetailsTask(modalTask);
        setDetailsPanelOpen(true);
        setActiveTaskId(task.id);
      } else {
        setTaskToEdit(modalTask);
        setQuickCreateOpen(true);
        setActiveTaskId(task.id);
      }
    },
    [toModalTask, isDesktop],
  );

  const handleTaskSelect = useCallback((taskId: string) => {
    const task = filteredTasks.find((t) => t.id === taskId);
    if (task) {
      handleTaskEdit(task);
    }
  }, [filteredTasks, handleTaskEdit]);

  const handleMarkerClick = useCallback((markerId: string) => {
    const task = filteredTasks.find((t) => t.id === markerId);
    if (task) {
      handleTaskEdit(task);
    }
  }, [filteredTasks, handleTaskEdit]);

  const setTaskPending = useCallback((taskId: string, pending: boolean) => {
    setPendingTaskIds((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  const resolveTaskIdentifiers = useCallback((task: TasksOverviewListItem) => {
    const projectId = task.projectId;
    const resolvedTaskId = task.taskId ?? task.id;
    if (!projectId || !resolvedTaskId) {
      notify("error", "We couldn't find that task or its project.");
      return null;
    }
    return { projectId, taskId: resolvedTaskId };
  }, []);

  const handleSubmitForReview = useCallback(
    async (task: TasksOverviewListItem) => {
      const identifiers = resolveTaskIdentifiers(task);
      if (!identifiers) return;
      const normalizedUserId = user?.userId?.trim().toLowerCase() ?? '';
      const normalizedAssigneeId = task.assigneeId?.trim().toLowerCase() ?? '';
      const normalizedCreatorId = task.createdById?.trim().toLowerCase() ?? '';
      const isAssignee = normalizedUserId && normalizedAssigneeId && normalizedUserId === normalizedAssigneeId;
      const isCreator = normalizedUserId && normalizedCreatorId && normalizedUserId === normalizedCreatorId;
      const canActOnTask = isAdmin || isAssignee || isCreator;
      if (!canActOnTask) {
        notify('error', 'Only the assignee, creator, or an admin can update this task.');
        return;
      }
      setTaskPending(task.id, true);
      updateTaskStatus(task.id, "in_review");
      try {
        await requestTaskReview(identifiers.projectId, identifiers.taskId);
        notify("success", "Task submitted for review!");
      } catch (error) {
        console.error("Failed to submit task for review", error);
        notify("error", "Failed to submit task for review.");
        await refreshTasks(); // revert
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending, updateTaskStatus, user?.userId, isAdmin],
  );

  const handleApproveTask = useCallback(
    async (task: TasksOverviewListItem) => {
      const identifiers = resolveTaskIdentifiers(task);
      if (!identifiers) return;
      const normalizedUserId = user?.userId?.trim().toLowerCase() ?? '';
      const normalizedAssigneeId = task.assigneeId?.trim().toLowerCase() ?? '';
      const normalizedCreatorId = task.createdById?.trim().toLowerCase() ?? '';
      const isAssignee = normalizedUserId && normalizedAssigneeId && normalizedUserId === normalizedAssigneeId;
      const isCreator = normalizedUserId && normalizedCreatorId && normalizedUserId === normalizedCreatorId;
      const canActOnTask = isAdmin || isAssignee || isCreator;
      if (!canActOnTask) {
        notify('error', 'Only the assignee, creator, or an admin can update this task.');
        return;
      }
      const normalizedStatus = typeof task.status === "string" ? task.status.trim().toLowerCase() : "";
      const isAwaitingApproval = normalizedStatus === "in_review";
      if (isAwaitingApproval && !isAdmin) {
        notify('error', 'Only admins can approve tasks that are in review.');
        return;
      }
      setTaskPending(task.id, true);
      updateTaskStatus(task.id, "done", { completedAt: new Date() });
      try {
        await approveTask(identifiers.projectId, identifiers.taskId, { note: "" });
        notify("success", "Task approved and marked as done.");
      } catch (error) {
        console.error("Failed to approve task", error);
        notify("error", "Failed to approve task.");
        await refreshTasks(); // revert
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending, updateTaskStatus, user?.userId, isAdmin],
  );

  const handleRequestChanges = useCallback(
    async (task: TasksOverviewListItem) => {
      if (typeof window === "undefined") {
        notify("error", "A note is required to request changes.");
        return;
      }
      const note = window.prompt("What needs to be fixed?");
      const trimmed = note?.trim();
      if (!trimmed) {
        notify("error", "Please include a note when requesting changes.");
        return;
      }
      const identifiers = resolveTaskIdentifiers(task);
      if (!identifiers) return;
      const normalizedUserId = user?.userId?.trim().toLowerCase() ?? '';
      const normalizedAssigneeId = task.assigneeId?.trim().toLowerCase() ?? '';
      const normalizedCreatorId = task.createdById?.trim().toLowerCase() ?? '';
      const isAssignee = normalizedUserId && normalizedAssigneeId && normalizedUserId === normalizedAssigneeId;
      const isCreator = normalizedUserId && normalizedCreatorId && normalizedUserId === normalizedCreatorId;
      const canActOnTask = isAdmin || isAssignee || isCreator;
      if (!canActOnTask) {
        notify('error', 'Only the assignee, creator, or an admin can update this task.');
        return;
      }
      setTaskPending(task.id, true);
      updateTaskStatus(task.id, "needs_changes");
      try {
        await requestTaskChanges(identifiers.projectId, identifiers.taskId, { note: trimmed });
        notify(
          "success",
          `Task sent back to ${task.assigneeName ?? "the assignee"} with requested changes.`,
        );
      } catch (error) {
        console.error("Failed to request task changes", error);
        notify("error", "Failed to send the task back for changes.");
        await refreshTasks(); // revert
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending, updateTaskStatus, user?.userId, isAdmin],
  );

  const handleArchiveTask = useCallback(
    async (task: TasksOverviewListItem) => {
      const identifiers = resolveTaskIdentifiers(task);
      if (!identifiers) return;
      const normalizedUserId = user?.userId?.trim().toLowerCase() ?? '';
      const normalizedAssigneeId = task.assigneeId?.trim().toLowerCase() ?? '';
      const normalizedCreatorId = task.createdById?.trim().toLowerCase() ?? '';
      const isAssignee = normalizedUserId && normalizedAssigneeId && normalizedUserId === normalizedAssigneeId;
      const isCreator = normalizedUserId && normalizedCreatorId && normalizedUserId === normalizedCreatorId;
      const canActOnTask = isAdmin || isAssignee || isCreator;
      if (!canActOnTask) {
        notify('error', 'Only the assignee, creator, or an admin can update this task.');
        return;
      }
      setTaskPending(task.id, true);
      updateTaskStatus(task.id, "archived");
      try {
        await archiveTask(identifiers.projectId, identifiers.taskId);
        notify("success", "Task archived. You can find it under 'Archived' if needed.");
      } catch (error) {
        console.error("Failed to archive task", error);
        notify("error", "Failed to archive task.");
        await refreshTasks();
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending, updateTaskStatus, user?.userId, isAdmin],
  );

  const handleUnarchiveTask = useCallback(
    async (task: TasksOverviewListItem) => {
      const identifiers = resolveTaskIdentifiers(task);
      if (!identifiers) return;
      const normalizedUserId = user?.userId?.trim().toLowerCase() ?? '';
      const normalizedAssigneeId = task.assigneeId?.trim().toLowerCase() ?? '';
      const normalizedCreatorId = task.createdById?.trim().toLowerCase() ?? '';
      const isAssignee = normalizedUserId && normalizedAssigneeId && normalizedUserId === normalizedAssigneeId;
      const isCreator = normalizedUserId && normalizedCreatorId && normalizedUserId === normalizedCreatorId;
      const canActOnTask = isAdmin || isAssignee || isCreator;
      if (!canActOnTask) {
        notify('error', 'Only the assignee, creator, or an admin can update this task.');
        return;
      }
      setTaskPending(task.id, true);
      updateTaskStatus(task.id, "done", { completedAt: new Date() });
      try {
        await unarchiveTask(identifiers.projectId, identifiers.taskId);
        notify("success", "Task unarchived and marked as completed.");
      } catch (error) {
        console.error("Failed to unarchive task", error);
        notify("error", "Failed to unarchive task.");
        await refreshTasks(); // revert
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending, updateTaskStatus, user?.userId, isAdmin],
  );

  const handleDeleteTask = useCallback(
    async (task: TasksOverviewListItem) => {
      const confirmed = window.confirm("Are you sure you want to delete this task? This action cannot be undone.");
      if (!confirmed) return;
      const identifiers = resolveTaskIdentifiers(task);
      if (!identifiers) return;
      const normalizedUserId = user?.userId?.trim().toLowerCase() ?? '';
      const normalizedAssigneeId = task.assigneeId?.trim().toLowerCase() ?? '';
      const normalizedCreatorId = task.createdById?.trim().toLowerCase() ?? '';
      const isAssignee = normalizedUserId && normalizedAssigneeId && normalizedUserId === normalizedAssigneeId;
      const isCreator = normalizedUserId && normalizedCreatorId && normalizedUserId === normalizedCreatorId;
      const canActOnTask = isAdmin || isAssignee || isCreator;
      if (!canActOnTask) {
        notify('error', 'Only the assignee, creator, or an admin can delete this task.');
        return;
      }
      setTaskPending(task.id, true);
      try {
        await deleteTask({ projectId: identifiers.projectId, taskId: identifiers.taskId });
        notify("success", "Task deleted successfully.");
        await refreshTasks();
      } catch (error) {
        console.error("Failed to delete task", error);
        notify("error", "Failed to delete task.");
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending, user?.userId, isAdmin],
  );

  const handleOpenQuickCreate = useCallback(() => {
    if (isDesktop) {
      setDetailsTask(null);
      setDetailsPanelOpen(true);
    } else {
      setTaskToEdit(null);
      setQuickCreateOpen(true);
    }
  }, [isDesktop]);

  // Auto-open create mode when navigating from calendar
  useEffect(() => {
    if (open && openInCreateMode) {
      if (isDesktop) {
        setDetailsTask(initialTaskDraft as QuickCreateTaskModalTask | null);
        setDetailsPanelOpen(true);
      } else {
        setTaskToEdit(initialTaskDraft as QuickCreateTaskModalTask | null);
        setQuickCreateOpen(true);
      }
    }
  }, [open, openInCreateMode, initialTaskDraft, isDesktop]);

  const handleCloseQuickCreate = useCallback(() => {
    setTaskToEdit(null);
    setQuickCreateOpen(false);
  }, []);

  const handleQuickCreateModalResult = useCallback(
    (event: QuickCreateTaskModalEvent) => {
      refreshTasks();
      if (event.type === "create") {
        handleCloseQuickCreate();
      }
    },
    [refreshTasks, handleCloseQuickCreate],
  );

  const handleCloseDetailsPanel = useCallback(() => {
    setDetailsTask(null);
    setDetailsPanelOpen(false);
  }, []);

  // Keyboard handler for Esc key
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (detailsPanelOpen) {
          // Close only the edit panel if open
          handleCloseDetailsPanel();
        } else {
          // Close the entire task drawer if edit panel not open
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, detailsPanelOpen, handleCloseDetailsPanel, onClose]);

  const handleDetailsSaved = useCallback(() => {
    refreshTasks();
    handleCloseDetailsPanel();
  }, [refreshTasks, handleCloseDetailsPanel]);

  const handleProjectClick = useCallback((projectId: string, projectName: string) => {
    const encodedName = encodeURIComponent(projectName);
    navigate(`/dashboard/projects/${projectId}/${encodedName}`);
  }, [navigate]);

  const formatDueLabel = useCallback((task: TasksOverviewListItem): string => {
    if (!task.dueDate) return "No due date";
    const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", weekday: "short" });
    const formatted = formatter.format(task.dueDate);
    return task.timeLabel ? `${formatted} · ${task.timeLabel}` : formatted;
  }, []);

  const formatDateLabel = useCallback((date: Date): string => {
    const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
    return formatter.format(date);
  }, []);

  const statusContext = useMemo(() => createTaskStatusContext(), []);

const BADGE_CLASS_BY_TONE = {
  success: "StatusBadgeSuccess",
  danger: "StatusBadgeDanger",
  warning: "StatusBadgeWarning",
  neutral: "StatusBadgeNeutral",
} as const;  const formatStatValue = (value: number): string | number => {
    if (error) return "—";
    if (loading) return "…";
    return value;
  };

  const mapStatusMessage = tasksWithLocation.length > 0
    ? `${tasksWithLocation.length} ${tasksWithLocation.length === 1 ? "task" : "tasks"} on the map`
    : "Add locations to tasks to see them on the map";

  const statusMessage = filteredTasks.length > 0
    ? `${filteredTasks.length} ${filteredTasks.length === 1 ? "task" : "tasks"} on your radar`
    : "No tasks to show";

  const activeProjectName = useMemo(() => {
    if (!projectFilter) return null;
    return projectOptions.find((p) => p.id === projectFilter)?.name ?? null;
  }, [projectFilter, projectOptions]);

  const pageTitle = activeProjectName ? activeProjectName : "All tasks";
  const pageSubtitle = activeProjectName
    ? `Tasks for ${activeProjectName}`
    : "Review everything on your radar";

  if (!open || typeof document === "undefined") {
    return null;
  }

  const hasMapMarkers = mapMarkers.length > 0;
  const overlayClassName = isDesktop
    ? `${styles.sheetOverlay} ${styles.desktopOverlay}`
    : styles.sheetOverlay;
  const sheetClassName = isDesktop 
    ? `${styles.sheet} ${styles.desktopSheet}`
    : fullPage
    ? `${styles.sheet} ${styles.sheetFullPage}`
    : styles.sheet;
  const drawerInitial = isDesktop ? { x: "-100%" } : fullPage ? { y: 0 } : { y: viewportHeight };
  const drawerAnimate = isDesktop ? { x: 0 } : fullPage ? { y: 0 } : { y: targetY };
  const drawerTransition = isDesktop
    ? { type: "spring", stiffness: 380, damping: 38, mass: 0.9 }
    : { type: "spring", stiffness: 360, damping: 42, mass: 0.9 };

  return (
    <>
      {createPortal(
        <div className={overlayClassName} role="presentation">
          <div className={styles.mapLayer}>
            <div className={styles.mapCanvas}>
              <MapComponent
                location={mapLocation}
                address={mapAddress}
                scrollWheelZoom={true}
                dragging={true}
                touchZoom={true}
                showUserLocation={false}
                markers={mapMarkers}
                onMarkerClick={handleMarkerClick}
                focusLocation={mapFocus}
                focusZoom={15}
              />
            </div>
            <div className={styles.mapGradient} aria-hidden="true" />
            {!hasMapMarkers && <div className={styles.mapEmptyBanner}>{mapStatusMessage}</div>}
          </div>
          {!isDesktop && (
            <>
              <button
                type="button"
                className={styles.sheetDismiss}
                onClick={onClose}
                aria-label="Close tasks drawer"
              >
                <ChevronDown size={20} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                className={styles.sheetCreate}
                onClick={handleOpenQuickCreate}
                aria-label="Quick create a task"
                disabled={loading || !projectOptions.length}
              >
                <Plus size={20} strokeWidth={2.5} />
              </button>
            </>
          )}
          <motion.div
            ref={sheetRef}
            className={sheetClassName}
            role="dialog"
            aria-modal="true"
            aria-label="Global tasks map view"
            drag={false}
            initial={drawerInitial}
            animate={drawerAnimate}
            transition={drawerTransition}
          >
            {isDesktop ? (
              <>
                <header className={styles.desktopDrawerHeader}>
                  <div className={styles.desktopDrawerHeaderLeft}>
                    <button
                      type="button"
                      className={styles.backButton}
                      onClick={onClose}
                      aria-label={backLabel || "Back to project"}
                      title={backLabel || "Back to project"}
                    >
                      <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
                      <span className={styles.backButtonLabel}>{backLabel || "Back to project"}</span>
                    </button>
                    {calendarAction && (
                      <button
                        type="button"
                        className={styles.calendarActionButton}
                        onClick={calendarAction.onClick}
                        aria-label={calendarAction.label}
                        title={calendarAction.label}
                      >
                        <Calendar size={16} strokeWidth={2.5} aria-hidden="true" />
                        <span className={styles.calendarActionLabel}>{calendarAction.label}</span>
                      </button>
                    )}
                  </div>
                  <div className={styles.desktopDrawerActions}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      onClick={handleOpenQuickCreate}
                      disabled={loading || !projectOptions.length}
                    >
                      <Plus size={18} strokeWidth={2.5} aria-hidden="true" /> New task
                    </button>
                  </div>
                </header>
                <div className={styles.sheetTitleGroup}>
                  <span className={styles.sheetTitle}>{pageTitle}</span>
                  <span className={styles.sheetSubtitle}>{pageSubtitle}</span>
                </div>
                <div className={`${styles.sheetSummary} ${styles.desktopDrawerSummary}`}>
                  <TaskSummary stats={stats} formatValue={formatStatValue} statusMessage={statusMessage} statusStyle={{ textAlign: 'center' }} />
                </div>
              </>
            ) : (
              <>
                {!fullPage && (
                  <div
                    className={styles.sheetDragArea}
                    role="button"
                    tabIndex={0}
                    aria-label="Toggle tasks drawer size"
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleClick();
                      }
                    }}
                  >
                    <div className={styles.sheetHandle}>
                      <span className={styles.sheetHandleBar} aria-hidden="true" />
                    </div>
                  </div>
                )}
                <header className={styles.sheetHeader}>
                  <div className={styles.sheetTitleGroup}>
                    <span className={styles.sheetTitle}>{pageTitle}</span>
                    <span className={styles.sheetSubtitle}>{pageSubtitle}</span>
                  </div>
                </header>
                <div className={styles.sheetSummary}>
                  <TaskSummary stats={stats} formatValue={formatStatValue} statusMessage={statusMessage} />
                </div>
              </>
            )}
            <div
              style={{
                padding: "0 1.5rem",
                paddingTop: "1rem",
                paddingBottom: "0.75rem",
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <div className={styles.statusTabs} role="tablist" aria-label="Filter tasks by status">
                {STATUS_FILTER_OPTIONS.map((option) => {
                  const isActiveStatus = statusFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={isActiveStatus}
                      className={
                        isActiveStatus
                          ? `${styles.statusTabButton} ${styles.statusTabButtonActive}`
                          : styles.statusTabButton
                      }
                      onClick={() => setStatusFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div
                className={desktopFilterStyles.statusDropdown}
                style={{ width: "auto", flex: "1 1 180px", minWidth: "160px" }}
                ref={projectFilterDropdown.dropdownRef}
              >
                <button
                  type="button"
                  className={desktopFilterStyles.statusTrigger}
                  aria-haspopup="listbox"
                  aria-expanded={projectFilterDropdown.isOpen}
                  aria-controls={projectFilterDropdown.listId}
                  aria-activedescendant={projectFilterDropdown.activeOptionId}
                  onClick={projectFilterDropdown.toggle}
                  onKeyDown={projectFilterDropdown.handleTriggerKeyDown}
                  style={{
                    background: projectFilter ? 'rgba(250, 51, 86, 0.1)' : undefined,
                    borderColor: projectFilter ? 'rgba(250, 51, 86, 0.3)' : undefined,
                    color: projectFilter ? '#fa3356' : undefined,
                  }}
                >
                  <span className={desktopFilterStyles.triggerLabel}>
                    <span className={desktopFilterStyles.triggerLabelText}>
                      {
                        projectFilterDropdownOptions.find(
                          (option) => option.value === projectFilterSelectedValue,
                        )?.label
                      }
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={desktopFilterStyles.triggerChevron}
                  />
                </button>
                {projectFilterDropdown.isOpen && (
                  <ul
                    className={desktopFilterStyles.statusOptions}
                    role="listbox"
                    id={projectFilterDropdown.listId}
                  >
                    {projectFilterDropdownOptions.map((option, index) => {
                      const { id, isSelected, isActive } =
                        projectFilterDropdown.getOptionRenderState(option, index);
                      const buttonProps = projectFilterDropdown.getOptionButtonProps(
                        option,
                        index,
                      );
                      return (
                        <li
                          key={`${option.value || "all"}-${index}`}
                          role="option"
                          id={id}
                          aria-selected={isSelected}
                        >
                          <button
                            {...buttonProps}
                            className={`${desktopFilterStyles.statusOptionButton} ${
                              isSelected ? desktopFilterStyles.statusOptionSelected : ""
                            } ${isActive ? desktopFilterStyles.statusOptionActive : ""}`}
                          >
                            {option.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div
                className={desktopFilterStyles.statusDropdown}
                style={{ width: "auto", flex: "1 1 140px", minWidth: "120px" }}
                ref={quickFilterDropdown.dropdownRef}
              >
                <button
                  type="button"
                  className={desktopFilterStyles.statusTrigger}
                  aria-haspopup="listbox"
                  aria-expanded={quickFilterDropdown.isOpen}
                  aria-controls={quickFilterDropdown.listId}
                  aria-activedescendant={quickFilterDropdown.activeOptionId}
                  onClick={quickFilterDropdown.toggle}
                  onKeyDown={quickFilterDropdown.handleTriggerKeyDown}
                >
                  <span className={desktopFilterStyles.triggerLabel}>
                    <span className={desktopFilterStyles.triggerLabelText}>{quickFilterLabel}</span>
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={desktopFilterStyles.triggerChevron}
                  />
                </button>
                {quickFilterDropdown.isOpen && (
                  <ul
                    className={desktopFilterStyles.statusOptions}
                    role="listbox"
                    id={quickFilterDropdown.listId}
                  >
                    {quickFilterOptions.map((option, index) => {
                      const { id, isSelected, isActive } =
                        quickFilterDropdown.getOptionRenderState(option, index);
                      const buttonProps = quickFilterDropdown.getOptionButtonProps(option, index);
                      return (
                        <li
                          key={`${option.value}-${index}`}
                          role="option"
                          id={id}
                          aria-selected={isSelected}
                        >
                          <button
                            {...buttonProps}
                            className={`${desktopFilterStyles.statusOptionButton} ${
                              isSelected ? desktopFilterStyles.statusOptionSelected : ""
                            } ${isActive ? desktopFilterStyles.statusOptionActive : ""}`}
                          >
                            {option.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {assignedByOptions.length > 0 && (
                <div
                  className={desktopFilterStyles.statusDropdown}
                  style={{ width: "auto", flex: "1 1 180px", minWidth: "140px" }}
                  ref={assignedByDropdown.dropdownRef}
                >
                  <button
                    type="button"
                    className={desktopFilterStyles.statusTrigger}
                    aria-haspopup="listbox"
                    aria-expanded={assignedByDropdown.isOpen}
                    aria-controls={assignedByDropdown.listId}
                    aria-activedescendant={assignedByDropdown.activeOptionId}
                    onClick={assignedByDropdown.toggle}
                    onKeyDown={assignedByDropdown.handleTriggerKeyDown}
                  >
                    <span className={desktopFilterStyles.triggerLabel}>
                      <span className={desktopFilterStyles.triggerLabelText}>
                        {
                          assignedByDropdownOptions.find(
                            (option) => option.value === assignedBySelectedValue,
                          )?.label
                        }
                      </span>
                    </span>
                    <ChevronDown
                      size={14}
                      aria-hidden
                      className={desktopFilterStyles.triggerChevron}
                    />
                  </button>
                  {assignedByDropdown.isOpen && (
                    <ul
                      className={desktopFilterStyles.statusOptions}
                      role="listbox"
                      id={assignedByDropdown.listId}
                    >
                      {assignedByDropdownOptions.map((option, index) => {
                        const { id, isSelected, isActive } =
                          assignedByDropdown.getOptionRenderState(option, index);
                        const buttonProps = assignedByDropdown.getOptionButtonProps(
                          option,
                          index,
                        );
                        return (
                          <li
                            key={`${option.value || "all"}-${index}`}
                            role="option"
                            id={id}
                            aria-selected={isSelected}
                          >
                            <button
                              {...buttonProps}
                              className={`${desktopFilterStyles.statusOptionButton} ${
                                isSelected ? desktopFilterStyles.statusOptionSelected : ""
                              } ${isActive ? desktopFilterStyles.statusOptionActive : ""}`}
                            >
                              {option.label}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {assignedToOptions.length > 0 && (
                <div
                  className={desktopFilterStyles.statusDropdown}
                  style={{ width: "auto", flex: "1 1 180px", minWidth: "140px" }}
                  ref={assignedToDropdown.dropdownRef}
                >
                  <button
                    type="button"
                    className={desktopFilterStyles.statusTrigger}
                    aria-haspopup="listbox"
                    aria-expanded={assignedToDropdown.isOpen}
                    aria-controls={assignedToDropdown.listId}
                    aria-activedescendant={assignedToDropdown.activeOptionId}
                    onClick={assignedToDropdown.toggle}
                    onKeyDown={assignedToDropdown.handleTriggerKeyDown}
                  >
                    <span className={desktopFilterStyles.triggerLabel}>
                      <span className={desktopFilterStyles.triggerLabelText}>
                        {
                          assignedToDropdownOptions.find(
                            (option) => option.value === assignedToSelectedValue,
                          )?.label
                        }
                      </span>
                    </span>
                    <ChevronDown
                      size={14}
                      aria-hidden
                      className={desktopFilterStyles.triggerChevron}
                    />
                  </button>
                  {assignedToDropdown.isOpen && (
                    <ul
                      className={desktopFilterStyles.statusOptions}
                      role="listbox"
                      id={assignedToDropdown.listId}
                    >
                      {assignedToDropdownOptions.map((option, index) => {
                        const { id, isSelected, isActive } =
                          assignedToDropdown.getOptionRenderState(option, index);
                        const buttonProps = assignedToDropdown.getOptionButtonProps(
                          option,
                          index,
                        );
                        return (
                          <li
                            key={`${option.value || "all"}-${index}`}
                            role="option"
                            id={id}
                            aria-selected={isSelected}
                          >
                            <button
                              {...buttonProps}
                              className={`${desktopFilterStyles.statusOptionButton} ${
                                isSelected ? desktopFilterStyles.statusOptionSelected : ""
                              } ${isActive ? desktopFilterStyles.statusOptionActive : ""}`}
                            >
                              {option.label}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              <div
                className={desktopFilterStyles.filterField}
                style={{ width: "auto", flex: "2 2 240px", minWidth: "200px" }}
              >
                <Search
                  size={16}
                  aria-hidden="true"
                  className={desktopFilterStyles.filterFieldIcon}
                />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={desktopFilterStyles.filterInput}
                />
              </div>

              <div
                className={desktopFilterStyles.statusDropdown}
                style={{ width: "auto", flex: "1 1 160px", minWidth: "140px" }}
                ref={sortDropdown.dropdownRef}
              >
                <button
                  type="button"
                  className={desktopFilterStyles.statusTrigger}
                  aria-haspopup="listbox"
                  aria-expanded={sortDropdown.isOpen}
                  aria-controls={sortDropdown.listId}
                  aria-activedescendant={sortDropdown.activeOptionId}
                  onClick={sortDropdown.toggle}
                  onKeyDown={sortDropdown.handleTriggerKeyDown}
                >
                  <span className={desktopFilterStyles.triggerLabel}>
                    <span className={desktopFilterStyles.triggerLabelText}>
                      {sortDropdownOptions.find((option) => option.value === sortSelectedValue)?.label}
                    </span>
                  </span>
                  <ChevronDown size={14} aria-hidden className={desktopFilterStyles.triggerChevron} />
                </button>
                {sortDropdown.isOpen && (
                  <ul
                    className={desktopFilterStyles.statusOptions}
                    role="listbox"
                    id={sortDropdown.listId}
                  >
                    {sortDropdownOptions.map((option, index) => {
                      const { id, isSelected, isActive } =
                        sortDropdown.getOptionRenderState(option, index);
                      const buttonProps = sortDropdown.getOptionButtonProps(option, index);
                      return (
                        <li key={`${option.value}-${index}`} role="option" id={id} aria-selected={isSelected}>
                          <button
                            {...buttonProps}
                            className={`${desktopFilterStyles.statusOptionButton} ${
                              isSelected ? desktopFilterStyles.statusOptionSelected : ""
                            } ${isActive ? desktopFilterStyles.statusOptionActive : ""}`}
                          >
                            {option.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
            <div className={`${styles.sheetScrollArea} ${isDesktop ? styles.desktopDrawerScrollArea : ""}`}>
              <section className={styles.sheetSection} aria-label="All tasks">
                
                {loading && <div className={styles.loading}>Loading tasks...</div>}
                {error && <div className={styles.error}>Failed to load tasks</div>}
                {!loading && !error && filteredTasks.length === 0 && (
                  <div className={styles.emptyState}>No tasks match your filters</div>
                )}
                {!loading && !error && filteredTasks.length > 0 && (
                  <ul ref={taskListRef} className={styles.taskList}>
                    {filteredTasks.map((task) => {
                      const isActive = task.id === activeTaskId;
                      const listItemClassName = `${styles.taskItem}${isActive ? ` ${styles.taskItemActive}` : ""}`;

                      // Get status badge
                      const { category, label } = getTaskStatusBadge(
                        task.status as "done" | "to_do" | "in_progress",
                        task.dueDate,
                        statusContext,
                      );
                      const normalizedStatus =
                        typeof task.status === "string" ? task.status.trim().toLowerCase() : "";
                      const isArchived = normalizedStatus === "archived";
                      const isInReview = normalizedStatus === "in_review";
                      const badgeToneCategory = isArchived ? "unscheduled" : isInReview ? "scheduled" : category;
                      const tone = getTaskStatusTone(badgeToneCategory);
                      const badgeClassKey = BADGE_CLASS_BY_TONE[tone];
                      const badgeToneClass = badgeClassKey ? styles[badgeClassKey] : undefined;
                      const badgeClassName = [styles.StatusBadge, badgeToneClass].filter(Boolean).join(" ");
                      const badgeLabel = isArchived ? "Archived" : isInReview ? "In Review" : label;
                      const normalizedUserId = normalizeUserId(user?.userId);
                      const normalizedAssignee = normalizeUserId(task.assigneeId);
                      const reviewerId =
                        task.reviewerId ?? (task.rawTask as { reviewerId?: string })?.reviewerId;
                      const normalizedReviewerId = normalizeUserId(reviewerId);
                      const isReviewer = Boolean(
                        normalizedReviewerId &&
                          normalizedUserId &&
                          normalizedReviewerId === normalizedUserId,
                      );
                      const isDone = normalizedStatus === "done";
                      const isNeedsChanges = normalizedStatus === "needs_changes";
                      const normalizedCreatorId = normalizeUserId(task.createdById);
                      const isAssignee = normalizedUserId && normalizedAssignee && normalizedUserId === normalizedAssignee;
                      const isCreator = normalizedUserId && normalizedCreatorId && normalizedUserId === normalizedCreatorId;
                      const canActOnTask = isAdmin || isAssignee || isCreator;
                      const isComplete = isDone || isArchived;
                      const canSubmitForReview = canActOnTask && ["todo", "in_progress", "needs_changes"].includes(normalizedStatus);
                      const canApprove = Boolean((isAdmin || isReviewer) && isInReview);
                      const canRequestChanges = canActOnTask && isInReview;
                      const canArchive = canActOnTask && isDone;
                      const canUnarchive = canActOnTask && isArchived;
                      const isBusy = pendingTaskIds.has(task.id);
                      const reviewNote = (
                        task.reviewNote ?? (task.rawTask as { reviewNote?: string })?.reviewNote ?? ""
                      ).trim();
                      const formattedTitle = task.title?.trim()
                        ? formatTaskName(task.title)
                        : "Untitled task";
                      const reviewerName =
                        task.reviewerName ?? (task.rawTask as { reviewerName?: string })?.reviewerName;
                      const showActionRow = Boolean(
                        isComplete ||
                        (canActOnTask && (
                          canSubmitForReview ||
                          canApprove ||
                          canRequestChanges ||
                          canArchive ||
                          canUnarchive
                        ))
                      );

                      return (
                        <li
                          key={task.id}
                          data-task-id={task.id}
                          className={listItemClassName}
                          style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
                          onClick={() => handleTaskSelect(task.id)}
                        >
                          <div className={styles.taskHeader} style={{ padding: '12px' }}>
                            <div className={styles.taskTitleRow} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', cursor: task.projectName ? 'pointer' : 'default' }} onClick={task.projectName ? (e) => { e.stopPropagation(); handleProjectClick(task.projectId, task.projectName!); } : undefined}>
                                {task.projectThumbnail ? (() => {
                                  const size = 24;
                                  const w = size, h = size;
                                  const r = Math.min(w, h) * 0.5;
                                  const k = 0.55 + 0.45;
                                  const squirclePath = getSquirclePath(w, h, r, k);
                                  return (
                                    <svg
                                      width={size}
                                      height={size}
                                      viewBox={`0 0 ${size} ${size}`}
                                      style={{ flexShrink: 0 }}
                                      aria-hidden="true"
                                    >
                                      <defs>
                                        <clipPath id={`squircle-clip-${task.id}`}>
                                          <path d={squirclePath} />
                                        </clipPath>
                                      </defs>
                                      <image
                                        href={task.projectThumbnail}
                                        x="0"
                                        y="0"
                                        width={size}
                                        height={size}
                                        clipPath={`url(#squircle-clip-${task.id})`}
                                      />
                                    </svg>
                                  );
                                })() : (
                                  <div
                                    style={{
                                      width: '24px',
                                      height: '24px',
                                      flexShrink: 0,
                                    }}
                                    aria-hidden="true"
                                  >
                                    <SvgThumbnail
                                      initial={task.projectName.charAt(0).toUpperCase()}
                                      size={24}
                                    />
                                  </div>
                                )}
                                <span
                                  className={styles.taskTitle}
                                  style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}
                                >
                                  {task.projectName || formattedTitle}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  {task.createdByName && task.createdById !== task.assigneeId && (
                                    <div
                                      style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        border: '2px solid #fff',
                                        background: '#000',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.625rem',
                                        color: '#fff',
                                        fontWeight: '600',
                                        flexShrink: 0,
                                        overflow: 'hidden',
                                        zIndex: 2,
                                        position: 'relative',
                                      }}
                                      title={`Created by ${task.createdByName}`}
                                    >
                                      {task.createdByThumbnail ? (
                                        <img
                                          src={getFileUrl(task.createdByThumbnail)}
                                          alt={task.createdByName}
                                          style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                          }}
                                        />
                                      ) : (
                                        task.createdByName.charAt(0).toUpperCase()
                                      )}
                                    </div>
                                  )}
                                  {task.assigneeName && (
                                    <div
                                      style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        border: '2px solid #fff',
                                        background: '#000',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.625rem',
                                        color: '#fff',
                                        fontWeight: '600',
                                        flexShrink: 0,
                                        overflow: 'hidden',
                                        marginLeft: task.createdById === task.assigneeId ? '0' : '-12px',
                                        zIndex: 1,
                                        position: 'relative',
                                      }}
                                      title={`Assigned to ${task.assigneeName}`}
                                    >
                                      {task.assigneeThumbnail ? (
                                        <img
                                          src={getFileUrl(task.assigneeThumbnail)}
                                          alt={task.assigneeName}
                                          style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                          }}
                                        />
                                      ) : (
                                        task.assigneeName.charAt(0).toUpperCase()
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span className={badgeClassName}>{badgeLabel}</span>
                              </div>
                            </div>
                          </div>
                          <div className={styles.taskMeta}>
                            {task.projectName && (
                              <span 
                                className={styles.metaLine} 
                                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px', cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleProjectClick(task.projectId, task.projectName);
                                }}
                              >
                               
                              </span>
                            )}
                            <span className={styles.metaLine} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '32ch', marginBottom: '18px', fontSize: '1.25em' }}>
                              {formattedTitle}
                            </span>
                            <span className={styles.metaLine}>
                              <Calendar size={14} aria-hidden="true" /> {formatDueLabel(task)}
                            </span>
                            {task.createdAt && (
                              <span
                                className={styles.metaLine}
                                style={{
                                  fontSize: '11px',
                                  color: 'rgba(246, 247, 251, 0.6)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  marginTop: '2px',
                                  marginBottom: '2px'
                                }}
                                title={
                                  task.completedAt
                                    ? `Created on ${task.createdAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} Completed on ${task.completedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`
                                    : `Created on ${task.createdAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`
                                }
                              >
                                {task.completedAt
                                  ? `Completed ${formatDateLabel(task.completedAt)} · Created ${formatDateLabel(task.createdAt)}`
                                  : `Created ${formatDateLabel(task.createdAt)}`
                                }
                              </span>
                            )}
                            {isNeedsChanges && (reviewNote || reviewerName) ? (
                              <div className={styles.reviewNoteBlock}>
                                <div className={styles.reviewNoteLabel}>
                                  Changes requested
                                  {reviewerName ? ` by ${reviewerName}` : ""}
                                </div>
                                {reviewNote ? (
                                  <p className={styles.reviewNoteText}>{reviewNote}</p>
                                ) : null}
                              </div>
                            ) : null}
                            {task.createdByName && task.assigneeName && (
                              <span
                                className={styles.metaLine}
                                style={{
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  marginTop: '0.25rem',
                                  marginBottom: '0.25rem'
                                }}
                              >
                                <span style={{ color: 'rgba(246, 247, 251, 0.6)' }}>Assigned by </span>
                                <span style={{ fontWeight: 600, color: 'rgba(246, 247, 251, 0.92)' }}>{task.createdByName}</span>
                                <span style={{ color: 'rgba(246, 247, 251, 0.6)' }}> to </span>
                                <span style={{ fontWeight: 600, color: 'rgba(246, 247, 251, 0.92)' }}>{task.assigneeName}</span>
                              </span>
                            )}
                            {task.address ? (
                              <span className={`${styles.metaLine} ${styles.metaLineAddress}`}>
                                <MapPin size={14} aria-hidden="true" />
                                <span className={styles.addressDetails}>
                                  <span className={styles.addressText}>{task.address}</span>
                                </span>
                              </span>
                            ) : (
                              <span className={`${styles.metaLine} ${styles.metaLineMuted}`}>
                                <MapPin size={14} aria-hidden="true" /> No location
                              </span>
                            )}
                          </div>
                          <div className={styles.taskFooter} style={{ display: 'flex', justifyContent: task.address ? 'space-between' : 'flex-end', alignItems: 'center', padding: '12px' }}>
                            {task.address ? (() => {
                              const directions = buildDirectionsLinks(task.address);
                              return (
                                <span className={styles.addressActions}>
                                  <a
                                    href={directions.appleMaps}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.addressLink}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    Open in Maps
                                  </a>
                                  <span className={styles.addressLinkSeparator} aria-hidden="true">
                                    •
                                  </span>
                                  <a
                                    href={directions.googleMaps}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.addressLink}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    Open in Google Maps
                                  </a>
                                </span>
                              );
                            })() : null}
                          </div>
                          {showActionRow ? (
                            <div className={styles.taskActionBar}>
                              {canSubmitForReview ? (
                              <button
                                type="button"
                                className={`${styles.taskActionButton} ${styles.taskActionSubmit}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleSubmitForReview(task);
                                }}
                                disabled={isBusy}
                              >
                                {isBusy ? "Working…" : "Submit for review"}
                              </button>
                            ) : null}
                            {canApprove ? (
                              <button
                                type="button"
                                className={`${styles.taskActionButton} ${styles.taskActionApprove}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleApproveTask(task);
                                }}
                                disabled={isBusy}
                              >
                                {isBusy ? "Working…" : "Mark as done"}
                              </button>
                            ) : null}
                            {canRequestChanges ? (
                              <button
                                type="button"
                                className={`${styles.taskActionButton} ${styles.taskActionRequest}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRequestChanges(task);
                                }}
                                disabled={isBusy}
                              >
                                {isBusy ? "Working…" : "Send back for changes"}
                              </button>
                            ) : null}
                            {canArchive ? (
                              <button
                                type="button"
                                className={`${styles.taskActionButton} ${styles.taskActionArchive}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleArchiveTask(task);
                                }}
                                disabled={isBusy}
                              >
                                {isBusy ? "Working…" : "Archive task"}
                              </button>
                            ) : null}
                              {canUnarchive ? (
                                <button
                                  type="button"
                                className={`${styles.taskActionButton} ${styles.taskActionRestore}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleUnarchiveTask(task);
                                }}
                                disabled={isBusy}
                              >
                                {isBusy ? "Working…" : "Unarchive task"}
                              </button>
                            ) : null}
                            {canUnarchive ? (
                              <button
                                type="button"
                                className={styles.taskActionButton}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteTask(task);
                                }}
                                disabled={isBusy}
                                style={{ color: '#ff6b6b', borderColor: '#ff6b6b', marginLeft: 'auto', background: 'rgba(255, 107, 107, 0.1)' }}
                              >
                                <Trash size={14} style={{ marginRight: '4px' }} /> Delete
                              </button>
                            ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </motion.div>
          {isDesktop && detailsPanelOpen && (
            <motion.div
              className={`${styles.detailsPanel} ${styles.detailsPanelWithDim}`}
              role="dialog"
              aria-modal="true"
              aria-label="Task details"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
            >
              
              <QuickCreateTaskModal
                open={true}
                onClose={handleCloseDetailsPanel}
                projects={projectOptions}
                onCreated={() => handleDetailsSaved()}
                onUpdated={() => handleDetailsSaved()}
                onDeleted={() => {
                  notify('success', 'Task deleted successfully');
                  handleDetailsSaved();
                }}
                task={detailsTask}
                embedMode={true}
                scopedProjectId={projectFilter || undefined}
              />
            </motion.div>
          )}
        </div>,
        document.body,
      )}
      {!isDesktop && (
        <QuickCreateTaskModal
          open={quickCreateOpen}
          onClose={handleCloseQuickCreate}
          projects={projectOptions}
          onCreated={handleQuickCreateModalResult}
          onUpdated={() => refreshTasks()}
          onDeleted={() => {
            notify('success', 'Task deleted successfully');
            refreshTasks();
          }}
          task={taskToEdit}
          scopedProjectId={projectFilter || undefined}
        />
      )}
    </>
  );
};

export default GlobalTaskDrawer;
