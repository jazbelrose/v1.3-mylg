import React from "react";
import { ArrowUpRight, Calendar, Check, MapPin, Pencil, User } from "lucide-react";

import { Button } from "@/components/ui";

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
  isTaskMarking: (taskId: string) => boolean;
  formatDueLabel: (task: QuickTask) => string;
  taskListRef: React.RefObject<HTMLUListElement>;
};

const BADGE_CLASS_BY_TONE: Record<TaskStatusTone, string> = {
  success: "statusBadgeSuccess",
  danger: "statusBadgeDanger",
  warning: "statusBadgeWarning",
  neutral: "statusBadgeNeutral",
};

const TaskList: React.FC<TaskListProps> = ({
  tasks,
  activeTaskId,
  onTaskSelect,
  onTaskEdit,
  onTaskMarkDone,
  isTaskMarking,
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

        const isMarking = isTaskMarking(task.id);

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
              {primaryMapUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  className={`${styles.taskActionButton} ${styles.taskMapButton}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (typeof window !== "undefined") {
                      window.open(primaryMapUrl, "_blank", "noopener,noreferrer");
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
                  className={`${styles.taskActionButton} ${styles.taskMarkDoneButton}`}
                  disabled={isMarking}
                  aria-busy={isMarking}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTaskMarkDone(task.id);
                  }}
                >
                  {isMarking ? (
                    "Marking…"
                  ) : (
                    <>
                      <Check aria-hidden="true" size={16} /> Mark done
                    </>
                  )}
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className={`${styles.taskActionButton} ${styles.taskEditButton}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onTaskEdit(task.id);
                }}
              >
                <Pencil aria-hidden="true" size={16} /> Edit task
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default TaskList;
