import React from "react";
import "./calendar-overview-card.css";
import CalendarBase, { CalendarBaseProps } from "./CalendarBase";

export type { Project, TimelineEvent } from "./CalendarBase";

type CalendarOverviewCardProps = Omit<CalendarBaseProps, "wrapperClassName" | "dayHeaderIdPrefix">;

const CalendarOverviewCard: React.FC<CalendarOverviewCardProps> = ({ showEventList = true, ...props }) => {
  return (
    <CalendarBase
      {...props}
      showEventList={showEventList}
      wrapperClassName="calendar-overview-card-wrapper"
      dayHeaderIdPrefix="calendar-overview-card-day"
    />
  );
};

export default CalendarOverviewCard;
