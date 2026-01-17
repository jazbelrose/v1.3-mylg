import type { FC } from "react";

import type { ProjectLike } from "@/dashboard/home/hooks/useProjectKpis";
import SVGThumbnail from "@/dashboard/home/components/SvgThumbnail";
import Squircle from "@/shared/ui/Squircle";
import { getFileUrl } from "@/shared/utils/api";

import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";

type ProjectsIconsStripProps = {
  projects: ProjectLike[];
  pinnedOrder?: string[];
  imgError: Record<string, boolean>;
  onImageError: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
};

const MAX_ICONS = 7;

export const ProjectsIconsStrip: FC<ProjectsIconsStripProps> = ({
  projects,
  pinnedOrder,
  imgError,
  onImageError,
  onOpenProject,
}) => {
  const pinned = projects.filter((p) => Boolean((p as unknown as { pinned?: unknown })?.pinned));
  const unpinned = projects.filter((p) => !(p as unknown as { pinned?: unknown })?.pinned);

  const ordered = (() => {
    if (!pinned.length) return projects;
    if (!pinnedOrder?.length) return [...pinned, ...unpinned];

    const byId = new Map(pinned.map((p) => [p.projectId, p] as const));
    const orderedPinned = pinnedOrder.map((id) => byId.get(id)).filter(Boolean) as ProjectLike[];
    const seen = new Set(orderedPinned.map((p) => p.projectId));
    const remainderPinned = pinned.filter((p) => !seen.has(p.projectId));
    return [...orderedPinned, ...remainderPinned, ...unpinned];
  })();

  const shown = ordered.slice(0, MAX_ICONS);
  const more = Math.max(0, ordered.length - shown.length);

  return (
    <div className={mobileStyles.iconsStrip} aria-label="Quick projects">
      {shown.map((project) => {
        const id = project.projectId;
        const title = (project.title || "Untitled project").trim();
        const thumb =
          Array.isArray(project.thumbnails) && project.thumbnails[0]
            ? project.thumbnails[0]
            : undefined;

        return (
          <Squircle
            key={`icon-${id}`}
            as="button"
            type="button"
            className={mobileStyles.iconBtnSm}
            aria-label={`Open project ${title}`}
            title={title}
            onClick={() => onOpenProject(id)}
            radius={8}
          >
            {thumb && !imgError[id] ? (
              <img
                className={`${mobileStyles.thumbSm} ${mobileStyles.thumbSquircle}`}
                src={getFileUrl(thumb)}
                alt=""
                onError={() => onImageError(id)}
              />
            ) : (
              <SVGThumbnail
                initial={title.charAt(0).toUpperCase() || "#"}
                className={`${mobileStyles.thumbSm} ${mobileStyles.thumbSquircle}`}
              />
            )}
          </Squircle>
        );
      })}
      {more > 0 && (
        <span className={mobileStyles.iconsMore} aria-hidden>
          +{more}
        </span>
      )}
    </div>
  );
};












