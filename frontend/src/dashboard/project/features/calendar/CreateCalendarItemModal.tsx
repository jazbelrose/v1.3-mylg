import React, { useCallback, useEffect, useMemo, useState, useId } from "react";
import clsx from "clsx";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Tag,
  Users,
  Video,
  X,
} from "lucide-react";

import { useUser } from "@/app/contexts/useUser";
import { notify } from "@/shared/ui/ToastNotifications";
import Modal from "@/shared/ui/ModalWithStack";
import { useIsMobile } from "@/dashboard/project/components/Shared/calendar/hooks";
import {
  fetchLocationSuggestions,
  fetchGlobalLocationSuggestions,
  type NominatimSuggestion,
  type SavedLocation,
} from "@/shared/utils/location";

import styles from "./create-calendar-item-modal.module.css";
import drawerStyles from "./components/calendar-drawer-shell.module.css";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";

type EventFormInitialValues = Partial<{
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  allDay?: boolean;
  eventType?: string;
  location?: string;
  description?: string;
  tags?: string[];
  guests?: string[];
}>;

type BaseProps = {
  isOpen: boolean;
  initialDate: Date;
  onClose: () => void;
  onCreateEvent: (input: CreateEventRequest) => Promise<void>;
  onUpdateEvent?: (input: CreateEventRequest) => Promise<void>;
  onDelete?: () => Promise<void>;
  mode?: "create" | "edit";
  initialValues?: EventFormInitialValues;
  teamMembers?: ProjectTeamMember[];
};

type Option = {
  label: string;
  value: string;
};

type Coordinates = {
  lat: number;
  lng: number;
};

export type CreateEventRequest = {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  endTime?: string; // HH:MM
  allDay: boolean;
  eventType: string;
  location?: string;
  description?: string;
  tags: string[];
  guests: string[];
};

const EVENT_TYPE_OPTIONS: Option[] = [
  { label: "Video Conference", value: "Video Conference" },
  { label: "In person", value: "In person" },
  { label: "Phone call", value: "Phone call" },
];

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatTimeInput = (date: Date) => {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
};

const deriveEndTime = (time?: string) => {
  if (!time) return undefined;
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return undefined;
  const total = hours * 60 + minutes + 60;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const endHours = `${Math.floor(wrapped / 60)}`.padStart(2, "0");
  const endMinutes = `${wrapped % 60}`.padStart(2, "0");
  return `${endHours}:${endMinutes}`;
};

