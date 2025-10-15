import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faClock } from "@fortawesome/free-solid-svg-icons";
import { getColor } from "@/shared/utils/colorUtils";
import type { TimelineEvent } from "./types";

interface EventListProps {
  dateLabel: string;
  events: TimelineEvent[];
  projectColor: string;
  totalHoursForDay: number;
  totalHoursForProject: number;
  hasPrevEvent: boolean;
  hasNextEvent: boolean;
  onPrevEventDate: () => void;
  onNextEventDate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const EventList: React.FC<EventListProps> = ({
  dateLabel,
  events,
  projectColor,
  totalHoursForDay,
  totalHoursForProject,
  hasPrevEvent,
  hasNextEvent,
  onPrevEventDate,
  onNextEventDate,
  onEdit,
  onDelete,
}) => {
  return (
    <div className="events-section">
      <div className="events-nav">
        <button onClick={onPrevEventDate} disabled={!hasPrevEvent} aria-label="Previous event day">
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <button onClick={onNextEventDate} disabled={!hasNextEvent} aria-label="Next event day">
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>

      <div className="events-log">
        <h3 className="events-log-date">Events on {dateLabel}</h3>

        {events.length === 0 ? (
          <div>No events</div>
        ) : (
          <ul>
            {events.map((event, index) => {
              const idKey = event.description || String(index);
              const color = projectColor || getColor(idKey);
              return (
                <li className="event-item" key={event.id || `${index}`}>
                  <FontAwesomeIcon icon={faClock} className="list-dot" style={{ color }} />
                  {event.description?.toUpperCase()} ({event.hours}{" "}
                  {Number(event.hours) === 1 ? "HR" : "HRS"})
                  <button className="edit-event-btn" onClick={() => onEdit(event.id)}>
                    Edit
                  </button>
                  <button className="delete-event-btn" onClick={() => onDelete(event.id)}>
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="events-log-totals">
          <span>Day Total: {totalHoursForDay} hrs</span>
          <span>Project Total: {totalHoursForProject} hrs</span>
        </div>
      </div>
    </div>
  );
};

export default EventList;
