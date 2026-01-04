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

// Context zoom level for preview (shows neighborhood context)
// z=12 ≈ 5km view, z=13 ≈ 2.5km view, z=14 ≈ 1.5km view
const PREVIEW_ZOOM = 13;

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

/**
 * Get a scale bar label based on zoom level
 */
function getScaleLabel(zoom: number): string {
  if (zoom >= 15) return '500m';
  if (zoom >= 14) return '1 km';
  if (zoom >= 13) return '2 km';
  if (zoom >= 12) return '3 km';
  if (zoom >= 11) return '5 km';
  return '10 km';
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
  const [currentZoom, setCurrentZoom] = useState(PREVIEW_ZOOM);

  // FINGERPRINT: Confirm this file is live
  console.log('🗺️ MiniMapTile LIVE', { radiusKm, PREVIEW_ZOOM, lat, lng, cityLabel });

  // Create/recreate map when coordinates change
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clean up existing map
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Calculate bounds for the desired radius
    const bounds = getBoundsForRadius(lat, lng, radiusKm);

    // Create map - fully locked down, no interactions
    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: PREVIEW_ZOOM,
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

    // Debug tile loading
    tiles.on('tileerror', (e) => {
      console.warn('🧱 MiniMapTile tileerror:', e);
    });

    tiles.on('load', () => {
      console.log('✅ MiniMapTile tiles loaded successfully');
    });

    tiles.addTo(map);

    // Add marker
    L.marker([lat, lng], { icon: PIN_ICON }).addTo(map);

    // Fit bounds after map is ready and container has stable size
    map.whenReady(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { 
        maxZoom: 15,  // Allow neighborhood-level detail (streets and landmarks visible)
        padding: [24, 24] 
      });
      // Update zoom state after fitBounds calculates final zoom
      const finalZoom = Math.round(map.getZoom());
      console.log('🗺️ MiniMapTile final zoom:', finalZoom, 'bounds:', bounds);
      setCurrentZoom(finalZoom);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, radiusKm]);

  const scaleLabel = getScaleLabel(currentZoom);

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
      
      {/* Bottom gradient + city label + scale bar */}
      <div className={styles.heroMapOverlay}>
        <div className={styles.heroMapContextRow}>
          {cityLabel && (
            <span className={styles.heroMapLabel}>{cityLabel}</span>
          )}
          <span className={styles.heroMapScale}>{scaleLabel}</span>
          {/* FINGERPRINT: Visual confirmation this file is live */}
          <span style={{ 
            position: 'absolute', 
            top: '4px', 
            right: '4px', 
            fontSize: '9px', 
            background: 'rgba(59, 130, 246, 0.8)', 
            color: 'white', 
            padding: '2px 4px', 
            borderRadius: '2px',
            fontWeight: 600
          }}>
            LIVE z={currentZoom}
          </span>
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
