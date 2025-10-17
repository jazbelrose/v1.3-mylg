import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faClock, faEllipsisV } from "@fortawesome/free-solid-svg-icons";
import { getColor } from "@/shared/utils/colorUtils";
import type { TimelineEvent } from "./types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

type EventActionsMenuProps = {
  onEdit: () => void;
  onDelete: () => void;
};

const EventActionsMenu: React.FC<EventActionsMenuProps> = ({ onEdit, onDelete }) => {
  const [open, setOpen] = React.useState(false);

  const handleTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleAction = (callback: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    callback();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="event-action-trigger"
          aria-label="Open event actions"
          onClick={handleTriggerClick}
        >
          <FontAwesomeIcon icon={faEllipsisV} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="event-actions-menu" align="end">
        <button type="button" onClick={handleAction(onEdit)} className="event-actions-menu-item">
          Edit event
        </button>
        <button
          type="button"
          onClick={handleAction(onDelete)}
          className="event-actions-menu-item event-actions-menu-item-danger"
        >
          Delete event
        </button>
      </PopoverContent>
    </Popover>
  );
};

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
          <ul className="event-items">
            {events.map((event, index) => {
              const idKey = event.description || String(index);
              const color = projectColor || getColor(idKey);
              return (
                <li className="event-item" key={event.id || `${index}`}>
                  <div className="event-item-main">
                    <FontAwesomeIcon icon={faClock} className="list-dot" style={{ color }} />
                    <div className="event-item-body">
                      <span className="event-item-title">{event.description || "Untitled event"}</span>
                      <span className="event-item-meta">
                        <span className="event-item-hours">
                          {event.hours} {Number(event.hours) === 1 ? "hr" : "hrs"}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="event-item-actions">
                    <EventActionsMenu onEdit={() => onEdit(event.id)} onDelete={() => onDelete(event.id)} />
                  </div>
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
