/**
 * HQ Skeleton Loading Components
 *
 * Premium SV-style skeleton system for the HQ dashboard.
 * Ensures no layout shift by matching exact final dimensions.
 *
 * Features:
 * - Subtle animated gradient shimmer
 * - Respects prefers-reduced-motion
 * - Fixed heights matching loaded state
 * - Crossfade transition support
 */
import React from "react";
import styles from "./HQSkeleton.module.css";

/* =============================================================================
   Base Skeleton Primitives
   ============================================================================= */

export interface SkeletonTextProps {
  width?: string | number;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

/** Text line skeleton */
export const SkeletonText: React.FC<SkeletonTextProps> = ({
  width,
  size = "md",
  className,
}) => {
  const sizeClass =
    size === "xs"
      ? styles.skeletonTextXs
      : size === "sm"
        ? styles.skeletonTextSm
        : size === "lg"
          ? styles.skeletonTextLg
          : size === "xl"
            ? styles.skeletonTextXl
            : styles.skeletonTextMd;

  return (
    <div
      className={[styles.skeletonText, sizeClass, className].filter(Boolean).join(" ")}
      style={width ? { width: typeof width === "number" ? `${width}px` : width } : undefined}
      aria-hidden="true"
    />
  );
};

export interface SkeletonPillProps {
  size?: "sm" | "md" | "lg";
  width?: string | number;
  className?: string;
}

/** Pill/button skeleton */
export const SkeletonPill: React.FC<SkeletonPillProps> = ({
  size = "md",
  width,
  className,
}) => {
  const sizeClass =
    size === "sm"
      ? styles.skeletonPillSm
      : size === "lg"
        ? styles.skeletonPillLg
        : "";

  return (
    <div
      className={[styles.skeletonPill, sizeClass, className].filter(Boolean).join(" ")}
      style={width ? { width: typeof width === "number" ? `${width}px` : width } : undefined}
      aria-hidden="true"
    />
  );
};

export interface SkeletonBarProps {
  width?: string | number;
  height?: string | number;
  className?: string;
}

/** Bar/progress skeleton */
export const SkeletonBar: React.FC<SkeletonBarProps> = ({
  width = "100%",
  height,
  className,
}) => {
  return (
    <div
      className={[styles.skeletonBar, className].filter(Boolean).join(" ")}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        ...(height ? { height: typeof height === "number" ? `${height}px` : height } : {}),
      }}
      aria-hidden="true"
    />
  );
};

/* =============================================================================
   HQ Hero Cash Chart Skeleton
   Shows skeleton for chart area + footer only (header is always visible)
   ============================================================================= */

export interface HeroCashChartSkeletonProps {
  className?: string;
  /** Include header row skeleton (for standalone use) */
  includeHeader?: boolean;
}

export const HeroCashChartSkeleton: React.FC<HeroCashChartSkeletonProps> = ({
  className,
  includeHeader = false,
}) => {
  return (
    <div
      className={[styles.heroChartSkeleton, className].filter(Boolean).join(" ")}
      role="status"
      aria-label="Loading cash chart"
    >
      {/* Optional header row skeleton (for standalone use) */}
      {includeHeader && (
        <div className={styles.heroChartHeaderSkeleton}>
          <div className={styles.heroChartHeaderLeft}>
            <SkeletonText size="lg" width={48} className={styles.heroChartTitleSkeleton} />
            <SkeletonText size="sm" width={180} className={styles.heroChartSubtitleSkeleton} />
          </div>

          <div className={styles.heroChartHeaderRight}>
            {/* Range pills */}
            <div className={styles.heroChartPillGroup}>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonPill key={`range-${i}`} size="sm" width={32} />
              ))}
            </div>

            <div className={styles.heroChartDivider} />

            {/* Series toggles */}
            <div className={styles.heroChartPillGroup}>
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonPill key={`series-${i}`} size="sm" width={52} />
              ))}
            </div>

            <div className={styles.heroChartDivider} />

            {/* Collapse button */}
            <SkeletonPill size="sm" width={26} />
          </div>
        </div>
      )}

      {/* Chart area skeleton */}
      <div className={styles.skeletonChartStage}>
        <div className={[styles.skeletonChart, styles.heroChartCanvasSkeleton].join(" ")}>
          {/* Grid lines */}
          <div className={styles.skeletonChartGrid}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`grid-${i}`} className={styles.skeletonChartGridLine} />
            ))}
          </div>

          {/* Y-axis labels */}
          <div className={styles.skeletonChartAxisY}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`y-${i}`}
                className={[styles.skeletonChartAxisLabel, styles.skeletonChartAxisLabelY].join(" ")}
              />
            ))}
          </div>

          {/* X-axis labels */}
          <div className={styles.skeletonChartAxisX}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={`x-${i}`} className={styles.skeletonChartAxisLabel} />
            ))}
          </div>

          {/* Subtle wave shape */}
          <div className={styles.skeletonChartWave} />
        </div>
      </div>

      {/* Footer skeleton */}
      <div className={styles.heroChartFooterSkeleton}>
        <div className={styles.heroChartFooterItem}>
          <SkeletonText size="xs" width={36} />
          <SkeletonText size="sm" width={28} />
        </div>
        <div className={styles.heroChartFooterItem}>
          <SkeletonText size="xs" width={20} />
          <SkeletonText size="sm" width={56} />
        </div>
        <div className={styles.heroChartFooterItem}>
          <SkeletonText size="xs" width={24} />
          <SkeletonText size="sm" width={56} />
        </div>
        <div className={styles.heroChartFooterItem}>
          <SkeletonText size="xs" width={24} />
          <SkeletonText size="sm" width={56} />
        </div>
      </div>

      <span className="visually-hidden">Loading cash chart data</span>
    </div>
  );
};

