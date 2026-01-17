import React, { useMemo } from "react";
import styles from "./Outlook14d.module.css";

export type OutlookDay = {
  date: Date;
  tasks: number;
  events: number;
  exception?: boolean;
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
}: Outlook14dProps) {
  const rangeLabel = useMemo(() => {
    const first = days[0]?.date;
    const last = days[days.length - 1]?.date;
    if (!first || !last) return "—";
    const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
    return `${fmt.format(first)} — ${fmt.format(last)}`;
  }, [days]);

  const maxTasks = useMemo(() => Math.max(1, ...days.map((d) => d.tasks)), [days]);
  const maxEvents = useMemo(() => Math.max(1, ...days.map((d) => d.events)), [days]);

  const isRangeSelected = useMemo(() => {
    if (!selected.start || !selected.end) return false;
    const first = days[0]?.date;
    const last = days[days.length - 1]?.date;
    if (!first || !last) return false;
    return isSameDay(selected.start, first) && isSameDay(selected.end, last);
  }, [days, selected.end, selected.start]);

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
            const title = `${date.toDateString()} • ${day.tasks} tasks • ${day.events} events`;

            const taskScale = Math.max(0.08, Math.min(1, day.tasks / maxTasks));
            const eventScale = Math.max(0.08, Math.min(1, day.events / maxEvents));

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
                <div className={styles.lines} aria-hidden>
                  <div
                    className={[
                      styles.line,
                      styles.lineTasks,
                      day.exception ? styles.lineException : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ transform: `scaleX(${taskScale})` }}
                  />
                  <div
                    className={[styles.line, styles.lineEvents].join(" ")}
                    style={{ transform: `scaleX(${eventScale})` }}
                  />
                </div>
                <div className={styles.counts} aria-hidden>
                  • {day.tasks} • {day.events}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
