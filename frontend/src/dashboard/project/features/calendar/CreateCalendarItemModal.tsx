import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Calendar as CalendarIcon,
  Clock,
  Copy,
  Repeat,
  Settings,
  Tag,
  Users,
  Video,
  X,
} from "lucide-react";

import Modal from "@/shared/ui/ModalWithStack";

import styles from "./create-calendar-item-modal.module.css";

type EventFormInitialValues = Partial<{
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  allDay?: boolean;
  repeat?: string;
  reminder?: string;
  eventType?: string;
  platform?: string;
  description?: string;
  tags?: string[];
  guests?: string[];
}>;

type BaseProps = {
  isOpen: boolean;
  initialDate: Date;
  initialTab: CreateCalendarItemTab;
  onClose: () => void;
  onCreateEvent: (input: CreateEventRequest) => Promise<void>;
  onCreateTask: (input: CreateTaskRequest) => Promise<void>;
  onUpdateEvent?: (input: CreateEventRequest) => Promise<void>;
  onUpdateTask?: (input: CreateTaskRequest) => Promise<void>;
  onDelete?: () => Promise<void>;
  mode?: "create" | "edit";
  initialValues?: EventFormInitialValues;
  availableTabs?: CreateCalendarItemTab[];
};

type Option = {
  label: string;
  value: string;
};

export type CreateCalendarItemTab = "Event" | "Task" | "Appointment";

export type CreateEventRequest = {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  endTime?: string; // HH:MM
  allDay: boolean;
  repeat: string;
  reminder: string;
  eventType: string;
  platform: string;
  description?: string;
  tags: string[];
  guests: string[];
};

export type CreateTaskRequest = {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  description?: string;
  tags: string[];
  guests: string[];
};

const TABS: CreateCalendarItemTab[] = ["Event", "Task", "Appointment"];

const REPEAT_OPTIONS: Option[] = [
  { label: "Does not repeat", value: "Does not repeat" },
  { label: "Daily", value: "Daily" },
  { label: "Weekly", value: "Weekly" },
  { label: "Monthly", value: "Monthly" },
];

const EVENT_TYPE_OPTIONS: Option[] = [
  { label: "Video Conference", value: "Video Conference" },
  { label: "In person", value: "In person" },
  { label: "Phone call", value: "Phone call" },
];

const PLATFORM_OPTIONS: Option[] = [
  { label: "Google Meet", value: "Google Meet" },
  { label: "Zoom", value: "Zoom" },
  { label: "Teams", value: "Teams" },
];

