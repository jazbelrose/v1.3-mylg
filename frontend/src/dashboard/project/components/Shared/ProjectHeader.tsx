import React, { useMemo } from "react";

import "./project-header.css";

import MobileProjectHeader from "./MobileProjectHeader";
import TeamModal from "./TeamModal";
import DesktopProjectHeader from "./DesktopProjectHeader";
import {
  useProjectHeaderState,
} from "./useProjectHeaderState";
import type { ProjectHeaderProps } from "./projectHeaderTypes";
import EditNameModal from "./modals/EditNameModal";
import FinishLineModal from "./modals/FinishLineModal";
import EditStatusModal from "./modals/EditStatusModal";
import ThumbnailModal from "./modals/ThumbnailModal";
import ColorModal from "./modals/ColorModal";
import InvoiceInfoModal from "./modals/InvoiceInfoModal";
import ProjectIdentityModal from "./modals/ProjectIdentityModal";
import DeleteConfirmationModal from "./modals/DeleteConfirmationModal";

const ProjectHeader: React.FC<ProjectHeaderProps> = (props) => {
  const state = useProjectHeaderState(props);
  const {
    saving,
    isMobile,
    localActiveProject,
    projectInitial,
    displayStatus,
    progressValue,
    rangeLabel,
    mobileRangeLabel,
    rangeDateLabel,
    rangeHoursLabel,
    handleKeyDown,
    navigation,
    editNameModal,
    editStatusModal,
    finishLineModal,
    deleteConfirmationModal,
    thumbnailModal,
    colorModal,
    invoiceInfoModal,
    settingsModal: identityModal,
    teamModal,
    getFileUrlForThumbnail,
    isAdmin,
  } = state;

  const thumbnailKey = localActiveProject?.thumbnails?.[0] as string | undefined;
  const currentThumbnailUrl = useMemo(() => {
    if (!thumbnailKey) return "";
    try {
      return getFileUrlForThumbnail(thumbnailKey);
    } catch (error) {
      console.error("Failed to resolve thumbnail url", error);
      return "";
    }
  }, [thumbnailKey, getFileUrlForThumbnail]);

  return (
    <div>
      {saving && <div style={{ color: "#FA3356" }}>Saving...</div>}

      {isMobile ? (
        <MobileProjectHeader
          projectName={localActiveProject?.title || "Summary"}
          projectInitial={projectInitial}
          thumbnailKey={thumbnailKey}
          statusLabel={displayStatus}
          progressValue={progressValue}
          rangeLabel={mobileRangeLabel || undefined}
          dateRangeLabel={rangeDateLabel || undefined}
          hoursLabel={rangeHoursLabel}
          teamMembers={teamModal.members}
          onOpenQuickLinks={props.onOpenQuickLinks}
          onOpenFiles={props.onOpenFiles}
          onOpenIdentity={identityModal.open}
          onOpenTeam={teamModal.open}
          onOpenFinishLine={finishLineModal.open}
          onOpenStatus={editStatusModal.open}
          onOpenThumbnail={() => thumbnailModal.open()}
          onOpenChat={props.onOpenChat}
          tabs={navigation.tabs}
          activeTabKey={navigation.activeTabKey}
          onSelectTab={(tab) => navigation.confirmNavigate(tab.path)}
        />
      ) : (
        <DesktopProjectHeader
          project={localActiveProject}
          projectInitial={projectInitial}
          displayStatus={displayStatus}
          progressValue={progressValue}
          rangeLabel={rangeLabel}
          dateRangeLabel={rangeDateLabel}
          hoursLabel={rangeHoursLabel}
          handleKeyDown={handleKeyDown}
          onOpenStatus={editStatusModal.open}
          onOpenFinishLine={finishLineModal.open}
          onOpenIdentity={identityModal.open}
          onOpenQuickLinks={props.onOpenQuickLinks}
          onOpenFiles={props.onOpenFiles}
          onOpenThumbnail={() => thumbnailModal.open()}
          onOpenTeam={teamModal.open}
          teamMembers={teamModal.members}
          navigation={{
            tabs: navigation.tabs,
            activeIndex: navigation.activeIndex,
            storageKey: navigation.storageKey,
            getFromIndex: navigation.getFromIndex,
            confirmNavigate: navigation.confirmNavigate,
          }}
          getFileUrlForThumbnail={getFileUrlForThumbnail}
          onOpenChat={props.onOpenChat}
          isChatHidden={props.isChatHidden}
        />
      )}

      <EditNameModal modal={editNameModal} />
      <FinishLineModal modal={finishLineModal} />
      <EditStatusModal modal={editStatusModal} />
      <ThumbnailModal modal={thumbnailModal} currentThumbnailUrl={currentThumbnailUrl} />
      <ColorModal modal={colorModal} />
      <InvoiceInfoModal modal={invoiceInfoModal} />
      <ProjectIdentityModal
        modal={identityModal}
        project={localActiveProject}
        editNameModal={editNameModal}
        colorModal={colorModal}
        invoiceInfoModal={invoiceInfoModal}
        deleteModal={deleteConfirmationModal}
        isAdmin={isAdmin}
      />
      <DeleteConfirmationModal modal={deleteConfirmationModal} />

      <TeamModal
        isOpen={teamModal.isOpen}
        onRequestClose={teamModal.close}
        members={teamModal.members}
      />
    </div>
  );
};

export default React.memo(ProjectHeader);
