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
import { useNavigate } from 'react-router-dom';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';

import { HealthStrip } from './components/HealthStrip';
import { TimelineNext7Days } from './components/TimelineNext7Days';
import { RecentUpdates } from './components/RecentUpdates';
import { AssetsPreview } from './components/AssetsPreview';
import { LocationRow } from './components/LocationRow';
import { ProjectPoster } from './components/ProjectPoster';
import type { BudgetStats } from '@/dashboard/project/features/budget/context/types';
import type { TimelineItem } from './types';

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

interface OverviewHudProps {
  projectId: string;
  projectTitle?: string;
  projectColor?: string;
  startDate?: string;
  endDate?: string;
  coverImage?: string;
  address?: string;
  budgetStats: BudgetStats | null;
  events: CalendarEvent[];
  tasks: TaskItem[];
  deckVersions: DeckVersion[];
  galleries: Gallery[];
  activities: ActivityEvent[];
  onOpenMap?: () => void;
  /** Client mode: hides internal controls, shows only client-facing data */
  clientMode?: boolean;
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
  budgetStats,
  events,
  tasks,
  deckVersions,
  galleries,
  activities,
  onOpenMap,
  clientMode = false,
}: OverviewHudProps) {
  const navigate = useNavigate();

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
    }
    // Map modal functionality would be implemented here if needed
  }, [onOpenMap]);

  const handleTimelineItemClick = useCallback((item: TimelineItem) => {
    const path = item.type === 'event' ? '/calendar' : '/tasks';
    navigate(getProjectDashboardPath(projectId, projectTitle, path));
  }, [navigate, projectId, projectTitle]);

  // Compute status metrics for poster
  const risksCount = visibleTasks.filter(t => {
    const status = t.status?.toLowerCase() || '';
    return status === 'blocked' || status === 'at-risk';
  }).length;

  const tasksDueCount = visibleTasks.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    const today = new Date();
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return due <= weekFromNow;
  }).length;

  const totalTasks = visibleTasks.length;
  const completedTasks = visibleTasks.filter(t => 
    t.status?.toLowerCase() === 'done' || t.status?.toLowerCase() === 'complete'
  ).length;
  const completedPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : undefined;

  return (
    <div className={styles.overviewHud}>
      {/* Project Poster - Hero Visual */}
      <ProjectPoster
        projectId={projectId}
        projectTitle={projectTitle || 'Project'}
        projectColor={projectColor}
        startDate={startDate}
        endDate={endDate}
        coverImage={coverImage}
        deckVersions={deckVersions}
        galleries={galleries}
        risksCount={risksCount}
        tasksDueCount={tasksDueCount}
        completedPercent={completedPercent}
      />

      {/* Location Row (compact) */}
      {address && (
        <LocationRow address={address} onOpenMap={handleOpenMap} />
      )}

      {/* Health Strip - 4 tiles */}
      <HealthStrip
        projectId={projectId}
        projectTitle={projectTitle}
        budgetStats={clientMode ? budgetStats : budgetStats} // Could filter for client
        events={events}
        tasks={visibleTasks}
        deckVersions={deckVersions}
      />

      {/* Main 2-column content */}
      <div className={styles.mainContent}>
        {/* Left: Timeline */}
        <div className={styles.leftColumn}>
          <TimelineNext7Days
            projectId={projectId}
            projectTitle={projectTitle}
            events={events}
            tasks={visibleTasks}
            onItemClick={handleTimelineItemClick}
          />
        </div>

        {/* Right: Updates + Assets */}
        <div className={styles.rightColumn}>
          <RecentUpdates
            projectId={projectId}
            projectTitle={projectTitle}
            activities={visibleActivities}
            maxItems={6}
          />

          <AssetsPreview
            projectId={projectId}
            projectTitle={projectTitle}
            deckVersions={deckVersions}
            galleries={galleries}
          />
        </div>
      </div>
    </div>
  );
}

export default OverviewHud;
