// Overview HUD feature exports

// Main component
export { OverviewHud, default } from './OverviewHud';

// Sub-components
export { HealthStrip } from './components/HealthStrip';
export { TimelineNext7Days } from './components/TimelineNext7Days';
export { RecentUpdates } from './components/RecentUpdates';
export { AssetsPreview } from './components/AssetsPreview';
export { LocationRow } from './components/LocationRow';

// Hooks
export { useOverviewData } from './hooks/useOverviewData';

// Types
export type {
  HealthMetric,
  BudgetHealth,
  ScheduleHealth,
  DeliverablesHealth,
  RisksHealth,
  TimelineItem,
  TimelineDay,
  RecentUpdate,
  AssetPreview,
  TimelineFilter,
} from './types';

// Utils
export {
  formatDayLabel,
  formatRelativeTime,
  formatTimeRange,
  parseTimeString,
  getNext7Days,
  isSameDay,
  computeBudgetHealth,
  computeScheduleHealth,
  computeDeliverablesHealth,
  computeRisksHealth,
  detectConflicts,
  groupTimelineByDay,
  formatCurrency,
  formatVariance,
  getActivityIcon,
} from './utils';
