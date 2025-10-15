import type { ProjectLike } from "@/dashboard/home/hooks/useProjectKpis";

export const createRandomId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const formatShortDate = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString(undefined, { month: "short", day: "numeric" });
};

export const getProjectActivityTs = (project: ProjectLike): number => {
  const candidates: (string | undefined)[] = [
    project.updatedAt,
    project.dateUpdated,
    project.lastModified,
    project.date,
    project.dateCreated,
  ];

  if (Array.isArray(project.timelineEvents)) {
    for (const event of project.timelineEvents) {
      if (event?.timestamp) candidates.push(event.timestamp);
      if (event?.date) candidates.push(event.date);
    }
  }

  const timestamps = candidates
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .filter((value) => Number.isFinite(value));

  return timestamps.length ? Math.max(...timestamps) : 0;
};