/* =============================================================================
   KPI Row Skeleton
   ============================================================================= */

export interface KpiRowSkeletonProps {
  count?: number;
  className?: string;
}

export const KpiRowSkeleton: React.FC<KpiRowSkeletonProps> = ({
  count = 5,
  className,
}) => {
  return (
    <div
      className={[styles.kpiRowSkeleton, className].filter(Boolean).join(" ")}
      role="status"
      aria-label="Loading KPI metrics"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.skeletonKpi}>
          <div className={styles.skeletonKpiLabel} />
          <div className={styles.skeletonKpiValue} />
          <div className={styles.skeletonKpiHint} />
        </div>
      ))}
      <span className="visually-hidden">Loading metrics</span>
    </div>
  );
};

/* =============================================================================
   Accounts Card Skeleton
   ============================================================================= */

export interface AccountsCardSkeletonProps {
  rows?: number;
  className?: string;
}

export const AccountsCardSkeleton: React.FC<AccountsCardSkeletonProps> = ({
  rows = 5,
  className,
}) => {
  return (
    <div
      className={[styles.midCardSkeleton, className].filter(Boolean).join(" ")}
      role="status"
      aria-label="Loading accounts"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.accountRowSkeleton}>
          <SkeletonText width={`${55 + Math.random() * 25}%`} size="sm" />
          <div className={styles.accountRightSkeleton}>
            <SkeletonText width={64} size="sm" />
            <SkeletonPill size="sm" width={68} />
          </div>
        </div>
      ))}
      <span className="visually-hidden">Loading accounts list</span>
    </div>
  );
};

/* =============================================================================
   Recurring Card Skeleton
   ============================================================================= */

export interface RecurringCardSkeletonProps {
  rows?: number;
  className?: string;
}

export const RecurringCardSkeleton: React.FC<RecurringCardSkeletonProps> = ({
  rows = 6,
  className,
}) => {
  return (
    <div
      className={[styles.midCardSkeleton, className].filter(Boolean).join(" ")}
      role="status"
      aria-label="Loading recurring commitments"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.recurringRowSkeleton}>
          <SkeletonText width={`${50 + Math.random() * 40}%`} size="sm" />
          <SkeletonBar width={`${30 + Math.random() * 50}%`} />
          <SkeletonText width={72} size="sm" />
        </div>
      ))}
      <span className="visually-hidden">Loading recurring items</span>
    </div>
  );
};

/* =============================================================================
   Top Categories Card Skeleton
   ============================================================================= */

export interface TopCategoriesCardSkeletonProps {
  rows?: number;
  className?: string;
}

export const TopCategoriesCardSkeleton: React.FC<TopCategoriesCardSkeletonProps> = ({
  rows = 6,
  className,
}) => {
  return (
    <div
      className={[styles.midCardSkeleton, className].filter(Boolean).join(" ")}
      role="status"
      aria-label="Loading top categories"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.topCategoriesRowSkeleton}>
          <SkeletonText width={`${40 + Math.random() * 40}%`} size="sm" />
          <SkeletonBar width={`${20 + Math.random() * 60}%`} />
          <SkeletonText width={64} size="sm" />
        </div>
      ))}
      <span className="visually-hidden">Loading categories</span>
    </div>
  );
};

/* =============================================================================
   Cash Flow Chart Skeleton
   ============================================================================= */

export interface CashFlowChartSkeletonProps {
  rows?: number;
  className?: string;
}

export const CashFlowChartSkeleton: React.FC<CashFlowChartSkeletonProps> = ({
  rows = 6,
  className,
}) => {
  return (
    <div className={className} role="status" aria-label="Loading cash flow chart">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.cashFlowRowSkeleton}>
          <SkeletonBar width={`${20 + Math.random() * 50}%`} className={styles.cashFlowBarSkeleton} />
          <SkeletonText width={32} size="xs" className={styles.cashFlowLabelSkeleton} />
          <SkeletonBar width={`${20 + Math.random() * 50}%`} className={styles.cashFlowBarSkeleton} />
        </div>
      ))}
      <span className="visually-hidden">Loading cash flow data</span>
    </div>
  );
};

