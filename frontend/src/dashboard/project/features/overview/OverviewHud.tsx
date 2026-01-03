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
import { EventsTasksPanel } from './components/EventsTasksPanel';
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
  location,
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
        completedPercent={completedPercent}
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
          <EventsTasksPanel
            projectId={projectId}
            projectTitle={projectTitle}
            events={events}
            tasks={visibleTasks}
            onOpenMap={handleOpenMap}
          />
        </div>

        {/* Right: Activity Panel */}
        <div className={styles.bottomPanel}>
          <ActivityPanel
            projectId={projectId}
            projectTitle={projectTitle}
            activities={visibleActivities}
            maxItems={20}
          />
        </div>
      </div>
    </div>
  );
}

export default OverviewHud;
