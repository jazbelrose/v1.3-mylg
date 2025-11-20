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
import { endOfWeek } from "@/dashboard/home/utils/dateUtils";
import { useUser } from "@/app/contexts/useUser";
import { notify } from "@/shared/ui/ToastNotifications";
import {
  approveTask,
  archiveTask,
  requestTaskChanges,
  requestTaskReview,
  unarchiveTask,
} from "@/shared/utils/api";
import styles from "./TasksListPage.module.css";

const dueFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  weekday: "short",
});

type StatusFilterOption = "active" | "all" | "archived";

function normalizeUserId(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split("__").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : trimmed;
}

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
  currentUserId?: string | null;
  isAdmin?: boolean;
  statusFilter: StatusFilterOption;
  pendingTaskIds?: Set<string>;
  onSubmitForReview?: (task: TasksOverviewListItem) => void;
  onApproveTask?: (task: TasksOverviewListItem) => void;
  onRequestChanges?: (task: TasksOverviewListItem) => void;
  onArchiveTask?: (task: TasksOverviewListItem) => void;
  onUnarchiveTask?: (task: TasksOverviewListItem) => void;
};

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilterOption; label: string }> = [
  { value: "active", label: "Active" },
  { value: "all", label: "All" },
  { value: "archived", label: "Archived" },
];

