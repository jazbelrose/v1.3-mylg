import React from "react";
import { Link, useLocation } from "react-router-dom";

import { useTasksOverview } from "../hooks/useTasksOverview";
import styles from "./MobileTasksOverviewCard.module.css";

type MobileTasksOverviewCardProps = {
  className?: string;
};

const MobileTasksOverviewCard: React.FC<MobileTasksOverviewCardProps> = ({ className }) => {
  const { loading, error, stats, groups } = useTasksOverview();
  const location = useLocation();

  const formatStatValue = (value: number): string | number => {
    if (error) return "—";
    if (loading) return "…";
    return value;
  };

  const statusMessage = React.useMemo(() => {
    if (error) return "We couldn’t load tasks right now.";
    if (loading) return "Loading tasks…";
    if (!groups.length) return "No open tasks this week.";

    const nextGroup = groups[0];
    if (!nextGroup) return "You're up to date.";

    const count = nextGroup.items.length;
    const noun = count === 1 ? "task" : "tasks";
    return `${count} ${noun} due ${nextGroup.dayLabel}.`;
  }, [error, loading, groups]);

  return (
    <section
      className={`${styles.card} ${className ?? ""}`.trim()}
      aria-label="Tasks overview"
    >
      <header className={styles.header}>
        <h3 className={styles.title}>Tasks</h3>
        <Link
          to="/dashboard/tasks"
          className={styles.viewAllButton}
          aria-label="View all tasks"
          state={{ from: `${location.pathname}${location.search}` }}
        >
          View all
        </Link>
      </header>

      <div className={styles.statRow}>
        <div className={`${styles.stat} ${styles.statOk}`}>
          <span className={styles.statValue}>{formatStatValue(stats.completed)}</span>
          <span className={styles.statLabel}>Done</span>
        </div>
        <div className={`${styles.stat} ${styles.statDanger}`}>
          <span className={styles.statValue}>{formatStatValue(stats.overdue)}</span>
          <span className={styles.statLabel}>Overdue</span>
        </div>
        <div className={`${styles.stat} ${styles.statWarn}`}>
          <span className={styles.statValue}>{formatStatValue(stats.dueSoon)}</span>
          <span className={styles.statLabel}>Due</span>
        </div>
      </div>

      <p className={styles.status}>{statusMessage}</p>
    </section>
  );
};

export default MobileTasksOverviewCard;









