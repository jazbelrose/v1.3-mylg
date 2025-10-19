import React from "react";
import { DayPopover, DaySheet } from "./DayOverlay";
import CalendarGrid from "./CalendarGrid";
import { useCalendarController } from "./useCalendarController";
import type { Project } from "./types";
export type { Project, TimelineEvent } from "./types";

export interface CalendarBaseProps {
  project: Project;
  initialFlashDate?: string | null;
  onDateSelect?: (dateKey: string | null) => void;
  onWrapperClick?: () => void;
  wrapperClassName: string;
  dayHeaderIdPrefix: string;
  showEventList?: boolean;
}

const CalendarBase: React.FC<CalendarBaseProps> = ({
  project,
  initialFlashDate,
  onDateSelect,
  onWrapperClick,
  wrapperClassName,
  dayHeaderIdPrefix,
  showEventList = false,
}) => {
  const controller = useCalendarController({
    project,
    initialFlashDate,
    onDateSelect,
    onWrapperClick,
    dayHeaderIdPrefix,
    showEventList,
  });

  const overlay = controller.overlayState;

  return (
    <div
      className={`${wrapperClassName}${controller.wrapperHover ? " calendar-card-hover" : ""}`}
      onClick={controller.wrapperHandlers.onClick}
      onMouseEnter={controller.wrapperHandlers.onMouseEnter}
      onMouseMove={controller.wrapperHandlers.onMouseMove}
      onMouseLeave={controller.wrapperHandlers.onMouseLeave}
    >
      <div className="calendar-content">
        <CalendarGrid
          monthTitle={controller.monthTitle}
          weekdayLabels={controller.weekdayLabels}
          weeks={controller.weeks}
          startDate={controller.startDate}
          endDate={controller.endDate}
          projectColor={controller.projectColor}
          selectedKey={controller.selectedKey}
          todayKey={controller.todayKey}
          flashKey={controller.flashKey}
          rangeSet={controller.rangeSet}
          eventsByDate={controller.eventsByDate}
          onDayOpen={controller.openDay}
        />

        {overlay.isOpen && overlay.anchor && overlay.dayKey && (
          overlay.isMobile ? (
            <DaySheet
              headerId={overlay.headerId}
              dateLabel={overlay.dateLabel}
              events={overlay.events}
              onClose={overlay.close}
              onNew={overlay.onNew}
              onEdit={overlay.onEdit}
              onDelete={overlay.onDelete}
            />
          ) : (
            <DayPopover
              anchor={overlay.anchor}
              headerId={overlay.headerId}
              dateLabel={overlay.dateLabel}
              events={overlay.events}
              onClose={() => overlay.close()}
              onNew={overlay.onNew}
              onEdit={overlay.onEdit}
              onDelete={overlay.onDelete}
            />
          )
        )}
      </div>

      {controller.eventList?.component}

      {controller.modal.component}
    </div>
  );
};

export default CalendarBase;
