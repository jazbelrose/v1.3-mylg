import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui";
import { fetchTasks, updateTask, type Task as ApiTaskPayload } from "@/shared/utils/api";
import QuickCreateTaskModal, {
  type QuickCreateTaskModalProject,
  type QuickCreateTaskModalTask,
} from "@/dashboard/home/components/QuickCreateTaskModal";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  User2,
} from "lucide-react";

import styles from "./TasksComponent.module.css";
import TaskDrawer from "./components/TaskDrawer";
import {
  DEFAULT_LOCATION,
  DRAWER_SNAP_POINTS,
  buildMapMarkers,
  buildMarkerThumbnail,
  computeStats,
  createTaskStatusContext,
  formatDueDate,
  formatDueLabel,
  formatStatusLabel,
  getTaskStatusBadge,
  getViewportHeight,
  isSameDay,
  normalizeTask,
  resolveTaskDueDateIso,
  sortTasksForDrawer,
  type QuickTask,
  type RawTask,
  type TaskMapMarker,
  type TaskStats,
  type SnapIndex,
  type TaskStatusContext,
} from "./components/quickTaskUtils";
import { buildDirectionsLinks, formatAssigneeDisplay } from "./utils";

type StatTone = "ok" | "warn" | "soon";

type StatChipProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: StatTone;
};

const toneClassMap: Record<StatTone, string> = {
  ok: styles.statToneOk,
  warn: styles.statToneWarn,
  soon: styles.statToneSoon,
};

const StatChip: React.FC<StatChipProps> = ({ icon, label, value, tone }) => {
  const toneClass = toneClassMap[tone];

  return (
    <div className={`${styles.statChip} ${toneClass}`}>
      <div className={styles.statChipContent}>
        <div className={styles.statIcon}>{icon}</div>
        <div className={styles.statCopy}>
          <span className={styles.statLabel}>{label}</span>
          <span className={styles.statValue}>{value}</span>
        </div>
      </div>
    </div>
  );
};

type TaskListItemProps = {
  task: QuickTask;
  isActive: boolean;
  onSelect: (taskId: string) => void;
  onEdit: (taskId: string) => void;
  onMarkDone: (taskId: string) => void;
  isMarking: boolean;
  formatDue: (task: QuickTask) => string;
  statusContext: TaskStatusContext;
};

