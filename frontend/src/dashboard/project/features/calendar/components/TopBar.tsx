import React from "react";
import { Calendar as CalendarIcon, Plus, Search } from "lucide-react";

export type TopBarProps = {
  onAdd: () => void;
};

function TopBar({ onAdd }: TopBarProps) {
  return (
    <div className="calendar-top-bar">
      <div className="calendar-top-bar__heading">
        <div className="calendar-top-bar__icon">
          <CalendarIcon className="calendar-top-bar__icon-svg" />
        </div>
        <div className="calendar-top-bar__title">Calendar</div>
      </div>
      <div className="calendar-top-bar__actions">
        <div className="calendar-top-bar__search">
          <Search className="calendar-top-bar__search-icon" />
          <input
            placeholder="Search for anything"
            className="calendar-top-bar__search-input"
          />
        </div>
        <button type="button" onClick={onAdd} className="calendar-top-bar__add">
          <Plus className="calendar-top-bar__add-icon" /> Add Event
        </button>
      </div>
    </div>
  );
}

export default TopBar;