/* =============================================================================
   Alerts Card Skeleton
   ============================================================================= */

export interface AlertsCardSkeletonProps {
  rows?: number;
  className?: string;
}

export const AlertsCardSkeleton: React.FC<AlertsCardSkeletonProps> = ({
  rows = 3,
  className,
}) => {
  return (
    <div className={className} role="status" aria-label="Loading alerts">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.alertRowSkeleton}>
          <SkeletonPill size="sm" width={52} />
          <SkeletonText width={`${60 + Math.random() * 30}%`} size="sm" />
        </div>
      ))}
      <span className="visually-hidden">Loading alerts</span>
    </div>
  );
};

/* =============================================================================
   Uncategorized Card Skeleton
   ============================================================================= */

export interface UncategorizedCardSkeletonProps {
  className?: string;
}

export const UncategorizedCardSkeleton: React.FC<UncategorizedCardSkeletonProps> = ({
  className,
}) => {
  return (
    <div
      className={className}
      role="status"
      aria-label="Loading uncategorized count"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 60 }}
    >
      <SkeletonText size="xl" width={48} />
      <span className="visually-hidden">Loading uncategorized transactions count</span>
    </div>
  );
};

/* =============================================================================
   Transactions Preview Skeleton
   ============================================================================= */

export interface TransactionsPreviewSkeletonProps {
  rows?: number;
  className?: string;
}

export const TransactionsPreviewSkeleton: React.FC<TransactionsPreviewSkeletonProps> = ({
  rows = 5,
  className,
}) => {
  return (
    <div className={className} role="status" aria-label="Loading transactions">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.txnRowSkeleton}>
          <div className={styles.txnMainSkeleton}>
            <SkeletonText width={`${40 + Math.random() * 35}%`} size="sm" />
            <SkeletonText width={`${25 + Math.random() * 20}%`} size="xs" />
          </div>
          <SkeletonText width={72} size="md" />
        </div>
      ))}
      <span className="visually-hidden">Loading transaction list</span>
    </div>
  );
};

/* =============================================================================
   Full HQ Overview Skeleton
   Renders the entire dashboard skeleton with stable heights
   ============================================================================= */

export interface HQOverviewSkeletonProps {
  className?: string;
}

export const HQOverviewSkeleton: React.FC<HQOverviewSkeletonProps> = ({
  className,
}) => {
  return (
    <div className={className} role="status" aria-label="Loading HQ dashboard">
      <HeroCashChartSkeleton />
      <KpiRowSkeleton count={5} />
      <span className="visually-hidden">Loading HQ dashboard data</span>
    </div>
  );
};

/* =============================================================================
   Crossfade Wrapper
   Handles smooth transition between skeleton and loaded content
   ============================================================================= */

export interface SkeletonCrossfadeProps {
  isLoading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Container maintains the larger height of skeleton or content */
  maintainHeight?: boolean;
}

export const SkeletonCrossfade: React.FC<SkeletonCrossfadeProps> = ({
  isLoading,
  skeleton,
  children,
  className,
  maintainHeight = false,
}) => {
  return (
    <div
      className={[styles.skeletonContainer, className].filter(Boolean).join(" ")}
      style={maintainHeight ? { position: "relative" } : undefined}
    >
      {maintainHeight ? (
        <>
          {/* Skeleton overlay */}
          <div
            className={[
              styles.skeletonOverlay,
              styles.skeletonFade,
              isLoading ? styles.skeletonFadeIn : styles.skeletonFadeOut,
            ].join(" ")}
          >
            {skeleton}
          </div>
          {/* Content (always rendered for height) */}
          <div
            className={[
              styles.skeletonFade,
              isLoading ? styles.skeletonFadeOut : styles.skeletonFadeIn,
            ].join(" ")}
            style={{ visibility: isLoading ? "hidden" : "visible" }}
          >
            {children}
          </div>
        </>
      ) : (
        <div
          className={[styles.skeletonFade, styles.skeletonFadeIn].join(" ")}
        >
          {isLoading ? skeleton : children}
        </div>
      )}
    </div>
  );
};

export default {
  SkeletonText,
  SkeletonPill,
  SkeletonBar,
  HeroCashChartSkeleton,
  KpiRowSkeleton,
  AccountsCardSkeleton,
  RecurringCardSkeleton,
  TopCategoriesCardSkeleton,
  CashFlowChartSkeleton,
  AlertsCardSkeleton,
  UncategorizedCardSkeleton,
  TransactionsPreviewSkeleton,
  HQOverviewSkeleton,
  SkeletonCrossfade,
};
