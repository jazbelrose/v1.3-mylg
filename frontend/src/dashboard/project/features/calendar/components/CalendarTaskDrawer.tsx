import React, { useMemo } from "react";
import clsx from "clsx";

import Modal from "@/shared/ui/ModalWithStack";
import QuickCreateTaskModal, {
  type QuickCreateTaskModalEvent,
  type QuickCreateTaskModalProject,
  type QuickCreateTaskModalTask,
  type TeamMemberInfo,
} from "@/dashboard/home/components/QuickCreateTaskModal";
import { useIsMobile } from "@/dashboard/project/components/Shared/calendar/hooks";

import drawerStyles from "./calendar-drawer-shell.module.css";

type CalendarTaskDrawerProps = {
  open: boolean;
  task: QuickCreateTaskModalTask | null;
  projects: QuickCreateTaskModalProject[];
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  teamMembers?: TeamMemberInfo[];
  onClose: () => void;
  onCreated: (event: QuickCreateTaskModalEvent) => void;
  onUpdated: () => void;
  onDeleted: () => void;
};

const CalendarTaskDrawer: React.FC<CalendarTaskDrawerProps> = ({
  open,
  task,
  projects,
  activeProjectId,
  activeProjectName,
  teamMembers,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}) => {
  const isMobileViewport = useIsMobile();

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

  return (
    <Modal
      isOpen={open}
      onRequestClose={onClose}
      overlayClassName={overlayClassName}
      className={contentClassName}
      contentLabel="Task drawer"
      shouldCloseOnOverlayClick={false}
      closeTimeoutMS={280}
    >
      <div className={drawerStyles.taskDrawerBody}>
        <QuickCreateTaskModal
          open={open}
          onClose={onClose}
          projects={projects}
          onCreated={onCreated}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
          task={task ?? undefined}
          activeProjectId={task?.projectId ?? activeProjectId ?? undefined}
          activeProjectName={task?.projectName ?? activeProjectName ?? undefined}
          teamMembers={teamMembers}
          embedMode
        />
      </div>
    </Modal>
  );
};

export default CalendarTaskDrawer;
