import React, { useState, useEffect, useRef } from "react";
import Map from "../../../../shared/ui/Map";
import { toast, ToastContainer } from "react-toastify";
import Modal from "../../../../shared/ui/ModalWithStack";
import { NOMINATIM_SEARCH_URL, apiFetch, getFileUrl } from "../../../../shared/utils/api";
import { useData } from "../../../../app/contexts/useData";
import { useSocket } from "../../../../app/contexts/useSocket";
import { useOnlineStatus } from '@/app/contexts/OnlineStatusContext';
import { FaPencilAlt, FaCrosshairs, FaLock, FaUnlock } from "react-icons/fa";
import { enqueueProjectUpdate } from "../../../../shared/utils/requestQueue";

const NOMINATIM_REVERSE_URL =
  "https://nominatim.openstreetmap.org/reverse?format=json";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

// ---- Light types to keep things ergonomic ----
type LatLng = { lat: number; lng: number; accuracy?: number };

type Project = {
  projectId?: string;
  title?: string;
  thumbnails?: string[];
  address?: string;
  location?: Partial<LatLng>;
};

type NominatimSuggestion = {
  place_id: number | string;
  display_name: string;
  lat: string; // Nominatim returns strings
  lon: string;
};

type ConnectedUser = {
  id: string;
  lat: number;
  lng: number;
  accuracy?: number;
  thumbnail?: string;
};

type MapRef = {
  locateUser: () => void;
} | null;

interface LocationComponentProps {
  activeProject: Project;
  onActiveProjectChange: (project: Project) => void;
}

