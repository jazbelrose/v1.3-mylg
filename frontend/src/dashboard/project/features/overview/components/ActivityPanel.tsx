/**
 * ActivityPanel - Project activity feed with utility state
 * 
 * Features:
 * - Shows latest project activity (comments, approvals, uploads, edits)
 * - If empty, shows "utility state" with chat highlights and actions
 * - Single panel with internal scroll
 * - Same height as left panel (Events & Tasks)
 */

import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  FileUp,
  CheckCircle2,
  Edit3,
  Link2,
  Pin,
  ListTodo,
  ChevronRight,
  DollarSign,
  Presentation,
  Image as ImageIcon,
  Clock,
} from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import styles from '../OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface ActivityEvent {
  activityId: string;
  type: string;
  summary: string;
  createdAt: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  metadata?: {
    entityType?: string;
    entityId?: string;
    link?: string;
  };
}

interface ChatMessage {
  messageId: string;
  text: string;
  timestamp: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  hasLink?: boolean;
  linkUrl?: string;
  isPinned?: boolean;
}

interface RecentFile {
  fileId: string;
  fileName: string;
  fileType?: string;
  thumbnailUrl?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

interface RecentLink {
  linkId: string;
  url: string;
  title?: string;
  sharedAt: string;
  sharedBy?: string;
}

interface ActivityPanelProps {
  projectId: string;
  projectTitle?: string;
  activities: ActivityEvent[];
  recentMessages?: ChatMessage[];
  recentFiles?: RecentFile[];
  recentLinks?: RecentLink[];
  maxItems?: number;
  onViewAll?: () => void;
  onPinMessage?: (messageId: string) => void;
  onCreateTaskFromMessage?: (message: ChatMessage) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getActivityIcon(type: string): React.ReactNode {
  const typeLC = type?.toLowerCase() || '';
  
  if (typeLC.includes('comment') || typeLC.includes('message')) {
    return <MessageCircle size={14} />;
  }
  if (typeLC.includes('upload') || typeLC.includes('file')) {
    return <FileUp size={14} />;
  }
  if (typeLC.includes('approv') || typeLC.includes('complete') || typeLC.includes('done')) {
    return <CheckCircle2 size={14} />;
  }
  if (typeLC.includes('edit') || typeLC.includes('update')) {
    return <Edit3 size={14} />;
  }
  if (typeLC.includes('budget')) {
    return <DollarSign size={14} />;
  }
  if (typeLC.includes('slide') || typeLC.includes('deck')) {
    return <Presentation size={14} />;
  }
  if (typeLC.includes('gallery') || typeLC.includes('image')) {
    return <ImageIcon size={14} />;
  }
  if (typeLC.includes('task')) {
    return <ListTodo size={14} />;
  }
  
  return <Clock size={14} />;
}

function getActivityCategory(type: string): 'neutral' | 'success' | 'info' {
  const typeLC = type?.toLowerCase() || '';
  
  if (typeLC.includes('approv') || typeLC.includes('complete') || typeLC.includes('done')) {
    return 'success';
  }
  if (typeLC.includes('upload') || typeLC.includes('create')) {
    return 'info';
  }
  
  return 'neutral';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ActivityItemProps {
  activity: ActivityEvent;
  onClick?: () => void;
}

function ActivityItem({ activity, onClick }: ActivityItemProps) {
  const icon = getActivityIcon(activity.type);
  const category = getActivityCategory(activity.type);
  const categoryClass = category === 'success'
    ? styles.apItemSuccess
    : category === 'info'
      ? styles.apItemInfo
      : '';

  return (
    <div
      className={`${styles.apItem} ${categoryClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className={styles.apItemIcon}>{icon}</div>
      <div className={styles.apItemContent}>
        <div className={styles.apItemSummary}>{activity.summary}</div>
        <div className={styles.apItemMeta}>
          {activity.userName && <span>{activity.userName}</span>}
          <span>{formatRelativeTime(activity.createdAt)}</span>
        </div>
      </div>
      {activity.userAvatar && (
        <img
          src={activity.userAvatar}
          alt=""
          className={styles.apItemAvatar}
        />
      )}
    </div>
  );
}

interface ChatHighlightProps {
  message: ChatMessage;
  onPin?: () => void;
  onCreateTask?: () => void;
  onClick?: () => void;
}

function ChatHighlight({ message, onPin, onCreateTask, onClick }: ChatHighlightProps) {
  return (
    <div className={styles.apChatItem} onClick={onClick} role="button" tabIndex={0}>
      <div className={styles.apChatContent}>
        <div className={styles.apChatSender}>
          {message.senderName || 'Unknown'}
          {message.isPinned && <Pin size={10} className={styles.apPinnedIcon} />}
        </div>
        <div className={styles.apChatText}>{message.text}</div>
        {message.hasLink && message.linkUrl && (
          <a
            href={message.linkUrl}
            className={styles.apChatLink}
            onClick={(e) => e.stopPropagation()}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Link2 size={12} />
            <span>{message.linkUrl.replace(/^https?:\/\//, '').slice(0, 30)}...</span>
          </a>
        )}
        <div className={styles.apChatMeta}>
          {formatRelativeTime(message.timestamp)}
        </div>
      </div>
      <div className={styles.apChatActions}>
        <button
          type="button"
          className={styles.apChatAction}
          onClick={(e) => { e.stopPropagation(); onPin?.(); }}
          title="Pin message"
        >
          <Pin size={12} />
        </button>
        <button
          type="button"
          className={styles.apChatAction}
          onClick={(e) => { e.stopPropagation(); onCreateTask?.(); }}
          title="Create task from message"
        >
          <ListTodo size={12} />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ActivityPanel({
  projectId,
  projectTitle,
  activities,
  recentMessages = [],
  recentFiles = [],
  recentLinks = [],
  maxItems = 15,
  onViewAll,
  onPinMessage,
  onCreateTaskFromMessage,
}: ActivityPanelProps) {
  const navigate = useNavigate();

  const { feedItems, feedCount } = useMemo(() => {
    const items: ActivityEvent[] = [];

    activities.forEach((a) => {
      if (!a?.activityId || !a?.createdAt) return;
      items.push(a);
    });

    recentMessages.forEach((m) => {
      if (!m?.messageId || !m?.timestamp) return;
      const sender = m.senderName?.trim();
      const prefix = sender ? `${sender.split(" ")[0]}: ` : "";
      const text = (m.text || "").trim();
      if (!text) return;
      items.push({
        activityId: `message-${m.messageId}`,
        type: "message",
        summary: `${prefix}${text}`,
        createdAt: m.timestamp,
        userId: m.senderId,
        userName: m.senderName,
        userAvatar: m.senderAvatar,
      });
    });

    recentFiles.forEach((f) => {
      if (!f?.fileId || !f?.uploadedAt) return;
      const fileName = (f.fileName || "").trim();
      if (!fileName) return;
      items.push({
        activityId: `file-${f.fileId}`,
        type: "file",
        summary: `Uploaded ${fileName}`,
        createdAt: f.uploadedAt,
      });
    });

    recentLinks.forEach((l) => {
      if (!l?.linkId || !l?.url) return;
      const createdAt = l.sharedAt || new Date(0).toISOString();
      const title = (l.title || "").trim();
      const host = l.url.replace(/^https?:\/\//, "").split("/")[0] || l.url;
      items.push({
        activityId: `link-${l.linkId}`,
        type: "link",
        summary: title ? `Quick link: ${title}` : `Quick link: ${host}`,
        createdAt,
        metadata: { link: l.url },
      });
    });

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      feedItems: items.slice(0, maxItems),
      feedCount: items.length,
    };
  }, [activities, recentMessages, recentFiles, recentLinks, maxItems]);

  const hasFeed = feedItems.length > 0;
  const hasMessages = recentMessages.length > 0;
  const hasFiles = recentFiles.length > 0;
  const hasLinks = recentLinks.length > 0;

  const handleViewAll = useCallback(() => {
    if (onViewAll) {
      onViewAll();
    } else {
      navigate(getProjectDashboardPath(projectId, projectTitle, '/activity'));
    }
  }, [onViewAll, navigate, projectId, projectTitle]);

  const handleActivityClick = useCallback((activity: ActivityEvent) => {
    // Navigate based on type
    const typeLC = activity.type?.toLowerCase() || '';
    let path = '';
    
    if (typeLC.includes('budget')) path = '/budget';
    else if (typeLC.includes('slide') || typeLC.includes('deck')) path = '/slides';
    else if (typeLC.includes('task')) path = '/tasks';
    else if (typeLC.includes('gallery')) path = '/gallery';
    else if (typeLC.includes('file')) path = '/gallery';
    else if (typeLC.includes('message') || typeLC.includes('comment')) path = '/messages';
    else if (typeLC.includes('link')) {
      const url = activity.metadata?.link;
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    
    if (path) {
      navigate(getProjectDashboardPath(projectId, projectTitle, path));
    }
  }, [navigate, projectId, projectTitle]);

  const handleOpenMessages = useCallback(() => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/messages'));
  }, [navigate, projectId, projectTitle]);

  return (
    <div className={styles.apPanel}>
      {/* Header */}
      <div className={styles.apHeader}>
        <h3 className={styles.apTitle}>Activity</h3>
        {feedCount > maxItems && (
          <button
            type="button"
            className={styles.apViewAll}
            onClick={handleViewAll}
          >
            View all <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className={styles.apBody}>
        {hasFeed && (
          <div className={styles.apList}>
            {feedItems.map(activity => (
              <ActivityItem
                key={activity.activityId}
                activity={activity}
                onClick={() => handleActivityClick(activity)}
              />
            ))}
          </div>
        )}

        <div className={styles.apUtility}>
            {/* Messages Section */}
            <div className={styles.apUtilitySection}>
              <div className={styles.apSectionHeader}>
                <MessageCircle size={14} />
                <span>Messages</span>
                <button
                  type="button"
                  className={styles.apSectionLink}
                  onClick={handleOpenMessages}
                >
                  Open Chat
                </button>
              </div>
              {hasMessages ? (
                <div className={styles.apSectionContent}>
                  {recentMessages.slice(0, 3).map(msg => (
                    <div
                      key={msg.messageId}
                      className={styles.apMiniMessage}
                      onClick={handleOpenMessages}
                      role="button"
                      tabIndex={0}
                    >
                      <span className={styles.apMiniSender}>{msg.senderName?.split(' ')[0] || 'User'}:</span>
                      <span className={styles.apMiniText}>{msg.text.slice(0, 60)}{msg.text.length > 60 ? '…' : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.apSectionEmpty}>No messages yet</div>
              )}
            </div>

            {/* Recent Files Section */}
            <div className={styles.apUtilitySection}>
              <div className={styles.apSectionHeader}>
                <FileUp size={14} />
                <span>Recent Files</span>
                <button
                  type="button"
                  className={styles.apSectionLink}
                  onClick={() => navigate(getProjectDashboardPath(projectId, projectTitle, '/gallery'))}
                >
                  Gallery
                </button>
              </div>
              {hasFiles ? (
                <div className={styles.apFilesGrid}>
                  {recentFiles.slice(0, 4).map(file => (
                    <div key={file.fileId} className={styles.apFileThumb} title={file.fileName}>
                      {file.thumbnailUrl ? (
                        <img src={file.thumbnailUrl} alt={file.fileName} />
                      ) : (
                        <FileUp size={16} />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.apSectionEmpty}>No uploads yet</div>
              )}
            </div>

            {/* Recent Links Section */}
            <div className={styles.apUtilitySection}>
              <div className={styles.apSectionHeader}>
                <Link2 size={14} />
                <span>Links</span>
              </div>
              {hasLinks ? (
                <div className={styles.apSectionContent}>
                  {recentLinks.slice(0, 3).map(link => (
                    <a
                      key={link.linkId}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.apLinkItem}
                    >
                      <Link2 size={12} />
                      <span>{link.title || link.url.replace(/^https?:\/\//, '').slice(0, 35)}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className={styles.apSectionEmpty}>No links shared yet</div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}

export default ActivityPanel;
