import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import type { Project } from "@/app/contexts/DataProvider";
import {
  POST_PROJECT_TO_USER_URL,
  apiFetch,
  getFileUrl,
} from "@/shared/utils/api";

import { useProjectTabs } from "./useProjectTabs";
import { useColorModal } from "./projectHeaderState/useColorModal";
import { useInvoiceInfoModal } from "./projectHeaderState/useInvoiceInfoModal";
import { useLocalProjectState } from "./projectHeaderState/useLocalProjectState";
import { useResponsiveLayout } from "./projectHeaderState/useResponsiveLayout";
import { useTeamMembers } from "./projectHeaderState/useTeamMembers";
import { useThumbnailModal } from "./projectHeaderState/useThumbnailModal";
import {
  toString,
  useQueueUpdate,
} from "./projectHeaderUtils";
import type {
  DeleteConfirmationModalState,
  EditNameModalState,
  EditStatusModalState,
  FinishLineModalState,
  NavigationState,
  ProjectHeaderProps,
  ProjectHeaderState,
  IdentityModalState,
  TeamModalState,
} from "./projectHeaderTypes";

function createNavigationState(
  projectTitle: string | undefined,
  parseTabs: ReturnType<typeof useProjectTabs>
): NavigationState {
  const activeIndex = parseTabs.getActiveIndex();
  const activeKey =
    parseTabs.tabs[activeIndex]?.key ?? parseTabs.tabs[0]?.key ?? "overview";

  return {
    tabs: parseTabs.tabs,
    activeTabKey: activeKey,
    activeIndex,
    getFromIndex: parseTabs.getFromIndex,
    storageKey: parseTabs.storageKey,
    confirmNavigate: parseTabs.confirmNavigate,
  };
}