const LocationComponent: React.FC<LocationComponentProps> = ({
  activeProject,
  onActiveProjectChange,
}) => {
  const { updateProjectFields, user } = useData() as {
    updateProjectFields: (projectId: string, fields: Record<string, unknown>) => Promise<void>;
    user?: { userId?: string; thumbnail?: string };
  };

  const { ws } = useSocket() as { ws: WebSocket | null };
  const { isOnline } = useOnlineStatus() as { isOnline: (id?: string | null) => boolean };

  const [saving, setSaving] = useState(false);

  const [location, setLocation] = useState<Partial<LatLng>>(
    activeProject.location || {}
  );
  const [address, setAddress] = useState<string>(
    activeProject.address || ""
  );
  const [isInteractive, setIsInteractive] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLocation, setModalLocation] = useState<Partial<LatLng>>(location);
  const [modalAddress, setModalAddress] = useState<string>(address);

  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimSuggestion[]>([]);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);

  const mapRef = useRef<MapRef>(null);

  // Keep local state in sync when the active project changes
  useEffect(() => {
    setLocation(activeProject.location || {});
    setAddress(activeProject.address || "");
  }, [activeProject]);

  // Listen for "userLocation" updates over the socket
  useEffect(() => {
    if (!ws) return;

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.action === "userLocation" &&
          data.userId &&
          data.userId !== user?.userId &&
          data.location
        ) {
          setConnectedUsers((prev) => {
            const others = prev.filter((u) => u.id !== data.userId);
            return [
              ...others,
              {
                id: data.userId,
                lat: data.location.lat,
                lng: data.location.lng,
                accuracy: data.location.accuracy,
                thumbnail: data.thumbnail ? getFileUrl(data.thumbnail) : undefined,
              },
            ];
          });
        }
      } catch (err) {
        console.error("Error handling websocket message:", err);
      }
    };

    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws, user?.userId]);

  // Remove disconnected users
  useEffect(() => {
    setConnectedUsers((prev) => prev.filter((u) => isOnline(u.id)));
  }, [isOnline]);

  const openModal = () => {
    setModalLocation(location);
    setModalAddress(address);
    setSearchQuery(address || "");
    setSuggestions([]);
    setIsModalOpen(true);
  };

  const fetchSuggestions = async (query: string): Promise<NominatimSuggestion[]> => {
    const url = `${NOMINATIM_SEARCH_URL}${encodeURIComponent(
      query
    )}&addressdetails=1&limit=5`;
    try {
      const data = await apiFetch<NominatimSuggestion[]>(url);
      return data;
    } catch (err) {
      console.error("Error fetching suggestions:", err);
      return [];
    }
  };

  const handleSearchChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (value.length > 2) {
      const results = await fetchSuggestions(value);
      setSuggestions(results);
    } else {
      setSuggestions([]);
    }
  };

  const handleSuggestionSelect = (s: NominatimSuggestion) => {
    const loc: LatLng = { lat: parseFloat(s.lat), lng: parseFloat(s.lon) };
    setModalLocation(loc);
    setModalAddress(s.display_name);
    setSearchQuery(s.display_name);
    setSuggestions([]);
  };

  const reverseGeocode = async (loc: LatLng): Promise<string> => {
    const url = `${NOMINATIM_REVERSE_URL}&lat=${loc.lat}&lon=${loc.lng}`;
    try {
      const data = await apiFetch<{ display_name?: string }>(url);
      return data.display_name || "";
    } catch (err) {
      console.error("Reverse geocode error:", err);
      return "";
    }
  };

  const handleModalLocationChange = async (loc: LatLng) => {
    setModalLocation(loc);
    const addr = await reverseGeocode(loc);
    if (addr) {
      setModalAddress(addr);
      setSearchQuery(addr);
    }
  };

  const updateAddressToAPI = async (
    addr: string,
    loc: Partial<LatLng>
  ): Promise<boolean> => {
    if (!activeProject || !activeProject.projectId) return false;

    const payload = { address: addr, location: loc };
    try {
      setSaving(true);
      await enqueueProjectUpdate(
        updateProjectFields,
        activeProject.projectId,
        payload
      );

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            action: "projectUpdated",
            projectId: activeProject.projectId,
            title: activeProject.title,
            fields: payload,
            conversationId: `project#${activeProject.projectId}`,
          })
        );
      }
      return true;
    } catch (error) {
      console.error("Error updating address and location:", error);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (
      !modalAddress ||
      !modalLocation.lat ||
      !modalLocation.lng
    ) {
      toast.error("Please select a valid address.");
      return;
    }

    const success = await updateAddressToAPI(modalAddress, modalLocation);
    if (success) {
      onActiveProjectChange({
        ...activeProject,
        address: modalAddress,
        location: modalLocation,
      });
      setAddress(modalAddress);
      setLocation(modalLocation);
      setIsModalOpen(false);
      toast.success("Location saved successfully!");
    } else {
      toast.error("Failed to save location. Please try again.");
    }
  };

  const handleUserLocation = (loc: LatLng) => {
    if (ws && ws.readyState === WebSocket.OPEN && user?.userId) {
      ws.send(
        JSON.stringify({
          action: "userLocation",
          userId: user.userId,
          location: loc,
          thumbnail: user?.thumbnail ? getFileUrl(user.thumbnail) : undefined,
        })
      );
    }
  };

  return (
    <div className="column-5" style={{ position: "relative" }}>
      {saving && (
        <div style={{ position: "absolute", top: 0, right: 0, color: "#FA3356" }}>
          Saving...
        </div>
      )}

      <Map
        ref={mapRef}
        location={
          location.lat && location.lng ? (location as LatLng) : { lat: 0, lng: 0 }
        }
        address={address || "No Address Provided"}
        scrollWheelZoom={isInteractive}
        dragging={isInteractive}
        touchZoom={isInteractive}
        showUserLocation
        userThumbnail={user?.thumbnail ? getFileUrl(user.thumbnail) : undefined}
        projectThumbnail={
          activeProject?.thumbnails?.[0]
            ? getFileUrl(activeProject.thumbnails[0])
            : undefined
        }
        otherUsers={connectedUsers}
        onUserLocation={handleUserLocation}
      />

      <div className="map-control-buttons">
        <button
          className="map-control-button"
          onClick={openModal}
          aria-label="Edit location"
        >
          <FaPencilAlt size={14} />
        </button>

        <button
          className="map-control-button"
          onClick={() => mapRef.current?.locateUser()}
          aria-label="Use my location"
        >
          <FaCrosshairs size={14} />
        </button>

        <button
          className="map-control-button"
          onClick={() => setIsInteractive(!isInteractive)}
          aria-label="Toggle map interaction"
        >
          {isInteractive ? <FaLock size={14} /> : <FaUnlock size={14} />}
        </button>
      </div>

      <Modal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        className="map-edit-modal"
        overlayClassName="map-edit-overlay"
      >
        <div style={{ position: "relative" }}>
          <input
            type="text"
            className="modal-input"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search address"
          />
          {suggestions.length > 0 && (
            <div className="suggestions-list">
              {suggestions.map((s) => (
                <div key={s.place_id} onClick={() => handleSuggestionSelect(s)}>
                  {s.display_name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-map" style={{ flex: 1, marginTop: "10px" }}>
          <Map
            location={
              modalLocation.lat && modalLocation.lng
                ? (modalLocation as LatLng)
                : { lat: 0, lng: 0 }
            }
            address={modalAddress || ""}
            scrollWheelZoom
            dragging
            touchZoom
            showUserLocation
            userThumbnail={user?.thumbnail ? getFileUrl(user.thumbnail) : undefined}
            projectThumbnail={
              activeProject?.thumbnails?.[0]
                ? getFileUrl(activeProject.thumbnails[0])
                : undefined
            }
            isEditable
            onLocationChange={handleModalLocationChange}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "10px",
          }}
        >
          <button
            className="modal-button secondary"
            onClick={() => setIsModalOpen(false)}
          >
            Cancel
          </button>
          <button className="modal-button primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </Modal>

      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
};

export default LocationComponent;









