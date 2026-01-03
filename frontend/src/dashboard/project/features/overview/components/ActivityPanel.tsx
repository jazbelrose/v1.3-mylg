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

interface ActivityPanelProps {
  projectId: string;
  projectTitle?: string;
  activities: ActivityEvent[];
  recentMessages?: ChatMessage[];
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
  maxItems = 15,
  onViewAll,
  onPinMessage,
  onCreateTaskFromMessage,
}: ActivityPanelProps) {
  const navigate = useNavigate();

  const displayedActivities = useMemo(() => {
    return activities.slice(0, maxItems);
  }, [activities, maxItems]);

  const hasActivity = displayedActivities.length > 0;
  const hasMessages = recentMessages.length > 0;
  const showUtilityState = !hasActivity;

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
    else if (typeLC.includes('message') || typeLC.includes('comment')) path = '/messages';
    
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
        {activities.length > maxItems && (
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
        {showUtilityState ? (
          // Utility State - Tile-based layout for empty state
          <div className={styles.apUtility}>
            {/* Chat Highlights Tile - Primary */}
            <div className={styles.apUtilityTile}>
              <div className={styles.apTileHeader}>
                <MessageCircle size={14} />
                <span>Messages</span>
              </div>
              {hasMessages ? (
                <div className={styles.apTileContent}>
                  {recentMessages.slice(0, 2).map(msg => (
                    <div
                      key={msg.messageId}
                      className={styles.apMiniMessage}
                      onClick={handleOpenMessages}
                      role="button"
                      tabIndex={0}
                    >
                      <span className={styles.apMiniSender}>{msg.senderName?.split(' ')[0] || 'User'}:</span>
                      <span className={styles.apMiniText}>{msg.text.slice(0, 50)}{msg.text.length > 50 ? '…' : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.apTileEmpty}>
                  <span>No messages yet</span>
                </div>
              )}
              <button
                type="button"
                className={styles.apTileAction}
                onClick={handleOpenMessages}
              >
                Open Chat <ChevronRight size={12} />
              </button>
            </div>

            {/* Stats Row */}
            <div className={styles.apUtilityStats}>
              <div className={styles.apStatTile}>
                <Pin size={12} />
                <span className={styles.apStatValue}>0</span>
                <span className={styles.apStatLabel}>Pinned</span>
              </div>
              <div className={styles.apStatTile}>
                <Link2 size={12} />
                <span className={styles.apStatValue}>0</span>
                <span className={styles.apStatLabel}>Links</span>
              </div>
              <div className={styles.apStatTile}>
                <FileUp size={12} />
                <span className={styles.apStatValue}>0</span>
                <span className={styles.apStatLabel}>Uploads</span>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className={styles.apQuickGrid}>
              <button
                type="button"
                className={styles.apGridAction}
                onClick={() => navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks?action=new'))}
              >
                <ListTodo size={16} />
                <span>New Task</span>
              </button>
              <button
                type="button"
                className={styles.apGridAction}
                onClick={() => navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar?action=new'))}
              >
                <Clock size={16} />
                <span>Schedule</span>
              </button>
              <button
                type="button"
                className={styles.apGridAction}
                onClick={() => navigate(getProjectDashboardPath(projectId, projectTitle, '/gallery?action=upload'))}
              >
                <FileUp size={16} />
                <span>Upload</span>
              </button>
            </div>
          </div>
        ) : (
          // Activity Feed
          <div className={styles.apList}>
            {displayedActivities.map(activity => (
              <ActivityItem
                key={activity.activityId}
                activity={activity}
                onClick={() => handleActivityClick(activity)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityPanel;
