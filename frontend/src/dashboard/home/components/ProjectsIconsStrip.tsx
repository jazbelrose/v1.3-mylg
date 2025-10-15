import type { FC } from "react";

import type { ProjectLike } from "@/dashboard/home/hooks/useProjectKpis";
import SVGThumbnail from "@/dashboard/home/components/SvgThumbnail";
import Squircle from "@/shared/ui/Squircle";
import { getFileUrl } from "@/shared/utils/api";

import mobileStyles from "@/dashboard/home/components/projects-panel.module.css";

type ProjectsIconsStripProps = {
  projects: ProjectLike[];
  imgError: Record<string, boolean>;
  onImageError: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
};

const MAX_ICONS = 7;

export const ProjectsIconsStrip: FC<ProjectsIconsStripProps> = ({
  projects,
  imgError,
  onImageError,
  onOpenProject,
}) => {
  const shown = projects.slice(0, MAX_ICONS);
  const more = Math.max(0, projects.length - shown.length);

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












