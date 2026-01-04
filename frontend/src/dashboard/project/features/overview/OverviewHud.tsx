/**
 * OverviewHud - Main Overview HUD component for Project Dashboard
 * 
 * A Silicon Valley / Apple-grade project dashboard that replaces the
 * cluttered overview with a clean, information-dense HUD.
 * 
 * Layout:
 * - Health Strip (4 compact tiles)
 * - 2-column main content (Timeline left, Updates/Assets right)
 */

import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { HealthStrip } from './components/HealthStrip';
import { OverviewEventsAndTasks } from './components/OverviewEventsAndTasks';
import type { TimelineTask } from './components/CommandPanel';
import { ActivityPanel } from './components/ActivityPanel';
import { ProjectPoster } from './components/ProjectPoster';
import type { BudgetStats } from '@/dashboard/project/features/budget/context/types';

import styles from './OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface CalendarEvent {
  id?: string;
  eventId?: string;
  date?: string;
  startAt?: string | null;
  endAt?: string | null;
  description?: string;
  title?: string;
  allDay?: boolean;
}

interface TaskItem {
  id?: string;
  taskId?: string;
  title?: string;
  dueDate?: string;
  startAt?: string | null;
  endAt?: string | null;
  status?: string;
  assignedTo?: string | { name?: string; email?: string }[];
  address?: string;
}

interface DeckVersion {
  versionId?: string;
  title?: string;
  version?: string;
  isDefault?: boolean;
  thumbnail?: string;
  exportedAt?: string;
  createdAt?: string;
  slideCount?: number;
}

interface Gallery {
  galleryId?: string;
  title?: string;
  slug?: string;
  thumbnail?: string;
  imageCount?: number;
  images?: Array<{ thumbnailUrl?: string; url?: string }>;
}

interface ActivityEvent {
  activityId: string;
  type: string;
  summary: string;
  createdAt: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
}

interface ChatMessage {
  messageId: string;
  text: string;
  timestamp: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
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

interface OverviewHudProps {
  projectId: string;
  projectTitle?: string;
  projectColor?: string;
  startDate?: string;
  endDate?: string;
  coverImage?: string;
  address?: string;
  location?: { lat: number; lng: number };
  budgetStats: BudgetStats | null;
  events: CalendarEvent[];
  tasks: TaskItem[];
  deckVersions: DeckVersion[];
  galleries: Gallery[];
  activities: ActivityEvent[];
  recentMessages?: ChatMessage[];
  recentFiles?: RecentFile[];
  recentLinks?: RecentLink[];
  onOpenMap?: () => void;
  /** Double-click quick edit for tasks */
  onQuickEditTask?: (task: TaskItem) => void;
  /** Client mode: hides internal controls, shows only client-facing data */
  clientMode?: boolean;
  /** Called after a task/event is deleted or updated to refresh data */
  onRefresh?: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OverviewHud({
  projectId,
  projectTitle,
  projectColor,
  startDate,
  endDate,
  coverImage,
  address,
  location,
  budgetStats,
  events,
  tasks,
  deckVersions,
  galleries,
  activities,
  recentMessages,
  recentFiles,
  recentLinks,
  onOpenMap,
  onQuickEditTask,
  clientMode = false,
  onRefresh,
}: OverviewHudProps) {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const isOpenTask = useCallback((task: TaskItem): boolean => {
    const status = task.status?.toLowerCase() || '';
    return !['done', 'complete', 'completed', 'archived'].includes(status);
  }, []);

  // Filter tasks for client mode (hide internal tasks)
  const visibleTasks = clientMode
    ? tasks.filter(t => {
        const status = t.status?.toLowerCase() || '';
        // In client mode, only show tasks marked for client visibility
        // This is a simplified check - adjust based on your task schema
        return status !== 'archived' && !t.title?.toLowerCase().includes('[internal]');
      })
    : tasks;

  // Filter activities for client mode
  const visibleActivities = clientMode
    ? activities.filter(a => {
        // Filter out internal-only activity types
        const type = a.type?.toLowerCase() || '';
        return !type.includes('internal');
      })
    : activities;

  const handleOpenMap = useCallback(() => {
    if (onOpenMap) {
      onOpenMap();
      return;
    }

    navigate('/dashboard/tasks', {
      state: {
        projectId,
        from: routeLocation.pathname,
        fromContext: 'overview',
      },
    });
  }, [onOpenMap, navigate, projectId, routeLocation.pathname]);

  // Compute status metrics for poster
  const risksCount = visibleTasks.filter(t => {
    const status = t.status?.toLowerCase() || '';
    return status === 'blocked' || status === 'at-risk';
  }).length;

  const { overdueCount, tasksDueCount } = React.useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekFromNowEnd = new Date(todayStart);
    weekFromNowEnd.setDate(weekFromNowEnd.getDate() + 7);
    weekFromNowEnd.setHours(23, 59, 59, 999);

    let overdue = 0;
    let dueSoon = 0;

    visibleTasks.forEach(t => {
      if (!isOpenTask(t) || !t.dueDate) return;
      const due = new Date(t.dueDate);
      if (Number.isNaN(due.getTime())) return;

      if (due < todayStart) {
        overdue += 1;
        return;
      }

      if (due <= weekFromNowEnd) {
        dueSoon += 1;
      }
    });

    return { overdueCount: overdue, tasksDueCount: dueSoon };
  }, [visibleTasks, isOpenTask]);

