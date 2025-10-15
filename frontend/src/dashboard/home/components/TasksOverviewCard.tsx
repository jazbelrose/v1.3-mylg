import React, { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";

import { useTasksOverview } from "../hooks/useTasksOverview";
import QuickCreateTaskModal, {
  type QuickCreateTaskModalTask,
} from "./QuickCreateTaskModal";
import styles from "./TasksOverviewCard.module.css";

type TasksOverviewCardProps = {
  className?: string;
};

type TaskLocation = QuickCreateTaskModalTask["location"];

type DerivedTask = {
  id: string;
  title: string;
  dayLabel: string;
  time?: string;
  project?: string;
  address?: string;
  assignee?: string;
  mapUrl: string | null;
  overdue: boolean;
  dueDate: Date | null;
  status?: string;
};

const dueDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function buildMapsUrl(location: TaskLocation, fallbackAddress?: string): string | null {
  if (!location) {
    if (!fallbackAddress) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackAddress)}`;
  }

  if (typeof location === "string") {
    const trimmed = location.trim();
    if (!trimmed) {
      return fallbackAddress
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackAddress)}`
        : null;
    }

    try {
      const parsed = JSON.parse(trimmed) as TaskLocation;
      return buildMapsUrl(parsed, fallbackAddress);
    } catch {
      const [latPart, lngPart] = trimmed.split(/[,\s]+/);
      const lat = parseCoordinate(latPart);
      const lng = parseCoordinate(lngPart);
      if (lat != null && lng != null) {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      }

      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
    }
  }

  if (typeof location === "object") {
    const record = location as Record<string, unknown>;
    const lat =
      parseCoordinate(record.lat) ??
      parseCoordinate(record.latitude) ??
      parseCoordinate(record.Lat) ??
      parseCoordinate(record.Latitude);
    const lng =
      parseCoordinate(record.lng) ??
      parseCoordinate(record.lon) ??
      parseCoordinate(record.longitude) ??
      parseCoordinate(record.Lng) ??
      parseCoordinate(record.Longitude) ??
      parseCoordinate(record.Lon);

    if (lat != null && lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
  }

  if (fallbackAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackAddress)}`;
  }

  return null;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type StatChipProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "ok" | "warn" | "soon";
};

const StatChip: React.FC<StatChipProps> = ({ icon, label, value, tone }) => (
  <div
    className={cn(
      styles.statChip,
      tone === "ok" && styles.statChipToneOk,
      tone === "warn" && styles.statChipToneWarn,
      tone === "soon" && styles.statChipToneSoon,
    )}
  >
    <span className={styles.statChipAccent} aria-hidden="true" />
    <div className={styles.statChipIcon}>{icon}</div>
    <div className={styles.statChipCopy}>
      <span className={styles.statChipLabel}>{label}</span>
      <span className={styles.statChipValue}>{value}</span>
    </div>
  </div>
);

const TasksOverviewCard: React.FC<TasksOverviewCardProps> = ({ className }) => {
  const { loading, error, stats, groups, refreshTasks, projectOptions, getTaskById } =
    useTasksOverview();
  const location = useLocation();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<QuickCreateTaskModalTask | null>(null);

  const flatTasks = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items.map((item) => ({
          event: item,
          dayLabel: group.dayLabel,
        })),
      ),
    [groups],
  );

  const derivedTasks: DerivedTask[] = useMemo(() => {
    const now = Date.now();
    return flatTasks.map(({ event, dayLabel }) => {
      const source = getTaskById(event.id);
      const dueDate = source?.dueDate ?? null;
      const overdue = Boolean(
        source &&
          source.status !== "done" &&
          dueDate &&
          dueDate.getTime() < now,
      );

      const address = source?.address ?? source?.projectName ?? event.project;
      const assignee = source?.assigneeId;
      const mapUrl = buildMapsUrl(source?.location as TaskLocation, address ?? undefined);

      return {
        id: event.id,
        title: source?.title ?? event.title,
        dayLabel,
        time: event.time,
        project: source?.projectName ?? event.project,
        address: address ?? undefined,
        assignee: assignee ?? undefined,
        mapUrl,
        overdue,
        dueDate,
        status: source?.status,
      } satisfies DerivedTask;
    });
  }, [flatTasks, getTaskById]);

  const taskCount = derivedTasks.length;
  const mapCount = derivedTasks.filter((task) => Boolean(task.mapUrl)).length;

  const dueSummary = useMemo(() => {
    const datedTasks = derivedTasks.filter((task) => task.dueDate);
    if (!datedTasks.length) return null;

    const sorted = datedTasks
      .slice()
      .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
    const firstDue = sorted[0].dueDate;
    if (!firstDue) return null;

    const sameDayCount = sorted.filter((task) => task.dueDate && isSameDay(task.dueDate, firstDue)).length;
    const noun = sameDayCount === 1 ? "task" : "tasks";
    return `${sameDayCount} ${noun} due ${dueDateFormatter.format(firstDue)}`;
  }, [derivedTasks]);

  const noticeText = useMemo(() => {
    const parts: string[] = [];
    if (dueSummary) {
      parts.push(`${dueSummary}.`);
    } else if (!loading && !derivedTasks.length) {
      parts.push("No open tasks due this week.");
    }

    if (mapCount > 0) {
      parts.push(`${mapCount} ${mapCount === 1 ? "task" : "tasks"} showing on the map.`);
    } else {
      parts.push("Add locations to tasks to see them on the map.");
    }

    return parts.join(" ");
  }, [dueSummary, mapCount, loading, derivedTasks.length]);

  const openCreateModal = useCallback(() => {
    setTaskToEdit(null);
    setIsCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    setTaskToEdit(null);
    setIsCreateModalOpen(false);
  }, []);

  const formatStatValue = (value: number): string | number => {
    if (error) return "—";
    if (loading) return "…";
    return value;
  };

  return (
    <>
      <section
        className={cn(styles.panel, className)}
        aria-label="Tasks overview"
      >
        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <h3 className={styles.title}>Tasks</h3>
            
          </div>
          <div className={styles.headerActions}>
            <Button
              className={cn(styles.accentButton, styles.actionButton)}
              onClick={openCreateModal}
              disabled={!projectOptions.length}
            >
              <Plus aria-hidden="true" />
              New task
            </Button>
            <Link
              to="/dashboard/tasks"
              className={cn(styles.secondaryAction, styles.actionButton)}
              state={{ from: `${location.pathname}${location.search}` }}
            >
              View all tasks
            </Link>
          </div>
        </div>

        <div className={styles.statsRow}>
          <StatChip
            icon={<CheckCircle2 aria-hidden="true" />}
            label="Done"
            value={formatStatValue(stats.completed)}
            tone="ok"
          />
          <StatChip
            icon={<AlertTriangle aria-hidden="true" />}
            label="Overdue"
            value={formatStatValue(stats.overdue)}
            tone="warn"
          />
          <StatChip
            icon={<Clock aria-hidden="true" />}
            label="Due soon"
            value={formatStatValue(stats.dueSoon)}
            tone="soon"
          />
        </div>

        <div className={styles.notice}>
          <p className={styles.noticeText}>
            <span className={styles.noticeStrong}>What to know:</span> {noticeText}
          </p>
        </div>

        {error ? (
          <div className={styles.empty}>We couldn’t load tasks right now. Please try again later.</div>
        ) : taskCount ? (
          <section className={styles.listSection} aria-label="Open tasks">
            
          </section>
        ) : (
          <div className={styles.empty}>
            {loading ? "Loading tasks…" : "No open tasks are due this week. You’re all caught up!"}
          </div>
        )}

      
      </section>
      <QuickCreateTaskModal
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        projects={projectOptions}
        onCreated={refreshTasks}
        onUpdated={refreshTasks}
        onDeleted={refreshTasks}
        task={taskToEdit}
      />
    </>
  );
};

export default TasksOverviewCard;









