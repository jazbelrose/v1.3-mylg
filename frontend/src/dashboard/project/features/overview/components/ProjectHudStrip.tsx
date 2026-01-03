/**
 * ProjectHudStrip - Compact sticky header for Overview
 * 
 * Single line, no scroll, no fluff.
 * Left: Project name + date range + status pill
 * Middle: Budget health strip (compact)
 * Right: Primary actions (3 max)
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Presentation, Calendar, DollarSign } from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { computeBudgetHealth, formatCurrency } from '../utils';
import type { BudgetStats } from '@/dashboard/project/features/budget/context/types';
import styles from '../OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface ProjectHudStripProps {
  projectId: string;
  projectTitle?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  budgetStats: BudgetStats | null;
  hasDeck?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDateRange(start?: string, end?: string): string | null {
  if (!start && !end) return null;
  
  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  if (start && end) {
    return `${formatDate(start)} – ${formatDate(end)}`;
  }
  
  if (start) return `From ${formatDate(start)}`;
  if (end) return `Due ${formatDate(end)}`;
  return null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ProjectHudStrip({
  projectId,
  projectTitle,
  startDate,
  endDate,
  status,
  budgetStats,
  hasDeck = false,
}: ProjectHudStripProps) {
  const navigate = useNavigate();
  
  const dateRange = useMemo(() => formatDateRange(startDate, endDate), [startDate, endDate]);
  const budgetHealth = useMemo(() => computeBudgetHealth(budgetStats), [budgetStats]);
  
  const handleOpenDeck = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/slides'));
  };
  
  const handleOpenCalendar = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/calendar'));
  };
  
  const handleOpenBudget = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/budget'));
  };

  const budgetStatusClass = budgetHealth.status === 'over-budget' 
    ? 'critical' 
    : budgetHealth.status === 'on-track' 
      ? 'healthy' 
      : 'neutral';

  const budgetLabel = useMemo(() => {
    if (!budgetHealth.hasData) return 'Budget not set';
    if (budgetHealth.status === 'over-budget') {
      return `Over by ${formatCurrency(budgetHealth.actual - budgetHealth.approved)}`;
    }
    if (budgetHealth.status === 'on-track') {
      return 'Tracking on budget';
    }
    return `${formatCurrency(budgetHealth.actual)} spent`;
  }, [budgetHealth]);

  return (
    <div className={styles.hudStrip}>
      {/* Left: Project info */}
      <div className={styles.hudLeft}>
        <span className={styles.hudProjectName}>{projectTitle || 'Project'}</span>
        {dateRange && (
          <span className={styles.hudDateRange}>{dateRange}</span>
        )}
        {status && (
          <span className={`${styles.hudStatusPill} ${styles[`hudStatus${status.replace(/\s/g, '')}`] || ''}`}>
            {status}
          </span>
        )}
      </div>
      
      {/* Middle: Budget health */}
      <div className={styles.hudMiddle}>
        <div className={`${styles.hudBudgetStrip} ${styles[budgetStatusClass]}`}>
          <DollarSign size={12} />
          <span>{budgetLabel}</span>
        </div>
      </div>
      
      {/* Right: Primary actions */}
      <div className={styles.hudRight}>
        <button
          type="button"
          className={`${styles.hudAction} ${styles.hudActionPrimary}`}
          onClick={handleOpenDeck}
        >
          <Presentation size={14} />
          <span>{hasDeck ? 'Open Deck' : 'Create Deck'}</span>
        </button>
        <button
          type="button"
          className={styles.hudAction}
          onClick={handleOpenCalendar}
        >
          <Calendar size={14} />
          <span>Calendar</span>
        </button>
        <button
          type="button"
          className={styles.hudAction}
          onClick={handleOpenBudget}
        >
          <DollarSign size={14} />
          <span>Budget</span>
        </button>
      </div>
    </div>
  );
}

export default ProjectHudStrip;
