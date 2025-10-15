import { useState } from "react";

import type { Project } from "@/app/contexts/DataProvider";

import type { ColorModalState } from "../projectHeaderTypes";

interface ColorModalConfig {
  activeProject: Project | null;
  localProject: Project;
  setLocalProject: (project: Project) => void;
  queueUpdate: (payload: Partial<Project>) => Promise<void>;
  setActiveProject: (project: Project) => void;
  onActiveProjectChange?: (project: Project) => void;
  notifyUpdate: (fields: Partial<Project>) => void;
  onReturnToSettings: () => void;
}

export function useColorModal({
  activeProject,
  localProject,
  setLocalProject,
  queueUpdate,
  setActiveProject,
  onActiveProjectChange,
  notifyUpdate,
  onReturnToSettings,
}: ColorModalConfig): ColorModalState {
  const [isOpen, setIsOpen] = useState(false);
  const [returnToSettings, setReturnToSettings] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>(
    (localProject?.color as string) || "#FA3356"
  );

  const EyeDropperCtor =
    (typeof window !== "undefined" &&
      ((window as typeof window & {
        EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
      }).EyeDropper || null)) ||
    null;

  const open = (fromSettings = false) => {
    setReturnToSettings(fromSettings);
    setSelectedColor((localProject?.color as string) || "#FA3356");
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    if (returnToSettings) {
      setReturnToSettings(false);
      onReturnToSettings();
    }
  };

  const save = async () => {
    if (!activeProject) {
      close();
      return;
    }
    try {
      const updatedProject = { ...localProject, color: selectedColor };
      setLocalProject(updatedProject);
      onActiveProjectChange?.(updatedProject);
      setActiveProject(updatedProject);
      await queueUpdate({ color: selectedColor });
      notifyUpdate({ color: selectedColor });
    } catch (error) {
      console.error("Error updating color:", error);
    } finally {
      close();
    }
  };

  const pickColorFromScreen = async () => {
    if (!EyeDropperCtor) {
      alert("Your browser does not support the EyeDropper API.");
      return;
    }
    try {
      const eyeDropper = new EyeDropperCtor();
      const { sRGBHex } = await eyeDropper.open();
      setSelectedColor(sRGBHex);
    } catch (error) {
      console.error("EyeDropper cancelled or failed", error);
    }
  };

  const hexToRgb = (hex: string) => {
    const cleaned = hex.replace("#", "");
    const bigint = parseInt(cleaned, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
  };

  return {
    isOpen,
    selectedColor,
    setSelectedColor,
    open,
    close,
    save,
    pickColorFromScreen,
    hexToRgb,
  };
}
