import type { KeyboardEvent } from "react";

import { Folder, Link2, MessageCircle } from "lucide-react";

import AvatarStack from "@/shared/ui/AvatarStack";
import Squircle from "@/shared/ui/Squircle";

import type { Project } from "@/app/contexts/DataProvider";

import ProjectTabs from "./ProjectTabs";
import type { TeamMember } from "./types";
import type { ProjectTabItem } from "./useProjectTabs";

interface NavigationProps {
  tabs: ProjectTabItem[];
  activeIndex: number;
  storageKey: string;
  getFromIndex: () => number;
  confirmNavigate: (path: string) => void;
}

interface DesktopProjectHeaderProps {
  project: Project;
  projectInitial: string;
  displayStatus: string;
  progressValue: number;
  rangeLabel: string;
  dateRangeLabel: string | null;
  hoursLabel: string;
  handleKeyDown: (event: KeyboardEvent, action: () => void) => void;
  onOpenStatus: () => void;
  onOpenFinishLine: () => void;
  onOpenIdentity: () => void;
  onOpenQuickLinks: () => void;
  onOpenFiles: () => void;
  onOpenThumbnail: () => void;
  onOpenTeam: () => void;
  teamMembers: TeamMember[];
  navigation: NavigationProps;
  getFileUrlForThumbnail: (thumbnail: string) => string;
  onOpenChat?: () => void;
  isChatHidden?: boolean;
}

const DesktopProjectHeader = ({
  project,
  projectInitial,
  displayStatus,
  progressValue,
  rangeLabel,
  dateRangeLabel,
  hoursLabel,
  handleKeyDown,
  onOpenStatus,
  onOpenFinishLine,
  onOpenIdentity,
  onOpenQuickLinks,
  onOpenFiles,
  onOpenThumbnail,
  onOpenTeam,
  teamMembers,
  navigation,
  getFileUrlForThumbnail,
  onOpenChat,
  isChatHidden,
}: DesktopProjectHeaderProps) => {
  const thumbnailKey = project?.thumbnails?.[0] as string | undefined;

  return (
    <div className="project-header">
      <div className="header-content">
        <div className="left-side">
          <div className="project-identity">
            <div className="project-logo-wrapper">
              <Squircle
                as="button"
                type="button"
                onClick={onOpenThumbnail}
                title="Change Project Thumbnail"
                aria-label="Change Project Thumbnail"
                className="interactive project-logo-button"
                radius={18}
                smoothing={0.88}
              >
                {thumbnailKey ? (
                  <img
                    src={getFileUrlForThumbnail(thumbnailKey)}
                    alt="Project Thumbnail"
                    className="project-logo-image"
                  />
                ) : (
                  <span className="project-logo-initial">{projectInitial.toUpperCase()}</span>
                )}
              </Squircle>
            </div>

            <div className="project-text-group">
              <div className="single-project-title project-title-row">
                <h2 className="project-title-heading">
                  <button
                    type="button"
                    className="project-title-button interactive"
                    onClick={onOpenIdentity}
                    onKeyDown={(event) => handleKeyDown(event, onOpenIdentity)}
                    title="Edit project identity"
                    aria-label="Edit project identity"
                  >
                    {project?.title || "Summary"}
                  </button>
                </h2>

                <div
                  className="finish-line-header interactive"
                  onClick={onOpenFinishLine}
                  onKeyDown={(event) => handleKeyDown(event, onOpenFinishLine)}
                  role="button"
                  tabIndex={0}
                  title={rangeLabel}
                  aria-label={rangeLabel}
                  style={{ cursor: "pointer" }}
                >
                  <span className="finish-line-label">
                    {dateRangeLabel ? (
                      <span className="finish-line-date">{dateRangeLabel}</span>
                    ) : null}
                    {dateRangeLabel ? (
                      <span className="finish-line-separator" aria-hidden="true">
                        •
                      </span>
                    ) : null}
                    <span className="finish-line-hours">{hoursLabel}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="project-quick-actions">
            <svg
              id="StatusSVG"
              viewBox="0 0 400 400"
              onClick={onOpenStatus}
              onKeyDown={(event) => handleKeyDown(event, onOpenStatus)}
              role="button"
              tabIndex={0}
              aria-label={`Status: ${displayStatus} Complete`}
              className="interactive status-svg"
              style={{ cursor: "pointer" }}
            >
              <title>{`Status: ${displayStatus} Complete`}</title>
              <text
                className="project-status"
                transform={`translate(${progressValue !== 100 ? 75 : 56.58} 375.21)`}
              >
                <tspan x="22.5" y="-136">
                  {displayStatus}
                </tspan>
              </text>
              {progressValue >= 0 && (
                <ellipse
                  cx="200"
                  cy="200"
                  rx="160"
                  ry="160"
                  fill="none"
                  strokeWidth="15"
                  strokeDasharray={`${(progressValue / 100) * 1002}, 1004`}
                  style={{
                    stroke: "var(--progress-accent, var(--accent-strong, #FA3356))",
                  }}
                >
                  {progressValue < 100 && (
                    <animate
                      attributeName="stroke-dasharray"
                      from="0, 1004"
                      to={`${(progressValue / 100) * 1002}, 1004`}
                      dur="1s"
                      begin="0s"
                      fill="freeze"
                    />
                  )}
                </ellipse>
              )}
            </svg>

            <div
              onClick={onOpenQuickLinks}
              onKeyDown={(event) => handleKeyDown(event, onOpenQuickLinks)}
              role="button"
              tabIndex={0}
              title="Quick links"
              aria-label="Quick links"
              className="interactive icon-button"
            >
              <Link2 size={20} />
            </div>

            <div
              onClick={onOpenFiles}
              onKeyDown={(event) => handleKeyDown(event, onOpenFiles)}
              role="button"
              tabIndex={0}
              title="Open file manager"
              aria-label="Open file manager"
              className="interactive icon-button"
            >
              <Folder size={20} />
            </div>

            
            <button
              type="button"
              onClick={() => {
                if (onOpenChat) {
                  onOpenChat();
                } else if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("project-open-chat"));
                }
              }}
              className="interactive icon-button"
              aria-label={isChatHidden ? "Open project chat" : "Show project chat"}
              title={isChatHidden ? "Open project chat" : "Show project chat"}
              aria-pressed={!isChatHidden}
            >
              <MessageCircle size={20} />
            </button>

            <div
              onClick={onOpenTeam}
              onKeyDown={(event) => handleKeyDown(event, onOpenTeam)}
              role="button"
              tabIndex={0}
              title="View project team"
              aria-label="View project team"
              className="interactive project-team-stack"
            >
              <AvatarStack members={teamMembers} />
            </div>

          </div>
        </div>

        <div className="right-side">
          <div className="project-nav-tabs">
            <ProjectTabs
              tabs={navigation.tabs}
              activeIndex={navigation.activeIndex}
              getFromIndex={navigation.getFromIndex}
              storageKey={navigation.storageKey}
              confirmNavigate={navigation.confirmNavigate}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopProjectHeader;
