import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

import {
  useTasksOverview,
  type TasksOverviewListItem,
} from "../hooks/useTasksOverview";
import QuickCreateTaskModal, {
  type QuickCreateTaskModalTask,
} from "../components/QuickCreateTaskModal";
import TaskMobileFilter, { type FilterOption } from "../components/TaskMobileFilter";
import { endOfWeek, startOfWeek } from "@/dashboard/home/utils/dateUtils";
import { useUser } from "@/app/contexts/useUser";
import styles from "./TasksListPage.module.css";

const dayLabelFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

const dueFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  weekday: "short",
});

function formatDateLabel(date: Date | null | undefined, timeLabel?: string): string {
  if (!date) return "No due date";
  const formatted = dueFormatter.format(date);
  return timeLabel ? `${formatted} · ${timeLabel}` : formatted;
}

type TaskListProps = {
  tasks: TasksOverviewListItem[];
  emptyLabel: string;
  onStart?: (task: TasksOverviewListItem) => void;
  showCompleted?: boolean;
  onSelect?: (task: TasksOverviewListItem) => void;
  onMarkDone?: (task: TasksOverviewListItem) => void;
};

const TaskList: React.FC<TaskListProps> = ({ tasks, emptyLabel, onStart, showCompleted, onSelect, onMarkDone }) => {
  if (!tasks.length) {
    return <div className={styles.sectionEmpty}>{emptyLabel}</div>;
  }

  return (
    <ul className={styles.taskList}>
      {tasks.map((task) => {
        const displayDate = showCompleted ? task.completedAt ?? task.dueDate : task.dueDate;
        const displayTimeLabel = showCompleted
          ? task.completedTimeLabel ?? task.timeLabel
          : task.timeLabel;

        return (
          <li key={task.id} className={styles.taskItem}>
            <button
              type="button"
              className={`${styles.taskMain} ${styles.taskButton}`}
              onClick={onSelect ? () => onSelect(task) : undefined}
              disabled={!onSelect}
            >
              <span
                className={styles.projectDot}
                style={{ backgroundColor: task.projectColor || "var(--brand, #fa3356)" }}
                aria-hidden="true"
              />
              <div className={styles.taskMeta}>
                <span className={styles.taskTitle} title={task.title}>
                  {task.title}
                </span>
                <span className={styles.taskDetails}>
                  {task.projectName}
                  {task.projectName && (displayDate || displayTimeLabel) ? " · " : ""}
                  {formatDateLabel(displayDate, displayTimeLabel)}
                </span>
                {(task.createdByName || task.assigneeName) && (
                  <div className={styles.taskAssignmentRow}>
                    {task.createdByName ? (
                      <span className={styles.taskAssignmentItem}>
                        <span className={styles.taskAssignmentLabel}>Assigned by</span>
                        <span className={styles.taskAssignmentValue}>{task.createdByName}</span>
                      </span>
                    ) : null}
                    {task.assigneeName ? (
                      <span className={styles.taskAssignmentItem}>
                        <span className={styles.taskAssignmentLabel}>Assigned to</span>
                        <span className={styles.taskAssignmentValue}>{task.assigneeName}</span>
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </button>
            <div className={styles.taskActions}>
              {showCompleted ? (
                <span className={styles.completedTag}>Completed</span>
              ) : (
                <>
                  {onStart && (
                    <button type="button" className={styles.startButton} onClick={() => onStart(task)}>
                      Open project
                    </button>
                  )}
                  {onMarkDone && (
                    <button type="button" className={styles.markDoneButton} onClick={() => onMarkDone(task)}>
                      Mark as Done
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

const TasksListPage: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useUser();
  const locationState = (location.state as { from?: string; projectId?: string } | undefined) ?? undefined;
  const returnTo = locationState?.from;
  const [taskToEdit, setTaskToEdit] = useState<QuickCreateTaskModalTask | null>(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("all");
  const [assignedByFilter, setAssignedByFilter] = useState<string | null>(null);
  const [assignedToFilter, setAssignedToFilter] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    const { style } = document.body;
    const originalOverflow = style.overflow;
    style.overflow = "hidden";
    return () => {
      style.overflow = originalOverflow;
    };
  }, [mounted]);

  const handleClose = useCallback(() => {
    if (returnTo) {
      navigate(returnTo, { replace: true });
      return;
    }

    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard/projects");
    }
  }, [navigate, returnTo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  const onOverlayMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  const {
    loading,
    error,
    stats,
    openTasks,
    undatedTasks,
    completedThisWeek,
    completedTasks,
    navigateToProject,
    refreshTasks,
    projectOptions,
    markTaskDone,
  } = useTasksOverview();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Build assignment filter options from tasks
  const { assignedByOptions, assignedToOptions } = useMemo(() => {
    const assignedByMap = new Map<string, string>();
    const assignedToMap = new Map<string, string>();
    [...openTasks, ...undatedTasks, ...completedTasks].forEach((task) => {
      const assignedByValue = task.createdById ?? task.createdByName;
      if (assignedByValue) {
        const assignedByLabel = task.createdByName ?? assignedByValue;
        assignedByMap.set(assignedByValue, assignedByLabel);
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
  }, [openTasks, undatedTasks, completedTasks]);

  const handleSortChange = useCallback((field: string | null, order: "asc" | "desc" | null) => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  const handleFilterChange = useCallback((filter: FilterOption) => {
    setActiveFilter(filter);
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
    }),
    [],
  );

  const handleTaskEdit = useCallback(
    (task: TasksOverviewListItem) => {
      setTaskToEdit(toModalTask(task));
      setIsCreateModalOpen(true);
    },
    [toModalTask],
  );

  const handleMarkDone = useCallback(
    async (task: TasksOverviewListItem) => {
      await markTaskDone(task.id);
    },
    [markTaskDone],
  );

  const openCreateModal = useCallback(() => {
    setTaskToEdit(null);
    setIsCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    setTaskToEdit(null);
    setIsCreateModalOpen(false);
  }, []);

  const { overdueTasks, dueSoonTasks, upcomingTasks } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = endOfWeek(now);

    const overdue: TasksOverviewListItem[] = [];
    const dueSoon: TasksOverviewListItem[] = [];
    const upcoming: TasksOverviewListItem[] = [];

    openTasks.forEach((task) => {
      const due = task.dueDate;
      if (!due) return;

      if (due < todayStart) {
        overdue.push(task);
      } else if (due <= weekEnd) {
        dueSoon.push(task);
      } else {
        upcoming.push(task);
      }
    });

    return { overdueTasks: overdue, dueSoonTasks: dueSoon, upcomingTasks: upcoming };
  }, [openTasks]);

  // Unified filtered and sorted task list
  const filteredAndSortedTasks = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);

    let tasks: TasksOverviewListItem[] = [];

    // Apply filter
    switch (activeFilter) {
      case "due":
        // All tasks with due dates (not completed)
        tasks = [...overdueTasks, ...dueSoonTasks, ...upcomingTasks];
        break;
      case "completed":
        // All completed tasks
        tasks = completedTasks;
        break;
      case "overdue":
        tasks = overdueTasks;
        break;
      case "mine":
        // Include ALL tasks (active + completed) assigned to user
        tasks = [...openTasks, ...undatedTasks, ...completedTasks].filter(
          (t) => t.assigneeId === userId
        );
        break;
      case "all":
      default:
        tasks = [...openTasks, ...undatedTasks];
        break;
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.projectName?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
      );
    }

    // Apply assignment filters
    if (assignedByFilter) {
      tasks = tasks.filter(
        (task) => (task.createdById ?? task.createdByName) === assignedByFilter,
      );
    }
    if (assignedToFilter) {
      tasks = tasks.filter((task) => task.assigneeId === assignedToFilter);
    }

    // Apply project filter (from location state)
    const projectFilterId = locationState?.projectId;
    if (projectFilterId) {
      tasks = tasks.filter((task) => task.projectId === projectFilterId);
    }

    // Apply sorting
    if (sortField && sortOrder) {
      tasks = [...tasks].sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortField) {
          case "dueDate":
            aValue = a.dueDate?.getTime() ?? Infinity;
            bValue = b.dueDate?.getTime() ?? Infinity;
            break;
          case "title":
            aValue = a.title.toLowerCase();
            bValue = b.title.toLowerCase();
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
        if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    return tasks;
  }, [
    activeFilter,
    searchQuery,
    assignedByFilter,
    assignedToFilter,
    sortField,
    sortOrder,
    dueSoonTasks,
    upcomingTasks,
    undatedTasks,
    completedTasks,
    overdueTasks,
    openTasks,
    locationState,
    userId,
  ]);

  

  const dueSoonGroups = useMemo(() => {
    const map = new Map<string, { label: string; tasks: TasksOverviewListItem[] }>();

    dueSoonTasks.forEach((task) => {
      if (!task.dueDate) return;
      const key = `${task.dueDate.getFullYear()}-${task.dueDate.getMonth()}-${task.dueDate.getDate()}`;
      const label = dayLabelFormatter.format(task.dueDate);
      const entry = map.get(key) ?? { label, tasks: [] };
      entry.tasks.push(task);
      map.set(key, entry);
    });

    return Array.from(map.values());
  }, [dueSoonTasks]);

  // Optional project filter: if the caller passed a projectId in location.state, show only that project's tasks
  const projectFilterId = (location.state as { projectId?: string } | undefined)?.projectId ?? undefined;
  const projectFilterName = projectFilterId
    ? projectOptions.find((p) => p.id === projectFilterId)?.name
    : undefined;

  const showCompleted = activeFilter === "completed";
  const hasAnyTask = filteredAndSortedTasks.length > 0;

  const introMessage = projectFilterId
    ? `Viewing tasks for ${projectFilterName ?? "this project"}. Review and kick off the next task.`
    : projectOptions.length
    ? "Review everything on your radar and kick off the next task for whichever project needs attention."
    : "Review everything on your radar and add tasks whenever you have a project to assign them to.";

  const getFilterLabel = () => {
    switch (activeFilter) {
      case "due":
        return "Tasks with due dates";
      case "completed":
        return "Completed tasks";
      case "overdue":
        return "Overdue tasks";
      case "mine":
        return "My tasks";
      default:
        return "All tasks";
    }
  };

  const titleId = "tasks-drawer-title";

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const drawer = (
    <div className={styles.drawerOverlay} role="presentation" onMouseDown={onOverlayMouseDown}>
      <div
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.drawerHeader}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close tasks"
          >
            <ChevronDown size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className={styles.drawerContent}>
          <div className={styles.container}>
            <header className={styles.header}>
              <div className={styles.headingGroup}>
                <h1 id={titleId} className={styles.title}>
                  All tasks
                </h1>
                <p className={styles.subtitle}>{introMessage}</p>
              </div>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={openCreateModal}
                disabled={!projectOptions.length}
                aria-label="Create a task for any project"
              >
                <Plus size={18} strokeWidth={2.5} />
                Create task
              </button>
            </header>

            <section className={styles.statsGrid} aria-label="Task summary">
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Completed this week</span>
                <span className={styles.statValue}>{stats.completed}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Due soon</span>
                <span className={styles.statValue}>{stats.dueSoon}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Overdue</span>
                <span className={styles.statValue}>{stats.overdue}</span>
              </div>
            </section>

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

            {error ? (
              <div className={styles.emptyState}>We couldn't load tasks right now. Please try again later.</div>
            ) : loading ? (
              <div className={styles.emptyState}>Loading your tasks…</div>
            ) : !hasAnyTask ? (
              <div className={styles.emptyState}>
                {activeFilter !== "all" 
                  ? `No tasks matching the filter "${getFilterLabel()}".`
                  : "You don't have any active tasks. Add a task from a project to see it appear here."
                }
              </div>
            ) : (
              <div className={styles.sections}>
                <section className={styles.section} aria-labelledby="tasks-filtered-heading">
                  <span className={styles.sectionAccent} aria-hidden="true" />
                  <div className={styles.sectionTitleRow}>
                    <h2 id="tasks-filtered-heading" className={styles.sectionTitle}>
                      {getFilterLabel()}
                    </h2>
                    <p className={styles.sectionCaption}>
                      {filteredAndSortedTasks.length === 1 
                        ? "1 task" 
                        : `${filteredAndSortedTasks.length} tasks`}
                    </p>
                  </div>
                  <TaskList
                    tasks={filteredAndSortedTasks}
                    emptyLabel={`No tasks matching current filters.`}
                    showCompleted={showCompleted}
                    {...(!projectFilterId && !showCompleted && { 
                      onStart: (task: TasksOverviewListItem) => navigateToProject(task.projectId) 
                    })}
                    onSelect={handleTaskEdit}
                    {...(!showCompleted && { onMarkDone: handleMarkDone })}
                  />
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(drawer, document.body)}
      <QuickCreateTaskModal
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        projects={projectOptions}
        onCreated={() => refreshTasks()}
        onUpdated={() => refreshTasks()}
        onDeleted={() => refreshTasks()}
        task={taskToEdit}
      />
    </>
  );
};

export default TasksListPage;
