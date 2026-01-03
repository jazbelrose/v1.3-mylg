/**
 * RecentUpdates - Activity feed for Overview HUD
 * 
 * Shows the last 6 activities with links to source.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { formatRelativeTime, getActivityIcon } from '../utils';
import type { RecentUpdate } from '../types';
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
}

interface RecentUpdatesProps {
  projectId: string;
  projectTitle?: string;
  activities: ActivityEvent[];
  maxItems?: number;
  onViewAll?: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function mapActivityToUpdate(activity: ActivityEvent): RecentUpdate {
  // Map activity type to our simplified types
  let type: RecentUpdate['type'] = 'project';
  const actType = activity.type?.toLowerCase() || '';
  
  if (actType.includes('budget')) type = 'budget';
  else if (actType.includes('slide') || actType.includes('deck')) type = 'slide';
  else if (actType.includes('file') || actType.includes('upload')) type = 'file';
  else if (actType.includes('task')) type = 'task';
  else if (actType.includes('comment')) type = 'comment';
  else if (actType.includes('gallery')) type = 'gallery';

  return {
    id: activity.activityId,
    type,
    summary: activity.summary,
    timestamp: activity.createdAt,
    userId: activity.userId,
    userName: activity.userName,
    userAvatar: activity.userAvatar,
    icon: getActivityIcon(type),
  };
}

// ============================================================================
// UPDATE ITEM
// ============================================================================

interface UpdateItemProps {
  update: RecentUpdate;
  onClick?: () => void;
}

function UpdateItem({ update, onClick }: UpdateItemProps) {
  return (
    <div className={styles.updateItem} onClick={onClick} role="button" tabIndex={0}>
      <div className={styles.updateIcon}>{update.icon}</div>
      
      <div className={styles.updateContent}>
        <div className={styles.updateSummary}>{update.summary}</div>
        <div className={styles.updateMeta}>
          {update.userName && <span>{update.userName}</span>}
          <span>{formatRelativeTime(update.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RecentUpdates({
  projectId,
  projectTitle,
  activities,
  maxItems = 6,
  onViewAll,
}: RecentUpdatesProps) {
  const navigate = useNavigate();

  const updates = useMemo(() => {
    return activities
      .slice(0, maxItems)
      .map(mapActivityToUpdate);
  }, [activities, maxItems]);

  const handleViewAll = () => {
    if (onViewAll) {
      onViewAll();
    } else {
      // Navigate to activity page if available
      navigate(getProjectDashboardPath(projectId, projectTitle, '/activity'));
    }
  };

  const handleUpdateClick = (update: RecentUpdate) => {
    // Navigate based on type
    let path = '';
    switch (update.type) {
      case 'budget':
        path = '/budget';
        break;
      case 'slide':
        path = '/slides';
        break;
      case 'task':
        path = '/tasks';
        break;
      case 'gallery':
        path = '/gallery';
        break;
      default:
        path = '';
    }
    if (path) {
      navigate(getProjectDashboardPath(projectId, projectTitle, path));
    }
  };

  return (
    <div className={styles.updatesCard}>
      <div className={styles.updatesHeader}>
        <span className={styles.updatesTitle}>Recent Updates</span>
        {activities.length > maxItems && (
          <span className={styles.healthTileCta} onClick={handleViewAll}>
            View all <ChevronRight size={12} />
          </span>
        )}
      </div>

      <div className={styles.updatesList}>
        {updates.length === 0 ? (
          <div className={styles.updatesEmpty}>
            No recent activity. Changes will appear here.
          </div>
        ) : (
          updates.map(update => (
            <UpdateItem
              key={update.id}
              update={update}
              onClick={() => handleUpdateClick(update)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default RecentUpdates;
