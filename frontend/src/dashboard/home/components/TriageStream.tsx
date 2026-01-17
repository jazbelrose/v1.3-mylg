import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./TriageStream.module.css";
import type { TasksOverviewListItem } from "@/dashboard/home/hooks/useTasksOverview";

type QueueAction = {
  id: string;
  label: string;
  count?: number;
  onClick: () => void;
};

export type TriageStreamProps = {
  className?: string;
  variant?: "card" | "embedded";
  tasks: TasksOverviewListItem[];
  undatedTasks: TasksOverviewListItem[];
  headerFilters?: React.ReactNode;
  emptyMessage?: string;
  emptyQueues?: QueueAction[];
  onOpenProject: (projectId: string) => void;
  onMarkDone?: (task: TasksOverviewListItem) => void;
  onReschedule?: (task: TasksOverviewListItem, nextDue: Date | null) => void;
};

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(value: Date, days: number): Date {
  const copy = new Date(value.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function endOfWeek(value: Date): Date {
  const day = startOfDay(value);
  const dow = day.getDay(); // 0 Sun
  const diff = 6 - dow;
  return addDays(day, diff);
}

type Group = { id: string; label: string; items: TasksOverviewListItem[] };

export default function TriageStream({
  className,
  variant = "card",
  tasks,
  undatedTasks,
  headerFilters,
  emptyMessage = "No tasks due this week.",
  emptyQueues = [],
  onOpenProject,
  onMarkDone,
  onReschedule,
}: TriageStreamProps) {
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuTaskId) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      setMenuTaskId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuTaskId]);

  const groups = useMemo<Group[]>(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const weekEnd = endOfWeek(today);

    const overdue: TasksOverviewListItem[] = [];
    const dueToday: TasksOverviewListItem[] = [];
    const dueTomorrow: TasksOverviewListItem[] = [];
    const thisWeek: TasksOverviewListItem[] = [];
    const later: TasksOverviewListItem[] = [];

    for (const task of tasks) {
      const due = task.dueDate ? startOfDay(task.dueDate) : null;
      if (!due) continue;
      if (due.getTime() < today.getTime()) overdue.push(task);
      else if (sameDay(due, today)) dueToday.push(task);
      else if (sameDay(due, tomorrow)) dueTomorrow.push(task);
      else if (due.getTime() <= weekEnd.getTime()) thisWeek.push(task);
      else later.push(task);
    }

    const out: Group[] = [];
    if (dueToday.length) out.push({ id: "today", label: "Today", items: dueToday });
    if (dueTomorrow.length) out.push({ id: "tomorrow", label: "Tomorrow", items: dueTomorrow });
    if (thisWeek.length) out.push({ id: "week", label: "This week", items: thisWeek });
    if (later.length) out.push({ id: "later", label: "Later", items: later });
    if (overdue.length) out.push({ id: "overdue", label: "Overdue", items: overdue });
    if (undatedTasks.length) out.push({ id: "undated", label: "Needs date", items: undatedTasks });
    return out;
  }, [tasks, undatedTasks]);

  const handleItemContextMenu = useCallback((taskId: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    setMenuTaskId(taskId);
  }, []);

  const handleOpen = useCallback(
    (task: TasksOverviewListItem) => {
      onOpenProject(task.projectId);
    },
    [onOpenProject],
  );

  if (!groups.length) {
    return (
      <section
        className={[styles.triage, variant === "embedded" ? styles.embedded : "", className].filter(Boolean).join(" ")}
        aria-label="Triage stream"
      >
        <div className={styles.header}>
          <div className={styles.title}>Triage</div>
          <div className={styles.filters}>{headerFilters}</div>
        </div>
        <div className={styles.body}>
          <div className={styles.empty}>
            {emptyMessage}
            {emptyQueues.length ? (
              <div className={styles.emptyQueues}>
                {emptyQueues.map((queue) => (
                  <button key={queue.id} type="button" className={styles.emptyQueueBtn} onClick={queue.onClick}>
                    {queue.label}
                    {typeof queue.count === "number" ? ` ${queue.count}` : ""}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={[styles.triage, variant === "embedded" ? styles.embedded : "", className].filter(Boolean).join(" ")}
      aria-label="Triage stream"
    >
      <div className={styles.header}>
        <div className={styles.title}>Triage</div>
        <div className={styles.filters}>{headerFilters}</div>
      </div>
      <div className={styles.body}>
        {groups.map((group) => (
          <div key={group.id} className={styles.group}>
            <div className={styles.groupHeader}>
              <span>{group.label}</span>
              <span className={styles.groupCount}>{group.items.length}</span>
            </div>
            <div>
              {group.items.map((task) => {
                const taskId = task.taskId ?? task.id;
                const isMenuOpen = menuTaskId === taskId;
                const dueLabel = task.dueDate
                  ? task.dueDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                  : "No date";
                const time = task.timeLabel ?? "";
                const assignee = task.assigneeName ?? (task.assigneeId ? "Assigned" : "Needs owner");
                const status = String(task.status || "todo").replace(/_/g, " ");

                return (
                  <div
                    key={`${task.projectId}:${taskId}`}
                    className={styles.item}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpen(task)}
                    onContextMenu={handleItemContextMenu(taskId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpen(task);
                      }
                    }}
                  >
                    <div className={styles.projectPill} title={task.projectName}>
                      <span className={styles.projectDot} style={{ background: task.projectColor || "#777" }} aria-hidden />
                      <span>{task.projectName}</span>
                    </div>
                    <div className={styles.main}>
                      <div className={styles.taskTitle}>{task.title}</div>
                      <div className={styles.meta}>
                        <span className={styles.tag}>
                          <span className={styles.kicker}>Due</span> {time ? `${dueLabel} • ${time}` : dueLabel}
                        </span>
                        <span className={styles.tag}>
                          <span className={styles.kicker}>Owner</span> {assignee}
                        </span>
                        <span className={styles.tag}>
                          <span className={styles.kicker}>Status</span> {status}
                        </span>
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        className={styles.menuBtn}
                        aria-label="Task actions"
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuTaskId((prev) => (prev === taskId ? null : taskId));
                        }}
                      >
                        {"⋯"}
                      </button>
                      {isMenuOpen ? (
                        <div className={styles.menu} role="menu" ref={menuRef}>
                          <button
                            type="button"
                            className={styles.menuItem}
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuTaskId(null);
                              onMarkDone?.(task);
                            }}
                          >
                            Mark done
                          </button>
                          <button
                            type="button"
                            className={styles.menuItem}
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuTaskId(null);
                              onReschedule?.(task, addDays(startOfDay(new Date()), 1));
                            }}
                          >
                            Move to tomorrow
                          </button>
                          <button
                            type="button"
                            className={styles.menuItem}
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuTaskId(null);
                              onReschedule?.(task, addDays(startOfDay(new Date()), 7));
                            }}
                          >
                            Move to next week
                          </button>
                          <button
                            type="button"
                            className={styles.menuItem}
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuTaskId(null);
                              onReschedule?.(task, null);
                            }}
                          >
                            Clear date
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
