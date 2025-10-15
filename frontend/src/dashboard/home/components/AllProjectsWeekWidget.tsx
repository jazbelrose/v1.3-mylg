import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import WeekWidget, { type Track, type Dot } from "./WeekWidget";
import { useData } from "@/app/contexts/useData";
import { getColor } from "@/shared/utils/colorUtils";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";

type TimelineEvent = { date?: string; description?: string; [k: string]: unknown };
type Project = {
  projectId: string;
  title?: string;
  color?: string;
  dateCreated?: string;
  finishline?: string;
  timelineEvents?: TimelineEvent[];
};

function toDay(d?: string | Date | number) {
  if (!d) return null;
  const v = d instanceof Date ? d : new Date(d);
  return Number.isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
}
function sameDay(a: Date | null, b: Date | null) {
  return !!(a && b) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDateKey(date: Date | null | undefined) {
  if (!date) return undefined;
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return utc.toISOString().slice(0, 10);
}

export default function AllProjectsWeekWidget({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const { projects = [], fetchProjectDetails } = useData() as {
    projects: Project[];
    fetchProjectDetails?: (projectId: string) => Promise<boolean>;
  };
  const [weekOf, setWeekOf] = useState<Date>(new Date());

  const handleNavigateToProject = async (project: Project, flashDate?: Date | null) => {
    if (!project?.projectId) return;
    if (typeof fetchProjectDetails === "function") {
      try {
        await fetchProjectDetails(project.projectId);
      } catch (error) {
        console.error("Failed to prefetch project", error);
      }
    }

    const dateKey = getDateKey(flashDate ?? null);
    navigate(getProjectDashboardPath(project.projectId, project.title), {
      state: dateKey ? { flashDate: dateKey } : undefined,
    });
  };

  // Map for consistent colors
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of projects) m[p.projectId] = p.color || getColor(p.projectId);
    return m;
  }, [projects]);

  // Bars across the week
  const tracks: Track[] = useMemo(() => {
    return projects
      .map((p) => {
        const start = toDay(p.dateCreated);
        const end = toDay(p.finishline);
        if (!start || !end || end < start) return null;
        return { id: p.projectId, color: colorMap[p.projectId] || "#FA3356", start, end };
      })
      .filter(Boolean) as Track[];
  }, [projects, colorMap]);

  // Dots from timeline events
  const dots: Dot[] = useMemo(() => {
    const out: Dot[] = [];
    for (const p of projects) {
      for (const ev of p.timelineEvents ?? []) {
        const d = toDay(ev.date);
        if (d) out.push({ date: d, color: colorMap[p.projectId] || "#FA3356" });
      }
    }
    return out;
  }, [projects, colorMap]);

  // 👉 Tooltip data for a tapped day (projects running that day + same-day events)
  const getTooltipItems = (date: Date) => {
    const day = toDay(date)!;
    const items: { id: string; title?: string; color?: string; note?: string; onSelect?: () => void }[] = [];

    for (const p of projects) {
      const color = colorMap[p.projectId] || "#FA3356";
      const start = toDay(p.dateCreated);
      const end = toDay(p.finishline);

      if (start && end && day >= start && day <= end) {
        items.push({
          id: p.projectId,
          title: p.title || p.projectId,
          color,
          onSelect: () => void handleNavigateToProject(p, day),
        });
      }
      for (const ev of p.timelineEvents ?? []) {
        const d = toDay(ev.date);
        if (sameDay(d, day)) {
          const note = (ev.description as string) || undefined;
          const hit = items.find((i) => i.id === p.projectId);
          if (hit) {
            hit.note ??= note;
            if (!hit.onSelect) hit.onSelect = () => void handleNavigateToProject(p, day);
          } else {
            items.push({
              id: p.projectId,
              title: p.title || p.projectId,
              color,
              note,
              onSelect: () => void handleNavigateToProject(p, day),
            });
          }
        }
      }
    }
    return items;
  };

  return (
    <WeekWidget
      weekOf={weekOf}
      tracks={tracks}
      dots={dots}
      className={className}
      onPrevWeek={(d) => setWeekOf(d)}
      onNextWeek={(d) => setWeekOf(d)}
      onSelectDate={(d) => setWeekOf(d)}
      getTooltipItems={getTooltipItems}   // ← pass real data
      isMobile                            // ← ensures mobile tooltip path
    />
  );
}