const CreateCalendarItemModal: React.FC<BaseProps> = ({
  isOpen,
  initialDate,
  onClose,
  onCreateEvent,
  onUpdateEvent,
  onDelete,
  mode = "create",
  initialValues,
  teamMembers,
}) => {
  const { userData, updateUserProfile, refreshUser } = useUser();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>(["Meeting"]);
  const [guestQuery, setGuestQuery] = useState("");
  const [guests, setGuests] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("11:30");
  const [endTime, setEndTime] = useState<string | undefined>(deriveEndTime("11:30"));
  const [allDay, setAllDay] = useState(false);
  const [eventType, setEventType] = useState(EVENT_TYPE_OPTIONS[0].value);
  const [location, setLocation] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<NominatimSuggestion[]>([]);
  const [showWorldwideLink, setShowWorldwideLink] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [currentLocationAddress, setCurrentLocationAddress] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  const guestOptions = useMemo(() => {
    if (!teamMembers || teamMembers.length === 0) return [];
    return teamMembers
      .map((member) => {
        const fullName = `${member.firstName ?? ""} ${member.lastName ?? ""}`
          .trim()
          .replace(/\s+/g, " ");
        return fullName.length > 0 ? { id: member.userId, name: fullName } : null;
      })
      .filter((option): option is { id: string; name: string } => option !== null);
  }, [teamMembers]);

  const filteredSuggestions = useMemo(() => {
    if (guestOptions.length === 0) return [];
    const normalizedQuery = guestQuery.trim().toLowerCase();
    return guestOptions.filter((option) => {
      if (guests.includes(option.name)) return false;
      if (!normalizedQuery) return true;
      return option.name.toLowerCase().includes(normalizedQuery);
    });
  }, [guestOptions, guestQuery, guests]);

  const isEditing = mode === "edit";
  const isMobileViewport = useIsMobile();
  const titleId = useId();
  const descriptionId = useId();
  const locationSuggestionsId = useId();
  const headerTitle = isEditing ? "Edit event" : "Create a new event";
  const headerDescription = isEditing
    ? "Adjust the schedule and share updates with your collaborators."
    : "Bring your collaborators together by sharing the when, where, and why.";

  const overlayClassName = useMemo(() => {
    const base = clsx(
      drawerStyles.overlay,
      isMobileViewport ? drawerStyles.overlayMobile : drawerStyles.overlayDesktop,
    );
    return {
      base,
      afterOpen: clsx(base, drawerStyles.overlayVisible),
      beforeClose: clsx(base, drawerStyles.overlayHidden),
    };
  }, [isMobileViewport]);

  const contentClassName = useMemo(() => {
    const base = clsx(
      drawerStyles.panel,
      isMobileViewport ? drawerStyles.panelMobile : drawerStyles.panelDesktop,
    );
    return {
      base,
      afterOpen: clsx(base, drawerStyles.panelOpen),
      beforeClose: base,
    };
  }, [isMobileViewport]);

  const getDistance = useCallback((coord1: Coordinates, coord2: Coordinates): number => {
    const R = 6371;
    const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((coord1.lat * Math.PI) / 180) *
        Math.cos((coord2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  const fetchCurrentLocationAddress = useCallback(async (lat: number, lng: number): Promise<string | null> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      );
      const data = await response.json();
      return typeof data.display_name === "string" ? data.display_name : null;
    } catch (fetchError) {
      console.error("Failed to reverse geocode current location", fetchError);
      return null;
    }
  }, []);

  const sortSuggestionsByProximity = useCallback(
    (suggestions: NominatimSuggestion[], origin: Coordinates | null) => {
      if (!origin) return suggestions;
      return [...suggestions].sort((a, b) => {
        const coordA = { lat: parseFloat(a.lat), lng: parseFloat(a.lon) };
        const coordB = { lat: parseFloat(b.lat), lng: parseFloat(b.lon) };
        return getDistance(origin, coordA) - getDistance(origin, coordB);
      });
    },
    [getDistance],
  );

  useEffect(() => {
    if (!isOpen) return;
    const resolvedDate = initialValues?.date ?? formatDateInput(initialDate);
    const resolvedTime = initialValues?.time ?? formatTimeInput(initialDate);
    setDate(resolvedDate);
    setTime(resolvedTime);
    setEndTime(initialValues?.endTime ?? deriveEndTime(resolvedTime));
    setTitle(initialValues?.title ?? "");
    setDescription(initialValues?.description ?? "");
    setGuestQuery("");
    setGuestError(null);
    setTags(
      initialValues?.tags && initialValues.tags.length > 0
        ? initialValues.tags
        : isEditing
          ? []
          : ["Meeting"]
    );
    setGuests(
      initialValues?.guests && initialValues.guests.length > 0
        ? initialValues.guests
        : []
    );
    setAllDay(initialValues?.allDay ?? false);
    setEventType(initialValues?.eventType ?? EVENT_TYPE_OPTIONS[0].value);
    setLocation(initialValues?.location ?? "");
    setLocationSuggestions([]);
    setShowWorldwideLink(false);
    setError(null);
    setIsSubmitting(false);
    setIsDeleting(false);
  }, [initialDate, initialValues, isEditing, isOpen]);

  useEffect(() => {
    if (guestError && guestQuery) {
      setGuestError(null);
    }
  }, [guestError, guestQuery]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setUserLocation(null);
      setCurrentLocationAddress(null);
      return;
    }

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        const address = await fetchCurrentLocationAddress(coords.lat, coords.lng);
        if (!cancelled) {
          setCurrentLocationAddress(address);
        }
      },
      () => {
        if (!cancelled) {
          setUserLocation(null);
          setCurrentLocationAddress(null);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [fetchCurrentLocationAddress, isOpen]);

  useEffect(() => {
    if (!userLocation) return;
    setLocationSuggestions((prev) => sortSuggestionsByProximity(prev, userLocation));
  }, [sortSuggestionsByProximity, userLocation]);

  const canSubmit = useMemo(() => title.trim().length > 0 && date.trim().length > 0, [title, date]);

  const handleAddGuest = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const normalized = trimmed.toLowerCase();
    const match = guestOptions.find(
      (option) => option.name.toLowerCase() === normalized
    ) ||
      guestOptions.find((option) => option.name.toLowerCase().includes(normalized));

    if (!match) {
      setGuestError("Guests must be selected from the project team");
      return false;
    }

    setGuests((prev) => (prev.includes(match.name) ? prev : [...prev, match.name]));
    setGuestError(null);
    return true;
  };

  const handleGuestKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const added = handleAddGuest(guestQuery);
      if (added) {
        setGuestQuery("");
      }
    }
  };

  const handleRemoveGuest = (name: string) => {
    setGuests((prev) => prev.filter((guest) => guest !== name));
    setGuestError(null);
  };

  const handleAddTag = () => {
    const next = window.prompt("Add a tag");
    if (!next) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    setTags((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((item) => item !== tag));
  };

  const fetchAddressSuggestions = useCallback(
    async (query: string) => {
      try {
        const result = await fetchLocationSuggestions(query, userLocation ?? undefined, {
          limit: 5,
          includeCurrentLocation: true,
          currentLocationAddress: currentLocationAddress ?? undefined,
          defaultLocation: userData?.defaultTaskLocation ?? null,
        });
        setLocationSuggestions(result.suggestions);
        setShowWorldwideLink(result.showWorldwideLink);
      } catch (suggestionError) {
        console.error("Failed to fetch location suggestions", suggestionError);
        setLocationSuggestions([]);
        setShowWorldwideLink(false);
      }
    },
    [currentLocationAddress, userData?.defaultTaskLocation, userLocation],
  );

  const fetchGlobalAddressSuggestions = useCallback(
    async (query: string) => {
      try {
        const suggestions = await fetchGlobalLocationSuggestions(
          query,
          userLocation ?? undefined,
          {
            limit: 8,
            includeCurrentLocation: true,
            currentLocationAddress: currentLocationAddress ?? undefined,
            defaultLocation: userData?.defaultTaskLocation ?? null,
          },
        );
        setLocationSuggestions(suggestions);
        setShowWorldwideLink(false);
      } catch (suggestionError) {
        console.error("Failed to fetch global location suggestions", suggestionError);
        setLocationSuggestions([]);
        setShowWorldwideLink(false);
      }
    },
    [currentLocationAddress, userData?.defaultTaskLocation, userLocation],
  );

  const handleLocationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setLocation(value);
    void fetchAddressSuggestions(value);
  };

  const handleLocationSuggestionSelect = (suggestion: NominatimSuggestion) => {
    const suggestionId = suggestion.place_id?.toString();
    if (suggestionId === "current") {
      const fallback = currentLocationAddress ?? suggestion.display_name;
      if (fallback) {
        setLocation(fallback);
      }
    } else if (suggestionId === "default") {
      const defaultLocation = userData?.defaultTaskLocation;
      if (defaultLocation) {
        setLocation(defaultLocation.formattedAddress);
      }
    } else {
      setLocation(suggestion.display_name);
    }
    setLocationSuggestions([]);
    setShowWorldwideLink(false);
  };

  const handleSetAsDefault = useCallback(
    async (suggestion: NominatimSuggestion) => {
      if (!userData) return;
      const defaultLocation: SavedLocation = {
        formattedAddress: suggestion.display_name,
        lat: parseFloat(suggestion.lat),
        lon: parseFloat(suggestion.lon),
        placeId: suggestion.place_id?.toString(),
      };
      try {
        await updateUserProfile({ ...userData, defaultTaskLocation: defaultLocation });
        await refreshUser(true);
        notify("success", "Default location updated");
      } catch (setError) {
        console.error("Failed to set default location", setError);
        notify("error", "Failed to set default location");
      }
    },
    [refreshUser, updateUserProfile, userData],
  );

  const handleUseDefaultLocation = () => {
    if (!userData?.defaultTaskLocation) return;
    setLocation(userData.defaultTaskLocation.formattedAddress);
    setLocationSuggestions([]);
    setShowWorldwideLink(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError("Title and date are required");
      return;
    }
    if (isSubmitting || isDeleting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      title: title.trim(),
      date,
      time: allDay ? undefined : time,
      endTime: allDay ? undefined : endTime ?? deriveEndTime(time),
      allDay,
      eventType,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      tags,
      guests,
    } satisfies CreateEventRequest;

    try {
      if (isEditing) {
        if (!onUpdateEvent) {
          throw new Error("Missing update handler");
        }
        await onUpdateEvent(payload);
      } else {
        await onCreateEvent(payload);
      }
      onClose();
    } catch (submitError) {
      console.error("Failed to save calendar item", submitError);
      setError("Something went wrong while saving. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (deleteError) {
      console.error("Failed to delete calendar item", deleteError);
      setError("Something went wrong while deleting. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRequestClose = useCallback(() => {
    if (isSubmitting || isDeleting) return;
    onClose();
  }, [isDeleting, isSubmitting, onClose]);

  const handleCancel = useCallback(() => {
    if (isSubmitting || isDeleting) return;
    onClose();
  }, [isDeleting, isSubmitting, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleRequestClose}
      overlayClassName={overlayClassName}
      className={contentClassName}
      contentLabel={isEditing ? "Edit event" : "Create event"}
      shouldCloseOnOverlayClick={!isSubmitting && !isDeleting}
      closeTimeoutMS={280}
    >
      <div
        className={styles.modalShell}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h2 id={titleId} className={styles.headerTitle}>
              {headerTitle}
            </h2>
            <p id={descriptionId} className={styles.headerDescription}>
              {headerDescription}
            </p>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleRequestClose}
            disabled={isSubmitting || isDeleting}
            aria-label="Close"
          >
            <X className={styles.icon} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.body}>
            <div className={styles.fieldGroup}>
              <input
                className={styles.titleInput}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Write a title here"
                disabled={isSubmitting}
              />
              <div className={styles.tagsRow}>
                <Tag className={styles.tagsIcon} />
                <div className={styles.tagList}>
                  {tags.map((tag) => (
                    <span key={tag} className={styles.tagChip}>
                      {tag}
                      <button
                        type="button"
                        className={styles.removeChip}
                        onClick={() => handleRemoveTag(tag)}
                        aria-label={`Remove ${tag}`}
                        disabled={isSubmitting}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className={styles.addTagButton}
                    onClick={handleAddTag}
                    disabled={isSubmitting}
                  >
                    + Add tag
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="modal-guests">
                Add collaborators
              </label>
              <div className={styles.fieldShell}>
                <div className={styles.fieldShellContent}>
                  <div className={styles.fieldShellHeader}>
                    <Users className={styles.fieldIcon} />
                    <input
                      id="modal-guests"
                      className={styles.textInput}
                      placeholder={
                        guestOptions.length > 0
                          ? "Search project team and press Enter"
                          : "No team members available"
                      }
                      value={guestQuery}
                      onChange={(event) => setGuestQuery(event.target.value)}
                      onKeyDown={handleGuestKeyDown}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className={styles.chipList}>
                    {guests.map((guest) => {
                      const initials = guest
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((part) => part[0] ?? "")
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();
                      return (
                        <span key={guest} className={styles.chip}>
                          <span className={styles.chipAvatar}>{initials || "?"}</span>
                          <span className={styles.chipLabel}>{guest}</span>
                          <button
                            type="button"
                            className={styles.chipRemove}
                            onClick={() => handleRemoveGuest(guest)}
                            aria-label={`Remove ${guest}`}
                            disabled={isSubmitting}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  {filteredSuggestions.length > 0 && (
                    <div className={styles.suggestions}>
                      {filteredSuggestions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={styles.suggestionButton}
                          onClick={() => {
                            const added = handleAddGuest(option.name);
                            if (added) {
                              setGuestQuery("");
                            }
                          }}
                          disabled={isSubmitting}
                        >
                          {option.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {guestError && <div className={styles.guestError}>{guestError}</div>}
                </div>
              </div>
            </div>

            <div className={styles.grid}>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="modal-date">
                  Date
                </label>
                <div className={styles.fieldShell}>
                  <div className={styles.fieldShellHeader}>
                    <CalendarIcon className={styles.fieldIcon} />
                    <input
                      id="modal-date"
                      type="date"
                      className={styles.textInput}
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="modal-time">
                  Time
                </label>
                <div className={styles.fieldShell}>
                  <div className={styles.timeRow}>
                    <Clock className={styles.fieldIcon} />
                    <input
                      id="modal-time"
                      type="time"
                      className={styles.timeInput}
                      value={time}
                      onChange={(event) => {
                        const nextTime = event.target.value;
                        setTime(nextTime);
                        setEndTime(deriveEndTime(nextTime));
                      }}
                      disabled={isSubmitting || allDay}
                    />
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={allDay}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setAllDay(checked);
                          if (checked) {
                            setEndTime(undefined);
                          } else {
                            setEndTime((current) => current ?? deriveEndTime(time));
                          }
                        }}
                        disabled={isSubmitting}
                      />
                      <span>All day</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="modal-event-type">
                  Event type
                </label>
                <div className={styles.fieldShell}>
                  <div className={styles.fieldShellHeader}>
                    <Video className={styles.fieldIcon} />
                    <select
                      id="modal-event-type"
                      className={styles.select}
                      value={eventType}
                      onChange={(event) => setEventType(event.target.value)}
                      disabled={isSubmitting}
                    >
                      {EVENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="modal-location">
                Location
              </label>
              {!location && userData?.defaultTaskLocation ? (
                <button
                  type="button"
                  className={styles.defaultLocationPill}
                  onClick={handleUseDefaultLocation}
                  disabled={isSubmitting}
                >
                  Use default address — {userData.defaultTaskLocation.formattedAddress}
                </button>
              ) : null}
              <div className={styles.locationInputWrapper}>
                <div className={styles.fieldShell}>
                  <div className={styles.fieldShellHeader}>
                    <MapPin className={styles.fieldIcon} />
                    <input
                      id="modal-location"
                      className={styles.textInput}
                      placeholder="Add a location"
                      value={location}
                      onChange={handleLocationChange}
                      disabled={isSubmitting}
                      aria-autocomplete="list"
                      aria-expanded={locationSuggestions.length > 0}
                      aria-controls={
                        locationSuggestions.length > 0 ? locationSuggestionsId : undefined
                      }
                    />
                  </div>
                </div>
                {locationSuggestions.length > 0 ? (
                  <div
                    className={styles.locationSuggestions}
                    role="listbox"
                    id={locationSuggestionsId}
                  >
                    {locationSuggestions.map((suggestion) => (
                      <div key={suggestion.place_id} className={styles.locationSuggestionItem}>
                        <button
                          type="button"
                          className={styles.locationSuggestionButton}
                          role="option"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleLocationSuggestionSelect(suggestion)}
                        >
                          {suggestion.display_name}
                        </button>
                        {suggestion.place_id !== "current" && suggestion.place_id !== "default" ? (
                          <button
                            type="button"
                            className={styles.setDefaultLink}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSetAsDefault(suggestion)}
                          >
                            Set as default
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {showWorldwideLink ? (
                      <button
                        type="button"
                        className={styles.worldwideLink}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          void fetchGlobalAddressSuggestions(location);
                        }}
                      >
                        Search worldwide
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="modal-description">
                Add description
              </label>
              <div className={styles.fieldShell}>
                <textarea
                  id="modal-description"
                  className={styles.textArea}
                  rows={4}
                  placeholder="Write here..."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}
          </div>

          <div className={styles.footer}>
            <div className={styles.footerMeta}>
              Guests can view this event • Share the location with your team
            </div>
            <div className={styles.footerActions}>
              {isEditing && onDelete && (
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={handleDelete}
                  disabled={isSubmitting || isDeleting}
                >
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
              )}
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleCancel}
                disabled={isSubmitting || isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting || isDeleting}
              >
                {isSubmitting
                  ? isEditing
                    ? "Updating…"
                    : "Saving…"
                  : isEditing
                    ? "Update"
                    : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CreateCalendarItemModal;
