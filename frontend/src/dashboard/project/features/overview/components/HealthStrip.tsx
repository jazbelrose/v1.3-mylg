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
  formatVariance,
  formatRelativeTime,
} from '../utils';
import { formatCompactUSD } from '@/shared/utils/budgetUtils';
import type { BudgetStats } from '@/dashboard/project/features/budget/context/types';
import { useBudget } from '@/dashboard/project/features/budget/context/BudgetContext';
import RevisionPillTooltip from '@/dashboard/project/features/budget/components/RevisionPillTooltip';
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
  name?: string;
  version?: string;
  isDefault?: boolean;
  isClientDefault?: boolean;
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
  const { budgetHeader, clientBudgetHeader } = useBudget();

  const displayedRevision =
    (clientBudgetHeader as { revision?: number | null } | null)?.revision ??
    ((budgetHeader as { clientRevisionId?: number | null } | null)?.clientRevisionId ??
      (budgetHeader as { revision?: number | null } | null)?.revision ?? null);
  const isClientRevision =
    typeof (clientBudgetHeader as { revision?: number | null } | null)?.revision === 'number' ||
    typeof (budgetHeader as { clientRevisionId?: number | null } | null)?.clientRevisionId === 'number';
  const revisionName =
    (clientBudgetHeader as { revisionName?: string | null } | null)?.revisionName ??
    (budgetHeader as { revisionName?: string | null } | null)?.revisionName ?? null;

  const revisionChip = displayedRevision != null ? (
    <RevisionPillTooltip
      data={{
        revisionNumber: Number(displayedRevision),
        revisionName,
        isClientVersion: isClientRevision,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          height: 22,
          borderRadius: 999,
          background: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: 'var(--text-muted, rgba(255, 255, 255, 0.72))',
          fontSize: 11,
          lineHeight: 1.2,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        <span>{`REV ${displayedRevision}`}</span>
        {isClientRevision && (
          <span
            aria-label="Published revision"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#fbbf24',
              display: 'inline-block',
            }}
          />
        )}
      </span>
    </RevisionPillTooltip>
  ) : null;

  const handleClick = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/budget'));
  };

  const statusClass = health.status === 'over-budget'
    ? 'critical'
    : health.status === 'on-track'
      ? 'healthy'
      : 'neutral';

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
        {stats && typeof stats.finalCost === 'number' && stats.finalCost > 0 ? (
          <>
            <div className={styles.healthTileMetric}>
              <span className={styles.healthTilePrimary}>
                {formatCompactUSD(stats.finalCost)}
              </span>
              <span className={styles.healthTileSecondary}>
                Final Cost
              </span>
            </div>
          </>
        ) : (
          <div className={styles.healthTileSubtext}>
            Final Cost not set
          </div>
        )}
      </div>

      <div className={styles.healthTileCta} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Open Budget <ChevronRight />
        </span>
        {revisionChip}
      </div>
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