export function useProjectHeaderState(props: ProjectHeaderProps): ProjectHeaderState {
  const {
    user,
    setActiveProject,
    updateProjectFields,
    isAdmin,
    setProjects,
    setUserProjects,
    refreshUser,
  } = useData();
  const socket = useSocket();

  const {
    parseStatusToNumber,
    activeProject,
    onActiveProjectChange,
    onProjectDeleted,
    showWelcomeScreen,
    userId,
  } = props;

  const isMobile = useResponsiveLayout();
  const [saving, setSaving] = useState(false);

  const queueUpdate = useQueueUpdate(
    updateProjectFields,
    activeProject?.projectId,
    setSaving
  );

  const {
    localProject,
    setLocalProject,
    projectInitial,
    displayStatus,
    rangeLabel,
    mobileRangeLabel,
    dateRangeLabel: rangeDateLabel,
    hoursLabel: rangeHoursLabel,
    resolvedProjectId,
  } = useLocalProjectState(activeProject);

  const progressValue = useMemo(
    () => parseStatusToNumber(localProject?.status),
    [localProject?.status, parseStatusToNumber]
  );

  const tabsState = useProjectTabs(resolvedProjectId, localProject?.title);
  const navigation = useMemo(
    () => createNavigationState(localProject?.title, tabsState),
    [localProject?.title, tabsState]
  );

  const teamMembers = useTeamMembers(localProject);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const notifyUpdate = useCallback(
    (fields: Partial<Project>) => {
      const ws = socket?.ws as WebSocket | undefined;
      if (!activeProject || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          action: "projectUpdated",
          projectId: activeProject.projectId,
          title: activeProject.title,
          fields,
          conversationId: `project#${activeProject.projectId}`,
          username: user?.firstName || "Someone",
          senderId: user.userId,
        })
      );
    },
    [activeProject, socket?.ws, user]
  );

  const reopenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  // Edit Name Modal
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [editNameFromSettings, setEditNameFromSettings] = useState(false);
  const [updatedName, setUpdatedName] = useState(localProject?.title || "");

  useEffect(() => {
    setUpdatedName(localProject?.title || "");
  }, [localProject?.title]);

  const openEditName = (fromSettings = false) => {
    setEditNameFromSettings(fromSettings);
    setUpdatedName(localProject?.title || "");
    setIsEditNameOpen(true);
  };
  const closeEditName = () => {
    setIsEditNameOpen(false);
    if (editNameFromSettings) {
      setEditNameFromSettings(false);
      reopenSettings();
    }
  };

  const handleUpdateName: EditNameModalState["submit"] = async (event) => {
    event.preventDefault();
    if (!activeProject) {
      closeEditName();
      return;
    }
    if (updatedName === activeProject.title) {
      closeEditName();
      return;
    }

    const updatedProject = { ...localProject, title: updatedName };
    setLocalProject(updatedProject);
    onActiveProjectChange?.(updatedProject);
    setActiveProject(updatedProject);
    setProjects((prev: Project[]) =>
      Array.isArray(prev)
        ? prev.map((project) =>
            project.projectId === updatedProject.projectId
              ? { ...project, title: updatedName }
              : project
          )
        : prev
    );
    setUserProjects((prev: Project[]) =>
      Array.isArray(prev)
        ? prev.map((project) =>
            project.projectId === updatedProject.projectId
              ? { ...project, title: updatedName }
              : project
          )
        : prev
    );

    try {
      await queueUpdate({ title: updatedName });
      notifyUpdate({ title: updatedName });
    } catch (error) {
      console.error("Failed to update project name:", error);
    } finally {
      closeEditName();
    }
  };

  const editNameModal: EditNameModalState = {
    isOpen: isEditNameOpen,
    updatedName,
    setUpdatedName,
    open: openEditName,
    close: closeEditName,
    submit: handleUpdateName,
  };

  // Edit Status Modal
  const [isEditStatusOpen, setIsEditStatusOpen] = useState(false);
  const [editStatusFromSettings, setEditStatusFromSettings] = useState(false);
  const [updatedStatus, setUpdatedStatus] = useState(
    localProject?.status?.toString?.() || ""
  );

  useEffect(() => {
    setUpdatedStatus(localProject?.status?.toString?.() || "");
  }, [localProject?.status]);

  const openEditStatus = (fromSettings = false) => {
    setEditStatusFromSettings(fromSettings);
    setUpdatedStatus(localProject?.status?.toString?.() || "");
    setIsEditStatusOpen(true);
  };
  const closeEditStatus = () => {
    setIsEditStatusOpen(false);
    if (editStatusFromSettings) {
      setEditStatusFromSettings(false);
      reopenSettings();
    }
  };

  const handleUpdateStatus: EditStatusModalState["submit"] = async (event) => {
    event.preventDefault();
    if (!activeProject) {
      closeEditStatus();
      return;
    }
    if (updatedStatus === String(activeProject.status ?? "")) {
      closeEditStatus();
      return;
    }

    const updatedProject = { ...localProject, status: updatedStatus };
    setLocalProject(updatedProject);
    onActiveProjectChange?.(updatedProject);
    setActiveProject(updatedProject);

    try {
      await queueUpdate({ status: updatedStatus });
      notifyUpdate({ status: updatedStatus });
    } finally {
      closeEditStatus();
    }
  };

  const editStatusModal: EditStatusModalState = {
    isOpen: isEditStatusOpen,
    updatedStatus,
    setUpdatedStatus,
    open: openEditStatus,
    close: closeEditStatus,
    submit: handleUpdateStatus,
  };

  // Finish Line Modal
  const [isFinishLineOpen, setIsFinishLineOpen] = useState(false);
  const [finishLineFromSettings, setFinishLineFromSettings] = useState(false);
  const [selectedFinishLineDate, setSelectedFinishLineDate] = useState(
    toString(localProject?.finishline)
  );
  const [selectedProductionStartDate, setSelectedProductionStartDate] = useState(
    toString(localProject?.productionStart) || toString(localProject?.dateCreated)
  );

  useEffect(() => {
    setSelectedFinishLineDate(toString(localProject?.finishline));
    setSelectedProductionStartDate(
      toString(localProject?.productionStart) || toString(localProject?.dateCreated)
    );
  }, [localProject?.finishline, localProject?.productionStart, localProject?.dateCreated]);

  const openFinishLine = (fromSettings = false) => {
    setFinishLineFromSettings(fromSettings);
    setSelectedFinishLineDate(toString(localProject?.finishline));
    setSelectedProductionStartDate(
      toString(localProject?.productionStart) || toString(localProject?.dateCreated)
    );
    setIsFinishLineOpen(true);
  };
  const closeFinishLine = () => {
    setIsFinishLineOpen(false);
    if (finishLineFromSettings) {
      setFinishLineFromSettings(false);
      reopenSettings();
    }
  };

  const handleUpdateFinishLine: FinishLineModalState["submit"] = async (event) => {
    event.preventDefault();
    if (!activeProject) {
      closeFinishLine();
      return;
    }

    const updatedProject = {
      ...localProject,
      finishline: selectedFinishLineDate,
      productionStart: selectedProductionStartDate,
    };
    setLocalProject(updatedProject);
    onActiveProjectChange?.(updatedProject);
    setActiveProject(updatedProject);

    try {
      await queueUpdate({
        finishline: selectedFinishLineDate,
        productionStart: selectedProductionStartDate,
      });
      notifyUpdate({
        finishline: selectedFinishLineDate,
        productionStart: selectedProductionStartDate,
      });
    } catch (error) {
      console.error("Failed to update finish line:", error);
    } finally {
      closeFinishLine();
    }
  };

  const finishLineModal: FinishLineModalState = {
    isOpen: isFinishLineOpen,
    productionStart: selectedProductionStartDate,
    finishLine: selectedFinishLineDate,
    setProductionStart: setSelectedProductionStartDate,
    setFinishLine: setSelectedFinishLineDate,
    open: openFinishLine,
    close: closeFinishLine,
    submit: handleUpdateFinishLine,
  };

  // Delete Confirmation Modal
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteFromSettings, setDeleteFromSettings] = useState(false);

  const openDeleteConfirmation = (fromSettings = false) => {
    setDeleteFromSettings(fromSettings);
    setIsDeleteOpen(true);
  };

  const closeDeleteConfirmation = () => {
    setIsDeleteOpen(false);
    if (deleteFromSettings) {
      setDeleteFromSettings(false);
      reopenSettings();
    }
  };

  const confirmDelete: DeleteConfirmationModalState["confirm"] = async () => {
    if (!activeProject?.projectId) {
      console.error("No active project to delete.");
      return;
    }

    try {
      await apiFetch(
        `${POST_PROJECT_TO_USER_URL}?userId=${userId}&projectId=${activeProject.projectId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }
      );
      onProjectDeleted(activeProject.projectId);
      await refreshUser();
    } catch (error) {
      console.error("Error during project deletion:", error);
    }
    closeDeleteConfirmation();
    showWelcomeScreen();
  };

  const deleteConfirmationModal: DeleteConfirmationModalState = {
    isOpen: isDeleteOpen,
    open: openDeleteConfirmation,
    close: closeDeleteConfirmation,
    confirm: confirmDelete,
  };

  // Thumbnail / Color / Invoice Modals
  const thumbnailModal = useThumbnailModal({
    activeProject,
    localProject,
    setLocalProject,
    queueUpdate,
    onActiveProjectChange,
    setActiveProject,
    notifyUpdate,
    onReturnToSettings: reopenSettings,
  });

  const colorModal = useColorModal({
    activeProject,
    localProject,
    setLocalProject,
    queueUpdate,
    setActiveProject,
    onActiveProjectChange,
    notifyUpdate,
    onReturnToSettings: reopenSettings,
  });

  const invoiceInfoModal = useInvoiceInfoModal({
    activeProject,
    localProject,
    setLocalProject,
    queueUpdate,
    setActiveProject,
    onActiveProjectChange,
    notifyUpdate,
    onReturnToSettings: reopenSettings,
  });

  // Settings Modal
  const openSettings = () => {
    setIsSettingsOpen(true);
  };
  const closeSettings = () => setIsSettingsOpen(false);

  const settingsModal: IdentityModalState = {
    isOpen: isSettingsOpen,
    open: openSettings,
    close: closeSettings,
  };

  const teamModal: TeamModalState = {
    isOpen: isTeamModalOpen,
    members: teamMembers,
    open: () => setIsTeamModalOpen(true),
    close: () => setIsTeamModalOpen(false),
  };

  const handleKeyDown = useCallback((event: KeyboardEvent, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }, []);

  return {
    saving,
    isMobile,
    localActiveProject: localProject,
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
    settingsModal,
    teamModal,
    getFileUrlForThumbnail: getFileUrl,
    isAdmin,
  };
}
