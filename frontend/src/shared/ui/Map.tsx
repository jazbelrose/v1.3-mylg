import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './marker.css';

const DEFAULT_PIN_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 2C11.163 2 4 9.163 4 18c0 11.046 16 30 16 30s16-18.954 16-30C36 9.163 28.837 2 20 2z" fill="#2563eb" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="18" r="7" fill="#ffffff"/></svg>`,
)}`;

export interface MapRef {
  locateUser: () => void;
}

interface UserLocation {
  id: string;
  lat: number;
  lng: number;
  thumbnail?: string;
  accuracy?: number;
}

interface LatLng {
  lat: number;
  lng: number;
}

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  iconUrl?: string;
  title?: string;
  isActive?: boolean;
  markerColor?: string;
  borderColor?: string;
  variant?: 'pin' | 'avatar';
}

interface MapProps {
  location: LatLng;
  address: string;
  scrollWheelZoom: boolean;
  dragging: boolean;
  touchZoom: boolean;
  showUserLocation: boolean;
  userThumbnail?: string;
  projectThumbnail?: string;
  isEditable?: boolean;
  onLocationChange?: (loc: LatLng) => void;
  otherUsers?: UserLocation[];
  onUserLocation?: (loc: { lat: number; lng: number; accuracy: number }) => void;
  markers?: MapMarker[];
  onMarkerClick?: (markerId: string) => void;
  focusLocation?: LatLng | null;
  focusZoom?: number;
}

const Map = forwardRef<MapRef, MapProps>(
  (
    {
      location,
      address,
      scrollWheelZoom,
      dragging,
      touchZoom,
      showUserLocation,
      userThumbnail,
      projectThumbnail,
      isEditable = false,
      onLocationChange,
      otherUsers = [],
      onUserLocation,
      markers = [],
      onMarkerClick,
      focusLocation = null,
      focusZoom,
    },
    ref,
  ) => {
    const mapRef = useRef<HTMLDivElement | null>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const userMarkerRef = useRef<L.Marker | null>(null);
    const accuracyCircleRef = useRef<L.Circle | null>(null);
    const projectMarkerRef = useRef<L.Marker | null>(null);
    const otherUsersMarkersRef = useRef<Record<string, L.Marker>>({});
    const otherUsersAccuracyRef = useRef<Record<string, L.Circle>>({});
    const customMarkersRef = useRef<Record<string, L.Marker>>({});
    const lastFocusRef = useRef<string | null>(null);
    const markerIdsRef = useRef<string[]>([]);

    const createMarkerIcon = (marker: MapMarker) => {
      const { iconUrl, isActive, markerColor, borderColor, variant } = marker;
      const mode = variant === 'avatar' ? 'avatar' : 'pin';
      const markerClasses = ['task-marker', `task-marker--${mode}`];
      if (isActive) {
        markerClasses.push('task-marker--active');
      }

      const styleParts: string[] = [];
      if (mode === 'avatar') {
        if (markerColor) {
          styleParts.push(`--marker-bg:${markerColor}`);
        }
        if (borderColor) {
          styleParts.push(`--marker-border:${borderColor}`);
        }
      }
      const styleAttr = styleParts.length ? ` style="${styleParts.join(';')}"` : '';

      let innerHtml: string;
      if (mode === 'avatar') {
        innerHtml = iconUrl
          ? `<img src="${iconUrl}" alt="" class="task-marker__avatar" />`
          : '<span class="task-marker__avatar-fallback" aria-hidden="true"></span>';
      } else {
        const pinUrl = iconUrl || DEFAULT_PIN_ICON;
        innerHtml = `<img src="${pinUrl}" alt="" class="task-marker__pin-image" />`;
      }

      const iconSize: [number, number] = mode === 'pin' ? [40, 52] : [36, 48];
      const iconAnchor: [number, number] = mode === 'pin' ? [20, 48] : [18, 44];

      return L.divIcon({
        html: `<div class="${markerClasses.join(' ')}"${styleAttr}>${innerHtml}</div>`,
        className: '',
        iconSize,
        iconAnchor,
      });
    };

    useEffect(() => {
      if (!mapRef.current || mapInstance.current) return;

      mapInstance.current = L.map(mapRef.current, {
        center: [location.lat, location.lng],
        zoom: 13,
        scrollWheelZoom,
        dragging,
        touchZoom,
        attributionControl: false,
        zoomControl: false, // Disable zoom controls since touch zoom is available
      });

      const apiKey = 'YOUR_API_KEY';
      const attribution =
        'Map tiles by <a href="https://stamen.com">Stamen Design</a>, ' +
        'hosted by <a href="https://stadiamaps.com">Stadia Maps</a> — ' +
        'Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';

      L.tileLayer(
        `https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png?api_key=${apiKey}`,
        {
          attribution,
          maxZoom: 20,
          tileSize: 256,
          zoomOffset: 0,
        },
      ).addTo(mapInstance.current);

      mapInstance.current.whenReady(() => mapInstance.current?.invalidateSize());
    }, [location.lat, location.lng, scrollWheelZoom, dragging, touchZoom]);

    useEffect(() => {
      if (typeof ResizeObserver === 'undefined' || !mapRef.current || !mapInstance.current) return;
      const observer = new ResizeObserver(() => {
        mapInstance.current?.invalidateSize();
      });
      observer.observe(mapRef.current);
      return () => observer.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      locateUser: () => {
        if (!mapInstance.current) return;
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            mapInstance.current?.setView([latitude, longitude], 13);
          });
        }
      },
    }));

    useEffect(() => {
      if (!mapInstance.current) return;

      if (scrollWheelZoom) mapInstance.current.scrollWheelZoom.enable();
      else mapInstance.current.scrollWheelZoom.disable();

      if (dragging) mapInstance.current.dragging.enable();
      else mapInstance.current.dragging.disable();

      if (touchZoom) mapInstance.current.touchZoom.enable();
      else mapInstance.current.touchZoom.disable();

      if (location.lat && location.lng) {
        const projectLatLng: [number, number] = [location.lat, location.lng];
        const projectIcon = L.icon({
          iconUrl: projectThumbnail || `${import.meta.env.BASE_URL}images/project-marker.svg`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32],
          className: projectThumbnail ? 'project-marker-icon' : '',
        });

        if (projectMarkerRef.current) {
          projectMarkerRef.current.setLatLng(projectLatLng);
          projectMarkerRef.current.setIcon(projectIcon);
          if (isEditable) {
            projectMarkerRef.current.dragging?.enable();
          } else {
            projectMarkerRef.current.dragging?.disable();
          }
        } else {
          projectMarkerRef.current = L.marker(projectLatLng, {
            icon: projectIcon,
            draggable: isEditable,
          }).addTo(mapInstance.current);

          if (isEditable) {
            projectMarkerRef.current.on('dragend', (e) => {
              const { lat, lng } = (e.target as L.Marker).getLatLng();
              onLocationChange?.({ lat, lng });
            });
          }
        }

        projectMarkerRef.current.bindTooltip(address, { direction: 'top' });

        const latLngs: L.LatLngExpression[] = [projectMarkerRef.current.getLatLng()];
        if (userMarkerRef.current) {
          latLngs.push(userMarkerRef.current.getLatLng());
          if (accuracyCircleRef.current) {
            const b = accuracyCircleRef.current.getBounds();
            latLngs.push(b.getNorthEast(), b.getSouthWest());
          }
        }
        Object.values(otherUsersMarkersRef.current).forEach((m) => {
          latLngs.push(m.getLatLng());
        });
        Object.values(otherUsersAccuracyRef.current).forEach((c) => {
          const b = c.getBounds();
          latLngs.push(b.getNorthEast(), b.getSouthWest());
        });
        Object.values(customMarkersRef.current).forEach((marker) => {
          latLngs.push(marker.getLatLng());
        });

        if (latLngs.length > 1) {
          mapInstance.current.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
        } else {
          mapInstance.current.setView(projectLatLng, 13);
        }
      }
    }, [
      scrollWheelZoom,
      dragging,
      touchZoom,
      location,
      address,
      projectThumbnail,
      isEditable,
      onLocationChange,
      otherUsers,
    ]);

    useEffect(() => {
      if (!mapInstance.current) return;

      if (!showUserLocation) {
        if (userMarkerRef.current) {
          mapInstance.current.removeLayer(userMarkerRef.current);
          userMarkerRef.current = null;
        }
        if (accuracyCircleRef.current) {
          mapInstance.current.removeLayer(accuracyCircleRef.current);
          accuracyCircleRef.current = null;
        }
        if (projectMarkerRef.current) {
          mapInstance.current.setView(projectMarkerRef.current.getLatLng(), 13);
        }
        return;
      }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            const userLatLng: [number, number] = [latitude, longitude];
            const iconHtml = userThumbnail
              ? `<img src="${userThumbnail}" style="width:32px;height:32px;border-radius:50%;border:2px solid white;" />`
              : `<svg width="24" height="24" viewBox="0 0 24 24"><path fill="#ff5722" stroke="white" stroke-width="2" d="M12 2C8.1 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="3" fill="white"/></svg>`;
            const iconSize: [number, number] = userThumbnail ? [32, 32] : [24, 24];
            const iconAnchor: [number, number] = userThumbnail ? [16, 16] : [12, 24];
            const icon = L.divIcon({ html: iconHtml, className: '', iconSize, iconAnchor });

            if (userMarkerRef.current) {
              userMarkerRef.current.setLatLng(userLatLng);
              userMarkerRef.current.setIcon(icon);
            } else {
              userMarkerRef.current = L.marker(userLatLng, { icon }).addTo(mapInstance.current!);
            }

            if (accuracyCircleRef.current) {
              accuracyCircleRef.current.setLatLng(userLatLng);
              accuracyCircleRef.current.setRadius(accuracy);
            } else {
              accuracyCircleRef.current = L.circle(userLatLng, {
                radius: accuracy,
                color: '#FA3356',
                fillColor: '#FA3356',
                fillOpacity: 0.2,
              }).addTo(mapInstance.current!);
            }

            onUserLocation?.({ lat: latitude, lng: longitude, accuracy });

            const latLngs: L.LatLngExpression[] = [];
            const userBounds = accuracyCircleRef.current.getBounds();
            latLngs.push(userBounds.getNorthEast(), userBounds.getSouthWest());
            if (projectMarkerRef.current) {
              latLngs.push(projectMarkerRef.current.getLatLng());
            }
            Object.values(otherUsersMarkersRef.current).forEach((m) => {
              latLngs.push(m.getLatLng());
            });
            Object.values(otherUsersAccuracyRef.current).forEach((c) => {
              const b = c.getBounds();
              latLngs.push(b.getNorthEast(), b.getSouthWest());
            });

            if (latLngs.length > 1) {
              mapInstance.current!.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
            } else {
              mapInstance.current!.fitBounds(userBounds, { padding: [50, 50] });
            }
          },
          (error) => {
            console.error('Geolocation error:', error);
          },
        );
      }
    }, [showUserLocation, userThumbnail, onUserLocation, otherUsers]);

    useEffect(() => {
      if (!mapInstance.current) return;
      const userMarkers = otherUsersMarkersRef.current;
      const circles = otherUsersAccuracyRef.current;
      const users = otherUsers || [];

      Object.keys(userMarkers).forEach((id) => {
        if (!users.find((u) => u.id === id)) {
          mapInstance.current?.removeLayer(userMarkers[id]);
          delete userMarkers[id];
          if (circles[id]) {
            mapInstance.current?.removeLayer(circles[id]);
            delete circles[id];
          }
        }
      });

      users.forEach((u) => {
        const userLatLng: [number, number] = [u.lat, u.lng];
        const iconHtml = u.thumbnail
          ? `<img src="${u.thumbnail}" style="width:32px;height:32px;border-radius:50%;border:2px solid white;" />`
          : `<svg width="24" height="24" viewBox="0 0 24 24"><path fill="#ff5722" stroke="white" stroke-width="2" d="M12 2C8.1 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="3" fill="white"/></svg>`;
        const iconSize: [number, number] = u.thumbnail ? [32, 32] : [24, 24];
        const iconAnchor: [number, number] = u.thumbnail ? [16, 16] : [12, 24];
        const icon = L.divIcon({ html: iconHtml, className: '', iconSize, iconAnchor });

        if (userMarkers[u.id]) {
          userMarkers[u.id].setLatLng(userLatLng);
          userMarkers[u.id].setIcon(icon);
        } else {
          userMarkers[u.id] = L.marker(userLatLng, { icon }).addTo(mapInstance.current!);
        }

        const radius = u.accuracy || 0;
        if (circles[u.id]) {
          circles[u.id].setLatLng(userLatLng);
          circles[u.id].setRadius(radius);
        } else {
          circles[u.id] = L.circle(userLatLng, {
            radius,
            color: '#FA3356',
            fillColor: '#FA3356',
            fillOpacity: 0.2,
          }).addTo(mapInstance.current!);
        }
      });

      const latLngs: L.LatLngExpression[] = [];
      if (projectMarkerRef.current) latLngs.push(projectMarkerRef.current.getLatLng());
      if (userMarkerRef.current) {
        latLngs.push(userMarkerRef.current.getLatLng());
        if (accuracyCircleRef.current) {
          const b = accuracyCircleRef.current.getBounds();
          latLngs.push(b.getNorthEast(), b.getSouthWest());
        }
      }
      Object.values(userMarkers).forEach((m) => latLngs.push(m.getLatLng()));
      Object.values(circles).forEach((c) => {
        const b = c.getBounds();
        latLngs.push(b.getNorthEast(), b.getSouthWest());
      });
      Object.values(customMarkersRef.current).forEach((marker) => latLngs.push(marker.getLatLng()));
      if (latLngs.length > 1) {
        mapInstance.current!.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
      }
    }, [otherUsers]);

    useEffect(() => {
      if (!mapInstance.current) return;
      const map = mapInstance.current;
      const activeMarkers = customMarkersRef.current;
      const list = markers || [];
      const ids = new Set(list.map((item) => item.id));

      Object.keys(activeMarkers).forEach((id) => {
        if (!ids.has(id)) {
          activeMarkers[id].off('click');
          map.removeLayer(activeMarkers[id]);
          delete activeMarkers[id];
        }
      });

      list.forEach((marker) => {
        const latLng: [number, number] = [marker.lat, marker.lng];
        const icon = createMarkerIcon(marker);
        const existing = activeMarkers[marker.id];

        if (existing) {
          existing.setLatLng(latLng);
          existing.setIcon(icon);
          existing.off('click');
          existing.unbindTooltip();
        } else {
          activeMarkers[marker.id] = L.marker(latLng, { icon }).addTo(map);
        }

        const current = activeMarkers[marker.id];

        if (marker.title) {
          current.bindTooltip(marker.title, { direction: 'top', offset: [0, -32] });
        } else {
          current.unbindTooltip();
        }

        if (onMarkerClick) {
          current.on('click', () => onMarkerClick(marker.id));
        }
      });

      const sortedIds = list.map((item) => item.id).sort();
      const previousIds = markerIdsRef.current;
      const changed =
        sortedIds.length !== previousIds.length ||
        sortedIds.some((id, index) => id !== previousIds[index]);
      markerIdsRef.current = sortedIds;

      if (changed) {
        const latLngs: L.LatLngExpression[] = [];
        if (projectMarkerRef.current) latLngs.push(projectMarkerRef.current.getLatLng());
        if (userMarkerRef.current) latLngs.push(userMarkerRef.current.getLatLng());
        Object.values(otherUsersMarkersRef.current).forEach((marker) => latLngs.push(marker.getLatLng()));
        Object.values(activeMarkers).forEach((marker) => latLngs.push(marker.getLatLng()));
        if (latLngs.length > 1) {
          map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
        } else if (latLngs.length === 1) {
          map.setView(latLngs[0], map.getZoom());
        }
      }

      return () => {
        Object.values(activeMarkers).forEach((marker) => marker.off('click'));
      };
    }, [markers, onMarkerClick]);

    useEffect(() => {
      if (!mapInstance.current) return;
      if (!focusLocation) {
        lastFocusRef.current = null;
        return;
      }

      const key = `${focusLocation.lat.toFixed(6)}:${focusLocation.lng.toFixed(6)}`;
      if (lastFocusRef.current === key) return;
      lastFocusRef.current = key;

      const zoom = focusZoom ?? Math.max(mapInstance.current.getZoom(), 13);
      mapInstance.current.setView([focusLocation.lat, focusLocation.lng], zoom, { animate: true });
    }, [focusLocation, focusZoom]);

    useEffect(() => {
      return () => {
        if (!mapInstance.current) return;
        Object.values(customMarkersRef.current).forEach((marker) => {
          marker.off('click');
          mapInstance.current?.removeLayer(marker);
        });
        customMarkersRef.current = {};
      };
    }, []);

    useEffect(() => {
      if (!mapInstance.current || !isEditable) return;
      const handleClick = (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        onLocationChange?.({ lat, lng });
      };
      mapInstance.current.on('click', handleClick);
      return () => {
        mapInstance.current?.off('click', handleClick);
      };
    }, [isEditable, onLocationChange]);

    return <div id="map" style={{ height: '100%', width: '100%' }} ref={mapRef} />;
  },
);

export default React.memo(Map);