const TaskList: React.FC<TaskListProps> = ({
  tasks,
  emptyLabel,
  onStart,
  showCompleted,
  onSelect,
  currentUserId,
  isAdmin,
  statusFilter,
  pendingTaskIds,
  onSubmitForReview,
  onApproveTask,
  onRequestChanges,
  onArchiveTask,
  onUnarchiveTask,
}) => {
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
        const normalizedStatus =
          typeof task.status === "string" ? task.status.toLowerCase() : "todo";
        const isArchived = normalizedStatus === "archived";
        const isDone = normalizedStatus === "done";
        const isInReview = normalizedStatus === "in_review";
        const isNeedsChanges = normalizedStatus === "needs_changes";
        const normalizedUserId = normalizeUserId(currentUserId);
        const normalizedAssignee = normalizeUserId(task.assigneeId);
        const reviewerId = task.reviewerId ?? (task.rawTask as { reviewerId?: string })?.reviewerId;
        const normalizedReviewerId = normalizeUserId(reviewerId);
        const isReviewer = Boolean(
          normalizedReviewerId && normalizedUserId && normalizedReviewerId === normalizedUserId,
        );
        const canSubmitForReview = Boolean(
          onSubmitForReview &&
            normalizedUserId &&
            normalizedAssignee &&
            normalizedAssignee === normalizedUserId &&
            ["todo", "in_progress", "needs_changes"].includes(normalizedStatus),
        );
        const canApprove = Boolean(onApproveTask && (isAdmin || isReviewer) && isInReview);
        const canRequestChanges = Boolean(onRequestChanges && (isAdmin || isReviewer) && isInReview);
        const canArchive = Boolean(onArchiveTask && (isAdmin || isReviewer) && isDone);
        const canUnarchive = Boolean(onUnarchiveTask && (isAdmin || isReviewer) && isArchived);
        const isBusy = pendingTaskIds?.has(task.id);
        const reviewNote = (task.reviewNote ?? (task.rawTask as { reviewNote?: string })?.reviewNote ?? "").trim();
        const reviewerName =
          task.reviewerName ?? (task.rawTask as { reviewerName?: string })?.reviewerName ?? undefined;
        const showReviewBadge = isInReview && statusFilter !== "archived";

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
                {showReviewBadge ? <span className={styles.reviewBadge}>In review</span> : null}
                {isNeedsChanges && reviewNote ? (
                  <div className={styles.reviewNoteBlock}>
                    <div className={styles.reviewNoteLabel}>
                      Changes requested{reviewerName ? ` by ${reviewerName}` : ""}
                    </div>
                    <p className={styles.reviewNoteText}>{reviewNote}</p>
                  </div>
                ) : null}
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
              {(showCompleted || isDone) && !isArchived ? (
                <span className={styles.completedTag}>Completed</span>
              ) : null}
              {isArchived ? (
                <span className={`${styles.completedTag} ${styles.archivedTag}`}>Archived</span>
              ) : null}
              {onStart && !isArchived ? (
                <button type="button" className={styles.startButton} onClick={() => onStart(task)}>
                  Open project
                </button>
              ) : null}
              {canSubmitForReview ? (
                <button
                  type="button"
                  className={styles.markDoneButton}
                  onClick={() => onSubmitForReview?.(task)}
                  disabled={isBusy}
                >
                  {isBusy ? "Working…" : "Submit for review"}
                </button>
              ) : null}
              {canApprove ? (
                <button
                  type="button"
                  className={styles.markDoneButton}
                  onClick={() => onApproveTask?.(task)}
                  disabled={isBusy}
                >
                  {isBusy ? "Working…" : "Mark as done"}
                </button>
              ) : null}
              {canRequestChanges ? (
                <button
                  type="button"
                  className={styles.requestChangesButton}
                  onClick={() => onRequestChanges?.(task)}
                  disabled={isBusy}
                >
                  {isBusy ? "Working…" : "Send back for changes"}
                </button>
              ) : null}
              {canArchive ? (
                <button
                  type="button"
                  className={styles.archiveButton}
                  onClick={() => onArchiveTask?.(task)}
                  disabled={isBusy}
                >
                  {isBusy ? "Working…" : "Archive task"}
                </button>
              ) : null}
              {canUnarchive ? (
                <button
                  type="button"
                  className={styles.unarchiveButton}
                  onClick={() => onUnarchiveTask?.(task)}
                  disabled={isBusy}
                >
                  {isBusy ? "Working…" : "Unarchive"}
                </button>
              ) : null}
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
  const { userId, isAdmin } = useUser();
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
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("active");
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());

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
    completedTasks,
    archivedTasks,
    navigateToProject,
    refreshTasks,
    projectOptions,
  } = useTasksOverview();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Build assignment filter options from tasks
  const { assignedByOptions, assignedToOptions } = useMemo(() => {
    const assignedByMap = new Map<string, string>();
    const assignedToMap = new Map<string, string>();
    [...openTasks, ...undatedTasks, ...completedTasks, ...archivedTasks].forEach((task) => {
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
  }, [archivedTasks, openTasks, undatedTasks, completedTasks]);

  const handleSortChange = useCallback((field: string | null, order: "asc" | "desc" | null) => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  const handleFilterChange = useCallback((filter: FilterOption) => {
    setActiveFilter(filter);
  }, []);

  const handleStatusFilterChange = useCallback((filter: StatusFilterOption) => {
    setStatusFilter(filter);
  }, []);

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
      setTaskPending(task.id, true);
      try {
        await requestTaskReview(identifiers.projectId, identifiers.taskId);
        notify("success", "Task submitted for review!");
        await refreshTasks();
      } catch (error) {
        console.error("Failed to submit task for review", error);
        notify("error", "Failed to submit task for review.");
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending],
  );

  const handleApproveTask = useCallback(
    async (task: TasksOverviewListItem) => {
      const identifiers = resolveTaskIdentifiers(task);
      if (!identifiers) return;
      setTaskPending(task.id, true);
      try {
        await approveTask(identifiers.projectId, identifiers.taskId, { note: "" });
        notify("success", "Task approved and marked as done.");
        await refreshTasks();
      } catch (error) {
        console.error("Failed to approve task", error);
        notify("error", "Failed to approve task.");
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending],
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
      setTaskPending(task.id, true);
      try {
        await requestTaskChanges(identifiers.projectId, identifiers.taskId, { note: trimmed });
        notify(
          "success",
          `Task sent back to ${task.assigneeName ?? "the assignee"} with requested changes.`,
        );
        await refreshTasks();
      } catch (error) {
        console.error("Failed to request task changes", error);
        notify("error", "Failed to send the task back for changes.");
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending],
  );

  const handleArchiveTask = useCallback(
    async (task: TasksOverviewListItem) => {
      const identifiers = resolveTaskIdentifiers(task);
      if (!identifiers) return;
      setTaskPending(task.id, true);
      try {
        await archiveTask(identifiers.projectId, identifiers.taskId);
        notify("success", "Task archived. You can find it under ‘Archived’ if needed.");
        await refreshTasks();
      } catch (error) {
        console.error("Failed to archive task", error);
        notify("error", "Failed to archive task.");
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending],
  );

  const handleUnarchiveTask = useCallback(
    async (task: TasksOverviewListItem) => {
      const identifiers = resolveTaskIdentifiers(task);
      if (!identifiers) return;
      setTaskPending(task.id, true);
      try {
        await unarchiveTask(identifiers.projectId, identifiers.taskId);
        notify("success", "Task unarchived and marked as completed.");
        await refreshTasks();
      } catch (error) {
        console.error("Failed to unarchive task", error);
        notify("error", "Failed to unarchive task.");
      } finally {
        setTaskPending(task.id, false);
      }
    },
    [refreshTasks, resolveTaskIdentifiers, setTaskPending],
  );

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
    let tasks: TasksOverviewListItem[] = [];

    if (statusFilter === "archived") {
      tasks = [...archivedTasks];
    } else {
      switch (activeFilter) {
        case "due":
          tasks = [...overdueTasks, ...dueSoonTasks, ...upcomingTasks];
          break;
        case "completed":
          tasks = completedTasks;
          break;
        case "overdue":
          tasks = overdueTasks;
          break;
        case "mine":
          tasks = [...openTasks, ...undatedTasks, ...completedTasks].filter(
            (t) => t.assigneeId === userId
          );
          break;
        case "all":
        default:
          tasks = [...openTasks, ...undatedTasks];
          break;
      }

      if (statusFilter === "all") {
        tasks = [...tasks, ...archivedTasks];
      }
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
        let aValue: string | number;
        let bValue: string | number;

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
    archivedTasks,
    statusFilter,
  ]);

  

  // Optional project filter: if the caller passed a projectId in location.state, show only that project's tasks
  const projectFilterId = (location.state as { projectId?: string } | undefined)?.projectId ?? undefined;
  const projectFilterName = projectFilterId
    ? projectOptions.find((p) => p.id === projectFilterId)?.name
    : undefined;

  const showCompleted = activeFilter === "completed" && statusFilter !== "archived";
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

  const sectionHeadingLabel = statusFilter === "archived" ? "Archived tasks" : getFilterLabel();

  const emptyStateMessage = statusFilter === "archived"
    ? "You don't have any archived tasks yet."
    : activeFilter !== "all"
      ? `No tasks matching the filter "${getFilterLabel()}".`
      : "You don't have any active tasks. Add a task from a project to see it appear here.";
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
              statusFilter={statusFilter}
              onStatusFilterChange={handleStatusFilterChange}
            />

            <div className={styles.statusFilterRow} role="group" aria-label="Filter tasks by status">
              <span className={styles.statusFilterLabel}>Status</span>
              <div className={styles.statusFilterButtons}>
                {STATUS_FILTER_OPTIONS.map((option) => {
                  const isActiveStatus = statusFilter === option.value;
                  const className = isActiveStatus
                    ? `${styles.statusFilterButton} ${styles.statusFilterButtonActive}`
                    : styles.statusFilterButton;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={className}
                      onClick={() => handleStatusFilterChange(option.value)}
                      aria-pressed={isActiveStatus}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? (
              <div className={styles.emptyState}>We couldn't load tasks right now. Please try again later.</div>
            ) : loading ? (
              <div className={styles.emptyState}>Loading your tasks…</div>
            ) : !hasAnyTask ? (
              <div className={styles.emptyState}>{emptyStateMessage}</div>
            ) : (
              <div className={styles.sections}>
                <section className={styles.section} aria-labelledby="tasks-filtered-heading">
                  <span className={styles.sectionAccent} aria-hidden="true" />
                  <div className={styles.sectionTitleRow}>
                    <h2 id="tasks-filtered-heading" className={styles.sectionTitle}>
                      {sectionHeadingLabel}
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
                    {...(!projectFilterId && !showCompleted && statusFilter !== "archived" && {
                      onStart: (task: TasksOverviewListItem) => navigateToProject(task.projectId)
                    })}
                    onSelect={handleTaskEdit}
                    currentUserId={userId}
                    isAdmin={isAdmin}
                    statusFilter={statusFilter}
                    pendingTaskIds={pendingTaskIds}
                    onSubmitForReview={handleSubmitForReview}
                    onApproveTask={handleApproveTask}
                    onRequestChanges={handleRequestChanges}
                    onArchiveTask={handleArchiveTask}
                    onUnarchiveTask={handleUnarchiveTask}
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
