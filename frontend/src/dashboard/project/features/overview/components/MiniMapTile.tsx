/**
 * MiniMapTile - Real Leaflet map tile for hero banner
 * 
 * Features:
 * - Real Leaflet map tiles (CartoDB dark)
 * - Shows venue marker at provided lat/lng
 * - Locked: no pan/zoom/interactions
 * - City label overlay at bottom
 * - "Open map" hover state
 * - Click opens full Map view
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon } from 'lucide-react';
import styles from '../OverviewHud.module.css';

// Simple pin marker SVG
const PIN_ICON = L.icon({
  iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#3b82f6"/>
      <circle cx="14" cy="14" r="5" fill="#fff"/>
    </svg>`
  )}`,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
});

interface MiniMapTileProps {
  lat: number;
  lng: number;
  cityLabel?: string; // e.g., "San Francisco" or "DTLA"
  onClick?: () => void;
  className?: string;
}

export function MiniMapTile({ lat, lng, cityLabel, onClick, className }: MiniMapTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const zoom = 12;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Create map - fully locked down
    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });

    // Use dark-style tiles (CartoDB dark matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Add marker
    L.marker([lat, lng], { icon: PIN_ICON }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng]);

  // Update center if lat/lng changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], zoom, { animate: false });
    }
  }, [lat, lng, zoom]);

  return (
    <div
      className={`${styles.heroMapTile} ${className || ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.();
        }
      }}
      title={cityLabel || 'Open map'}
    >
      {/* Leaflet container */}
      <div ref={containerRef} className={styles.heroMapLeaflet} />
      
      {/* Bottom gradient + city label */}
      <div className={styles.heroMapOverlay}>
        {cityLabel && (
          <span className={styles.heroMapLabel}>{cityLabel}</span>
        )}
      </div>

      {/* Hover state */}
      <div className={`${styles.heroMapHover} ${isHovered ? styles.heroMapHoverVisible : ''}`}>
        <span>Open Map</span>
      </div>

      <button
        type="button"
        className={styles.heroMapActionButton}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        aria-label="Open tasks map"
        title="Open tasks map"
      >
        <MapIcon size={14} aria-hidden />
      </button>
    </div>
  );
}

export default MiniMapTile;
