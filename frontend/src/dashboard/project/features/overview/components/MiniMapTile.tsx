/**
 * MiniMapTile - Real Leaflet map tile for hero banner
 * 
 * Features:
 * - Real Leaflet map tiles (CartoDB dark)
 * - Shows venue marker at provided lat/lng
 * - Context-level zoom (city/neighborhood, z=11-13)
 * - Uses fitBounds to show ~3-5km radius around pin
 * - Locked: no pan/zoom/interactions
 * - City/neighborhood label overlay with scale bar
 * - "Open map" hover state
 * - Click opens full Map view (where user can zoom in)
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

/**
 * Calculate bounds for a given radius around a point
 * @param lat - center latitude
 * @param lng - center longitude  
 * @param radiusKm - radius in kilometers
 * @returns Leaflet LatLngBounds
 */
function getBoundsForRadius(lat: number, lng: number, radiusKm: number): L.LatLngBounds {
  // Approximate degrees per km (varies by latitude)
  const latDegPerKm = 1 / 111; // ~111km per degree latitude
  const lngDegPerKm = 1 / (111 * Math.cos((lat * Math.PI) / 180)); // adjust for longitude
  
  const latOffset = radiusKm * latDegPerKm;
  const lngOffset = radiusKm * lngDegPerKm;
  
  return L.latLngBounds(
    [lat - latOffset, lng - lngOffset], // southwest
    [lat + latOffset, lng + lngOffset]  // northeast
  );
}

interface MiniMapTileProps {
  lat: number;
  lng: number;
  cityLabel?: string; // e.g., "San Francisco" or "Downtown LA"
  radiusKm?: number; // Desired context radius (default: 2.5km for neighborhood view)
  onClick?: () => void;
  className?: string;
}

export function MiniMapTile({ 
  lat, 
  lng, 
  cityLabel, 
  radiusKm = 2.5, // Show ~2.5km radius by default (neighborhood context)
  onClick, 
  className 
}: MiniMapTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Create/recreate map when coordinates change
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clean up existing map
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Calculate bounds for reference
    const bounds = getBoundsForRadius(lat, lng, radiusKm);

    // Create map - fully locked down, no interactions
    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 14,  // Deterministic neighborhood zoom (no guessing)
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });

    // Use dark-style tiles (CartoDB dark matter) - includes city/neighborhood labels
    const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      crossOrigin: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    });

    tiles.addTo(map);

    // Add marker
    L.marker([lat, lng], { icon: PIN_ICON }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, radiusKm]);

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
        <div className={styles.heroMapContextRow}>
          {cityLabel && (
            <span className={styles.heroMapLabel}>{cityLabel}</span>
          )}
        </div>
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
