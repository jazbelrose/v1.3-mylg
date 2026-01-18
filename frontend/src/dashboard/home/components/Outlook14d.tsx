import React, { useMemo } from "react";
import styles from "./Outlook14d.module.css";

export type OutlookWorkloadProject = {
  projectId: string;
  tasksCount: number;
  eventsCount: number;
  total: number;
  color: string;
  label?: string;
};

export type OutlookWorkload = {
  projects: OutlookWorkloadProject[];
  overflowCount?: number;
};

export type OutlookDay = {
  date: Date;
  tasks: number;
  events: number;
  exception?: boolean;
  workload?: OutlookWorkload;
};

export type OutlookRange = {
  start: Date | null;
  end: Date | null;
};

export type Outlook14dProps = {
  days: OutlookDay[];
  selected: OutlookRange;
  onPrevRange: () => void;
  onNextRange: () => void;
  onSelectDay: (day: Date) => void;
  onToggleSelectRange: () => void;
  onToday?: () => void;
};

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isInRange(day: Date, range: OutlookRange): boolean {
  if (!range.start || !range.end) return false;
  const d = startOfDay(day).getTime();
  const s = startOfDay(range.start).getTime();
  const e = startOfDay(range.end).getTime();
  return d >= Math.min(s, e) && d <= Math.max(s, e);
}

export default function Outlook14d({
  days,
  selected,
  onPrevRange,
  onNextRange,
  onSelectDay,
  onToggleSelectRange,
  onToday,
}: Outlook14dProps) {
  const rangeLabel = useMemo(() => {
    const first = days[0]?.date;
    const last = days[days.length - 1]?.date;
    if (!first || !last) return "—";
    const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
    return `${fmt.format(first)} — ${fmt.format(last)}`;
  }, [days]);

  const isRangeSelected = useMemo(() => {
    if (!selected.start || !selected.end) return false;
    const first = days[0]?.date;
    const last = days[days.length - 1]?.date;
    if (!first || !last) return false;
    return isSameDay(selected.start, first) && isSameDay(selected.end, last);
  }, [days, selected.end, selected.start]);

  const isOnToday = useMemo(() => {
    const first = days[0]?.date;
    if (!first) return true;
    return isSameDay(first, startOfDay(new Date()));
  }, [days]);

  const dateLabelFmt = useMemo(() => new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }), []);

  return (
    <section className={styles.outlook} aria-label="14-day outlook">
      <div className={styles.header}>
        <div className={styles.title}>14-Day Outlook</div>
        <div className={styles.nav}>
          <button type="button" className={styles.navBtn} onClick={onPrevRange} aria-label="Previous 14 days">
            {"<"}
          </button>
          <button
            type="button"
            className={[
              styles.rangeButton,
              isRangeSelected ? styles.rangeButtonActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={onToggleSelectRange}
            aria-pressed={isRangeSelected}
            aria-label="Select date range"
          >
            {rangeLabel}
          </button>
          <button type="button" className={styles.navBtn} onClick={onNextRange} aria-label="Next 14 days">
            {">"}
          </button>
          {onToday && (
            <button
              type="button"
              className={[
                styles.todayBtn,
                isOnToday ? styles.todayBtnDisabled : "",
              ].filter(Boolean).join(" ")}
              onClick={onToday}
              disabled={isOnToday}
              aria-label="Jump to current 14 days"
              title="Jump to current 14 days"
            >
              Today
            </button>
          )}
        </div>
      </div>

      <div className={styles.daysScroll} aria-label="Outlook days">
        <div className={styles.days} role="list">
          {days.map((day) => {
            const date = day.date;
            const selectedDay = Boolean(selected.start && selected.end && isSameDay(selected.start, date) && isSameDay(selected.end, date));
            const inRange = isInRange(date, selected);
            const dow = date.toLocaleDateString(undefined, { weekday: "short" });
            const dom = String(date.getDate());

            const projects = day.workload?.projects ?? [];
            const MAX_PROJECTS = 5;
            const overflowCount = day.workload?.overflowCount ?? Math.max(0, projects.length - MAX_PROJECTS);

            const top = projects.slice(0, MAX_PROJECTS);
            const maxProjectTotal = Math.max(1, ...top.map((p) => p.total));
            const MIN_BAR = 0.12;

            const titleLines: string[] = [];
            titleLines.push(`${dateLabelFmt.format(date)}`);
            titleLines.push(`${day.tasks} tasks • ${day.events} events`);
            for (const p of top) {
              const label = p.label ?? p.projectId;
              titleLines.push(`${label} — ${p.tasksCount} tasks • ${p.eventsCount} events`);
            }
            if (overflowCount > 0) titleLines.push(`+${overflowCount} more`);
            const title = titleLines.join("\n");

            return (
              <button
                key={date.toISOString()}
                type="button"
                role="listitem"
                className={[
                  styles.day,
                  selectedDay ? styles.daySelected : "",
                  !selectedDay && inRange ? styles.dayInRange : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={title}
                onClick={() => onSelectDay(date)}
                aria-label={title}
              >
                <div className={styles.dayTop}>
                  <span className={styles.dow}>{dow}</span>
                  <span className={styles.dom}>{dom}</span>
                </div>
                {top.length > 0 ? (
                  <div className={styles.bars} aria-hidden>
                    {top.map((p) => {
                      const pct = Math.max(MIN_BAR, Math.min(1, p.total / maxProjectTotal)) * 100;
                      return (
                        <div
                          key={p.projectId}
                          className={[styles.bar, day.exception ? styles.barException : ""].filter(Boolean).join(" ")}
                          style={{ width: `${pct}%`, background: p.color }}
                        />
                      );
                    })}
                    {overflowCount > 0 ? <span className={styles.morePill}>+{overflowCount}</span> : null}
                  </div>
                ) : (
                  <div className={styles.empty} aria-hidden>
                    —
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
