import type React from "react";
import { FileText, Paintbrush } from "lucide-react";

export type EditorMode = string;

export type ModeDefinition = {
  key: EditorMode;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
};

export const DEFAULT_MODE_DEFINITIONS: ModeDefinition[] = [
  { key: "brief", label: "Brief", icon: FileText },
  { key: "canvas", label: "Canvas", icon: Paintbrush },
];
