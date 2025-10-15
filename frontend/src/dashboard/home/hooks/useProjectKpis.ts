import { useMemo } from "react";

export interface ProjectTimelineEvent {
  id?: string;
  title?: string;
  date?: string;
  timestamp?: string;
}

export interface ProjectLike {
  projectId: string;
  title?: string;
  description?: string;
  status?: string | number;
  finishline?: string;
  date?: string;
  dateCreated?: string;
  updatedAt?: string;
  dateUpdated?: string;
  lastModified?: string;
  thumbnails?: string[];
  timelineEvents?: ProjectTimelineEvent[];
}

interface KPIs {
  totalProjects: number;
  pendingProjects: number;
  nextProject: { title: string; date: string } | null;
}

export const parseProjectStatusToNumber = (status: unknown): number => {
  if (status === undefined || status === null) return 0;
  const str = typeof status === "string" ? status : String(status);
  const num = parseFloat(str.replace("%", ""));
  return Number.isNaN(num) ? 0 : num;
};

/**
 * Derive dashboard KPIs from a list of projects.
 * - total number of projects
 * - number of pending projects (progress < 100%)
 * - next upcoming project deadline from the project's finishline
 */
export function useProjectKpis(projects: ProjectLike[]): KPIs {
  return useMemo(() => {
    const totalProjects = projects.length;
    const completed = projects.filter(
      (p) => parseProjectStatusToNumber(p.status) >= 100
    ).length;
    const pendingProjects = totalProjects - completed;

    const today = new Date();
    const next = projects
      .filter(
        (p) => p.finishline && new Date(p.finishline) > today
      )
      .sort(
        (a, b) =>
          new Date(a.finishline || 0).getTime() -
          new Date(b.finishline || 0).getTime()
      )[0];

    let nextProject: { title: string; date: string } | null = null;
    if (next) {
      nextProject = {
        title: next.title || "N/A",
        date: new Date(next.finishline!).toLocaleDateString(undefined, {
          month: "numeric",
          day: "numeric",
          year: "numeric",
        }),
      };
    }

    return { totalProjects, pendingProjects, nextProject };
  }, [projects]);
}

export default useProjectKpis;








