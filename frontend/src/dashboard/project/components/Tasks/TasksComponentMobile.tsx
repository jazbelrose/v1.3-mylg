import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchTasks } from "@/shared/utils/api";
import QuickCreateTaskModal, {
  type QuickCreateTaskModalProject,
  type QuickCreateTaskModalTask,
} from "@/dashboard/home/components/QuickCreateTaskModal";
import type { Project } from "@/app/contexts/DataProvider";

import styles from "./TasksComponentMobile.module.css";
import TaskDrawer from "./components/TaskDrawer";
import TaskSummary from "./components/TaskSummary";
import {
  DEFAULT_LOCATION,
  DRAWER_SNAP_POINTS,
  buildMapMarkers,
  buildMarkerThumbnail,
  computeStats,
  formatDueDate,
  formatDueLabel,
  getViewportHeight,
  isSameDay,
  normalizeTask,
  sortTasksForDrawer,
  type QuickTask,
  type RawTask,
  type TaskMapMarker,
  type SnapIndex,
} from "./components/quickTaskUtils";
import { formatAssigneeDisplay } from "./utils";

type TasksComponentMobileProps = {
  projectId?: string;
  projectName?: string;
  projectColor?: string;
  activeProject?: Project;
  onActiveProjectChange?: (updatedProject: Project) => void;
};

