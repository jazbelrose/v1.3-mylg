/**
 * LocationRow - Compact inline location display for Overview HUD
 * 
 * Replaces the big map widget with a single line showing location + CTA.
 */

import React from 'react';
import { MapPin } from 'lucide-react';
import styles from '../OverviewHud.module.css';

// ============================================================================
// TYPES
// ============================================================================

interface LocationRowProps {
  address?: string;
  onOpenMap?: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LocationRow({ address, onOpenMap }: LocationRowProps) {
  if (!address) {
    return null;
  }

  return (
    <div className={styles.locationRow}>
      <MapPin size={14} className={styles.locationIcon} />
      <span className={styles.locationText}>{address}</span>
      {onOpenMap && (
        <span className={styles.locationCta} onClick={onOpenMap}>
          View Map
        </span>
      )}
    </div>
  );
}

export default LocationRow;
