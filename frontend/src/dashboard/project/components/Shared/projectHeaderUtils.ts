import { useCallback, useMemo } from "react";

import { enqueueProjectUpdate } from "@/shared/utils/requestQueue";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { fileUrlsToKeys } from "@/shared/utils/api";

import type { Project } from "@/app/contexts/DataProvider";
import type { ProjectHeaderProps } from "./projectHeaderTypes";

export function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function safeParse(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map((p) => parseInt(p, 10));
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

export function useQueueUpdate(
  updateProjectFields: (projectId: string, payload: Partial<Project>) => Promise<void>,
  activeProjectId?: string,
  setSaving?: (value: boolean) => void
) {
  return useCallback(
    async (payload: Partial<Project>) => {
      if (!activeProjectId) return;
      try {
        setSaving?.(true);
        await enqueueProjectUpdate(updateProjectFields, activeProjectId, payload);
      } finally {
        setSaving?.(false);
      }
    },
    [activeProjectId, setSaving, updateProjectFields]
  );
}

export function deriveProjectInitial(title?: string | null): string {
  if (!title) return "";
  return title.length > 0 ? title.charAt(0) : "";
}

export function normalizeStatus(status: string | number | undefined): string {
  if (!status && status !== 0) return "0%";
  const stringStatus = status.toString();
  if (stringStatus.trim().endsWith("%")) {
    return stringStatus;
  }
  return `${stringStatus}%`;
}

export function getCanonicalProjectPath(
  project: Project,
  currentPath: string
): string | null {
  const segments = currentPath.split("/").filter(Boolean);
  const projectsIndex = segments.indexOf("projects");

  let suffix = "";
  if (projectsIndex !== -1) {
    const afterProjectId = segments.slice(projectsIndex + 2);
    if (afterProjectId.length > 0) {
      const [firstSegment, ...restSegments] = afterProjectId;
      const expectedSlug = encodeURIComponent((project.title ?? "").trim());
      const knownSuffixes = new Set(["budget", "calendar", "moodboard", "editor"]);

      let suffixSegments: string[] = [];
      const slugMatchesExpected = expectedSlug.length > 0 && firstSegment === expectedSlug;

      if (slugMatchesExpected) {
        suffixSegments = restSegments;
      } else if (knownSuffixes.has(firstSegment.toLowerCase())) {
        suffixSegments = [firstSegment, ...restSegments];
      } else if (restSegments.length > 0) {
        suffixSegments = restSegments;
      }

      if (suffixSegments.length > 0) {
        suffix = `/${suffixSegments.join("/")}`;
      }
    }
  }

  const canonicalPath = getProjectDashboardPath(
    project.projectId,
    project.title,
    suffix
  );
  return canonicalPath;
}

export function normalizeProjectFromProps(project: Project | null): Project {
  return project
    ? { ...project, thumbnails: fileUrlsToKeys(project.thumbnails || []) }
    : (({} as unknown) as Project);
}

export function useRangeLabels(project: Project) {
  const startDate = useMemo(
    () =>
      safeParse(
        (project?.productionStart as string) || (project?.dateCreated as string)
      ),
    [project?.productionStart, project?.dateCreated]
  );
  const endDate = useMemo(
    () => safeParse(project?.finishline as string),
    [project?.finishline]
  );

  const totalHours = useMemo(
    () =>
      (project?.timelineEvents || []).reduce(
        (sum, event) => sum + Number(event.hours || 0),
        0
      ),
    [project?.timelineEvents]
  );
const rangeLabel = useMemo(() => {
    const totalPart = `${totalHours} hrs`;
    if (!startDate || !endDate) return totalPart;
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const startStr = startDate.toLocaleDateString(undefined, options);
    const endStr = endDate.toLocaleDateString(undefined, options);
    return `${startStr} – ${endStr} · ${totalPart}`;
  }, [startDate, endDate, totalHours]);

  const mobileRangeLabel = useMemo(() => rangeLabel, [rangeLabel]);

  return { rangeLabel, mobileRangeLabel, totalHours };
}

export function deriveProjectInitialState(props: ProjectHeaderProps) {
  return normalizeProjectFromProps(props.activeProject);
}