const TaskListItem: React.FC<TaskListItemProps> = ({
  task,
  isActive,
  onSelect,
  onEdit,
  onMarkDone,
  isMarking,
  formatDue,
  statusContext,
}) => {
  const { label: statusLabel, category } = getTaskStatusBadge(task.status, task.dueDate, statusContext);
  const baseStatusLabel = formatStatusLabel(task.status);
  const displayStatusLabel = statusLabel === baseStatusLabel ? statusLabel : `${statusLabel} · ${baseStatusLabel}`;
  const assigneeLabel = formatAssigneeDisplay(task.assignedTo);
  const directionsLinks = buildDirectionsLinks(task.address);
  const isCompleted = typeof task.status === "string" && task.status.toLowerCase() === "done";

  const metaEntries: Array<{ icon: React.ReactNode; label: string }> = [];
  const dueLabel = formatDue(task);
  if (dueLabel) {
    metaEntries.push({ icon: <CalendarDays size={16} aria-hidden="true" />, label: dueLabel });
  }

  if (task.address) {
    metaEntries.push({ icon: <MapPin size={16} aria-hidden="true" />, label: task.address });
  }

  if (assigneeLabel) {
    metaEntries.push({ icon: <User2 size={16} aria-hidden="true" />, label: `Assigned to: ${assigneeLabel}` });
  }

  return (
    <li className={`${styles.taskItem}${isActive ? ` ${styles.taskItemActive}` : ""}`} data-task-id={task.id}>
      <div className={styles.taskContent}>
        <button
          type="button"
          className={styles.taskMain}
          onClick={() => onSelect(task.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(task.id);
            }
          }}
        >
          <div className={styles.taskTitleRow}>
            <span className={styles.taskTitle}>{task.title}</span>
            <span
              className={`${styles.statusBadge}${category === "overdue" ? ` ${styles.statusBadgeDanger}` : ""}`}
            >
              {displayStatusLabel}
            </span>
          </div>
          {metaEntries.length > 0 ? (
            <div className={styles.taskMeta}>
              {metaEntries.map((entry, index) => (
                <span key={`${task.id}-meta-${index}`} className={styles.metaEntry}>
                  {entry.icon}
                  <span>{entry.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </button>
        <div className={styles.taskActions}>
          {directionsLinks ? (
            <Button
              variant="outline"
              size="sm"
              className={`${styles.mapButton} ${styles.buttonWithIcon}`}
              onClick={(event) => {
                event.stopPropagation();
                const url = directionsLinks.googleMaps || directionsLinks.appleMaps;
                if (typeof window !== "undefined") {
                  window.open(url, "_blank", "noopener,noreferrer");
                }
              }}
            >
              Open in Maps
              <ArrowUpRight aria-hidden="true" size={16} />
            </Button>
          ) : null}
          {!isCompleted ? (
            <Button
              size="sm"
              className={styles.accentButton}
              disabled={isMarking}
              aria-busy={isMarking}
              onClick={(event) => {
                event.stopPropagation();
                onMarkDone(task.id);
              }}
            >
              {isMarking ? "Marking…" : "Mark done"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(task.id);
            }}
          >
            Edit task
          </Button>
        </div>
      </div>
    </li>
  );
};

export type TasksComponentProps = {
  projectId?: string;
  projectName?: string;
  projectColor?: string;
};

const TasksComponent: React.FC<TasksComponentProps> = ({
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
  const [snapIndex, setSnapIndex] = useState<SnapIndex>(2);
  const [viewportHeight, setViewportHeight] = useState(() => getViewportHeight());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [currentDragY, setCurrentDragY] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [markingTaskIds, setMarkingTaskIds] = useState<Set<string>>(() => new Set());
  const drawerTaskListRef = useRef<HTMLUListElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneRef = useRef(false);


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

  const isTaskBeingMarked = useCallback((taskId: string) => markingTaskIds.has(taskId), [markingTaskIds]);
  const quickCreateProjects = useMemo<QuickCreateTaskModalProject[]>(() => {
    if (projectId && projectName) {
      return [{ id: projectId, name: projectName }];
    }

    if (tasks.length > 0) {
      const firstTask = tasks[0];
      if (firstTask.projectId) {
        return [{ id: firstTask.projectId, name: firstTask.projectId }];
      }
    }

    return [];
  }, [projectId, projectName, tasks]);

  const hasQuickCreateProject = quickCreateProjects.length > 0;

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
    if (!tasks.length) {
      setActiveTaskId(null);
      return;
    }

    if (!activeTaskId || !tasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(tasks[0].id);
    }
  }, [tasks, activeTaskId]);

  const stats = useMemo<TaskStats>(() => computeStats(tasks), [tasks]);
  const statusContext = useMemo(() => createTaskStatusContext(), []);

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
    if (!drawerOpen || !activeTaskId || !drawerTaskListRef.current) return;
    const container = drawerTaskListRef.current;
    const target = container.querySelector<HTMLLIElement>(`[data-task-id="${activeTaskId}"]`);
    if (!target) return;

    const behavior: ScrollBehavior = initialScrollDoneRef.current ? "smooth" : "auto";
    target.scrollIntoView({ block: "center", behavior });
    initialScrollDoneRef.current = true;
  }, [activeTaskId, drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || typeof document === "undefined") return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

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
        openTaskEditor(taskId);
      } else {
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
    async (taskId: string) => {
      setActiveTaskId(taskId);
      const task = tasks.find((item) => item.id === taskId) ?? null;
      const resolvedProjectId = task?.projectId ?? (projectId ? projectId : null);

      if (!task || !resolvedProjectId) {
        openTaskEditor(taskId, { status: "done" });
        return;
      }

      setTaskMarkingState(taskId, true);

      try {
        const dueDateIso = resolveTaskDueDateIso(task);
        const payload: ApiTaskPayload = {
          projectId: resolvedProjectId,
          taskId,
          title: task.title,
          status: "done",
        };

        if (task.description) {
          payload.description = task.description;
        }

        if (task.assignedTo) {
          payload.assigneeId = task.assignedTo;
        }

        if (dueDateIso) {
          payload.dueDate = dueDateIso;
        }

        const rawBudgetItemId = (task.raw as { budgetItemId?: string | null }).budgetItemId;
        if (typeof rawBudgetItemId === "string") {
          payload.budgetItemId = rawBudgetItemId;
        } else if (rawBudgetItemId === null) {
          payload.budgetItemId = null;
        }

        await updateTask(payload);
        setTasks((currentTasks) =>
          currentTasks.map((currentTask) =>
            currentTask.id === taskId
              ? {
                  ...currentTask,
                  status: "done",
                  raw: { ...currentTask.raw, status: "done" },
                }
              : currentTask,
          ),
        );
      } catch (error) {
        console.error("Failed to mark task done", error);
        try {
          await refreshTasks();
        } catch (refreshError) {
          console.error("Failed to refresh tasks after mark done error", refreshError);
        }
      } finally {
        setTaskMarkingState(taskId, false);
      }
    },
    [tasks, projectId, openTaskEditor, setTaskMarkingState, refreshTasks],
  );

  const handleMarkerClick = useCallback(
    (markerId: string) => {
      handleTaskSelect(markerId);
    },
    [handleTaskSelect],
  );

  const handleOpenDrawer = useCallback(() => {
    setDrawerOpen(true);
    setSnapIndex(2);
    initialScrollDoneRef.current = false;
    setViewportHeight(getViewportHeight());
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSnapIndex(2);
    setMapFocus(null);
    initialScrollDoneRef.current = false;
  }, []);

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
      event.preventDefault();
    }
  }, [isDragging, dragStartY]);

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStartY(null);

      const threshold = viewportHeight * 0.15;
      if (Math.abs(currentDragY) > threshold) {
        if (currentDragY > 0) {
          setSnapIndex((current) => Math.max(0, current - 1) as SnapIndex);
        } else {
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

    const sorted = datedTasks.slice().sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const nextDue = sorted[0];
    const sameDayCount = sorted.filter((task) => isSameDay(task.dueDate, nextDue.dueDate)).length;
    const noun = sameDayCount === 1 ? "task" : "tasks";
    return `${sameDayCount} ${noun} due ${formatDueDate(nextDue.dueDate)}.`;
  }, [error, loading, tasks]);

  const mapStatusMessage = useMemo(() => {
    if (error) return "We couldn’t load task locations.";
    if (loading) return "Loading task locations…";
    if (!mapTasks.length) return "Add locations to your tasks to see them appear here.";
    return `${mapTasks.length === 1 ? "One" : mapTasks.length} task${mapTasks.length === 1 ? "" : "s"} showing on the map.`;
  }, [error, loading, mapTasks.length]);

  const listMetaLabel = useMemo(() => {
    if (error) return "Error";
    if (loading) return "Loading…";
    if (!tasks.length) return "No tasks yet";
    const noun = tasks.length === 1 ? "task" : "tasks";
    return `${tasks.length} ${noun}`;
  }, [error, loading, tasks.length]);

  return (
    <section className={`${styles.panel} tasks-component`} aria-label="Project tasks overview">
      <div className={styles.inner}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h3 className={styles.title}>Tasks</h3>
            <p className={styles.subtitle}>
              {projectName ? `Keep ${projectName} moving forward.` : "Keep this project moving forward."}
            </p>
          </div>
          <div className={styles.actions}>
            <Button
              className={`${styles.accentButton} ${styles.buttonWithIcon}`}
              onClick={handleOpenQuickCreate}
              disabled={loading || !hasQuickCreateProject}
            >
              <Plus aria-hidden="true" size={16} />
              New task
            </Button>
            <Button variant="outline" onClick={handleOpenDrawer} disabled={loading}>
              Open map view
            </Button>
          </div>
        </header>

        <div className={styles.statsRow}>
          <StatChip icon={<CheckCircle2 aria-hidden="true" />} label="Done" value={formatStatValue(stats.completed)} tone="ok" />
          <StatChip icon={<AlertTriangle aria-hidden="true" />} label="Overdue" value={formatStatValue(stats.overdue)} tone="warn" />
          <StatChip icon={<Clock aria-hidden="true" />} label="Due soon" value={formatStatValue(stats.dueSoon)} tone="soon" />
        </div>

        <div className={styles.notice}>
          <span className={styles.noticeStrong}>What to know:</span> {statusMessage}{" "}
          <span className={styles.noticeSubtle}>{mapStatusMessage}</span>
        </div>

        <section className={styles.listSection} aria-label="All project tasks">
          <div className={styles.listHeader}>
            <h4 className={styles.sectionHeading}>Task list</h4>
            <span className={styles.listMeta}>{listMetaLabel}</span>
          </div>
          {error ? (
            <div className={styles.error}>{error}</div>
          ) : loading ? (
            <div className={styles.loading}>Loading tasks…</div>
          ) : tasks.length ? (
            <ul className={styles.taskList}>
              {drawerTasks.map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  isActive={task.id === activeTaskId}
                  onSelect={handleTaskSelect}
                  onEdit={handleEditTask}
                  onMarkDone={handleMarkTaskDone}
                  isMarking={isTaskBeingMarked(task.id)}
                  formatDue={formatDueLabel}
                  statusContext={statusContext}
                />
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>No tasks yet. Create one to get started.</div>
          )}
        </section>

     
      </div>

      <TaskDrawer
        open={drawerOpen}
        isDesktop={isDesktop}
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
        isTaskMarking={isTaskBeingMarked}
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
        taskListRef={drawerTaskListRef}
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

export default TasksComponent;
