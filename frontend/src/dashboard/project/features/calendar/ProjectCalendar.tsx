import React from "react";
import "./project-calendar.css";
import CalendarBase, { CalendarBaseProps } from "../../components/Shared/calendar/CalendarBase";

export type { Project, TimelineEvent } from "../../components/Shared/calendar/CalendarBase";

type ProjectCalendarProps = Omit<CalendarBaseProps, "wrapperClassName" | "dayHeaderIdPrefix" | "showEventList">;

const ProjectCalendar: React.FC<ProjectCalendarProps> = (props) => {
  return (
    <CalendarBase
      {...props}
      wrapperClassName="dashboard-item project-calendar-wrapper"
      dayHeaderIdPrefix="project-calendar-day"
      onWrapperClick={() => {}}
    />
  );
};

export default ProjectCalendar;
