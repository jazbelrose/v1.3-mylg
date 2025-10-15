import React from "react";
import {
  ChevronLeft,
  Folder,
  Link as LinkIcon,
  MoreVertical,
  MessageCircle,
  Settings,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/components/ui/utils";
import { getFileUrl } from "@/shared/utils/api";
import type { TeamMember } from "./types";
import type { ProjectTabItem } from "./useProjectTabs";
import styles from "./mobile-project-header.module.css";
import Squircle from "@/shared/ui/Squircle";
import { useNavigate } from "react-router-dom";

interface MobileProjectHeaderProps {
  projectName?: string;
  projectInitial: string;
  thumbnailKey?: string | null;
  statusLabel: string;
  progressValue: number;
  rangeLabel?: string;
  teamMembers: TeamMember[];
  onOpenQuickLinks: () => void;
  onOpenFiles: () => void;
  onOpenSettings: () => void;
  onOpenTeam: () => void;
  onOpenFinishLine: () => void;
  onOpenStatus: () => void;
  onOpenThumbnail: () => void;
  onOpenChat?: () => void;
  tabs: ProjectTabItem[];
  activeTabKey?: string;
  onSelectTab: (tab: ProjectTabItem) => void;
}

const MobileProjectHeader: React.FC<MobileProjectHeaderProps> = ({
  projectName = "Summary",
  projectInitial,
  thumbnailKey,
  statusLabel,
  progressValue,
  rangeLabel,
  teamMembers,
  onOpenQuickLinks,
  onOpenFiles,
  onOpenSettings,
  onOpenTeam,
  onOpenFinishLine,
  onOpenStatus,
  onOpenThumbnail,
  onOpenChat,
  tabs,
  activeTabKey,
  onSelectTab,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const navigate = useNavigate();

  const displayedMembers = React.useMemo(
    () => teamMembers.slice(0, 3),
    [teamMembers]
  );

  const remainingCount = Math.max(teamMembers.length - displayedMembers.length, 0);

  const thumbnailSrc = React.useMemo(
    () => (thumbnailKey ? getFileUrl(thumbnailKey) : undefined),
    [thumbnailKey]
  );

  const handleSelectTab = (tab: ProjectTabItem) => {
    onSelectTab(tab);
  };

  const handleBackToDashboard = React.useCallback(() => {
    navigate("/dashboard/projects");
  }, [navigate]);

  const handleOpenChat = React.useCallback(() => {
    if (onOpenChat) {
      onOpenChat();
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("project-open-chat"));
    }
  }, [onOpenChat]);

  const statusBadgeLabel = React.useMemo(() => {
    if (Number.isFinite(progressValue)) {
      return statusLabel;
    }
    return statusLabel;
  }, [progressValue, statusLabel]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.topRow}>
        <div className={styles.projectSection}>
          <button
            type="button"
            onClick={handleBackToDashboard}
            className={styles.backButton}
            aria-label="Return to dashboard"
          >
            <ChevronLeft className={styles.backIcon} />
          </button>
          <Squircle
            as="button"
            type="button"
            onClick={onOpenThumbnail}
            className={styles.logoWrapper}
            aria-label="Change project thumbnail"
            radius={18}
            smoothing={0.88}
          >
            {thumbnailSrc ? (
              <img src={thumbnailSrc} alt={projectName} />
            ) : (
              <span className={styles.logoInitial}>{projectInitial.toUpperCase()}</span>
            )}
          </Squircle>

          <div className={styles.projectMeta}>
            <div className={styles.infoGroup}>
              <h1 className={styles.projectName}>{projectName}</h1>
              <button
                type="button"
                onClick={onOpenStatus}
                className="reset"
                style={{ border: "none", background: "transparent", padding: 0 }}
                aria-label="Update project status"
              >
                <Badge variant="outline" className={styles.progressBadge}>
                  {statusBadgeLabel}
                </Badge>
              </button>
            </div>

            {rangeLabel ? (
              <button
                type="button"
                onClick={onOpenFinishLine}
                className="reset"
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                }}
                aria-label="Edit project schedule"
              >
                <div className={styles.dateText}>{rangeLabel}</div>
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.rightGroup}>
          <button
            type="button"
            onClick={onOpenTeam}
            className={cn(styles.avatarGroup, "reset")}
            style={{ border: "none", background: "transparent", padding: 0 }}
            aria-label="View project team"
          >
            {displayedMembers.map((member) => {
              const fallback = `${(member.firstName?.[0] || "").toUpperCase()}${(
                member.lastName?.[0] || ""
              ).toUpperCase()}`.trim();
              return (
                <Avatar
                  key={member.userId}
                  src={member.thumbnail ? getFileUrl(member.thumbnail) : undefined}
                  alt={`${member.firstName} ${member.lastName}`.trim()}
                  fallback={fallback || projectInitial.toUpperCase()}
                  className={cn(styles.avatarOverlap)}
                />
              );
            })}
            {remainingCount > 0 ? (
              <div className={cn(styles.moreCount, styles.avatarOverlap)}>
                +{remainingCount}
              </div>
            ) : null}
          </button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.chatButton}
            onClick={handleOpenChat}
            aria-label="Open project chat"
          >
            <MessageCircle />
          </Button>

          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open project actions"
              >
                <MoreVertical />
              </Button>
            </PopoverTrigger>
            <PopoverContent className={styles.menuList} role="menu">
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenQuickLinks();
                }}
              >
                <LinkIcon />
                Links
              </button>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenFiles();
                }}
              >
                <Folder />
                Files
              </button>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
              >
                <Settings />
                Settings
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className={cn(styles.tabs)}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTabKey;
          return (
            <Button
              key={tab.key}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn(styles.tabButton, isActive && styles.tabButtonActive)}
              onClick={() => handleSelectTab(tab)}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileProjectHeader;
