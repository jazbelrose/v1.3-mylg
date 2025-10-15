import type { Project } from "@/app/contexts/DataProvider";
import { getFileUrl } from "@/shared/utils/api";

const stringFromUnknown = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
};

export const resolveProjectCoverUrl = (
  project?: Project | null
): string | undefined => {
  if (!project) return undefined;

  const thumbnails = Array.isArray(project.thumbnails)
    ? project.thumbnails
    : [];
  for (const entry of thumbnails) {
    const candidate = stringFromUnknown(entry);
    if (candidate) {
      return getFileUrl(candidate);
    }
  }

  const fallbackThumb = stringFromUnknown(
    (project as Record<string, unknown>).thumbnail
  );
  if (fallbackThumb) {
    return getFileUrl(fallbackThumb);
  }

  const preview = stringFromUnknown(project.previewUrl);
  if (preview) {
    return getFileUrl(preview);
  }

  const cover = stringFromUnknown(
    (project as Record<string, unknown>).coverImageUrl ||
      (project as Record<string, unknown>).coverImage ||
      (project as Record<string, unknown>).heroImage
  );
  if (cover) {
    return getFileUrl(cover);
  }

  return undefined;
};









