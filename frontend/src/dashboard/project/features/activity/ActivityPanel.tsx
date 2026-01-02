/**
 * ActivityPanel - Display project activity timeline
 * 
 * Shows a chronological list of activity events for a project,
 * including batched edit summaries, file uploads, task changes, etc.
 */

import React from 'react';
import { useProjectActivity, ActivityEvent } from './hooks/useProjectActivity';
import styles from './ActivityPanel.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface ActivityPanelProps {
  projectId: string;
  className?: string;
}

interface ActivityItemProps {
  activity: ActivityEvent;
  formatRelativeTime: (date: string) => string;
}

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Get icon for activity type
 */
function getActivityIcon(type: ActivityEvent['type']): string {
  const icons: Record<string, string> = {
    slide_edit: '✏️',
    slide_create: '➕',
    slide_delete: '🗑️',
    slide_reorder: '↕️',
    slide_duplicate: '📋',
    deck_create: '📊',
    deck_rename: '✍️',
    deck_publish: '🚀',
    budget_update: '💰',
    budget_revision: '📝',
    file_upload: '📎',
    file_delete: '🗑️',
    file_rename: '✍️',
    task_create: '✅',
    task_update: '🔄',
    task_complete: '✓',
    project_settings: '⚙️',
    comment_add: '💬',
    comment_resolve: '✓',
  };
  return icons[type] || '📋';
}

/**
 * Single activity item
 */
function ActivityItem({ activity, formatRelativeTime }: ActivityItemProps) {
  const { userName, userAvatar, summary, createdAt, changeCount, changes } = activity;
  
  return (
    <div className={styles.activityItem}>
      <div className={styles.activityAvatar}>
        {userAvatar ? (
          <img src={userAvatar} alt={userName} className={styles.avatar} />
        ) : (
          <div className={styles.avatarFallback}>
            {userName?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
      </div>
      
      <div className={styles.activityContent}>
        <div className={styles.activityHeader}>
          <span className={styles.icon}>{getActivityIcon(activity.type)}</span>
          <span className={styles.summary}>{summary}</span>
        </div>
        
        {changes && changes.length > 0 && changeCount && changeCount > 3 && (
          <details className={styles.changesDetails}>
            <summary className={styles.changesSummary}>
              {changeCount} changes
            </summary>
            <ul className={styles.changesList}>
              {changes.slice(0, 10).map((change, idx) => (
                <li key={idx} className={styles.changeItem}>
                  Slide {change.slideNumber}: {change.changeType}
                  {change.description && ` - ${change.description}`}
                </li>
              ))}
              {changes.length > 10 && (
                <li className={styles.changeItem}>
                  +{changes.length - 10} more...
                </li>
              )}
            </ul>
          </details>
        )}
        
        <div className={styles.activityMeta}>
          <span className={styles.timestamp}>
            {formatRelativeTime(createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Activity Panel component
 */
export function ActivityPanel({ projectId, className }: ActivityPanelProps) {
  const { activities, loading, error, formatRelativeTime } = useProjectActivity(projectId);

  if (!projectId) {
    return null;
  }

  return (
    <div className={`${styles.activityPanel} ${className || ''}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Activity</h3>
      </div>

      <div className={styles.activityList}>
        {loading && activities.length === 0 && (
          <div className={styles.loading}>Loading activity...</div>
        )}

        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {!loading && activities.length === 0 && (
          <div className={styles.empty}>
            No activity yet. Edits and changes will appear here.
          </div>
        )}

        {activities.map(activity => (
          <ActivityItem
            key={activity.activityId}
            activity={activity}
            formatRelativeTime={formatRelativeTime}
          />
        ))}
      </div>
    </div>
  );
}

export default ActivityPanel;
