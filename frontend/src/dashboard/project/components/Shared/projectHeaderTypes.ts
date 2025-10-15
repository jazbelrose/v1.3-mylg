import type {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MutableRefObject,
} from "react";

import type { Project } from "@/app/contexts/DataProvider";

import type { Area } from "react-easy-crop";

import type { TeamMember } from "./types";
import type { ProjectTabItem } from "./useProjectTabs";

export interface ProjectHeaderProps {
  title?: string;
  parseStatusToNumber: (status: string | number | undefined) => number;
  userId: string;
  onProjectDeleted: (projectId: string) => void;
  activeProject: Project | null;
  showWelcomeScreen: () => void;
  onActiveProjectChange?: (project: Project) => void;
  onOpenFiles: () => void;
  onOpenQuickLinks: () => void;
  onOpenChat?: () => void;
  isChatHidden?: boolean;
}

export interface NavigationState {
  tabs: ProjectTabItem[];
  activeTabKey: string;
  activeIndex: number;
  getFromIndex: () => number;
  storageKey: string;
  confirmNavigate: (path: string) => void;
}

export interface EditNameModalState {
  isOpen: boolean;
  updatedName: string;
  setUpdatedName: (value: string) => void;
  open: (fromSettings?: boolean) => void;
  close: () => void;
  submit: (event: FormEvent) => Promise<void>;
}

export interface EditStatusModalState {
  isOpen: boolean;
  updatedStatus: string;
  setUpdatedStatus: (value: string) => void;
  open: () => void;
  close: () => void;
  submit: (event: FormEvent) => Promise<void>;
}

export interface FinishLineModalState {
  isOpen: boolean;
  productionStart: string;
  finishLine: string;
  setProductionStart: (value: string) => void;
  setFinishLine: (value: string) => void;
  open: () => void;
  close: () => void;
  submit: (event: FormEvent) => Promise<void>;
}

export interface DeleteConfirmationModalState {
  isOpen: boolean;
  open: (fromSettings?: boolean) => void;
  close: () => void;
  confirm: () => Promise<void>;
}

export interface InvoiceInfoModalState {
  isOpen: boolean;
  fields: {
    invoiceBrandName: string;
    invoiceBrandAddress: string;
    invoiceBrandPhone: string;
    clientName: string;
    clientAddress: string;
    clientPhone: string;
    clientEmail: string;
  };
  setField: (field: keyof InvoiceInfoModalState["fields"], value: string) => void;
  open: (fromSettings?: boolean) => void;
  close: () => void;
  submit: (event: FormEvent) => Promise<void>;
}

export interface ColorModalState {
  isOpen: boolean;
  selectedColor: string;
  setSelectedColor: (value: string) => void;
  open: (fromSettings?: boolean) => void;
  close: () => void;
  save: () => Promise<void>;
  pickColorFromScreen: () => Promise<void>;
  hexToRgb: (hex: string) => string;
}

export interface ThumbnailModalState {
  isOpen: boolean;
  preview: string | null;
  isDragging: boolean;
  isUploading: boolean;
  crop: { x: number; y: number };
  zoom: number;
  onCropChange: (crop: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (cropped: Area) => void;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  open: (fromSettings?: boolean) => void;
  close: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  remove: () => void;
  upload: () => Promise<void>;
  setPreview: (preview: string | null) => void;
}

export interface SettingsModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  triggerEditName: () => void;
  triggerThumbnail: () => void;
  triggerColor: () => void;
  triggerInvoiceInfo: () => void;
  triggerDelete: () => void;
}

export interface TeamModalState {
  isOpen: boolean;
  members: TeamMember[];
  open: () => void;
  close: () => void;
}

export interface ProjectHeaderState {
  saving: boolean;
  isMobile: boolean;
  localActiveProject: Project;
  projectInitial: string;
  displayStatus: string;
  progressValue: number;
  rangeLabel: string;
  mobileRangeLabel: string;
  handleKeyDown: (event: KeyboardEvent, action: () => void) => void;
  navigation: NavigationState;
  editNameModal: EditNameModalState;
  editStatusModal: EditStatusModalState;
  finishLineModal: FinishLineModalState;
  deleteConfirmationModal: DeleteConfirmationModalState;
  thumbnailModal: ThumbnailModalState;
  colorModal: ColorModalState;
  invoiceInfoModal: InvoiceInfoModalState;
  settingsModal: SettingsModalState;
  teamModal: TeamModalState;
  getFileUrlForThumbnail: (thumbnail: string) => string;
  isAdmin: boolean;
}
