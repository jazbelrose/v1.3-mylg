import React from "react";

import styles from "../TasksComponentMobile.module.css";
import type { TaskStats } from "./taskTypes";

type TaskSummaryProps = {
  stats: TaskStats;
  formatValue: (value: number) => string | number;
  statusMessage: string;
  statRowClassName?: string;
  statusClassName?: string;
};

const TaskSummary: React.FC<TaskSummaryProps> = ({
  stats,
  formatValue,
  statusMessage,
  statRowClassName,
  statusClassName,
}) => (
  <>
    <div
      className={`${styles.statRow}${statRowClassName ? ` ${statRowClassName}` : ""}`}
      aria-label="Task summary"
    >
      <div className={`${styles.statCard} ${styles.statOk}`}>
        <span className={styles.statValue}>{formatValue(stats.completed)}</span>
        <span className={styles.statLabel}>Done</span>
      </div>
      <div className={`${styles.statCard} ${styles.statDanger}`}>
        <span className={styles.statValue}>{formatValue(stats.overdue)}</span>
        <span className={styles.statLabel}>Overdue</span>
      </div>
      <div className={`${styles.statCard} ${styles.statWarn}`}>
        <span className={styles.statValue}>{formatValue(stats.dueSoon)}</span>
        <span className={styles.statLabel}>Due soon</span>
      </div>
    </div>
    <p className={statusClassName ?? styles.status}>{statusMessage}</p>
  </>
);

export default TaskSummary;