const TasksComponentMobile: React.FC<TasksComponentMobileProps> = ({
  projectId = "",
  projectName,
  projectColor,
}) => {
  const [tasks, setTasks] = useState<QuickTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<QuickCreateTaskModalTask | null>(null);
  const [snapIndex, setSnapIndex] = useState<SnapIndex>(1);
  const [viewportHeight, setViewportHeight] = useState(() => getViewportHeight());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [currentDragY, setCurrentDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const taskListRef = useRef<HTMLUListElement | null>(null);
  const initialScrollDoneRef = useRef(false);

  const quickCreateProjects = useMemo<QuickCreateTaskModalProject[]>(() => {
    // Always provide at least the current project for editing tasks
    if (projectId && projectName) {
      return [{ id: projectId, name: projectName }];
    }
    
    // If no project info available, try to extract from tasks
    if (tasks.length > 0) {
      const firstTask = tasks[0];
      if (firstTask.projectId) {
        return [{ id: firstTask.projectId, name: firstTask.projectId }];
      }
    }
    
    // Fallback to allow editing without project constraint
    return [];
  }, [projectId, projectName, tasks]);
  const hasQuickCreateProject = quickCreateProjects.length > 0;

  const handleOpenDrawer = useCallback(() => {
    setDrawerOpen(true);
    // Start the sheet in the mid snap-point so tasks are visible immediately.
    setSnapIndex(1);
    initialScrollDoneRef.current = false;
    setViewportHeight(getViewportHeight());
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSnapIndex(1);
    setActiveTaskId(null);
    setMapFocus(null);
    initialScrollDoneRef.current = false;
  }, []);

  const handleOpenQuickCreate = useCallback(() => {
    if (!hasQuickCreateProject) return;
    setTaskToEdit(null);
    setQuickCreateOpen(true);
  }, [hasQuickCreateProject]);

  const handleCloseQuickCreate = useCallback(() => {
    setTaskToEdit(null);
    setQuickCreateOpen(false);
  }, []);

  const toModalTask = useCallback(
    (task: QuickTask): QuickCreateTaskModalTask => {
      const resolvedProjectId = task.projectId || projectId || "";
      return {
        id: task.id,
        taskId: task.id,
        projectId: resolvedProjectId,
        projectName,
        title: task.title,
        description: task.description ?? undefined,
        dueDate: task.dueDateInput ?? (task.dueDate ? task.dueDate.toISOString() : null),
        status: task.status,
        assigneeId: task.assignedTo ?? undefined,
        address: task.address ?? undefined,
        location: (task.location ?? task.raw?.location) as QuickCreateTaskModalTask["location"],
      };
    },
    [projectId, projectName],
  );

  const refreshTasks = useCallback(async () => {
    if (!projectId) {
      setTasks([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetchTasks(projectId);
      const normalized = (response || [])
        .map((raw: RawTask) => normalizeTask(raw))
        .filter((task): task is QuickTask => Boolean(task));
      setTasks(normalized);
    } catch (err) {
      console.error("Failed to load project tasks", err);
      setError("We couldn't load tasks for this project. Please try again.");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    if (!hasQuickCreateProject) {
      setQuickCreateOpen(false);
    }
  }, [hasQuickCreateProject]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseDrawer();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, handleCloseDrawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    const update = () => setViewportHeight(getViewportHeight());
    update();
    window.addEventListener("resize", update);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || typeof document === "undefined") return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  const stats = useMemo(() => computeStats(tasks), [tasks]);

  const formatStatValue = (value: number): string | number => {
    if (error) return "—";
    if (loading) return "…";
    return value;
  };

  const drawerTasks = useMemo(() => sortTasksForDrawer(tasks), [tasks]);

  const mapTasks = useMemo(
    () => tasks.filter((task) => task.location && !Number.isNaN(task.location.lat) && !Number.isNaN(task.location.lng)),
    [tasks],
  );

  const mapLocation = mapTasks[0]?.location ?? DEFAULT_LOCATION;
  const mapAddress = mapTasks[0]?.address ?? projectName ?? "Project";

  const markerThumbnail = useMemo(() => buildMarkerThumbnail(projectColor), [projectColor]);

  const mapMarkers = useMemo<TaskMapMarker[]>(
    () => buildMapMarkers(mapTasks, markerThumbnail, activeTaskId),
    [mapTasks, markerThumbnail, activeTaskId],
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const existingIds = new Set(drawerTasks.map((task) => task.id));
    if (activeTaskId && existingIds.has(activeTaskId)) {
      return;
    }

    initialScrollDoneRef.current = false;

    if (mapTasks.length) {
      setActiveTaskId(mapTasks[0].id);
    } else if (drawerTasks.length) {
      setActiveTaskId(drawerTasks[0].id);
    } else {
      setActiveTaskId(null);
    }
  }, [drawerOpen, drawerTasks, mapTasks, activeTaskId]);

  useEffect(() => {
    if (!drawerOpen) return;
    if (!activeTaskId) {
      setMapFocus(null);
      return;
    }

    const locatedTask = mapTasks.find((task) => task.id === activeTaskId);
    if (!locatedTask?.location) {
      setMapFocus(null);
      return;
    }

    setMapFocus(locatedTask.location);

    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => setMapFocus(null), 420);
    return () => window.clearTimeout(timeout);
  }, [activeTaskId, mapTasks, drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || !activeTaskId || !taskListRef.current) return;
    const container = taskListRef.current;
    const target = container.querySelector<HTMLLIElement>(`[data-task-id="${activeTaskId}"]`);
    if (!target) return;

    const behavior: ScrollBehavior = initialScrollDoneRef.current ? "smooth" : "auto";
    target.scrollIntoView({ block: "center", behavior });
    initialScrollDoneRef.current = true;
  }, [activeTaskId, drawerOpen]);

  const sheetHeights = useMemo(() => DRAWER_SNAP_POINTS.map((point) => viewportHeight * point), [viewportHeight]);
  const baseTargetY = viewportHeight ? viewportHeight - sheetHeights[snapIndex] : 0;
  const targetY = isDragging ? baseTargetY + currentDragY : baseTargetY;
  const selectedTask = useMemo(
    () => drawerTasks.find((task) => task.id === activeTaskId) ?? null,
    [drawerTasks, activeTaskId],
  );
  const selectedAssigneeName = formatAssigneeDisplay(selectedTask?.assignedTo);

  const openTaskEditor = useCallback(
    (taskId: string, overrides?: Partial<QuickCreateTaskModalTask>) => {
      const match = drawerTasks.find((task) => task.id === taskId) ?? tasks.find((task) => task.id === taskId);
      if (!match) return;

      const modalTask = toModalTask(match);
      setTaskToEdit(overrides ? { ...modalTask, ...overrides } : modalTask);
      setQuickCreateOpen(true);
    },
    [drawerTasks, tasks, toModalTask],
  );

  const handleTaskSelect = useCallback(
    (taskId: string) => {
      if (activeTaskId === taskId) {
        // Second tap on already selected task - open edit modal
        openTaskEditor(taskId);
      } else {
        // First tap - select task and show on map
        setActiveTaskId(taskId);
        setSnapIndex((current) => (current === 0 ? 1 : current));
      }
    },
    [activeTaskId, openTaskEditor],
  );

  const handleEditTask = useCallback(
    (taskId: string) => {
      setActiveTaskId(taskId);
      openTaskEditor(taskId);
    },
    [openTaskEditor],
  );

  const handleMarkTaskDone = useCallback(
    (taskId: string) => {
      setActiveTaskId(taskId);
      openTaskEditor(taskId, { status: "done" });
    },
    [openTaskEditor],
  );

  const handleMarkerClick = useCallback(
    (markerId: string) => {
      handleTaskSelect(markerId);
    },
    [handleTaskSelect],
  );

  const handleHandleClick = useCallback(() => {
    setSnapIndex((current) => {
      if (current === 2) return 1;
      if (current === 1) return 2;
      return 1;
    });
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 1) {
      setIsDragging(true);
      setDragStartY(event.touches[0].clientY);
      setCurrentDragY(0);
    }
  }, []);

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    if (isDragging && dragStartY !== null && event.touches.length === 1) {
      const deltaY = event.touches[0].clientY - dragStartY;
      setCurrentDragY(deltaY);
      // Prevent scrolling while dragging
      event.preventDefault();
    }
  }, [isDragging, dragStartY]);

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStartY(null);
      
      // Snap to nearest position based on drag distance
      const threshold = viewportHeight * 0.15; // 15% of viewport
      if (Math.abs(currentDragY) > threshold) {
        if (currentDragY > 0) {
          // Dragged down - go to lower snap point
          setSnapIndex((current) => Math.max(0, current - 1) as SnapIndex);
        } else {
          // Dragged up - go to higher snap point
          setSnapIndex((current) => Math.min(2, current + 1) as SnapIndex);
        }
      }
      
      setCurrentDragY(0);
    }
  }, [isDragging, currentDragY, viewportHeight]);

  const statusMessage = useMemo(() => {
    if (error) return "We couldn’t load tasks right now.";
    if (loading) return "Loading tasks…";
    if (!tasks.length) return "No tasks for this project yet.";

    const openTasks = tasks.filter((task) => task.status !== "done");
    if (!openTasks.length) return "You're all caught up.";

    const datedTasks = openTasks.filter((task): task is QuickTask & { dueDate: Date } => Boolean(task.dueDate));
    if (!datedTasks.length) {
      const noun = openTasks.length === 1 ? "task" : "tasks";
      return `${openTasks.length} open ${noun} with no due date yet.`;
    }

    const sorted = datedTasks
      .slice()
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const nextDue = sorted[0];
    const sameDayCount = sorted.filter((task) => isSameDay(task.dueDate, nextDue.dueDate)).length;
    const noun = sameDayCount === 1 ? "task" : "tasks";
    return `${sameDayCount} ${noun} due ${formatDueDate(nextDue.dueDate)}.`;
  }, [error, loading, tasks]);

  const mapStatusMessage = useMemo(() => {
    if (error) return "We couldn’t load task locations.";
    if (loading) return "Loading task locations…";
    return "Add locations to your tasks to see them appear here.";
  }, [error, loading]);

  return (
    <section className={styles.card} aria-label="Project tasks overview">
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <h3 className={styles.title}>Tasks</h3>
          <p className={styles.subtitle}>
            {projectName
              ? `Keep ${projectName} moving forward.`
              : "Keep this project moving forward."}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleOpenDrawer}
            disabled={loading}
          >
            Open tasks
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleOpenQuickCreate}
            aria-label="Quick create a task"
            disabled={loading || !hasQuickCreateProject}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: 'block', flexShrink: 0 }}
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      </header>

      <TaskSummary stats={stats} formatValue={formatStatValue} statusMessage={statusMessage} />

      <TaskDrawer
        open={drawerOpen}
        isDesktop={false}
        viewportHeight={viewportHeight}
        targetY={targetY}
        projectName={projectName}
        mapLocation={mapLocation}
        mapAddress={mapAddress}
        mapMarkers={mapMarkers}
        mapFocus={mapFocus}
        mapStatusMessage={mapStatusMessage}
        hasQuickCreateProject={hasQuickCreateProject}
        loading={loading}
        error={error}
        stats={stats}
        formatValue={formatStatValue}
        statusMessage={statusMessage}
        tasks={drawerTasks}
        activeTaskId={activeTaskId}
        onTaskSelect={handleTaskSelect}
        onTaskEdit={handleEditTask}
        onTaskMarkDone={handleMarkTaskDone}
        formatDueLabel={formatDueLabel}
        selectedTask={selectedTask}
        selectedAssigneeName={selectedAssigneeName}
        onMarkerClick={handleMarkerClick}
        onClose={handleCloseDrawer}
        onOpenQuickCreate={handleOpenQuickCreate}
        onHandleClick={handleHandleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        sheetRef={sheetRef}
        taskListRef={taskListRef}
      />
      <QuickCreateTaskModal
        open={quickCreateOpen}
        onClose={handleCloseQuickCreate}
        projects={quickCreateProjects}
        onCreated={refreshTasks}
        onUpdated={refreshTasks}
        onDeleted={refreshTasks}
        task={taskToEdit}
        activeProjectId={projectId}
        activeProjectName={projectName}
        scopedProjectId={projectId ?? null}
      />
    </section>
  );
};

export default TasksComponentMobile;


