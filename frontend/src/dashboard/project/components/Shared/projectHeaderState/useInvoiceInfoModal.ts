import { useState } from "react";

import type { Project } from "@/app/contexts/DataProvider";

import { toString } from "../projectHeaderUtils";
import type { InvoiceInfoModalState } from "../projectHeaderTypes";

interface InvoiceModalConfig {
  activeProject: Project | null;
  localProject: Project;
  setLocalProject: (project: Project) => void;
  queueUpdate: (payload: Partial<Project>) => Promise<void>;
  setActiveProject: (project: Project) => void;
  onActiveProjectChange?: (project: Project) => void;
  notifyUpdate: (fields: Partial<Project>) => void;
  onReturnToSettings: () => void;
}

const initialFields = (project: Project) => ({
  invoiceBrandName: toString(project?.invoiceBrandName),
  invoiceBrandAddress: toString(project?.invoiceBrandAddress),
  invoiceBrandPhone: toString(project?.invoiceBrandPhone),
  clientName: toString(project?.clientName),
  clientAddress: toString(project?.clientAddress),
  clientPhone: toString(project?.clientPhone),
  clientEmail: toString(project?.clientEmail),
});

export function useInvoiceInfoModal({
  activeProject,
  localProject,
  setLocalProject,
  queueUpdate,
  setActiveProject,
  onActiveProjectChange,
  notifyUpdate,
  onReturnToSettings,
}: InvoiceModalConfig): InvoiceInfoModalState {
  const [isOpen, setIsOpen] = useState(false);
  const [returnToSettings, setReturnToSettings] = useState(false);
  const [fields, setFields] = useState(() => initialFields(localProject));

  const open = (fromSettings = false) => {
    setReturnToSettings(fromSettings);
    setFields(initialFields(localProject));
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    if (returnToSettings) {
      setReturnToSettings(false);
      onReturnToSettings();
    }
  };

  const submit: InvoiceInfoModalState["submit"] = async (event) => {
    event.preventDefault();
    if (!activeProject) {
      close();
      return;
    }
    try {
      const updatedProject = { ...localProject, ...fields };
      setLocalProject(updatedProject);
      onActiveProjectChange?.(updatedProject);
      setActiveProject(updatedProject);
      await queueUpdate(fields);
      notifyUpdate(fields);
    } catch (error) {
      console.error("Error updating invoice info:", error);
    } finally {
      close();
    }
  };

  return {
    isOpen,
    fields,
    setField: (field, value) => {
      setFields((prev) => ({ ...prev, [field]: value }));
    },
    open,
    close,
    submit,
  };
}
