import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, MapPin, Plus, User, X } from "lucide-react";
import { motion } from "framer-motion";

import MapComponent from "@/shared/ui/Map";
import { useTasksOverview, type TasksOverviewListItem } from "../hooks/useTasksOverview";
import QuickCreateTaskModal, { type QuickCreateTaskModalTask } from "./QuickCreateTaskModal";
import { buildDirectionsLinks } from "@/dashboard/project/components/Tasks/utils";
import TaskSummary from "@/dashboard/project/components/Tasks/components/TaskSummary";
import TaskMobileFilter, { type FilterOption } from "./TaskMobileFilter";
import { useUser } from "@/app/contexts/useUser";

import styles from "@/dashboard/project/components/Tasks/TasksComponentMobile.module.css";

type TaskMapMarker = {
  id: string;
  lat: number;
  lng: number;
  iconUrl: string;
  title: string;
  isActive: boolean;
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

  const [isDesktop, setIsDesktop] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(getViewportHeight());
  const [snapIndex, setSnapIndex] = useState<SnapIndex>(2);
  const [isDragging, setIsDragging] = useState(false);
  const [currentDragY, setCurrentDragY] = useState(0);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<QuickCreateTaskModalTask | null>(null);

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

  // Filter/sort handlers
  const handleSortChange = useCallback((field: string | null, order: "asc" | "desc" | null) => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  const handleFilterChange = useCallback((filter: FilterOption) => {
    setActiveFilter(filter);
  }, []);

  // Get unique users for filters
  const assignedByOptions = useMemo(() => {
    const uniqueUsers = new Map<string, { id: string; name: string }>();
    allTasks.forEach((task) => {
      if (task.createdById && task.createdByName) {
        uniqueUsers.set(task.createdById, { id: task.createdById, name: task.createdByName });
      }
    });
    return Array.from(uniqueUsers.values());
  }, [allTasks]);

  const assignedToOptions = useMemo(() => {
    const uniqueUsers = new Map<string, { id: string; name: string }>();
    allTasks.forEach((task) => {
      if (task.assigneeId && task.assigneeName) {
        uniqueUsers.set(task.assigneeId, { id: task.assigneeId, name: task.assigneeName });
      }
    });
    return Array.from(uniqueUsers.values());
  }, [allTasks]);

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
        // All tasks assigned to current user (including completed)
        filtered = user?.userId 
          ? allTasks.filter((task) => task.assigneeId === user.userId)
          : allTasks;
        break;
      case "all":
      default:
        // All non-completed tasks
        filtered = allTasks.filter((task) => task.status !== "done");
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

    // Assigned by filter
    if (assignedByFilter) {
      filtered = filtered.filter((task) => task.createdById === assignedByFilter);
    }

    // Assigned to filter
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
  }, [allTasks, searchQuery, activeFilter, assignedByFilter, assignedToFilter, sortField, sortOrder, user?.userId]);

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

  const selectedTask = useMemo(
    () => filteredTasks.find((task) => task.id === activeTaskId) ?? null,
    [filteredTasks, activeTaskId],
  );

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

  const selectedTaskDirections = selectedTask?.address ? buildDirectionsLinks(selectedTask.address) : null;

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

  const handleTaskSelect = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    setSnapIndex((current) => (current === 0 ? 1 : current));
  }, []);

  const handleMarkerClick = useCallback((markerId: string) => {
    setActiveTaskId(markerId);
    setSnapIndex(1);
  }, []);

  const handleOpenQuickCreate = useCallback(() => {
    setTaskToEdit(null);
    setQuickCreateOpen(true);
  }, []);

  const handleCloseQuickCreate = useCallback(() => {
    setTaskToEdit(null);
    setQuickCreateOpen(false);
  }, []);

  const formatDueLabel = useCallback((task: TasksOverviewListItem): string => {
    if (!task.dueDate) return "No due date";
    const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", weekday: "short" });
    const formatted = formatter.format(task.dueDate);
    return task.timeLabel ? `${formatted} · ${task.timeLabel}` : formatted;
  }, []);

  const formatStatValue = (value: number): string | number => {
    if (error) return "—";
    if (loading) return "…";
    return value;
  };

  const mapStatusMessage = tasksWithLocation.length > 0
    ? `${tasksWithLocation.length} ${tasksWithLocation.length === 1 ? "task" : "tasks"} on the map`
    : "Add locations to tasks to see them on the map";

  const statusMessage = filteredTasks.length > 0
    ? `${filteredTasks.length} ${filteredTasks.length === 1 ? "task" : "tasks"} in your list`
    : "No tasks to show";

  if (!open || typeof document === "undefined") {
    return null;
  }

  const hasMapMarkers = mapMarkers.length > 0;
  const overlayClassName = isDesktop
    ? `${styles.sheetOverlay} ${styles.desktopOverlay}`
    : styles.sheetOverlay;
  const sheetClassName = isDesktop ? `${styles.sheet} ${styles.desktopSheet}` : styles.sheet;
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
            {selectedTask && (
              <div className={styles.mapActiveCard}>
                <span className={styles.mapActiveTitle}>{selectedTask.title}</span>
                <div className={styles.mapActiveMeta}>
                  <span className={styles.metaLine}>
                    <Calendar size={14} aria-hidden="true" /> {formatDueLabel(selectedTask)}
                  </span>
                  {selectedTask.projectName && (
                    <span className={styles.metaLine}>
                      <span
                        className={styles.projectDot}
                        style={{ backgroundColor: selectedTask.projectColor || "#fa3356" }}
                        aria-hidden="true"
                      />
                      {selectedTask.projectName}
                    </span>
                  )}
                  {selectedTask.address && (
                    <span className={`${styles.metaLine} ${styles.metaLineAddress}`}>
                      <MapPin size={14} aria-hidden="true" />
                      <span className={styles.addressDetails}>
                        <span className={styles.addressText}>{selectedTask.address}</span>
                        {selectedTaskDirections && (
                          <span className={styles.addressActions}>
                            <a
                              href={selectedTaskDirections.appleMaps}
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
                              href={selectedTaskDirections.googleMaps}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.addressLink}
                            >
                              Open in Google Maps
                            </a>
                          </span>
                        )}
                      </span>
                    </span>
                  )}
                  {selectedTask.assigneeName && (
                    <span className={styles.metaLine}>
                      <User size={14} aria-hidden="true" /> Assigned to: {selectedTask.assigneeName}
                    </span>
                  )}
                </div>
              </div>
            )}
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
                  <div className={styles.sheetTitleGroup}>
                    <span className={styles.sheetTitle}>All tasks</span>
                    <span className={styles.sheetSubtitle}>Tasks across all your projects</span>
                  </div>
                  <div className={styles.desktopDrawerActions}>
                    <button
                      type="button"
                      className={`${styles.desktopDrawerButton} ${styles.desktopDrawerGhostButton}`}
                      onClick={onClose}
                    >
                      <X size={16} strokeWidth={2.25} aria-hidden="true" /> Close map
                    </button>
                    <button
                      type="button"
                      className={`${styles.desktopDrawerButton} ${styles.desktopDrawerPrimaryButton}`}
                      onClick={handleOpenQuickCreate}
                      disabled={loading || !projectOptions.length}
                    >
                      <Plus size={16} strokeWidth={2.25} aria-hidden="true" /> New task
                    </button>
                  </div>
                </header>
                <div className={`${styles.sheetSummary} ${styles.desktopDrawerSummary}`}>
                  <TaskSummary stats={stats} formatValue={formatStatValue} statusMessage={statusMessage} />
                  <p className={styles.desktopDrawerMapStatus}>{mapStatusMessage}</p>
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
            <div className={`${styles.sheetScrollArea} ${isDesktop ? styles.desktopDrawerScrollArea : ""}`}>
              <section className={styles.sheetSection} aria-label="All tasks">
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionHeading}>Task list</h3>
                  <TaskMobileFilter
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    sortField={sortField}
                    sortOrder={sortOrder}
                    onSortChange={handleSortChange}
                    activeFilter={activeFilter}
                    onFilterChange={handleFilterChange}
                    assignedByFilter={assignedByFilter}
                    onAssignedByFilterChange={setAssignedByFilter}
                    assignedByOptions={assignedByOptions}
                    assignedToFilter={assignedToFilter}
                    onAssignedToFilterChange={setAssignedToFilter}
                    assignedToOptions={assignedToOptions}
                    statusFilter={null}
                    onStatusFilterChange={() => {}}
                  />
                </div>
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
                      const isOverdue = task.dueDate && task.dueDate < new Date() && task.status !== "done";
                      const badgeClassName = isOverdue ? `${styles.statusBadge} ${styles.statusBadgeDanger}` : styles.statusBadge;
                      
                      return (
                        <li
                          key={task.id}
                          data-task-id={task.id}
                          className={listItemClassName}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            className={styles.taskButton}
                            onClick={() => handleTaskSelect(task.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleTaskSelect(task.id);
                              }
                            }}
                          >
                            <div className={styles.taskTitleRow}>
                              <span className={styles.taskTitle}>{task.title}</span>
                              {isOverdue && <span className={badgeClassName}>Overdue</span>}
                            </div>
                            <div className={styles.taskMeta}>
                              <span className={styles.metaLine}>
                                <Calendar size={14} aria-hidden="true" /> {formatDueLabel(task)}
                              </span>
                              {task.projectName && (
                                <span className={styles.metaLine}>
                                  <span
                                    className={styles.projectDot}
                                    style={{ backgroundColor: task.projectColor || "#fa3356" }}
                                    aria-hidden="true"
                                  />
                                  {task.projectName}
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
                              {task.assigneeName && (
                                <span className={styles.metaLine}>
                                  <User size={14} aria-hidden="true" /> {task.assigneeName}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </motion.div>
        </div>,
        document.body,
      )}
      <QuickCreateTaskModal
        open={quickCreateOpen}
        onClose={handleCloseQuickCreate}
        projects={projectOptions}
        onCreated={refreshTasks}
        onUpdated={refreshTasks}
        onDeleted={refreshTasks}
        task={taskToEdit}
      />
    </>
  );
};

export default GlobalTaskDrawer;
