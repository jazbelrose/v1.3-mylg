import React from "react";
import { ArrowUpRight, Calendar, Check, MapPin, MoreVertical, Pencil, User } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import styles from "../TasksComponentMobile.module.css";
import { buildDirectionsLinks, formatAssigneeDisplay } from "../utils";
import {
  createTaskStatusContext,
  getTaskStatusBadge,
  getTaskStatusTone,
  type TaskStatusTone,
} from "./quickTaskUtils";
import type { QuickTask } from "./taskTypes";

type TaskListProps = {
  tasks: QuickTask[];
  activeTaskId: string | null;
  onTaskSelect: (taskId: string) => void;
  onTaskEdit: (taskId: string) => void;
  onTaskMarkDone: (taskId: string) => void;
  formatDueLabel: (task: QuickTask) => string;
  taskListRef: React.RefObject<HTMLUListElement>;
};

const BADGE_CLASS_BY_TONE: Record<TaskStatusTone, string> = {
  success: "statusBadgeSuccess",
  danger: "statusBadgeDanger",
  warning: "statusBadgeWarning",
  neutral: "statusBadgeNeutral",
};

type TaskActionsMenuProps = {
  onOpenMaps?: () => void;
  onEdit: () => void;
  onMarkDone?: () => void;
  isCompleted: boolean;
};

const TaskActionsMenu: React.FC<TaskActionsMenuProps> = ({ onOpenMaps, onEdit, onMarkDone, isCompleted }) => {
  const [open, setOpen] = React.useState(false);

  const handleTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleAction = (callback: (() => void) | undefined) =>
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      callback?.();
      setOpen(false);
    };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={styles.taskActionsTrigger}
          aria-label="Open task actions"
          onClick={handleTriggerClick}
        >
          <MoreVertical size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={styles.taskActionsMenu} align="end">
        <ul className={styles.taskActionsMenuList}>
          {onOpenMaps ? (
            <li>
              <button type="button" className={styles.taskActionsMenuItem} onClick={handleAction(onOpenMaps)}>
                <ArrowUpRight aria-hidden="true" size={16} /> Open in Maps
              </button>
            </li>
          ) : null}
          {!isCompleted ? (
            <li>
              <button
                type="button"
                className={`${styles.taskActionsMenuItem} ${styles.taskActionsMenuItemPrimary}`}
                onClick={handleAction(onMarkDone)}
              >
                <Check aria-hidden="true" size={16} /> Mark done
              </button>
            </li>
          ) : null}
          <li>
            <button
              type="button"
              className={styles.taskActionsMenuItem}
              onClick={handleAction(onEdit)}
            >
              <Pencil aria-hidden="true" size={16} /> Edit task
            </button>
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
};

const TaskList: React.FC<TaskListProps> = ({
  tasks,
  activeTaskId,
  onTaskSelect,
  onTaskEdit,
  onTaskMarkDone,
  formatDueLabel,
  taskListRef,
}) => {
  const statusContext = createTaskStatusContext();

  return (
    <ul className={styles.taskList} ref={taskListRef}>
      {tasks.map((task) => {
        const isActive = task.id === activeTaskId;
        const assigneeLabel = formatAssigneeDisplay(task.assignedTo);
        const listItemClassName = `${styles.taskItem}${isActive ? ` ${styles.taskItemActive}` : ""}`;

        const directionsLinks = buildDirectionsLinks(task.address);
        const primaryMapUrl = directionsLinks
          ? directionsLinks.googleMaps || directionsLinks.appleMaps
          : null;
        const isCompleted =
          typeof task.status === "string" && task.status.toLowerCase() === "done";
        const { category, label } = getTaskStatusBadge(task.status, task.dueDate, statusContext);
        const tone = getTaskStatusTone(category);
        const badgeClassKey = BADGE_CLASS_BY_TONE[tone];
        const badgeToneClass = badgeClassKey ? styles[badgeClassKey as keyof typeof styles] : undefined;
        const badgeClassName = [styles.statusBadge, badgeToneClass].filter(Boolean).join(" ");

        return (
          <li key={task.id} data-task-id={task.id} className={listItemClassName}>
            <div
              role="button"
              tabIndex={0}
              className={styles.taskButton}
              onClick={() => onTaskSelect(task.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onTaskSelect(task.id);
                }
              }}
            >
              <div className={styles.taskTitleRow}>
                <span className={styles.taskTitle}>{task.title}</span>
                <span className={badgeClassName}>{label}</span>
              </div>
              <div className={styles.taskMeta}>
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
                {assigneeLabel ? (
                  <span className={styles.metaLine}>
                    <User size={14} aria-hidden="true" /> Assigned to : {assigneeLabel}
                  </span>
                ) : (
                  <span className={`${styles.metaLine} ${styles.metaLineMuted}`}>
                    <User size={14} aria-hidden="true" /> No assignee
                  </span>
                )}
              </div>
            </div>
            <div className={styles.taskActions}>
              <TaskActionsMenu
                onOpenMaps={primaryMapUrl ? () => {
                  if (typeof window !== "undefined") {
                    window.open(primaryMapUrl, "_blank", "noopener,noreferrer");
                  }
                } : undefined}
                onEdit={() => onTaskEdit(task.id)}
                onMarkDone={!isCompleted ? () => onTaskMarkDone(task.id) : undefined}
                isCompleted={isCompleted}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default TaskList;
