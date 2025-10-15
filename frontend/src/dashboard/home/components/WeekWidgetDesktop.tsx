import React, { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { startOfWeek, endOfWeek, addDays } from "../utils/dateUtils";
import "./week-widget.css";

export type Track = { id: string; color: string; start: Date | string | number; end: Date | string | number };
export type Dot = { date: Date | string | number; color?: string };
type TooltipItem = {
  id: string;
  title?: string;
  color?: string;
  time?: string;
  badge?: string;
  note?: string;
  onSelect?: () => void;
};

type Props = {
  weekOf: Date;
  tracks?: Track[];
  dots?: Dot[];
  className?: string;
  onPrevWeek?: (d: Date) => void;
  onNextWeek?: (d: Date) => void;
  onSelectDate?: (d: Date) => void;
  getTooltipItems?: (date: Date) => TooltipItem[];
};

function toDate(v: Date | string | number) {
  const d = v instanceof Date ? v : new Date(v);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function WeekWidgetDesktop({
  weekOf,
  tracks = [],
  dots = [],
  className = "",
  onPrevWeek,
  onNextWeek,
  onSelectDate,
  getTooltipItems,
}: Props) {
  const weekStart = startOfWeek(weekOf);
  const weekEnd = endOfWeek(weekOf);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const dotMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of dots) {
      const k = dateKey(toDate(d.date));
      const arr = m.get(k) || [];
      arr.push(d.color || "#FFC14A");
      m.set(k, arr);
    }
    return m;
  }, [dots]);

  const total = weekEnd.getTime() - weekStart.getTime();
  const spans = useMemo(() => {
    const s = tracks
      .map((t) => {
        const S = Math.max(toDate(t.start).getTime(), weekStart.getTime());
        const E = Math.min(toDate(t.end).getTime(), weekEnd.getTime());
        if (E <= S) return null;
        return { id: t.id, color: t.color, left: ((S - weekStart.getTime()) / total) * 100, width: ((E - S) / total) * 100 };
      })
      .filter(Boolean) as Array<{ id: string; color: string; left: number; width: number }>;
    s.sort((a, b) => a.left - b.left);
    return s;
  }, [tracks, weekStart, weekEnd, total]);

  const lanesEnd: number[] = [];
  const withLane = spans.map((s) => {
    let lane = 0;
    while (lanesEnd[lane] != null && s.left < lanesEnd[lane]) lane++;
    lanesEnd[lane] = s.left + s.width;
    return { ...s, lane };
  });

  const MAX_VISIBLE_LANES = 3;
  const lanesUsed = Math.max(0, ...withLane.map((t) => t.lane)) + 1;
  const overflowCount = Math.max(0, lanesUsed - MAX_VISIBLE_LANES);
  const visibleLaneCount = Math.min(lanesUsed, MAX_VISIBLE_LANES);

  const laneHeight = 6;
  const laneGap = 2;
  const railHeight = visibleLaneCount * laneHeight + Math.max(0, visibleLaneCount - 1) * laneGap;

  const title = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;

  const DOT_SIZE = 10;
  const DOT_STROKE = 2;
  const DOT_MAX_VISIBLE = 4;
  const DOT_OVERLAP_PX = 3;

  // Tooltip state
  const [tooltipDate, setTooltipDate] = useState<Date | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!tooltipDate) {
      tooltipRef.current = null;
    }
  }, [tooltipDate]);

  // Build tooltip items; fallback to dots if callback returns none
  const items = useMemo(() => {
    if (!tooltipDate) return [];
    const cb = getTooltipItems?.(tooltipDate) ?? [];
    if (cb.length) {
      return [...cb].sort((a, b) => Number(Boolean(b.note)) - Number(Boolean(a.note)));
    }
    const k = dateKey(tooltipDate);
    const dayDots = dotMap.get(k) || [];
    return dayDots
      .map((c, i) => ({ id: `dot-${k}-${i}`, title: "Event", color: c, note: undefined } as TooltipItem))
      .sort((a, b) => Number(Boolean(b.note)) - Number(Boolean(a.note)));
  }, [tooltipDate, getTooltipItems, dotMap]);

  // Close on outside / ESC / scroll-resize
  useEffect(() => {
    if (!tooltipDate) return;
    const close = (e: MouseEvent | TouchEvent | KeyboardEvent | Event) => {
      const type = e.type;
      if (type === "keydown") {
        if ((e as KeyboardEvent).key !== "Escape") return;
      } else if (type === "mousedown" || type === "touchstart") {
        const target = e.target as Node | null;
        if (target && tooltipRef.current?.contains(target)) {
          return;
        }
      }
      setTooltipDate(null);
      setAnchor(null);
      setShowAll(false);
    };
    window.addEventListener("mousedown", close, { passive: true });
    window.addEventListener("touchstart", close, { passive: true });
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close as EventListener);
      window.removeEventListener("touchstart", close as EventListener);
      window.removeEventListener("keydown", close as EventListener);
      window.removeEventListener("scroll", close as EventListener);
      window.removeEventListener("resize", close as EventListener);
    };
  }, [tooltipDate]);

  // Compute tooltip position (fixed, via portal)
  const tip = useMemo(() => {
    if (!tooltipDate || !items.length || !anchor) return null;

    const TOOLTIP_W = 300;
    const TOOLTIP_H = 120; // rough initial height; clamped within viewport
    const left = clamp(anchor.x - TOOLTIP_W / 2, 8, (typeof window !== "undefined" ? window.innerWidth : 1000) - TOOLTIP_W - 8);
    const top = clamp(anchor.y + 55, 8, (typeof window !== "undefined" ? window.innerHeight : 1000) - TOOLTIP_H - 8);
    const arrowX = anchor.x - left; // px within tooltip width

    const MAX_VISIBLE = 3;
    const overflow = Math.max(0, items.length - MAX_VISIBLE);
    const list = showAll ? items : items.slice(0, MAX_VISIBLE);

    return createPortal(
      <div
        className={`ww-top-tooltip ${overflow && !showAll ? "has-overflow" : ""}`}
        role="dialog"
        aria-label="Day details"
        ref={(node) => {
          tooltipRef.current = node;
        }}
        style={
          {
            position: "fixed",
            top,
            left,
            width: TOOLTIP_W,
            zIndex: 2147483647,
            pointerEvents: "auto",
            padding: "16px",
            "--arrow-x": `${Math.round(arrowX)}px`,
          } as React.CSSProperties
        }
      >
        {list.map((it) => (
          <div
            key={it.id}
            className={`ww-tt-item${it.onSelect ? " ww-tt-item--action" : ""}`}
            role={it.onSelect ? "button" : undefined}
            tabIndex={it.onSelect ? 0 : undefined}
            onClick={() => {
              if (!it.onSelect) return;
              it.onSelect();
              setTooltipDate(null);
              setAnchor(null);
              setShowAll(false);
            }}
            onKeyDown={(e) => {
              if (!it.onSelect) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                it.onSelect();
                setTooltipDate(null);
                setAnchor(null);
                setShowAll(false);
              }
            }}
          >
            <span className="ww-tt-dot" style={{ background: it.color || "#999" }} />
            <div className="ww-tt-body">
              <div className="ww-tt-title">{it.title ?? "Untitled"}</div>
              {it.note && <div className="ww-tt-note">{it.note}</div>}
              {it.time && <div className="ww-tt-time">{it.time}</div>}
            </div>
          </div>
        ))}
        {overflow > 0 && !showAll && (
          <button
            className="ww-tt-more-pill"
            onClick={() => setShowAll(true)}
            aria-label={`Show ${overflow} more`}
          >
            +{overflow}
          </button>
        )}

        <button className="ww-tt-close" onClick={() => { setTooltipDate(null); setAnchor(null); setShowAll(false); }} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>,
      document.body
    );
  }, [tooltipDate, items, anchor, showAll]);

  const containerClass = [
    "week-widget",
    "week-widget--desktop",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass} style={{ position: "relative" }}>
      <div className="week-widget-header">
        <button className="week-nav-btn" onClick={() => onPrevWeek?.(addDays(weekStart, -7))} aria-label="Previous week">
          ‹
        </button>
        <span className="week-title">{title}</span>
        <button className="week-nav-btn" onClick={() => onNextWeek?.(addDays(weekStart, 7))} aria-label="Next week">
          ›
        </button>
      </div>

      <div className="week-days">
        {days.map((day) => {
          const k = dateKey(day);
          const dayDots = dotMap.get(k) || [];
          const isToday = dateKey(new Date()) === k;
          const isSelected = dateKey(weekOf) === k;

          const handleTap = (el: HTMLElement) => {
            const same = tooltipDate && dateKey(tooltipDate) === k;
            onSelectDate?.(day);
            if (same) {
              setTooltipDate(null);
              setAnchor(null);
            } else {
              const rect = el.getBoundingClientRect();
              setAnchor({ x: rect.left + rect.width / 2, y: rect.top });
              setTooltipDate(day);
            }
          };

          return (
            <div
              key={k}
              className={`week-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
              onClick={(e) => handleTap(e.currentTarget as HTMLElement)}
              role="button"
              aria-label={day.toDateString()}
            >
              <div className="day-name">{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className="day-number">{day.getDate()}</div>

              <div className="day-dots">
                {dayDots.slice(0, DOT_MAX_VISIBLE).map((c, i) => (
                  <svg
                    key={i}
                    width={DOT_SIZE}
                    height={DOT_SIZE}
                    viewBox="0 0 24 24"
                    style={{ marginLeft: i ? -DOT_OVERLAP_PX : 0, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.45))", zIndex: 20 - i }}
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.65)" />
                    <circle cx="12" cy="12" r={10 - DOT_STROKE} fill="none" stroke={c} strokeWidth={DOT_STROKE} />
                    <path d="M12 7v5l3 2" stroke={c} strokeWidth={DOT_STROKE} fill="none" strokeLinecap="round" />
                  </svg>
                ))}
                {dayDots.length > DOT_MAX_VISIBLE && (
                  <span
                    className="day-dot-more"
                    style={{
                      marginLeft: 6,
                      padding: "0 6px",
                      height: 16,
                      lineHeight: "16px",
                      minWidth: 18,
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: ".2px",
                      color: "#fff",
                      background: "rgba(15,15,15,.6)",
                      border: "1px solid rgba(255,255,255,.25)",
                      backdropFilter: "saturate(140%) blur(2px)",
                    }}
                  >
                    +{dayDots.length - DOT_MAX_VISIBLE}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="week-tracks" style={{ height: `${railHeight}px` }}>
        {withLane
          .filter((t) => t.lane < MAX_VISIBLE_LANES)
          .map((t) => (
            <div
              key={t.id}
              className="track"
              style={{
                left: `${t.left}%`,
                width: `${t.width}%`,
                top: `${t.lane * (laneHeight + laneGap)}px`,
                height: `${laneHeight}px`,
                backgroundColor: t.color,
                borderRadius: laneHeight / 2,
              }}
            />
          ))}
        {overflowCount > 0 && <span className="lane-overflow-pill">+{overflowCount}</span>}
      </div>

      {/* Portalized tooltip (renders into <body>) */}
      {tip}
    </div>
  );
}

export { WeekWidgetDesktop };








