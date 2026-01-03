/**
 * ProjectPoster - 2-Column Hero Banner for Overview HUD
 * 
 * Layout: grid-template-columns: clamp(140px, 16vw, 220px) 1fr
 * 
 * Left column: Real Leaflet map tile with city label
 * Right column: Project info + status + primary CTA
 * 
 * The hero is now "decision-first" - entry point to deck/tasks.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  Clock, 
  Calendar,
  Layers,
  ListTodo,
  ChevronRight,
} from 'lucide-react';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import { MiniMapTile } from './MiniMapTile';
import styles from '../OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface DeckVersion {
  versionId?: string;
  title?: string;
  name?: string;
  version?: string;
  isDefault?: boolean;
  isClientDefault?: boolean;
  thumbnail?: string;
  exportedAt?: string;
  createdAt?: string;
  slideCount?: number;
}

interface ProjectPosterProps {
  projectId: string;
  projectTitle: string;
  projectColor?: string;
  startDate?: string;
  endDate?: string;
  coverImage?: string;
  deckVersions?: DeckVersion[];
  // Location for map tile
  locationName?: string;
  locationCoords?: { lat: number; lng: number };
  onOpenMap?: () => void;
  // Status metrics
  risksCount?: number;
  tasksDueCount?: number;
  conflictsCount?: number;
  overdueCount?: number;
  completedPercent?: number;
  hasBudget?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateGradient(title: string, baseColor?: string): string {
  if (baseColor) {
    return `linear-gradient(135deg, ${baseColor} 0%, ${adjustColor(baseColor, -30)} 100%)`;
  }
  
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 65%, 45%) 0%, hsl(${(hue + 30) % 360}, 55%, 35%) 100%)`;
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return '';
  
  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    
    if (startYear === endYear) {
      return `${formatDate(start)} – ${formatDate(end)}, ${endYear}`;
    }
    return `${formatDate(start)}, ${startYear} – ${formatDate(end)}, ${endYear}`;
  }
  
  if (start) return `Starts ${formatDate(start)}`;
  if (end) return `Due ${formatDate(end)}`;
  return '';
}

function stripZipCodes(text: string): string {
  return text
    .replace(/\b\d{5}(?:-\d{4})?\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*$/g, '')
    .trim();
}

function getLocationLabel(address?: string): string {
  if (!address) return '';
  const cleaned = stripZipCodes(address);
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[1]}`;
  }
  return parts[0] || cleaned;
}

function getPreferredDeck(deckVersions: DeckVersion[]): DeckVersion | undefined {
  return (
    deckVersions.find(d => d.isClientDefault) ||
    deckVersions.find(d => d.isDefault) ||
    deckVersions.find(d => d.thumbnail) ||
    deckVersions[0]
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ProjectPoster({
  projectId,
  projectTitle,
  projectColor,
  startDate,
  endDate,
  coverImage,
  deckVersions = [],
  locationName,
  locationCoords,
  onOpenMap,
  risksCount = 0,
  tasksDueCount = 0,
  conflictsCount = 0,
  overdueCount = 0,
  completedPercent,
  hasBudget = true,
}: ProjectPosterProps) {
  const navigate = useNavigate();

  // Check if we have valid coordinates for real map
  const hasValidCoords = locationCoords && 
    typeof locationCoords.lat === 'number' && 
    typeof locationCoords.lng === 'number' &&
    !isNaN(locationCoords.lat) && 
    !isNaN(locationCoords.lng);

  const preferredDeck = useMemo(() => getPreferredDeck(deckVersions), [deckVersions]);

  const hasDeck = deckVersions.length > 0;

  // Date range
  const dateRange = useMemo(() => 
    formatDateRange(startDate, endDate), 
    [startDate, endDate]
  );

  const locationLabel = useMemo(() => getLocationLabel(locationName), [locationName]);

  // Build status line
  const statusLine = useMemo(() => {
    const parts: string[] = [];
    if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
    if (conflictsCount > 0) parts.push(`${conflictsCount} conflicts`);
    if (tasksDueCount > 0) parts.push(`${tasksDueCount} due soon`);
    if (risksCount > 0) parts.push(`${risksCount} at risk`);
    if (!hasBudget) parts.push('Budget not set');
    
    if (parts.length === 0) {
      if (completedPercent !== undefined && completedPercent > 0) {
        return `${Math.round(completedPercent)}% complete`;
      }
      return 'All clear';
    }
    return parts.join(' · ');
  }, [overdueCount, conflictsCount, tasksDueCount, risksCount, hasBudget, completedPercent]);

  // Status variant for coloring
  const statusVariant = useMemo(() => {
    if (overdueCount > 0 || risksCount > 0) return 'warning';
    if (conflictsCount > 0 || tasksDueCount > 0) return 'attention';
    return 'success';
  }, [overdueCount, risksCount, conflictsCount, tasksDueCount]);

  // Background gradient
  const gradient = useMemo(() => 
    generateGradient(projectTitle, projectColor), 
    [projectTitle, projectColor]
  );

  // Handlers
  const handleOpenDeck = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/slides'));
  };

  const handleOpenTasks = () => {
    navigate(getProjectDashboardPath(projectId, projectTitle, '/tasks'));
  };

  const handleMapClick = () => {
    onOpenMap?.();
  };

  return (
    <div className={styles.heroBanner}>
      {/* Left: Project Info Stack */}
      <div 
        className={styles.heroInfoColumn}
        style={{ background: coverImage ? `url(${coverImage}) center/cover` : gradient }}
      >
        {/* Gradient overlay for readability */}
        <div className={styles.heroInfoOverlay} />

        {/* Content */}
        <div className={styles.heroInfoContent}>
          {/* Project name */}
          <h2 className={styles.heroTitle}>{projectTitle}</h2>

          {/* Date range */}
          {dateRange && (
            <div className={styles.heroDateRange}>
              <Calendar size={14} />
              <span>{dateRange}</span>
            </div>
          )}

          {/* Status line */}
          <div className={`${styles.heroStatusLine} ${styles[`heroStatus${statusVariant.charAt(0).toUpperCase() + statusVariant.slice(1)}`]}`}>
            {statusVariant === 'warning' && <AlertTriangle size={14} />}
            {statusVariant === 'attention' && <Clock size={14} />}
            <span>{statusLine}</span>
          </div>

          {/* Primary CTA */}
          <div className={styles.heroCTAs}>
            {hasDeck ? (
              <button
                type="button"
                className={styles.heroPrimaryCTA}
                onClick={(e) => { e.stopPropagation(); handleOpenDeck(); }}
              >
                <Layers size={16} />
                <span className={styles.heroPrimaryCTALabel}>
                  Open {preferredDeck?.title || preferredDeck?.name || 'Deck'}
                </span>
                {preferredDeck?.slideCount && (
                  <span className={styles.heroCTABadge}>{preferredDeck.slideCount}</span>
                )}
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                className={styles.heroPrimaryCTA}
                onClick={(e) => { e.stopPropagation(); handleOpenTasks(); }}
              >
                <ListTodo size={16} />
                <span>Open Tasks</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: Map Tile */}
      <div className={styles.heroMapColumn}>
        {hasValidCoords ? (
          <MiniMapTile
            lat={locationCoords.lat}
            lng={locationCoords.lng}
            cityLabel={locationLabel}
            onClick={handleMapClick}
          />
        ) : (
          // Fallback if no coords
          <div 
            className={styles.heroMapPlaceholder}
            style={{ background: gradient }}
            onClick={handleMapClick}
            role="button"
            tabIndex={0}
          >
            <span className={styles.heroMapPlaceholderText}>
              {locationName ? 'No coordinates' : 'No location'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectPoster;
