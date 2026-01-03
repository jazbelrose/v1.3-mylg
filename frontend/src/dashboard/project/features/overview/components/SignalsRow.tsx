/**
 * SignalsRow - Three small, dense, skimmable signal cards
 * 
 * 1. Risks - "4 overdue" + 1-line top risk, CTA: Open Tasks
 * 2. Next Milestone - "Next: Client review" + date/time, CTA: Schedule review
 * 3. Activity (only if non-empty) - Last 3 updates max
 * 
 * If a section is empty, collapse it entirely.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  Calendar, 
  Activity as ActivityIcon,
  ChevronRight,
  Clock
} from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { formatRelativeTime } from '../utils';
import styles from '../OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface TaskItem {
  id?: string;
  taskId?: string;
  title?: string;
  dueDate?: string;
  status?: string;
  done?: boolean;
}

interface CalendarEvent {
  id?: string;
  eventId?: string;
  date?: string;
  title?: string;
  description?: string;
}

interface ActivityEvent {
  activityId: string;
  type: string;
  summary: string;
  createdAt: string;
  userName?: string;
}

interface SignalsRowProps {
  projectId: string;
  projectTitle?: string;
  tasks: TaskItem[];
  events: CalendarEvent[];
  activities: ActivityEvent[];
}

// ============================================================================
// RISK CARD
// ============================================================================

interface RiskCardProps {
  projectId: string;
  projectTitle?: string;
  overdueCount: number;
  blockedCount: number;
  topRisk?: string;
}

function RiskCard({ projectId, projectTitle, overdueCount, blockedCount, topRisk }: RiskCardProps) {
  const navigate = useNavigate();
  const totalRisks = overdueCount + blockedCount;
  
  // Don't render if no risks
  if (totalRisks === 0) return null;
  
  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks'));
  };
  
  const riskLabel = useMemo(() => {
    const parts: string[] = [];
    if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
    if (blockedCount > 0) parts.push(`${blockedCount} blocked`);
    return parts.join(', ');
  }, [overdueCount, blockedCount]);
  
  return (
    <div 
      className={`${styles.signalCard} ${styles.signalCardWarning}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
    >
      <div className={styles.signalHeader}>
        <AlertTriangle size={14} className={styles.signalIcon} />
        <span className={styles.signalTitle}>Risks</span>
      </div>
      <div className={styles.signalMetric}>{riskLabel}</div>
      {topRisk && (
        <div className={styles.signalSubtext}>{topRisk}</div>
      )}
      <div className={styles.signalCta}>
        Open Tasks <ChevronRight size={12} />
      </div>
    </div>
  );
}

// ============================================================================
// MILESTONE CARD
// ============================================================================

interface MilestoneCardProps {
  projectId: string;
  projectTitle?: string;
  nextEvent: CalendarEvent | null;
}

function MilestoneCard({ projectId, projectTitle, nextEvent }: MilestoneCardProps) {
  const navigate = useNavigate();
  
  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar'));
  };
  
  const formattedDate = useMemo(() => {
    if (!nextEvent?.date) return null;
    const date = new Date(nextEvent.date);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  }, [nextEvent?.date]);
  
  return (
    <div 
      className={styles.signalCard}
      onClick={handleClick}
      role="button"
      tabIndex={0}
    >
      <div className={styles.signalHeader}>
        <Calendar size={14} className={styles.signalIcon} />
        <span className={styles.signalTitle}>Next Milestone</span>
      </div>
      {nextEvent ? (
        <>
          <div className={styles.signalMetric}>
            {nextEvent.title || nextEvent.description || 'Upcoming event'}
          </div>
          {formattedDate && (
            <div className={styles.signalSubtext}>
              <Clock size={10} /> {formattedDate}
            </div>
          )}
        </>
      ) : (
        <div className={styles.signalMetric}>Not scheduled</div>
      )}
      <div className={styles.signalCta}>
        {nextEvent ? 'View Calendar' : 'Schedule milestone'} <ChevronRight size={12} />
      </div>
    </div>
  );
}

// ============================================================================
// ACTIVITY CARD
// ============================================================================

interface ActivityCardProps {
  projectId: string;
  projectTitle?: string;
  activities: ActivityEvent[];
}

function ActivityCard({ projectId, projectTitle, activities }: ActivityCardProps) {
  const navigate = useNavigate();
  
  // Don't render if no activities
  if (activities.length === 0) return null;
  
  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/activity'));
  };
  
  const recentActivities = activities.slice(0, 3);
  
  return (
    <div 
      className={styles.signalCard}
      onClick={handleClick}
      role="button"
      tabIndex={0}
    >
      <div className={styles.signalHeader}>
        <ActivityIcon size={14} className={styles.signalIcon} />
        <span className={styles.signalTitle}>Activity</span>
      </div>
      <div className={styles.signalActivityList}>
        {recentActivities.map(activity => (
          <div key={activity.activityId} className={styles.signalActivityItem}>
            <span className={styles.signalActivityText}>{activity.summary}</span>
            <span className={styles.signalActivityTime}>
              {formatRelativeTime(activity.createdAt)}
            </span>
          </div>
        ))}
      </div>
      {activities.length > 3 && (
        <div className={styles.signalCta}>
          View all <ChevronRight size={12} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SignalsRow({
  projectId,
  projectTitle,
  tasks,
  events,
  activities,
}: SignalsRowProps) {
  // Calculate risks
  const { overdueCount, blockedCount, topRisk } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let overdue = 0;
    let blocked = 0;
    let topRiskTask: string | undefined;
    
    for (const task of tasks) {
      if (task.done) continue;
      
      const status = task.status?.toLowerCase() || '';
      
      if (status === 'blocked' || status === 'at-risk') {
        blocked++;
        if (!topRiskTask && task.title) {
          topRiskTask = task.title;
        }
      } else if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        if (dueDate < today) {
          overdue++;
          if (!topRiskTask && task.title) {
            topRiskTask = `"${task.title}" is overdue`;
          }
        }
      }
    }
    
    return { overdueCount: overdue, blockedCount: blocked, topRisk: topRiskTask };
  }, [tasks]);
  
  // Find next upcoming event
  const nextEvent = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcoming = events
      .filter(e => e.date && new Date(e.date) >= today)
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
    
    return upcoming[0] || null;
  }, [events]);
  
  const hasRisks = overdueCount + blockedCount > 0;
  const hasActivities = activities.length > 0;
  
  // If nothing to show, don't render the row
  if (!hasRisks && !nextEvent && !hasActivities) {
    return null;
  }
  
  return (
    <div className={styles.signalsRow}>
      <RiskCard
        projectId={projectId}
        projectTitle={projectTitle}
        overdueCount={overdueCount}
        blockedCount={blockedCount}
        topRisk={topRisk}
      />
      <MilestoneCard
        projectId={projectId}
        projectTitle={projectTitle}
        nextEvent={nextEvent}
      />
      <ActivityCard
        projectId={projectId}
        projectTitle={projectTitle}
        activities={activities}
      />
    </div>
  );
}

export default SignalsRow;
