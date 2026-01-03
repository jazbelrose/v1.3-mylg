/**
 * MiniMapTile - Small Leaflet map for the hero poster
 * 
 * Features:
 * - Real Leaflet map tiles (not a placeholder)
 * - Shows venue marker at provided lat/lng
 * - Locked: no pan/zoom/interactions
 * - Click opens full Map view
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import styles from '../OverviewHud.module.css';

// Simple pin marker SVG
const PIN_ICON = L.icon({
  iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="#3b82f6"/>
      <circle cx="12" cy="12" r="5" fill="#fff"/>
    </svg>`
  )}`,
  iconSize: [24, 32],
  iconAnchor: [12, 32],
});

interface MiniMapTileProps {
  lat: number;
  lng: number;
  onClick?: () => void;
  className?: string;
}

export function MiniMapTile({ lat, lng, onClick, className }: MiniMapTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Create map - fully locked down
    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 14,
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
      mapRef.current.setView([lat, lng], 14, { animate: false });
    }
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className={`${styles.miniMapTile} ${className || ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.();
        }
      }}
      title="Click to open map"
    />
  );
}

export default MiniMapTile;
