export function getProjectDashboardPath(
  projectId: string,
  title?: string | null,
  suffix = ""
): string {
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  const encodedTitle = trimmedTitle ? `/${encodeURIComponent(trimmedTitle)}` : "";
  return `/dashboard/projects/${projectId}${encodedTitle}${suffix}`;
}

export function extractProjectNameFromPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  const projectsIdx = segments.indexOf("projects");
  if (projectsIdx === -1) return undefined;
  const rawSegment = segments[projectsIdx + 2];
  if (!rawSegment) return undefined;
  const cleanSegment = rawSegment.split(/[?#]/)[0] ?? "";
  try {
    return decodeURIComponent(cleanSegment);
  } catch {
    return cleanSegment;
  }
}
