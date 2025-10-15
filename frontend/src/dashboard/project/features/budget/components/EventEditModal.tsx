import React, { useState, useEffect, useRef } from "react";
import { v4 as uuid } from "uuid";
import Modal from "@/shared/ui/ModalWithStack";
import styles from "./create-line-item-modal.module.css";
import type { TimelineEvent } from "@/shared/utils/api";
import { createEvent, updateEvent, deleteEvent } from "@/shared/utils/api";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { useData } from "@/app/contexts/useData";

interface EventEditModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  projectId: string;
  budgetItemId?: string;
  events?: TimelineEvent[];
  defaultDate?: string;
  defaultDescription?: string;
  descOptions?: string[];
  onEventsUpdated?: (events: TimelineEvent[]) => void;
}

const EventEditModal: React.FC<EventEditModalProps> = ({
  isOpen,
  onRequestClose,
  projectId,
  budgetItemId,
  events: initialEvents = [],
  defaultDate = "",
  defaultDescription = "",
  descOptions = [],
  onEventsUpdated,
}) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [eventInputs, setEventInputs] = useState<{
    date: string;
    hours: string;
    description: string;
  }>({
    date: defaultDate,
    hours: "",
    description: defaultDescription,
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [eventError, setEventError] = useState("");
  const originalEventsRef = useRef<TimelineEvent[]>([]);
  const { wsOps } = useBudget();
  const { userId } = useData();

  useEffect(() => {
    if (isOpen) {
      const cloned = initialEvents.map((ev) => ({ ...ev }));
      setEvents(cloned);
      originalEventsRef.current = cloned;
      setEventInputs({
        date: defaultDate,
        hours: "",
        description: defaultDescription,
      });
      setEditingIndex(null);
      setEventError("");
    }
  }, [isOpen, initialEvents, defaultDate, defaultDescription]);

  const handleEventInputChange = (field: keyof typeof eventInputs, value: string) => {
    setEventInputs((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddEvent = () => {
    if (!eventInputs.date || !eventInputs.hours) {
      setEventError("Date and hours are required");
      return;
    }
    setEventError("");

    if (editingIndex !== null) {
      setEvents((prev) =>
        prev.map((ev, i) =>
          i === editingIndex
            ? {
                ...ev,
                date: eventInputs.date,
                hours: Number(eventInputs.hours),
                description: eventInputs.description,
              }
            : ev
        )
      );
      setEditingIndex(null);
    } else {
      setEvents((prev) => [
        ...prev,
        {
          id: uuid(),
          date: eventInputs.date,
          hours: Number(eventInputs.hours),
          description: eventInputs.description,
        },
      ]);
    }

    setEventInputs({
      date: eventInputs.date,
      hours: "",
      description: defaultDescription,
    });
  };

  const handleEditEvent = (idx: number) => {
    const ev = events[idx];
    if (ev) {
      setEventInputs({
        date: ev.date,
        hours: String(ev.hours),
        description: ev.description || defaultDescription,
      });
      setEditingIndex(idx);
    }
  };

  const handleRemoveEvent = async (idx: number) => {
    const ev = events[idx];
    const updated = events.filter((_, i) => i !== idx);
    setEvents(updated);
    if (ev?.id && originalEventsRef.current.some((e) => e.id === ev.id)) {
      try {
        await deleteEvent(projectId, ev.id);
        originalEventsRef.current = originalEventsRef.current.filter((e) => e.id !== ev.id);
        wsOps.emitTimelineUpdate(updated);
        onEventsUpdated?.(updated);
      } catch (err) {
        console.error('Error deleting event', err);
      }
    }
    if (editingIndex === idx) {
      setEventInputs({
        date: defaultDate,
        hours: "",
        description: defaultDescription,
      });
      setEditingIndex(null);
    }
  };

  const handleSave = async () => {
    const updated: TimelineEvent[] = [];
    for (const ev of events) {
      const eventId = ev.id || uuid();
      const payload: TimelineEvent & { projectId: string; eventId: string } = {
        projectId,
        eventId,
        id: eventId,
        createdAt: ev.createdAt || new Date().toISOString(),
        createdBy: userId,
        description: ev.description,
        hours: Number(ev.hours),
        date: ev.date,
        ...(budgetItemId ? { budgetItemId } : {}),
      };
      try {
        if (originalEventsRef.current.some((e) => e.id === ev.id)) {
          await updateEvent(payload);
        } else {
          await createEvent(projectId, payload);
        }
        updated.push(payload);
      } catch (err) {
        console.error('Error saving event', err);
      }
    }
    const totalHours = updated.reduce((sum, e) => sum + Number(e.hours || 0), 0);
    void totalHours; // recalculated if needed
    setEvents(updated);
    originalEventsRef.current = updated;
    wsOps.emitTimelineUpdate(updated);
    onEventsUpdated?.(updated);
    onRequestClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Edit Events"
      className={{
        base: styles.modalContent,
        afterOpen: styles.modalContentAfterOpen,
        beforeClose: styles.modalContentBeforeClose,
      }}
      overlayClassName={{
        base: styles.modalOverlay,
        afterOpen: styles.modalOverlayAfterOpen,
        beforeClose: styles.modalOverlayBeforeClose,
      }}
    >
      <h3 className={styles.modalTitle}>Edit Events</h3>

      <div className={styles.eventsWrapper}>
        {events.map((ev, idx) => (
          <div key={ev.id} className={styles.eventRow}>
            <span>{ev.date}</span>
            <span>{ev.hours} hrs</span>
            <span>{ev.description}</span>
            <div className={styles.eventRowActions}>
              <button
                type="button"
                className={styles.editEventButton}
                onClick={() => handleEditEvent(idx)}
              >
                Edit
              </button>
              <button
                type="button"
                className={styles.deleteEventBtn}
                onClick={() => handleRemoveEvent(idx)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        <div className={styles.calendarFields}>
          <label className={styles.field}>
            Event Date
            <input
              type="date"
              value={eventInputs.date}
              onChange={(e) => handleEventInputChange("date", e.target.value)}
            />
          </label>
          <label className={styles.field}>
            Hours
            <input
              type="number"
              value={eventInputs.hours}
              onChange={(e) => handleEventInputChange("hours", e.target.value)}
            />
          </label>
          <label className={styles.field}>
            Description
            <input
              type="text"
              value={eventInputs.description}
              onChange={(e) => handleEventInputChange("description", e.target.value)}
              list="event-desc-options"
            />
          </label>
          <button
            type="button"
            className={`address-button ${styles.addEventButton}`}
            onClick={handleAddEvent}
          >
            {editingIndex !== null ? "Update" : "Add Event"}
          </button>
        </div>

        {eventError && <div className={styles.eventError}>{eventError}</div>}

        <datalist id="event-desc-options">
          {descOptions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>

      <div className={styles.modalFooter}>
        <button
          type="button"
          className="modal-button primary"
          style={{ borderRadius: "5px" }}
          onClick={handleSave}
        >
          Save
        </button>
        <button
          type="button"
          className="modal-button secondary"
          style={{ borderRadius: "5px" }}
          onClick={onRequestClose}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
};

export default EventEditModal;











