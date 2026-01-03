/**
 * HealthStrip - 4 compact health tiles for the Overview HUD
 * 
 * Displays: Budget Health | Schedule Health | Deliverables | Risks/Blockers
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, DollarSign, Calendar, FileText, AlertTriangle } from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import {
  computeBudgetHealth,
  computeScheduleHealth,
  computeDeliverablesHealth,
  computeRisksHealth,
  formatCurrency,
  formatVariance,
  formatRelativeTime,
} from '../utils';
import type { BudgetStats } from '@/dashboard/project/features/budget/context/types';
import styles from "../OverviewHud.module.css";

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
}

interface DeckVersion {
  versionId?: string;
  title?: string;
  version?: string;
  isDefault?: boolean;
  exportedAt?: string;
  createdAt?: string;
  approvalState?: string;
}

interface HealthStripProps {
  projectId: string;
  projectTitle?: string;
  budgetStats: BudgetStats | null;
  events: CalendarEvent[];
  tasks: TaskItem[];
  deckVersions: DeckVersion[];
}

// ============================================================================
// BUDGET TILE
// ============================================================================

interface BudgetTileProps {
  projectId: string;
  projectTitle?: string;
  stats: BudgetStats | null;
}

function BudgetTile({ projectId, projectTitle, stats }: BudgetTileProps) {
  const navigate = useNavigate();
  const health = useMemo(() => computeBudgetHealth(stats), [stats]);

  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/budget'));
  };

  const statusClass = health.status === 'over-budget' 
    ? 'critical' 
    : health.status === 'on-track' 
      ? 'healthy' 
      : 'neutral';

  // Calculate bar percentages
  const maxValue = Math.max(health.approved, health.actual, 1);
  const approvedPercent = (health.approved / maxValue) * 100;
  const actualPercent = (health.actual / maxValue) * 100;
  const isOver = health.actual > health.approved;

  return (
    <div className={styles.healthTile} onClick={handleClick} role="button" tabIndex={0}>
      <div className={styles.healthTileHeader}>
        <div className={styles.healthTileTitle}>
          <DollarSign className={styles.healthTileIcon} />
          Budget
        </div>
        <div className={`${styles.statusDot} ${styles[statusClass]}`} />
      </div>

      <div className={styles.healthTileBody}>
        {health.hasData ? (
          <>
            <div className={styles.healthTileMetric}>
              <span className={styles.healthTilePrimary}>
                {formatCurrency(health.actual)}
              </span>
              <span className={styles.healthTileSecondary}>
                / {formatCurrency(health.approved)}
              </span>
            </div>
            
            <div className={styles.miniBar}>
              {!isOver && (
                <>
                  <div
                    className={`${styles.miniBarSegment} ${styles.actual}`}
                    style={{ width: `${actualPercent}%` }}
                  />
                  <div
                    className={`${styles.miniBarSegment} ${styles.approved}`}
                    style={{ width: `${approvedPercent - actualPercent}%`, opacity: 0.3 }}
                  />
                </>
              )}
              {isOver && (
                <>
                  <div
                    className={`${styles.miniBarSegment} ${styles.approved}`}
                    style={{ width: `${approvedPercent}%` }}
                  />
                  <div
                    className={`${styles.miniBarSegment} ${styles.over}`}
                    style={{ width: `${actualPercent - approvedPercent}%` }}
                  />
                </>
              )}
            </div>

            <div className={styles.healthTileSubtext}>
              Variance: {formatVariance(health.variance)}
            </div>
          </>
        ) : (
          <div className={styles.healthTileSubtext}>
            Tracking starts when budget is set
          </div>
        )}
      </div>

      <span className={styles.healthTileCta}>
        Open Budget <ChevronRight />
      </span>
    </div>
  );
}

// ============================================================================
// SCHEDULE TILE
// ============================================================================

interface ScheduleTileProps {
  projectId: string;
  projectTitle?: string;
  events: CalendarEvent[];
  tasks: TaskItem[];
}

function ScheduleTile({ projectId, projectTitle, events, tasks }: ScheduleTileProps) {
  const navigate = useNavigate();
  const health = useMemo(
    () => computeScheduleHealth(events, tasks),
    [events, tasks]
  );

  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar'));
  };

  const statusClass = health.status === 'conflict'
    ? 'warning'
    : health.status === 'on-track'
      ? 'healthy'
      : 'neutral';

  return (
    <div className={styles.healthTile} onClick={handleClick} role="button" tabIndex={0}>
      <div className={styles.healthTileHeader}>
        <div className={styles.healthTileTitle}>
          <Calendar className={styles.healthTileIcon} />
          Schedule
        </div>
        <div className={`${styles.statusDot} ${styles[statusClass]}`} />
      </div>

      <div className={styles.healthTileBody}>
        {health.daysToNextMilestone !== null ? (
          <>
            <div className={styles.healthTileMetric}>
              <span className={styles.healthTilePrimary}>
                {health.daysToNextMilestone}
              </span>
              <span className={styles.healthTileSecondary}>
                days to next
              </span>
            </div>
            <div className={styles.healthTileSubtext}>
              {health.nextMilestoneLabel}
            </div>
          </>
        ) : (
          <div className={styles.healthTileSubtext}>
            No upcoming events scheduled
          </div>
        )}

        {health.conflictCount > 0 && (
          <div className={styles.healthTileSubtext} style={{ color: 'var(--color-warning)' }}>
            ⚠ {health.conflictCount} conflict{health.conflictCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      <span className={styles.healthTileCta}>
        Open Calendar <ChevronRight />
      </span>
    </div>
  );
}

// ============================================================================
// DELIVERABLES TILE
// ============================================================================

interface DeliverablesTileProps {
  projectId: string;
  projectTitle?: string;
  deckVersions: DeckVersion[];
}

function DeliverablesTile({ projectId, projectTitle, deckVersions }: DeliverablesTileProps) {
  const navigate = useNavigate();
  const health = useMemo(
    () => computeDeliverablesHealth(deckVersions),
    [deckVersions]
  );

  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/slides'));
  };

  const statusClass = health.approvalState === 'approved'
    ? 'healthy'
    : health.hasDecks
      ? 'neutral'
      : 'neutral';

  return (
    <div className={styles.healthTile} onClick={handleClick} role="button" tabIndex={0}>
      <div className={styles.healthTileHeader}>
        <div className={styles.healthTileTitle}>
          <FileText className={styles.healthTileIcon} />
          Deliverables
        </div>
        <div className={`${styles.statusDot} ${styles[statusClass]}`} />
      </div>

      <div className={styles.healthTileBody}>
        {health.hasDecks ? (
          <>
            <div className={styles.healthTileSubtext} style={{ color: 'var(--text-primary)' }}>
              {health.latestDeckName}
            </div>
            <div className={styles.healthTileSubtext}>
              {health.latestDeckVersion}
              {health.lastExportTime && ` • ${formatRelativeTime(health.lastExportTime)}`}
            </div>
            {health.approvalState && health.approvalState !== 'none' && (
              <div className={styles.healthTileSubtext}>
                {health.approvalState === 'approved' ? '✓ Approved' : '⏳ Pending approval'}
              </div>
            )}
          </>
        ) : (
          <div className={styles.healthTileSubtext}>
            No decks created yet
          </div>
        )}
      </div>

      <span className={styles.healthTileCta}>
        Open Slides <ChevronRight />
      </span>
    </div>
  );
}

// ============================================================================
// RISKS TILE
// ============================================================================

interface RisksTileProps {
  projectId: string;
  projectTitle?: string;
  tasks: TaskItem[];
}

function RisksTile({ projectId, projectTitle, tasks }: RisksTileProps) {
  const navigate = useNavigate();
  const health = useMemo(() => computeRisksHealth(tasks), [tasks]);

  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks'));
  };

  const statusClass = health.status === 'urgent'
    ? 'critical'
    : health.status === 'attention'
      ? 'warning'
      : 'healthy';

  return (
    <div className={styles.healthTile} onClick={handleClick} role="button" tabIndex={0}>
      <div className={styles.healthTileHeader}>
        <div className={styles.healthTileTitle}>
          <AlertTriangle className={styles.healthTileIcon} />
          Risks
        </div>
        <div className={`${styles.statusDot} ${styles[statusClass]}`} />
      </div>

      <div className={styles.healthTileBody}>
        {health.overdueCount > 0 && (
          <div className={styles.healthTileMetric}>
            <span className={styles.healthTilePrimary} style={{ color: 'var(--color-error)' }}>
              {health.overdueCount}
            </span>
            <span className={styles.healthTileSecondary}>overdue</span>
          </div>
        )}

        {health.overdueCount === 0 && health.waitingOnClientCount === 0 && (
          <div className={styles.healthTileSubtext} style={{ color: 'var(--color-success)' }}>
            All clear
          </div>
        )}

        {health.waitingOnClientCount > 0 && (
          <div className={styles.healthTileSubtext}>
            {health.waitingOnClientCount} waiting on client
          </div>
        )}

        {health.openRisksCount > 0 && health.overdueCount === 0 && (
          <div className={styles.healthTileSubtext}>
            {health.openRisksCount} open task{health.openRisksCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      <span className={styles.healthTileCta}>
        Open Tasks <ChevronRight />
      </span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HealthStrip({
  projectId,
  projectTitle,
  budgetStats,
  events,
  tasks,
  deckVersions,
}: HealthStripProps) {
  return (
    <div className={styles.healthStrip}>
      <BudgetTile
        projectId={projectId}
        projectTitle={projectTitle}
        stats={budgetStats}
      />
      <ScheduleTile
        projectId={projectId}
        projectTitle={projectTitle}
        events={events}
        tasks={tasks}
      />
      <DeliverablesTile
        projectId={projectId}
        projectTitle={projectTitle}
        deckVersions={deckVersions}
      />
      <RisksTile
        projectId={projectId}
        projectTitle={projectTitle}
        tasks={tasks}
      />
    </div>
  );
}

export default HealthStrip;
