/**
 * Breadcrumb - Path navigation component
 * 
 * Features:
 * - Clickable path segments
 * - Home/root icon
 * - Overflow handling for long paths
 */

import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import styles from './file-manager-v2.module.css';

export interface BreadcrumbSegment {
  key: string;
  name: string;
}

export interface BreadcrumbProps {
  /** Array of path segments */
  segments: BreadcrumbSegment[];
  /** Callback when a segment is clicked */
  onNavigate: (key: string) => void;
  /** Whether to show home icon */
  showHomeIcon?: boolean;
  /** Root label (when at root) */
  rootLabel?: string;
}

export function Breadcrumb({
  segments,
  onNavigate,
  showHomeIcon = true,
  rootLabel = 'Project Files',
}: BreadcrumbProps) {
  if (segments.length === 0) {
    return (
      <nav className={styles.breadcrumb} aria-label="Folder path">
        <span className={styles.breadcrumbItem}>
          {showHomeIcon && <Home size={14} className={styles.breadcrumbHomeIcon} />}
          <span>{rootLabel}</span>
        </span>
      </nav>
    );
  }

  return (
    <nav className={styles.breadcrumb} aria-label="Folder path">
      <button
        type="button"
        className={styles.breadcrumbItem}
        onClick={() => onNavigate('uploads')}
      >
        {showHomeIcon && <Home size={14} className={styles.breadcrumbHomeIcon} />}
        <span>{rootLabel}</span>
      </button>

      {segments.map((segment, index) => (
        <React.Fragment key={segment.key}>
          <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          {index === segments.length - 1 ? (
            <span className={`${styles.breadcrumbItem} ${styles.breadcrumbItemCurrent}`}>
              {segment.name}
            </span>
          ) : (
            <button
              type="button"
              className={styles.breadcrumbItem}
              onClick={() => onNavigate(segment.key)}
            >
              {segment.name}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export default Breadcrumb;