const REMINDER_OPTIONS: Option[] = [
  { label: "10 minutes before", value: "10 minutes before" },
  { label: "30 minutes before", value: "30 minutes before" },
  { label: "1 hour before", value: "1 hour before" },
  { label: "1 day before", value: "1 day before" },
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
  initialTab,
  onClose,
  onCreateEvent,
  onCreateTask,
  onUpdateEvent,
  onUpdateTask,
  onDelete,
  mode = "create",
  initialValues,
  availableTabs,
}) => {
  const [tab, setTab] = useState<CreateCalendarItemTab>(initialTab);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>(["Meeting"]);
  const [guestQuery, setGuestQuery] = useState("");
  const [guests, setGuests] = useState<string[]>(["Arafat Nayeem", "Jawad", "Washim"]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("11:30");
  const [endTime, setEndTime] = useState<string | undefined>(deriveEndTime("11:30"));
  const [allDay, setAllDay] = useState(false);
  const [repeat, setRepeat] = useState(REPEAT_OPTIONS[0].value);
  const [eventType, setEventType] = useState(EVENT_TYPE_OPTIONS[0].value);
  const [platform, setPlatform] = useState(PLATFORM_OPTIONS[0].value);
  const [reminder, setReminder] = useState(REMINDER_OPTIONS[1].value);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const tabs = useMemo<CreateCalendarItemTab[]>(
    () => (availableTabs && availableTabs.length > 0 ? availableTabs : TABS),
    [availableTabs]
  );
  const isEditing = mode === "edit";

  useEffect(() => {
    if (!isOpen) return;
    const resolvedTab = tabs.includes(initialTab) ? initialTab : tabs[0];
    setTab(resolvedTab);
    const resolvedDate = initialValues?.date ?? formatDateInput(initialDate);
    const resolvedTime = initialValues?.time ?? formatTimeInput(initialDate);
    setDate(resolvedDate);
    setTime(resolvedTime);
    setEndTime(initialValues?.endTime ?? deriveEndTime(resolvedTime));
    setTitle(initialValues?.title ?? "");
    setDescription(initialValues?.description ?? "");
    setGuestQuery("");
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
        : isEditing
          ? []
          : ["Arafat Nayeem", "Jawad", "Washim"]
    );
    setAllDay(initialValues?.allDay ?? false);
    setRepeat(initialValues?.repeat ?? REPEAT_OPTIONS[0].value);
    setEventType(initialValues?.eventType ?? EVENT_TYPE_OPTIONS[0].value);
    setPlatform(initialValues?.platform ?? PLATFORM_OPTIONS[0].value);
    setReminder(initialValues?.reminder ?? REMINDER_OPTIONS[1].value);
    setError(null);
    setIsSubmitting(false);
    setIsDeleting(false);
  }, [initialDate, initialTab, initialValues, isEditing, isOpen, tabs]);

  const canSubmit = useMemo(() => title.trim().length > 0 && date.trim().length > 0, [title, date]);

  const handleAddGuest = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setGuests((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  };

  const handleGuestKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddGuest(guestQuery);
      setGuestQuery("");
    }
  };

  const handleRemoveGuest = (name: string) => {
    setGuests((prev) => prev.filter((guest) => guest !== name));
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
      repeat,
      reminder,
      eventType: tab === "Appointment" ? "Appointment" : eventType,
      platform,
      description: description.trim() || undefined,
      tags,
      guests,
    } satisfies CreateEventRequest;

    const taskPayload: CreateTaskRequest = {
      title: payload.title,
      date: payload.date,
      time: payload.time,
      description: payload.description,
      tags: payload.tags,
      guests: payload.guests,
    };

    try {
      if (tab === "Task") {
        if (isEditing) {
          if (!onUpdateTask) {
            throw new Error("Missing update handler");
          }
          await onUpdateTask(taskPayload);
        } else {
          await onCreateTask(taskPayload);
        }
      } else if (isEditing) {
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

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleRequestClose}
      overlayClassName={styles.modalOverlay}
      className={styles.modalContent}
      contentLabel="Create calendar item"
      shouldCloseOnOverlayClick={!isSubmitting && !isDeleting}
      closeTimeoutMS={160}
    >
      <div className={styles.modalShell}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            {isEditing ? `Edit ${tab.toLowerCase()}` : `Create a new ${tab.toLowerCase()}`}
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

          <div className={styles.tabs}>
            {tabs.map((current) => (
              <button
                key={current}
                type="button"
                className={`${styles.tabButton} ${tab === current ? styles.tabButtonActive : ""}`}
                onClick={() => setTab(current)}
                disabled={isSubmitting}
              >
                {current}
              </button>
            ))}
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="modal-guests">
              Add guests
            </label>
            <div className={styles.fieldShell}>
              <div className={styles.fieldShellContent}>
                <div className={styles.fieldShellHeader}>
                  <Users className={styles.fieldIcon} />
                  <input
                    id="modal-guests"
                    className={styles.textInput}
                    placeholder="Type a name and press Enter"
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
              <div className={styles.fieldShell}>
                <div className={styles.fieldShellHeader}>
                  <Repeat className={styles.fieldIcon} />
                  <select
                    className={styles.select}
                    value={repeat}
                    onChange={(event) => setRepeat(event.target.value)}
                    disabled={isSubmitting}
                  >
                    {REPEAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="modal-platform">
                Platform
              </label>
              <div className={styles.fieldShell}>
                <div className={styles.platformRow}>
                  <img
                    alt="Platform icon"
                    src="https://www.gstatic.com/images/branding/product/2x/meet_2020q4_48dp.png"
                    className={styles.platformIcon}
                  />
                  <select
                    id="modal-platform"
                    className={styles.select}
                    value={platform}
                    onChange={(event) => setPlatform(event.target.value)}
                    disabled={isSubmitting}
                  >
                    {PLATFORM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className={styles.platformActions}>
                    <button type="button" className={styles.iconButton} title="Settings" disabled>
                      <Settings className={styles.icon} />
                    </button>
                    <button type="button" className={styles.iconButton} title="Copy" disabled={isSubmitting}>
                      <Copy className={styles.icon} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="modal-reminder">
                Reminder
              </label>
              <div className={styles.fieldShell}>
                <div className={styles.fieldShellHeader}>
                  <Bell className={styles.fieldIcon} />
                  <select
                    id="modal-reminder"
                    className={styles.select}
                    value={reminder}
                    onChange={(event) => setReminder(event.target.value)}
                    disabled={isSubmitting}
                  >
                    {REMINDER_OPTIONS.map((option) => (
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
          <div className={styles.footerMeta}>Guests visible • Calendar default notifications</div>
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
              onClick={onClose}
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
    </Modal>
  );
};

export default CreateCalendarItemModal;