  const totalTasks = visibleTasks.length;
  const completedTasks = visibleTasks.filter(t => 
    t.status?.toLowerCase() === 'done' || t.status?.toLowerCase() === 'complete'
  ).length;
  const completedPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : undefined;

  const hasBudget = Boolean(budgetStats && (budgetStats.budgetedCost || budgetStats.ballpark));

  return (
    <div className={styles.overviewHud}>
      {/* Project Poster - 2-Column Hero (Map + Info) */}
      <ProjectPoster
        projectId={projectId}
        projectTitle={projectTitle || 'Project'}
        projectColor={projectColor}
        startDate={startDate}
        endDate={endDate}
        coverImage={coverImage}
        deckVersions={deckVersions}
        locationName={address}
        locationCoords={location}
        onOpenMap={handleOpenMap}
        risksCount={risksCount}
        tasksDueCount={tasksDueCount}
        overdueCount={overdueCount}
        completedPercent={completedPercent}
        hasBudget={hasBudget}
      />

      {/* Health Strip - 4 tiles */}
      <HealthStrip
        projectId={projectId}
        projectTitle={projectTitle}
        budgetStats={clientMode ? budgetStats : budgetStats} // Could filter for client
        events={events}
        tasks={visibleTasks}
        deckVersions={deckVersions}
      />

      {/* Bottom: Two-column work surfaces (full height to bottom) */}
      <div className={styles.bottomGrid}>
        {/* Left: Events & Tasks Panel */}
        <div className={styles.bottomPanel}>
          <OverviewEventsAndTasks
            projectId={projectId}
            projectTitle={projectTitle}
            events={events}
            tasks={visibleTasks}
            onOpenMap={handleOpenMap}
            onRefresh={onRefresh}
            onQuickEditTask={onQuickEditTask ? (task: TimelineTask) => {
              // Find the original task data to pass to parent
              const originalTask = tasks.find(t => (t.id || t.taskId) === task.id);
              if (originalTask) {
                onQuickEditTask(originalTask);
              }
            } : undefined}
          />
        </div>

        {/* Right: Activity Panel */}
        <div className={styles.bottomPanel}>
          <ActivityPanel
            projectId={projectId}
            projectTitle={projectTitle}
            activities={visibleActivities}
            recentMessages={recentMessages}
            recentFiles={recentFiles}
            recentLinks={recentLinks}
            maxItems={20}
          />
        </div>
      </div>
    </div>
  );
}

export default OverviewHud;
