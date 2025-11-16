import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, ChevronLeft, MapPin, Plus, Search, X } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import MapComponent from "@/shared/ui/Map";
import { useTasksOverview, type TasksOverviewListItem } from "../hooks/useTasksOverview";
import QuickCreateTaskModal, { type QuickCreateTaskModalTask } from "./QuickCreateTaskModal";
import SvgThumbnail from "./SvgThumbnail";
import { getSquirclePath } from "@/shared/ui/squircle/getSquirclePath";
import TaskSummary from "@/dashboard/project/components/Tasks/components/TaskSummary";
import { type FilterOption } from "./TaskMobileFilter";
import { useUser } from "@/app/contexts/useUser";
import {
  createTaskStatusContext,
  getTaskStatusBadge,
  getTaskStatusTone,
} from "@/dashboard/project/components/Tasks/components/quickTaskUtils";
import { buildDirectionsLinks } from "@/dashboard/project/components/Tasks/utils";
import desktopFilterStyles from "@/dashboard/home/components/ProjectsPanelDesktop.module.css";
import { notify } from "@/shared/ui/ToastNotifications";
import { updateTask, getFileUrl } from "@/shared/utils/api";

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

type GlobalTaskDrawerProps = {
  open: boolean;
  onClose: () => void;
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

const GlobalTaskDrawer: React.FC<GlobalTaskDrawerProps> = ({ open, onClose }) => {
  const {
    loading,
    error,
    stats,
    openTasks,
    completedTasks,
    refreshTasks,
    projectOptions,
  } = useTasksOverview();
  const { user } = useUser();
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
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("all");
  const [assignedByFilter, setAssignedByFilter] = useState<string | null>(null);
  const [assignedToFilter, setAssignedToFilter] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const taskListRef = useRef<HTMLUListElement>(null);
  const initialScrollDoneRef = useRef(false);
  const touchStartY = useRef(0);

  // Combine open and completed tasks for filtering
  const allTasks = useMemo(() => [...openTasks, ...completedTasks], [openTasks, completedTasks]);

  const { assignedByOptions, assignedToOptions } = useMemo<{
    assignedByOptions: AssignedPersonOption[];
    assignedToOptions: AssignedPersonOption[];
  }>(() => {
    const assignedByMap = new Map<string, string>();
    const assignedToMap = new Map<string, string>();

    allTasks.forEach((task) => {
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
  }, [allTasks]);

  // Filter/sort handlers
  const handleSortChange = useCallback((field: string | null, order: "asc" | "desc" | null) => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  const handleFilterChange = useCallback((filter: FilterOption) => {
    setActiveFilter(filter);
  }, []);

  // Apply filters and sorting
  const filteredTasks = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let filtered: TasksOverviewListItem[] = [];

    // Apply quick filter first (determines base list)
    switch (activeFilter) {
      case "due":
        // All open tasks with due dates
        filtered = allTasks.filter((task) => task.dueDate && task.status !== "done");
        break;
      case "completed":
        // All completed tasks
        filtered = allTasks.filter((task) => task.status === "done");
        break;
      case "overdue":
        // Tasks past their due date (not completed)
        filtered = allTasks.filter(
          (task) => task.dueDate && task.dueDate < todayStart && task.status !== "done"
        );
        break;
      case "mine":
        // All tasks assigned to OR created by current user (including completed)
        filtered = user?.userId 
          ? allTasks.filter((task) => 
              task.assigneeId === user.userId || task.createdById === user.userId
            )
          : allTasks;
        break;
      case "all":
      default:
        // All tasks (open + completed)
        filtered = allTasks;
        break;
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.projectName?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
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

    // Sorting
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
        } else {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
      });
    }

    return filtered;
  }, [
    allTasks,
    searchQuery,
    activeFilter,
    sortField,
    sortOrder,
    user?.userId,
    assignedByFilter,
    assignedToFilter,
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
    return tasksWithLocation.map((task) => ({
      id: task.id,
      lat: task.parsedLocation.lat,
      lng: task.parsedLocation.lng,
      iconUrl: buildMarkerThumbnail(task.projectColor),
      title: task.title,
      isActive: task.id === activeTaskId,
    }));
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

    setMapFocus(locatedTask.parsedLocation);

    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => setMapFocus(null), 420);
    return () => window.clearTimeout(timeout);
  }, [activeTaskId, tasksWithLocation, open]);

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

  const handleMarkDone = useCallback(async (task: TasksOverviewListItem) => {
    try {
      await updateTask({
        projectId: task.projectId,
        taskId: task.taskId ?? task.id,
        title: task.title,
        status: 'done'
      });
      refreshTasks();
      notify('success', 'Task marked as done');
    } catch (error) {
      console.error('Failed to mark task as done:', error);
      notify('error', 'Failed to mark task as done');
    }
  }, [refreshTasks]);

  const handleOpenQuickCreate = useCallback(() => {
    if (isDesktop) {
      setDetailsTask(null);
      setDetailsPanelOpen(true);
    } else {
      setTaskToEdit(null);
      setQuickCreateOpen(true);
    }
  }, [isDesktop]);

  const handleCloseQuickCreate = useCallback(() => {
    setTaskToEdit(null);
    setQuickCreateOpen(false);
  }, []);

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

  const statusContext = useMemo(() => createTaskStatusContext(), []);

  const BADGE_CLASS_BY_TONE = {
    success: "statusBadgeSuccess",
    danger: "statusBadgeDanger",
    warning: "statusBadgeWarning",
    neutral: "statusBadgeNeutral",
  } as const;

  const formatStatValue = (value: number): string | number => {
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

  if (!open || typeof document === "undefined") {
    return null;
  }

  const hasMapMarkers = mapMarkers.length > 0;
  const overlayClassName = isDesktop
    ? `${styles.sheetOverlay} ${styles.desktopOverlay}`
    : styles.sheetOverlay;
  const sheetClassName = isDesktop 
    ? `${styles.sheet} ${styles.desktopSheet} ${detailsPanelOpen ? styles.dimmed : ''}`
    : styles.sheet;
  const drawerInitial = isDesktop ? { x: "-100%" } : { y: viewportHeight };
  const drawerAnimate = isDesktop ? { x: 0 } : { y: targetY };
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
                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={onClose}
                    aria-label="Back to project"
                    title="Back to project"
                  >
                    <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
                    <span className={styles.backButtonLabel}>Back to project</span>
                  </button>
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
                <div className={styles.sheetTitleGroup} style={{ padding: '0 1.75rem 1.25rem' }}>
                  <span className={styles.sheetTitle}>All tasks</span>
                  <span className={styles.sheetSubtitle}>Review everything on your radar</span>
                </div>
                <div className={`${styles.sheetSummary} ${styles.desktopDrawerSummary}`}>
                  <TaskSummary stats={stats} formatValue={formatStatValue} statusMessage={statusMessage} statusStyle={{ textAlign: 'center' }} />
                </div>
              </>
            ) : (
              <>
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
                <header className={styles.sheetHeader}>
                  <div className={styles.sheetTitleGroup}>
                    <span className={styles.sheetTitle}>All tasks</span>
                    <span className={styles.sheetSubtitle}>Tasks across all your projects</span>
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
              <div
                className={`${desktopFilterStyles.filterField} ${desktopFilterStyles.filterSelect}`}
                style={{ width: "auto", flex: "1 1 140px", minWidth: "120px" }}
              >
                <select
                  value={activeFilter}
                  onChange={(e) => handleFilterChange(e.target.value as FilterOption)}
                  className={desktopFilterStyles.filterSelectControl}
                  aria-label="Quick task filter"
                >
                  <option value="all">All</option>
                  <option value="due">Due</option>
                  <option value="completed">Completed</option>
                  <option value="overdue">Overdue</option>
                  <option value="mine">Mine</option>
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={desktopFilterStyles.filterSelectChevron}
                />
              </div>

              {assignedByOptions.length > 0 && (
                <div
                  className={`${desktopFilterStyles.filterField} ${desktopFilterStyles.filterSelect}`}
                  style={{ width: "auto", flex: "1 1 180px", minWidth: "140px" }}
                >
                  <select
                    value={assignedByFilter ?? ""}
                    onChange={(event) => setAssignedByFilter(event.target.value || null)}
                    className={desktopFilterStyles.filterSelectControl}
                    aria-label="Filter tasks by creator"
                  >
                    <option value="">All creators</option>
                    {assignedByOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={desktopFilterStyles.filterSelectChevron}
                  />
                </div>
              )}

              {assignedToOptions.length > 0 && (
                <div
                  className={`${desktopFilterStyles.filterField} ${desktopFilterStyles.filterSelect}`}
                  style={{ width: "auto", flex: "1 1 180px", minWidth: "140px" }}
                >
                  <select
                    value={assignedToFilter ?? ""}
                    onChange={(event) => setAssignedToFilter(event.target.value || null)}
                    className={desktopFilterStyles.filterSelectControl}
                    aria-label="Filter tasks by assignee"
                  >
                    <option value="">All assignees</option>
                    {assignedToOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={desktopFilterStyles.filterSelectChevron}
                  />
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
                className={`${desktopFilterStyles.filterField} ${desktopFilterStyles.filterSelect}`}
                style={{ width: "auto", flex: "1 1 160px", minWidth: "140px" }}
              >
                <select
                  value={sortField && sortOrder ? `${sortField}-${sortOrder}` : "default"}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "default") {
                      handleSortChange(null, null);
                    } else {
                      const [field, order] = value.split("-");
                      handleSortChange(field, order as "asc" | "desc");
                    }
                  }}
                  className={desktopFilterStyles.filterSelectControl}
                  aria-label="Sort tasks"
                >
                  <option value="default">Default order</option>
                  <option value="dueDate-asc">Due Date (Earliest)</option>
                  <option value="dueDate-desc">Due Date (Latest)</option>
                  <option value="title-asc">Title (A→Z)</option>
                  <option value="title-desc">Title (Z→A)</option>
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={desktopFilterStyles.filterSelectChevron}
                />
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
                        statusContext
                      );
                      const tone = getTaskStatusTone(category);
                      const badgeClassKey = BADGE_CLASS_BY_TONE[tone];
                      const badgeToneClass = badgeClassKey ? styles[badgeClassKey] : undefined;
                      const badgeClassName = [styles.statusBadge, badgeToneClass].filter(Boolean).join(" ");

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
                                  {task.projectName || task.title}
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
                                <span className={badgeClassName}>{label}</span>
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
                               {task.title}
                             </span>
                            <span className={styles.metaLine}>
                              <Calendar size={14} aria-hidden="true" /> {formatDueLabel(task)}
                            </span>
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
                                  >
                                    Open in Google Maps
                                  </a>
                                </span>
                              );
                            })() : null}
                            <button
                              type="button"
                              className={styles.markDoneButton}
                              onClick={() => handleMarkDone(task)}
                              aria-label="Mark task as done"
                            >
                              Mark done
                            </button>
                          </div>
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
          onCreated={() => refreshTasks()}
          onUpdated={() => refreshTasks()}
          onDeleted={() => {
            notify('success', 'Task deleted successfully');
            refreshTasks();
          }}
          task={taskToEdit}
        />
      )}
    </>
  );
};

export default GlobalTaskDrawer;
