import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DollarSign, FileText, Folder, Upload } from "lucide-react";

import type { Task } from "@/shared/utils/api";
import {
  createTask,
  deleteTask,
  archiveTask,
  unarchiveTask,
  updateTask,
  uploadFile,
  getFileUrl,
  apiFetch,
  PROJECTS_SERVICE_URL,
  fetchBudgetHeader,
  fetchBudgetItems,
  createBudgetItem,
  type BudgetHeader,
  type BudgetLine,
  requestTaskReview,
  fetchTask,
  approveTask,
  approveTaskReview,
  requestTaskChanges,
} from "@/shared/utils/api";
import {
  BUDGET_TASK_LINK_TYPES,
  type BudgetTaskLinkType,
  getPrimaryBudgetLineItemId,
  inferBudgetTaskLinkTypeFromTitle,
  normalizeBudgetTaskLinkType,
} from "@/shared/utils/budgetTaskLinks";
import { fetchLocationSuggestions, fetchGlobalLocationSuggestions, type NominatimSuggestion, type SavedLocation } from "@/shared/utils/location";
import { useData } from "@/app/contexts/useData";
import { useUser } from "@/app/contexts/useUser";
import { notify } from "@/shared/ui/ToastNotifications";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import useModalStack from "@/shared/utils/useModalStack";
import {
  getTaskStatusBadge,
  getTaskStatusTone,
  type TaskStatusTone,
} from "@/dashboard/project/components/Tasks/components/quickTaskUtils";
import { formatTaskName } from "@/shared/utils/taskNameFormatting";
import AttachmentPreviewModal from "@/shared/ui/AttachmentPreviewModal";
import FileManagerComponent, {
  type FileItem,
  type FileManagerRef,
} from "@/dashboard/project/components/FileManager/FileManager";

import styles from "./QuickCreateTaskModal.module.css";
import type {
  QuickCreateTaskModalEvent,
  QuickCreateTaskModalEventType,
  QuickCreateTaskModalTask,
  QuickCreateTaskLocation,
  TaskNoteAttachment,
  TaskReviewThreadEntry,
} from "./QuickCreateTaskModal.types";

export type { QuickCreateTaskModalTask, QuickCreateTaskModalEvent } from "./QuickCreateTaskModal.types";

type Coordinates = {
  lat: number;
  lng: number;
};

type TaskStatus =
  | "todo"
  | "in_progress"
  | "done"
  | "in_review"
  | "needs_changes"
  | "archived";

const PATCHABLE_STATUSES: readonly TaskStatus[] = ["todo", "in_progress"] as const;
const READ_ONLY_STATUSES: readonly TaskStatus[] = ["done", "in_review", "archived"] as const;
const STATUS_SELECT_OPTIONS: ReadonlyArray<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
];

type AssigneeOption = {
  value: string;
  label: string;
  avatar?: string;
};

function toTokenArray(value?: string | string[] | null): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toTokenArray(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function parseAssigneeTokensInput(value?: string | string[] | null): string[] {
  const tokens = toTokenArray(value);
  return Array.from(new Set(tokens.map((token) => token.trim()).filter(Boolean)));
}

function extractAssigneeUserId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("__")) {
    const [, extracted] = trimmed.split("__");
    const candidate = extracted?.trim();
    return candidate ? candidate : null;
  }
  return trimmed;
}

function generateAttachmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const TASK_ATTACHMENT_EXTENSIONS = new Set([
  "jpeg",
  "jpg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tif",
  "tiff",
  "pdf",
]);

const getFileExtension = (fileName: string): string => {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
};

const guessMimeTypeFromExtension = (extension: string): string | undefined => {
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return undefined;
  }
};

function sanitizeIncomingAttachments(
  attachments: { id: string; fileName: string; mimeType?: string; dataUrl?: string; url?: string; uploadedAt?: string; }[] | null | undefined,
): TaskNoteAttachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== "object") return null;
      const fileName =
        typeof attachment.fileName === "string" && attachment.fileName.trim()
          ? attachment.fileName.trim()
          : "Attachment";
      const mimeType = typeof attachment.mimeType === "string" ? attachment.mimeType : undefined;
      // Use url for S3-based storage
      const url = typeof attachment.url === "string" && attachment.url.trim() ? attachment.url.trim() : undefined;
      if (!url) return null;
      return {
        id:
          typeof attachment.id === "string" && attachment.id.trim()
            ? attachment.id.trim()
            : generateAttachmentId(),
        fileName,
        mimeType,
        url, // Use url instead of dataUrl
        uploadedAt:
          typeof attachment.uploadedAt === "string" && attachment.uploadedAt.trim()
            ? attachment.uploadedAt.trim()
            : undefined,
      } satisfies TaskNoteAttachment;
    })
    .filter(Boolean);
}

function toInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateInputString(value?: string | number | Date | null): string {
  if (value == null || value === "") {
    return "";
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : toInputDate(value);
  }

  if (typeof value === "number") {
    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? "" : toInputDate(asDate);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      return isoMatch[1];
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return toInputDate(parsed);
    }
  }

  return "";
}

function toTimeInputString(value?: string | number | Date | null): string {
  if (value == null || value === "") {
    return "";
  }

  const pad = (segment: number) => `${segment}`.padStart(2, "0");

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }

  if (typeof value === "number") {
    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? "" : `${pad(asDate.getHours())}:${pad(asDate.getMinutes())}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const isoMatch = trimmed.match(/T(\d{2}):(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}:${isoMatch[2]}`;
    }

    const plainMatch = trimmed.match(/^(\d{1,2})(:?)(\d{2})?$/);
    if (plainMatch) {
      const hours = Number(plainMatch[1]);
      const minutes = Number(plainMatch[3] ?? 0);
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        return `${pad(hours)}:${pad(minutes)}`;
      }
    }
  }

  return "";
}

function parseSimpleTime(value?: string | null): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  const result = new Date();
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function formatDateToTimeString(date: Date): string {
  const padSegment = (segment: number) => `${segment}`.padStart(2, "0");
  return `${padSegment(date.getHours())}:${padSegment(date.getMinutes())}`;
}

function addMinutesToTimeString(time: string, minutesToAdd: number): string {
  const parsed = parseSimpleTime(time);
  if (!parsed) {
    return time;
  }
  parsed.setMinutes(parsed.getMinutes() + minutesToAdd);
  return formatDateToTimeString(parsed);
}

function computeDurationMinutes(start: string, end: string): number | null {
  const startDate = parseSimpleTime(start);
  const endDate = parseSimpleTime(end);
  if (!startDate || !endDate) {
    return null;
  }
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

const DEFAULT_TASK_DURATION_MINUTES = 30;
const DEFAULT_TASK_START_TIME = "12:00";
const DEFAULT_TASK_END_TIME = addMinutesToTimeString(
  DEFAULT_TASK_START_TIME,
  DEFAULT_TASK_DURATION_MINUTES,
);

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function normalizeUserIdentifier(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("__").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : trimmed;
}

function normalizeStatus(value?: string | null): TaskStatus {
  if (!value) return "todo";
  const trimmed = value.toString().trim();
  if (!trimmed) return "todo";
  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "done") return "done";
  if (normalized === "in_progress" || normalized === "in-progress") return "in_progress";
  if (normalized === "in_review" || normalized === "in-review") return "in_review";
  if (normalized === "needs_changes" || normalized === "needs-changes") return "needs_changes";
  if (normalized === "archived") return "archived";
  return "todo";
}

function formatStatusLabel(value?: string | null): string {
  if (!value) return "To do";
  const normalized = value.toString().trim().replace(/[_-]+/g, " ");
  if (!normalized) return "To do";
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeLocation(location: QuickCreateTaskLocation): Coordinates | null {
  if (!location) return null;

  if (typeof location === "string") {
    try {
      const parsed = JSON.parse(location);
      return normalizeLocation(parsed as QuickCreateTaskLocation);
    } catch {
      const [latPart, lngPart] = location.split(/[,\s]+/);
      const lat = parseCoordinate(latPart);
      const lng = parseCoordinate(lngPart);
      return lat != null && lng != null ? { lat, lng } : null;
    }
  }

  if (typeof location === "object") {
    const record = location as Record<string, unknown>;
    const lat =
      parseCoordinate(record.lat) ??
      parseCoordinate(record.latitude) ??
      parseCoordinate(record.Lat) ??
      parseCoordinate(record.Latitude);
    const lng =
      parseCoordinate(record.lng) ??
      parseCoordinate(record.longitude) ??
      parseCoordinate(record.Lng) ??
      parseCoordinate(record.Longitude);

    if (lat != null && lng != null) {
      return { lat, lng };
    }
  }

  return null;
}

function getOffsetDate(days: number): string {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + days);
  return toInputDate(base);
}

export type QuickCreateTaskModalProject = {
  id: string;
  name: string;
};

export type QuickCreateTaskModalProps = {
  open: boolean;
  onClose: () => void;
  projects: QuickCreateTaskModalProject[];
  onCreated: (event: QuickCreateTaskModalEvent) => void;
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  scopedProjectId?: string | null;
  task?: QuickCreateTaskModalTask | null;
  onUpdated?: () => void;
  onDeleted?: () => void;
  embedMode?: boolean;
};

const QuickCreateTaskModal: React.FC<QuickCreateTaskModalProps> = ({
  open,
  onClose,
  projects,
  onCreated,
  activeProjectId,
  activeProjectName,
  scopedProjectId,
  task,
  onUpdated,
  onDeleted,
  embedMode = false,
}) => {
  const { userData, allUsers, userId, isAdmin, updateUserProfile, refreshUser } = useUser();
  const { activeProject, projects: detailedProjects, fetchProjectDetails } = useData();
  useModalStack(open);
  const [projectId, setProjectId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startTime, setStartTime] = useState(DEFAULT_TASK_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_TASK_END_TIME);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_TASK_DURATION_MINUTES);
  const [addressSearch, setAddressSearch] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<NominatimSuggestion[]>([]);
  const [showWorldwideLink, setShowWorldwideLink] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Coordinates | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [currentLocationAddress, setCurrentLocationAddress] = useState<string | null>(null);
  const [assigneeTokens, setAssigneeTokens] = useState<string[]>([]);
  const [noteAttachments, setNoteAttachments] = useState<TaskNoteAttachment[]>([]);
  const [attachedBudgetItemId, setAttachedBudgetItemId] = useState<string | null>(null);
  const [budgetLinkType, setBudgetLinkType] = useState<BudgetTaskLinkType>("build");
  const [isCostPanelOpen, setIsCostPanelOpen] = useState(false);
  const [budgetHeader, setBudgetHeader] = useState<BudgetHeader | null>(null);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetLoadError, setBudgetLoadError] = useState<string | null>(null);
  const [costQuery, setCostQuery] = useState("");
  const [isCostSaving, setIsCostSaving] = useState(false);
  const [isCreatingLineItem, setIsCreatingLineItem] = useState(false);
  const [newLineKey, setNewLineKey] = useState("");
  const [newLineDesc, setNewLineDesc] = useState("");
  const [newLineCost, setNewLineCost] = useState("");
  const costTouchedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const [dueDateError, setDueDateError] = useState<string | null>(null);
  const [timeRangeError, setTimeRangeError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const [createdById, setCreatedById] = useState<string | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [createdByUsername, setCreatedByUsername] = useState<string | null>(null);
  const [createdByEmail, setCreatedByEmail] = useState<string | null>(null);
  const [createdByThumbnail, setCreatedByThumbnail] = useState<string | null>(null);
  const suggestionsListId = "quick-create-task-location-suggestions";
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [focusedAssigneeIndex, setFocusedAssigneeIndex] = useState(-1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedAttachmentIndex, setSelectedAttachmentIndex] = useState<number | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [isDueOpen, setIsDueOpen] = useState(false);
  const [showQuickDateChips, setShowQuickDateChips] = useState(false);
  const assigneePopoverRef = useRef<HTMLDivElement | null>(null);
  const assigneeFieldRef = useRef<HTMLDivElement | null>(null);
  const assigneeSearchRef = useRef<HTMLInputElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const locationSuggestionsRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastOffsetRef = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const fileManagerRef = useRef<FileManagerRef | null>(null);
  const attachmentPopoverRef = useRef<HTMLDivElement | null>(null);
  const attachmentPopoverButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastAppliedTaskRef = useRef<string | null>(null);
  const successMessageRef = useRef<string | null>(null);
  const initialTaskRef = useRef<QuickCreateTaskModalTask | null>(null);
  const baseId = useId();
  const descriptionId = `${baseId}-description`;
  const projectFieldId = `${baseId}-project`;
  const assigneeFieldId = `${baseId}-assignee`;
  const assigneePopoverId = `${baseId}-assignee-popover`;
  const taskNameFieldId = `${baseId}-task-name`;
  const titleCounterId = `${baseId}-title-counter`;
  const titleErrorId = `${baseId}-title-error`;
  const projectErrorId = `${baseId}-project-error`;
  const startDateErrorId = `${baseId}-start-date-error`;
  const dueDateErrorId = `${baseId}-due-date-error`;
  const timeRangeErrorId = `${baseId}-time-range-error`;
  const locationFieldId = `${baseId}-location`;
  const startDateFieldId = `${baseId}-start-date`;
  const dueDateFieldId = `${baseId}-due-date`;
  const startTimeFieldId = `${baseId}-start-time`;
  const endTimeFieldId = `${baseId}-end-time`;
  const notesFieldId = `${baseId}-notes`;
  const attachmentsFieldId = `${baseId}-attachments`;
  const feedbackRegionId = `${baseId}-feedback`;
  const locationHintId = `${baseId}-location-hint`;
  const statusFieldId = `${baseId}-status`;

  const projectOptions = useMemo(() => projects ?? [], [projects]);
  const hasProjects = projectOptions.length > 0;
  const isEditing = Boolean(taskId);
  const assigneeScopeProjectId = useMemo(() => {
    if (isEditing) {
      if (projectId) {
        return projectId;
      }
      if (initialTaskRef.current?.projectId) {
        return initialTaskRef.current.projectId;
      }
    }

    if (scopedProjectId) {
      return scopedProjectId;
    }

    if (projectId && projectOptions.some((project) => project.id === projectId)) {
      return projectId;
    }

    return projectOptions[0]?.id ?? initialTaskRef.current?.projectId ?? "";
  }, [isEditing, projectId, projectOptions, scopedProjectId]);
  const resolvedActiveProjectName = useMemo(() => {
    if (activeProjectName && activeProjectName.trim()) {
      return activeProjectName.trim();
    }

    const targetId = activeProjectId || scopedProjectId || projectId;
    if (!targetId) return "";
    const found = projectOptions.find((project) => project.id === targetId);
    return found?.name ?? "";
  }, [activeProjectId, activeProjectName, projectId, projectOptions, scopedProjectId]);

  const selectedProjectRecord = useMemo(() => {
    if (!assigneeScopeProjectId) return null;
    if (activeProject?.projectId === assigneeScopeProjectId) {
      return activeProject;
    }
    return detailedProjects.find((project) => project.projectId === assigneeScopeProjectId) ?? null;
  }, [activeProject, assigneeScopeProjectId, detailedProjects]);

  useEffect(() => {
    if (!open) return;
    if (!assigneeScopeProjectId) return;
    if (selectedProjectRecord && Array.isArray((selectedProjectRecord as { team?: unknown }).team)) {
      return;
    }
    fetchProjectDetails(assigneeScopeProjectId).catch(() => {
      // ignore; assignee picker will degrade to showing only already-selected assignees
    });
  }, [assigneeScopeProjectId, fetchProjectDetails, open, selectedProjectRecord]);

  const projectTeamUserIds = useMemo(() => {
    const record = selectedProjectRecord as { team?: Array<{ userId?: string }> } | null;
    if (!record || !Array.isArray(record.team)) {
      return [] as string[];
    }
    return record.team
      .map((member) => member?.userId?.trim())
      .filter((id): id is string => Boolean(id));
  }, [selectedProjectRecord]);

  const projectTeamUserIdSet = useMemo(() => new Set(projectTeamUserIds), [projectTeamUserIds]);
  const collaboratorIds = useMemo(() => {
    const extraFromExistingAssignees = assigneeTokens
      .map((token) => extractAssigneeUserId(token))
      .filter((id): id is string => Boolean(id));

    return Array.from(new Set([...projectTeamUserIds, ...extraFromExistingAssignees]));
  }, [assigneeTokens, projectTeamUserIds]);

  const collaboratorOptions = useMemo(() => {
    if (!collaboratorIds.length) {
      const fallbackOptions: AssigneeOption[] = assigneeTokens.map((token) => {
        const trimmed = token.trim();
        const [namePart] = trimmed.includes("__") ? trimmed.split("__") : [trimmed];
        const label = namePart.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim() || trimmed;
        return { value: trimmed, label, avatar: undefined };
      });
      return fallbackOptions;
    }

    const findCollaborator = (rawId: string) => {
      const trimmedId = rawId.trim();
      if (!trimmedId) return undefined;
      const [, extractedId] = trimmedId.includes("__") ? trimmedId.split("__") : [null, null];
      const normalizedId = extractedId?.trim() || trimmedId;
      return allUsers.find((user) => {
        const userId = user.userId?.trim();
        const username = user.username?.trim();
        const compactName = `${user.firstName?.trim() ?? ""}${user.lastName?.trim() ?? ""}`;
        return (
          (userId && userId === normalizedId) ||
          (userId && userId === trimmedId) ||
          (username && username === trimmedId) ||
          (compactName && compactName === trimmedId)
        );
      });
    };

    const formatLabel = (collaborator: (typeof allUsers)[number] | undefined, fallbackId: string) => {
      const first = collaborator?.firstName?.trim() ?? "";
      const last = collaborator?.lastName?.trim() ?? "";
      const fullName = `${first} ${last}`.trim();
      return (
        fullName ||
        collaborator?.username?.trim() ||
        collaborator?.email?.trim() ||
        collaborator?.userId?.trim() ||
        fallbackId
      );
    };

    const formatValue = (collaborator: (typeof allUsers)[number] | undefined, fallbackId: string) => {
      if (!collaborator) return fallbackId;
      const existingParts = fallbackId.includes("__") ? fallbackId.split("__") : [];
      const fallbackUserId = existingParts[1]?.trim();
      const userId = collaborator.userId?.trim() || fallbackUserId;
      if (!userId) return fallbackId;
      const compactFirst = collaborator.firstName?.trim() ?? "";
      const compactLast = collaborator.lastName?.trim() ?? "";
      const compactName = `${compactFirst}${compactLast}`.replace(/\s+/g, "");
      const fallbackName =
        compactName ||
        collaborator.username?.replace(/\s+/g, "") ||
        existingParts[0]?.replace(/\s+/g, "") ||
        fallbackId.replace(/\s+/g, "");
      const safeName = fallbackName || "User";
      return `${safeName}__${userId}`;
    };

    const formatAvatar = (collaborator: (typeof allUsers)[number] | undefined) => {
      return collaborator?.avatar || undefined; // Placeholder for avatar URL
    };

    const dedupeMap = new Map<string, AssigneeOption>();

    collaboratorIds.forEach((rawId) => {
      const collaborator = findCollaborator(rawId);
      const value = formatValue(collaborator, rawId);
      const label = formatLabel(collaborator, rawId);
      const avatar = formatAvatar(collaborator);
      if (!dedupeMap.has(value)) {
        dedupeMap.set(value, { value, label, avatar: avatar as string | undefined });
      }
    });

    // Admins can add people to the project directly from this modal:
    // only surface non-team users when searching.
    const normalizedQuery = assigneeSearch.trim().toLowerCase();
    if (isAdmin && normalizedQuery) {
      const candidates = allUsers
        .filter((user) => {
          const uid = user.userId?.trim();
          if (!uid) return false;
          if (projectTeamUserIdSet.has(uid)) return false;
          const first = user.firstName?.trim() ?? "";
          const last = user.lastName?.trim() ?? "";
          const fullName = `${first} ${last}`.trim();
          const username = user.username?.trim() ?? "";
          const email = user.email?.trim() ?? "";
          return [fullName, username, email, uid].some((field) =>
            field.toLowerCase().includes(normalizedQuery),
          );
        })
        .slice(0, 25);

      candidates.forEach((user) => {
        const fallbackId = user.userId?.trim() || "";
        if (!fallbackId) return;
        const value = formatValue(user, fallbackId);
        const label = formatLabel(user, fallbackId);
        const avatar = formatAvatar(user);
        if (!dedupeMap.has(value)) {
          dedupeMap.set(value, { value, label, avatar: avatar as string | undefined });
        }
      });
    }

    assigneeTokens.forEach((token) => {
      const trimmed = token.trim();
      if (!trimmed || dedupeMap.has(trimmed)) return;
      const [namePart] = trimmed.includes("__") ? trimmed.split("__") : [trimmed];
      const label = namePart.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim() || trimmed;
      dedupeMap.set(trimmed, { value: trimmed, label, avatar: undefined });
    });

    return Array.from(dedupeMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [allUsers, assigneeSearch, collaboratorIds, assigneeTokens, isAdmin, projectTeamUserIdSet]);

  // Filtered options based on search
  const filteredAssigneeOptions = useMemo(() => {
    const searchLower = assigneeSearch.toLowerCase();
    return collaboratorOptions.filter(option =>
      option.label.toLowerCase().includes(searchLower)
    );
  }, [collaboratorOptions, assigneeSearch]);

  // Sorted options: selected first
  const sortedAssigneeOptions = useMemo(() => {
    const selected = filteredAssigneeOptions.filter(option => assigneeTokens.includes(option.value));
    const unselected = filteredAssigneeOptions.filter(option => !assigneeTokens.includes(option.value));
    return [...selected, ...unselected];
  }, [filteredAssigneeOptions, assigneeTokens]);

  const selectedAssignees = useMemo(
    () =>
      assigneeTokens
        .map((token) => collaboratorOptions.find((option) => option.value === token))
        .filter((option): option is AssigneeOption => Boolean(option)),
    [assigneeTokens, collaboratorOptions],
  );

  const incomingTaskId = useMemo(() => {
    if (!task) return null;
    const normalizedTaskId = task.taskId?.trim();
    const normalizedId = task.id?.trim();
    return normalizedTaskId || normalizedId || null;
  }, [task]);

  const visibleAssignees = selectedAssignees.slice(0, 3);
  const remainingAssigneeCount = Math.max(0, selectedAssignees.length - visibleAssignees.length);

  const currentUserAssigneeValue = useMemo(() => {
    if (!userId) return undefined;
    const normalizedId = userId.trim();
    if (!normalizedId) return undefined;

    const matchesCurrentUser = (value?: string | null) => {
      if (!value) return false;
      const trimmed = value.trim();
      if (!trimmed) return false;
      if (trimmed === normalizedId) return true;
      if (trimmed.endsWith(`__${normalizedId}`)) return true;
      if (trimmed.includes("__")) {
        const [, extracted] = trimmed.split("__");
        if (extracted?.trim() === normalizedId) {
          return true;
        }
      }
      return false;
    };

    const existingToken = assigneeTokens.find((token) => matchesCurrentUser(token));
    if (existingToken) {
      return existingToken;
    }

    return collaboratorOptions.find((option) => matchesCurrentUser(option.value))?.value;
  }, [assigneeTokens, collaboratorOptions, userId]);

  const isCurrentUserAssigned = Boolean(
    currentUserAssigneeValue && assigneeTokens.includes(currentUserAssigneeValue),
  );

  const canAssignToSelf = Boolean(currentUserAssigneeValue && !isCurrentUserAssigned);

  const hasCollaborators = collaboratorOptions.length > 0;
  const effectiveProjectId = useMemo(() => assigneeScopeProjectId, [assigneeScopeProjectId]);
  const trimmedTitle = title.trim();
  const formattedTitle = trimmedTitle ? formatTaskName(trimmedTitle) : "";
  const titleRemaining = 120 - title.length;
  const showTitleCounter = titleRemaining <= 20;
  const canSubmit = Boolean(effectiveProjectId && trimmedTitle);
  const isBusy = submitting || deleting || archiving;

  const hasUnsavedChanges = useMemo(() => {
    const current = {
      projectId,
      title: title.trim(),
      description: description.trim(),
      startDate,
      dueDate,
      startTime,
      endTime,
      assigneeTokens: [...assigneeTokens].sort(),
      address: addressSearch.trim(),
      location: selectedLocation,
      noteAttachments: noteAttachments.map(att => ({ fileName: att.fileName, mimeType: att.mimeType, url: att.url })),
      status,
    };
    if (initialTaskRef.current) {
      // edit mode
      const initial = {
        projectId: initialTaskRef.current.projectId || "",
        title: initialTaskRef.current.title?.trim() || "",
        description: initialTaskRef.current.description?.trim() || "",
        startDate:
          toDateInputString(initialTaskRef.current.startAt) ||
          toDateInputString(initialTaskRef.current.dueDate) ||
          "",
        dueDate:
          toDateInputString(initialTaskRef.current.endAt) ||
          toDateInputString(initialTaskRef.current.dueDate) ||
          "",
        startTime: toTimeInputString(initialTaskRef.current.startAt) || "",
        endTime: toTimeInputString(initialTaskRef.current.endAt) || "",
        assigneeTokens: parseAssigneeTokensInput(initialTaskRef.current.assigneeTokens || initialTaskRef.current.assigneeId || initialTaskRef.current.assigneeIds).sort(),
        address: initialTaskRef.current.address?.trim() || "",
        location: normalizeLocation(initialTaskRef.current.location),
        noteAttachments: sanitizeIncomingAttachments(initialTaskRef.current.noteAttachments).map(att => ({ fileName: att.fileName, mimeType: att.mimeType, url: att.url })),
        status: normalizeStatus(initialTaskRef.current.status),
      };
      const hasChanges = JSON.stringify(current) !== JSON.stringify(initial);
      return hasChanges;
    } else {
      // create mode - only consider user-entered fields, not auto-set projectId
      const hasData = !!(
        title.trim() ||
        description.trim() ||
        startDate ||
        dueDate ||
        startTime ||
        endTime ||
        assigneeTokens.length ||
        addressSearch.trim() ||
        selectedLocation ||
        noteAttachments.length
      );
      return hasData;
    }
  }, [projectId, title, description, startDate, dueDate, startTime, endTime, assigneeTokens, addressSearch, selectedLocation, noteAttachments, status]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowConfirmClose(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  useEffect(() => {
    successMessageRef.current = successMessage;
  }, [successMessage]);

  // Handlers for opening/closing the assignee popover must be
  // declared before any effect that references them. We hoist
  // these handlers above the click-outside effect to avoid a
  // temporal-dead-zone (ReferenceError) when the effect runs.
  const openAssigneePopover = useCallback(() => {
    setAssigneePopoverOpen(true);
    setAssigneeSearch("");
    setFocusedAssigneeIndex(-1);
    requestAnimationFrame(() => assigneeSearchRef.current?.focus());
  }, []);

  const closeAssigneePopover = useCallback(() => {
    setAssigneePopoverOpen(false);
    setAssigneeSearch("");
    setFocusedAssigneeIndex(-1);
  }, []);

  const toggleAssignee = useCallback((value: string) => {
    setAssigneeTokens((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }, []);

  const handleAssigneeFieldKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("button")) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openAssigneePopover();
      } else if (event.key === "ArrowDown" && !assigneePopoverOpen) {
        event.preventDefault();
        openAssigneePopover();
      } else if (event.key === "Escape" && assigneePopoverOpen) {
        event.preventDefault();
        closeAssigneePopover();
      }
    },
    [assigneePopoverOpen, closeAssigneePopover, openAssigneePopover]
  );

  const handleAssigneeFieldClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("button")) {
        return;
      }
      openAssigneePopover();
    },
    [openAssigneePopover]
  );

  const handleAssignToMe = useCallback(() => {
    if (!currentUserAssigneeValue) return;
    setAssigneeTokens((prev) =>
      prev.includes(currentUserAssigneeValue) ? prev : [...prev, currentUserAssigneeValue]
    );
  }, [currentUserAssigneeValue]);

  const handleClearAssignees = useCallback(() => {
    setAssigneeTokens([]);
  }, []);

  const handleAssigneeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!assigneePopoverOpen) return;
      const { key } = event;
      if (key === "Escape") {
        closeAssigneePopover();
      } else if (key === "ArrowDown") {
        event.preventDefault();
        setFocusedAssigneeIndex((prev) => Math.min(prev + 1, sortedAssigneeOptions.length - 1));
      } else if (key === "ArrowUp") {
        event.preventDefault();
        setFocusedAssigneeIndex((prev) => Math.max(prev - 1, 0));
      } else if (key === "Enter" || key === " ") {
        event.preventDefault();
        if (focusedAssigneeIndex >= 0) {
          toggleAssignee(sortedAssigneeOptions[focusedAssigneeIndex].value);
        }
      }
    },
    [assigneePopoverOpen, closeAssigneePopover, focusedAssigneeIndex, sortedAssigneeOptions, toggleAssignee]
  );

  useEffect(() => {
    if (!assigneePopoverOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        assigneePopoverRef.current?.contains(target) ||
        assigneeFieldRef.current?.contains(target)
      ) {
        return;
      }
      closeAssigneePopover();
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [assigneePopoverOpen, closeAssigneePopover]);

  useEffect(() => {
    if (addressSuggestions.length === 0) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        locationSuggestionsRef.current?.contains(target) ||
        locationInputRef.current?.contains(target)
      ) {
        return;
      }
      setAddressSuggestions([]);
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addressSuggestions.length]);

  const getDistance = useCallback((coord1: Coordinates, coord2: Coordinates): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  const fetchCurrentLocationAddress = useCallback(async (lat: number, lng: number): Promise<string | null> => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await response.json();
      return data.display_name || null;
    } catch (error) {
      console.error("Failed to reverse geocode current location:", error);
      return null;
    }
  }, []);

  const sortSuggestionsByProximity = useCallback(
    (suggestions: NominatimSuggestion[], origin: Coordinates | null) => {
      if (!origin) return suggestions;
      return [...suggestions].sort((a, b) => {
        const coordA = { lat: parseFloat(a.lat), lng: parseFloat(a.lon) };
        const coordB = { lat: parseFloat(b.lat), lng: parseFloat(b.lon) };
        const distA = getDistance(origin, coordA);
        const distB = getDistance(origin, coordB);
        const within50A = distA <= 50;
        const within50B = distB <= 50;
        if (within50A && !within50B) return -1;
        if (!within50A && within50B) return 1;
        return distA - distB;
      });
    },
    [getDistance]
  );

  const fetchAddressSuggestions = useCallback(
    async (query: string) => {
      let biasLocation = userLocation;
      if (!biasLocation && userData?.defaultTaskLocation) {
        biasLocation = {
          lat: userData.defaultTaskLocation.lat,
          lng: userData.defaultTaskLocation.lon,
        };
      }
      const result = await fetchLocationSuggestions(query, biasLocation ? { lat: biasLocation.lat, lng: biasLocation.lng } : undefined, {
        limit: 5,
        includeCurrentLocation: true,
        currentLocationAddress: currentLocationAddress || undefined,
        defaultLocation: userData?.defaultTaskLocation || null,
      });

      setAddressSuggestions(result.suggestions);
      setShowWorldwideLink(result.showWorldwideLink);
    },
    [userLocation, currentLocationAddress, userData?.defaultTaskLocation]
  );

  const fetchGlobalAddressSuggestions = useCallback(
    async (query: string) => {
      let biasLocation = userLocation;
      if (!biasLocation && userData?.defaultTaskLocation) {
        biasLocation = {
          lat: userData.defaultTaskLocation.lat,
          lng: userData.defaultTaskLocation.lon,
        };
      }
      const suggestions = await fetchGlobalLocationSuggestions(query, biasLocation ? { lat: biasLocation.lat, lng: biasLocation.lng } : undefined, {
        limit: 8,
        includeCurrentLocation: true,
        currentLocationAddress: currentLocationAddress || undefined,
        defaultLocation: userData?.defaultTaskLocation || null,
      });

      setAddressSuggestions(suggestions);
      setShowWorldwideLink(false); // Hide the link since we're now showing global results
    },
    [userLocation, currentLocationAddress, userData?.defaultTaskLocation]
  );

  const resetForm = useCallback(() => {
    setProjectId("");
    setTitle("");
    setDescription("");
    setStartDate("");
    setDueDate("");
    setStartTime(DEFAULT_TASK_START_TIME);
    setEndTime(DEFAULT_TASK_END_TIME);
    setDurationMinutes(DEFAULT_TASK_DURATION_MINUTES);
    setAddressSearch("");
    setAddressSuggestions([]);
    setShowWorldwideLink(false);
    setSelectedLocation(null);
    setAssigneeTokens([]);
    setNoteAttachments([]);
    setAttachedBudgetItemId(null);
    setBudgetLinkType("build");
    setIsCostPanelOpen(false);
    setBudgetHeader(null);
    setBudgetLines([]);
    setBudgetLoading(false);
    setBudgetLoadError(null);
    setCostQuery("");
    setIsCostSaving(false);
    setIsCreatingLineItem(false);
    setNewLineKey("");
    setNewLineDesc("");
    setNewLineCost("");
    costTouchedRef.current = false;
    setSubmitting(false);
    setDeleting(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTitleError(null);
    setProjectError(null);
    setStartDateError(null);
    setDueDateError(null);
    setTimeRangeError(null);
    setTaskId(null);
    setStatus("todo");
    setArchiving(false);
    setReviewerId(null);
    setCreatedById(null);
    setCreatedByName(null);
    setCreatedByUsername(null);
    setCreatedByEmail(null);
    setCreatedByThumbnail(null);
    initialTaskRef.current = null;
  }, []);

  const applyTaskToForm = useCallback(
    (
      taskData: QuickCreateTaskModalTask,
      options?: {
        preserveFeedback?: boolean;
      },
    ) => {
      const preserveFeedback = Boolean(options?.preserveFeedback);
      const nextProjectId = typeof taskData.projectId === "string" ? taskData.projectId.trim() : "";
      setProjectId(nextProjectId);
      const nextTaskId =
        (typeof taskData.taskId === "string" && taskData.taskId.trim()) ||
        (typeof taskData.id === "string" && taskData.id.trim()) ||
        null;
      setTaskId(nextTaskId);
      setReviewerId(typeof taskData.reviewerId === "string" ? taskData.reviewerId : null);
      setTitle(typeof taskData.title === "string" ? formatTaskName(taskData.title) : "");
      setDescription(typeof taskData.description === "string" ? taskData.description : "");
      const normalizedStartDate =
        toDateInputString(taskData.startAt) || toDateInputString(taskData.dueDate);
      const normalizedEndDate =
        toDateInputString(taskData.endAt) || toDateInputString(taskData.dueDate);
      setStartDate(normalizedStartDate || normalizedEndDate);
      setDueDate(normalizedEndDate || normalizedStartDate);
      const normalizedStart = toTimeInputString(taskData.startAt);
      const normalizedEnd = toTimeInputString(taskData.endAt) || toTimeInputString(taskData.dueDate);
      const resolvedStart = normalizedStart || DEFAULT_TASK_START_TIME;
      const resolvedEnd =
        normalizedEnd ||
        (normalizedStart
          ? addMinutesToTimeString(normalizedStart, DEFAULT_TASK_DURATION_MINUTES)
          : DEFAULT_TASK_END_TIME);
      setStartTime(resolvedStart);
      setEndTime(resolvedEnd);
      const nextDuration =
        normalizedStart && normalizedEnd
          ? computeDurationMinutes(normalizedStart, normalizedEnd)
          : DEFAULT_TASK_DURATION_MINUTES;
      setDurationMinutes(nextDuration ?? DEFAULT_TASK_DURATION_MINUTES);
      const normalizedFormStatus = normalizeStatus(taskData.status);
      setStatus(normalizedFormStatus);
      const providedTokens = Array.isArray(taskData.assigneeTokens)
        ? taskData.assigneeTokens.filter(
            (token): token is string => typeof token === "string" && token.trim().length > 0,
          )
        : [];
      if (providedTokens.length) {
        setAssigneeTokens(providedTokens);
      } else {
        const fallbackTokens = parseAssigneeTokensInput(
          Array.isArray(taskData.assigneeIds) && taskData.assigneeIds.length
            ? taskData.assigneeIds
            : taskData.assigneeId ?? null,
        );
        setAssigneeTokens(fallbackTokens);
      }
      setAddressSearch(typeof taskData.address === "string" ? taskData.address : "");
      setAddressSuggestions([]);
      setSelectedLocation(normalizeLocation(taskData.location));
      setNoteAttachments(sanitizeIncomingAttachments(taskData.noteAttachments));

      const primaryId = getPrimaryBudgetLineItemId(taskData as unknown as Task);
      setAttachedBudgetItemId(primaryId);
      const inferredLinkType = inferBudgetTaskLinkTypeFromTitle(
        typeof taskData.title === "string" ? taskData.title : "",
      );
      const existingLinkType = normalizeBudgetTaskLinkType(
        (taskData as { budgetLinkType?: unknown }).budgetLinkType,
      );
      setBudgetLinkType(existingLinkType ?? inferredLinkType);
      setIsCostPanelOpen(false);
      setBudgetHeader(null);
      setBudgetLines([]);
      setBudgetLoading(false);
      setBudgetLoadError(null);
      setCostQuery("");
      setIsCreatingLineItem(false);
      setNewLineKey("");
      setNewLineDesc("");
      setNewLineCost("");
      setIsCostSaving(false);
      costTouchedRef.current = false;
      setCreatedById(typeof taskData.createdById === "string" ? taskData.createdById : null);
      setCreatedByName(typeof taskData.createdByName === "string" ? taskData.createdByName : null);
      setCreatedByUsername(typeof taskData.createdByUsername === "string" ? taskData.createdByUsername : null);
      setCreatedByEmail(typeof taskData.createdByEmail === "string" ? taskData.createdByEmail : null);
      setCreatedByThumbnail(typeof taskData.createdByThumbnail === "string" ? taskData.createdByThumbnail : null);
      if (!preserveFeedback) {
        setSuccessMessage(null);
        setErrorMessage(null);
      }
      setTitleError(null);
      setProjectError(null);
      setStartDateError(null);
      setTimeRangeError(null);
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      resetForm();
      setSwipeOffset(0);
      setIsDragging(false);
      isDraggingRef.current = false;
      touchStartYRef.current = null;
      lastOffsetRef.current = 0;
      lastAppliedTaskRef.current = null;
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setTitleError(null);
    setProjectError(null);
    setStartDateError(null);
    setDueDateError(null);
    setTimeRangeError(null);
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || task) {
      return;
    }

    if (scopedProjectId) {
      setProjectId(scopedProjectId);
      return;
    }

    if (!projectOptions.length) {
      setProjectId("");
      return;
    }

    setProjectId(projectOptions[0].id);
  }, [open, projectOptions, scopedProjectId, task]);

  useEffect(() => {
    if (!open || !task) return;
    const taskKey =
      (typeof task.taskId === "string" && task.taskId.trim()) ||
      (typeof task.id === "string" && task.id.trim()) ||
      null;
    const shouldPreserveFeedback =
      Boolean(successMessageRef.current) && taskKey !== null && taskKey === lastAppliedTaskRef.current;
    applyTaskToForm(task, { preserveFeedback: shouldPreserveFeedback });
    initialTaskRef.current = task;
    lastAppliedTaskRef.current = taskKey;
  }, [open, task, applyTaskToForm]);

  useEffect(() => {
    if (!open || !task || !incomingTaskId) return;
    const projectIdentifier = task.projectId;
    if (!projectIdentifier) return;

    let cancelled = false;

    const loadAttachments = async () => {
      try {
        const taskDetails = await fetchTask(projectIdentifier, incomingTaskId);
        if (cancelled || !taskDetails) return;
        const attachments = sanitizeIncomingAttachments(taskDetails.noteAttachments);
        setNoteAttachments(attachments);
        initialTaskRef.current = initialTaskRef.current
          ? { ...initialTaskRef.current, noteAttachments: attachments }
          : { noteAttachments: attachments } as QuickCreateTaskModalTask;
      } catch (error) {
        console.error("Failed to refresh task attachments", error);
      }
    };

    void loadAttachments();
    return () => {
      cancelled = true;
    };
  }, [open, task, incomingTaskId]);

  // Reset form when opening in create mode (no task provided)
  useEffect(() => {
    if (open && !task) {
      resetForm();
      lastAppliedTaskRef.current = null;
    }
  }, [open, task, resetForm]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isBusy) {
          handleClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleClose, isBusy]);

  useEffect(() => {
    if (!open) return;

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setUserLocation(null);
      setCurrentLocationAddress(null);
      return;
    }

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (!cancelled) {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(coords);
          const address = await fetchCurrentLocationAddress(coords.lat, coords.lng);
          if (!cancelled) {
            setCurrentLocationAddress(address);
          }
        }
      },
      () => {
        if (!cancelled) {
          // Fallback to default location if available
          if (userData?.defaultTaskLocation) {
            const fallbackCoords = {
              lat: userData.defaultTaskLocation.lat,
              lng: userData.defaultTaskLocation.lon,
            };
             setUserLocation(fallbackCoords);
             setCurrentLocationAddress(userData.defaultTaskLocation.formattedAddress);
            notify("info", "Using your default location for suggestions.");
          } else {
            setUserLocation(null);
            setCurrentLocationAddress(null);
            notify("warning", "Location access denied. Suggestions may be less accurate.");
          }
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [open, fetchCurrentLocationAddress]);

  useEffect(() => {
    if (!userLocation) return;
    setAddressSuggestions((prev) => sortSuggestionsByProximity(prev, userLocation));
  }, [sortSuggestionsByProximity, userLocation]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";

    return () => {
      style.overflow = previousOverflow;
    };
  }, [open]);

  const resizeNotes = useCallback(() => {
    const textarea = notesRef.current;
    if (!textarea) return;

    const lineHeight = 24;
    const minHeight = lineHeight * 4;
    const maxHeight = lineHeight * 6;
    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus({ preventScroll: true });
      resizeNotes();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [open, resizeNotes]);

  useEffect(() => {
    resizeNotes();
  }, [description, resizeNotes]);

  useEffect(() => {
    if (!open) return;
    const handleMetaEnter = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (!isBusy && canSubmit) {
          formRef.current?.requestSubmit();
        }
      }
    };

    window.addEventListener("keydown", handleMetaEnter);
    return () => window.removeEventListener("keydown", handleMetaEnter);
  }, [canSubmit, open, isBusy]);

  useEffect(() => {
    if (!open) return;
    const modal = modalRef.current;
    if (!modal) return;

    const selectors = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(selectors)).filter(
        (element) =>
          (element.offsetParent !== null || element.getClientRects().length > 0) &&
          !element.hasAttribute("data-focus-guard")
      );

      if (!focusable.length) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first || !modal.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    modal.addEventListener("keydown", handleTabKey);
    return () => modal.removeEventListener("keydown", handleTabKey);
  }, [open]);

  useEffect(() => {
    if (trimmedTitle) {
      setTitleError(null);
    }
  }, [trimmedTitle]);

  useEffect(() => {
    if (effectiveProjectId) {
      setProjectError(null);
    }
  }, [effectiveProjectId]);

  useEffect(() => {
    if (startDate) {
      setStartDateError(null);
    }
  }, [startDate]);

  useEffect(() => {
    if (dueDate) {
      setDueDateError(null);
    }
  }, [dueDate]);

  // Set default collapsed state based on mode
  useEffect(() => {
    if (!open) return;
    
    if (isEditing) {
      // Edit mode: collapsed unless missing due date/time (prompt completion)
      const hasStart = Boolean(startDate && startDate.trim());
      const hasEnd = Boolean(dueDate && dueDate.trim());
      setIsDueOpen(!(hasStart && hasEnd));
      setShowQuickDateChips(false);
    } else {
      // Create mode: expanded by default (scheduling is important)
      setIsDueOpen(true);
      setShowQuickDateChips(true);
    }
  }, [open, isEditing, dueDate, startDate]);

  // Show quick date chips when date section is open
  useEffect(() => {
    setShowQuickDateChips(isDueOpen);
  }, [isDueOpen]);


  const descriptionCopy = (activeProjectId || scopedProjectId)
    ? `Launch work for ${resolvedActiveProjectName || "this project"}.`
    : "Launch work for any project without leaving this view.";
  const showProjectSelect = !scopedProjectId && hasProjects && !isEditing;
  const todayValue = getOffsetDate(0);
  const tomorrowValue = getOffsetDate(1);
  const nextWeekValue = getOffsetDate(7);
  const isSubmitDisabled = isBusy || !canSubmit;
  const modalTitle = isEditing ? "Edit task" : "Create a task";
  const modalDescription = isEditing
    ? "Update the basics or reassign work. Use the task view for reviews and approvals."
    : descriptionCopy;
  const isStatusLocked = READ_ONLY_STATUSES.includes(status);
  const normalizedCurrentUserId = normalizeUserIdentifier(userId);
  const normalizedReviewerId = normalizeUserIdentifier(reviewerId);
  const normalizedCreatorId = normalizeUserIdentifier(createdById);
  const isReviewer = Boolean(
    normalizedReviewerId && normalizedCurrentUserId && normalizedReviewerId === normalizedCurrentUserId,
  );
  const isCreator = Boolean(
    normalizedCreatorId && normalizedCurrentUserId && normalizedCreatorId === normalizedCurrentUserId,
  );

  const statusBadgeData = useMemo(() => {
    const dueDateObj =
      dueDate && endTime
        ? new Date(`${dueDate}T${endTime}:00`)
        : dueDate
          ? new Date(`${dueDate}T00:00:00`)
          : null;
    return getTaskStatusBadge(status, dueDateObj, undefined);
  }, [status, dueDate, endTime]);
  
  const statusTone: TaskStatusTone = useMemo(
    () => getTaskStatusTone(statusBadgeData.category),
    [statusBadgeData.category],
  );

  const normalizedStatus = status.trim().toLowerCase();
  const isAwaitingApproval = normalizedStatus === "in_review";
  const canSubmitForReview =
    normalizedStatus === "todo" ||
    normalizedStatus === "in_progress" ||
    normalizedStatus === "needs_changes";

  const isCompleteStatus = normalizedStatus === "done" || normalizedStatus === "archived";
  const canSubmitForReviewAction = Boolean(isAdmin || isCurrentUserAssigned || isCreator);
  const showSubmitForReviewButton =
    isEditing && !isBusy && !isAwaitingApproval && !isCompleteStatus && canSubmitForReview && canSubmitForReviewAction;
  const normalizedReviewState = typeof task?.reviewState === "string" ? task.reviewState.trim().toLowerCase() : "";
  const isReviewApproved = normalizedReviewState === "approved";
  const showApproveReviewButton = isEditing && !isBusy && isAdmin && isAwaitingApproval && !isCompleteStatus && !isReviewApproved;
  const showMarkDoneButton = isEditing && !isBusy && isAdmin && !isCompleteStatus;
  const showRequestChangesButton = isEditing && isAwaitingApproval && isAdmin && !isBusy;
  const canArchiveTask = Boolean(isEditing && status === "done" && (isAdmin || isReviewer));
  const canUnarchiveTask = Boolean(isEditing && status === "archived" && (isAdmin || isReviewer));
  const hasAnyStatusAction =
    showSubmitForReviewButton ||
    showApproveReviewButton ||
    showMarkDoneButton ||
    showRequestChangesButton ||
    canArchiveTask ||
    canUnarchiveTask;
  const taskNameDescribedBy = [
    showTitleCounter ? titleCounterId : null,
    titleError ? titleErrorId : null,
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || undefined;
  const projectDescribedBy = projectError ? projectErrorId : undefined;
  const locationDescribedBy = selectedLocation ? locationHintId : undefined;

  const reviewThreadEntries = useMemo(() => {
    const raw = task?.thread;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((entry): entry is TaskReviewThreadEntry => Boolean(entry && typeof entry === "object"))
      .slice()
      .sort((a, b) => {
        const aTime = typeof a.createdAt === "string" ? Date.parse(a.createdAt) : Number.NaN;
        const bTime = typeof b.createdAt === "string" ? Date.parse(b.createdAt) : Number.NaN;
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return -1;
        if (Number.isNaN(bTime)) return 1;
        return aTime - bTime;
      });
  }, [task]);

  const reviewThreadGroups = useMemo(() => {
    const groups = new Map<string, TaskReviewThreadEntry[]>();
    const order: string[] = [];

    reviewThreadEntries.forEach((entry) => {
      const submissionIdRaw = typeof entry.submissionId === "string" ? entry.submissionId.trim() : "";
      const submissionId = submissionIdRaw || "no-submission";
      if (!groups.has(submissionId)) {
        groups.set(submissionId, []);
        order.push(submissionId);
      }
      groups.get(submissionId)?.push(entry);
    });

    return order.map((submissionId) => ({
      submissionId,
      entries: groups.get(submissionId) ?? [],
    }));
  }, [reviewThreadEntries]);

  const formatReviewActionLabel = useCallback((action?: string | null) => {
    const normalized = typeof action === "string" ? action.trim().toLowerCase() : "";
    if (normalized === "submit_for_review") return "Submitted for review";
    if (normalized === "request_changes") return "Requested changes";
    if (normalized === "approve") return "Approved";
    if (normalized === "mark_done") return "Marked done";
    return action?.toString?.() || "Review update";
  }, []);

  const formatReviewEntryTime = useCallback((createdAt?: string | null) => {
    if (typeof createdAt !== "string" || !createdAt.trim()) return "";
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) return createdAt;
    return parsed.toLocaleString();
  }, []);

  const formatReviewEntryActor = useCallback((entry: TaskReviewThreadEntry) => {
    const actorId = typeof entry.createdById === "string" ? entry.createdById.trim() : "";
    if (!actorId) {
      return entry.createdByAdmin ? "Admin" : "System";
    }
    const match = allUsers.find((candidate) => candidate.userId?.trim() === actorId);
    if (match) {
      const full = `${match.firstName?.trim() ?? ""} ${match.lastName?.trim() ?? ""}`.trim();
      return full || match.username?.trim() || match.email?.trim() || match.userId?.trim() || actorId;
    }
    return actorId;
  }, [allUsers]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isBusy) return;
    if (event.touches.length !== 1) return;

    touchStartYRef.current = event.touches[0].clientY;
    isDraggingRef.current = true;
    lastOffsetRef.current = 0;
    setIsDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || touchStartYRef.current === null) return;

    const currentY = event.touches[0].clientY;
    const delta = currentY - touchStartYRef.current;
    const offset = delta > 0 ? delta : 0;
    lastOffsetRef.current = offset;
    setSwipeOffset(offset);
    
    // Always prevent default to avoid scrolling interference when dragging
    if (offset > 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;

    const threshold = 140;
    const shouldClose = lastOffsetRef.current > threshold && !isBusy;

    if (shouldClose) {
      setSwipeOffset(0);
      handleClose();
    } else {
      setSwipeOffset(0);
    }

    isDraggingRef.current = false;
    touchStartYRef.current = null;
    lastOffsetRef.current = 0;
    setIsDragging(false);
  };

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isBusy) {
      handleClose();
    }
  };

  const handleFormBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // If clicked outside of input/textarea/select elements, blur the active element to dismiss keyboard
    if (!target.closest('input, textarea, select, button')) {
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && activeElement.blur) {
        activeElement.blur();
      }
    }
  };

  const handleAddressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setAddressSearch(value);
    setSelectedLocation(null);
    setSuccessMessage(null);
    setErrorMessage(null);
    void fetchAddressSuggestions(value);
  };

  const handleAddressSuggestionSelect = (suggestion: NominatimSuggestion) => {
    if (suggestion.place_id === 'current') {
      // Special case for current location
      if (userLocation && currentLocationAddress) {
        setSelectedLocation(userLocation);
        setAddressSearch(currentLocationAddress);
      }
    } else if (suggestion.place_id === 'default') {
      // Special case for default location
      if (userData?.defaultTaskLocation) {
        const coords = { lat: userData.defaultTaskLocation.lat, lng: userData.defaultTaskLocation.lon };
        setSelectedLocation(coords);
        setAddressSearch(userData.defaultTaskLocation.formattedAddress);
      }
    } else {
      const coords = { lat: parseFloat(suggestion.lat), lng: parseFloat(suggestion.lon) };
      setSelectedLocation(coords);
      setAddressSearch(suggestion.display_name);
    }
    setAddressSuggestions([]);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleSetAsDefault = useCallback(async (suggestion: NominatimSuggestion) => {
    if (!userData) return;
    
    const defaultLocation: SavedLocation = {
      formattedAddress: suggestion.display_name,
      lat: parseFloat(suggestion.lat),
      lon: parseFloat(suggestion.lon),
      placeId: suggestion.place_id.toString(),
    };

    try {
      await updateUserProfile({ ...userData, defaultTaskLocation: defaultLocation });
      setSuccessMessage("Default location updated successfully");
      // Refresh user data to get the updated default location
      await refreshUser(true);
    } catch (error) {
      console.error("Failed to set default location:", error);
      setErrorMessage("Failed to set default location");
    }
  }, [userData, updateUserProfile, refreshUser]);

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleProjectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setProjectId(event.target.value);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleStartDateInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setStartDate(nextValue);
    setSuccessMessage(null);
    setErrorMessage(null);
    setStartDateError(null);
    setTimeRangeError(null);

    if (nextValue && (!dueDate || dueDate < nextValue)) {
      setDueDate(nextValue);
      setDueDateError(null);
    }
  };

  const handleDueDateInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setDueDate(nextValue);
    setSuccessMessage(null);
    setErrorMessage(null);
    setDueDateError(null);
    setTimeRangeError(null);

    if (nextValue && (!startDate || startDate > nextValue)) {
      setStartDate(nextValue);
      setStartDateError(null);
    }
  };

  const handleDueDateFocus = () => {
    setIsDueOpen(true);
  };

  const handleDueDateBlur = () => {
  };

  const handleStartTimeFocus = () => {
    setIsDueOpen(true);
  };

  const handleEndTimeFocus = () => {
    setIsDueOpen(true);
  };

  const toggleDueSection = () => {
    setIsDueOpen(!isDueOpen);
  };

  const handleCalendarIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDueOpen) {
      setIsDueOpen(true);
      // Focus date field after state update
      setTimeout(() => {
        document.getElementById(dueDateFieldId)?.focus();
      }, 100);
    }
  };

  const formatScheduleSummary = (): string => {
    if (!startDate && !dueDate) {
      return "Not scheduled";
    }

    const formatTime = (time: string) => {
      const [hours, minutes] = time.split(":");
      const h = Number.parseInt(hours, 10);
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return `${h12}${minutes !== "00" ? `:${minutes}` : ""} ${ampm}`;
    };

    const startLabelDate = startDate
      ? new Date(`${startDate}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "";
    const endLabelDate = dueDate
      ? new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "";

    const startLabel = startTime
      ? `${startLabelDate} ${formatTime(startTime)}`.trim()
      : startLabelDate;
    const endLabel = endTime ? `${endLabelDate} ${formatTime(endTime)}`.trim() : endLabelDate;

    if (startLabel && endLabel) {
      return `${startLabel} – ${endLabel}`;
    }
    return startLabel || endLabel || "Not scheduled";
  };

  const formatDueSummary = (): string => {
    return formatScheduleSummary();
    if (!dueDate && !startTime && !endTime) {
      return "Not scheduled";
    }

    const parts: string[] = [];

    // Format date
    if (dueDate) {
      const dateObj = new Date(dueDate + "T00:00:00");
      if (!isNaN(dateObj.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dueDateObj = new Date(dueDate + "T00:00:00");
        dueDateObj.setHours(0, 0, 0, 0);

        if (dueDateObj.getTime() === today.getTime()) {
          parts.push("Today");
        } else if (dueDateObj.getTime() === tomorrow.getTime()) {
          parts.push("Tomorrow");
        } else {
          parts.push(dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
        }
      }
    }

    // Format time range
    if (startTime && endTime) {
      const formatTime = (time: string) => {
        const [hours, minutes] = time.split(":");
        const h = parseInt(hours, 10);
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        return `${h12}${minutes !== "00" ? ":" + minutes : ""} ${ampm}`;
      };
      parts.push(`${formatTime(startTime)}–${formatTime(endTime)}`);
    } else if (startTime) {
      const formatTime = (time: string) => {
        const [hours, minutes] = time.split(":");
        const h = parseInt(hours, 10);
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        return `${h12}${minutes !== "00" ? ":" + minutes : ""} ${ampm}`;
      };
      parts.push(formatTime(startTime));
    }

    return parts.join(" · ") || "Not scheduled";
  };

  const handleDueDateQuickSelect = (value: string) => {
    setDueDate(value);
    if (!startDate || startDate > value) {
      setStartDate(value);
      setStartDateError(null);
    }
    setSuccessMessage(null);
    setErrorMessage(null);
    setDueDateError(null);
    setTimeRangeError(null);
    // Keep section open so user can set time immediately
    setIsDueOpen(true);
    // Focus start time field for smooth continuation
    requestAnimationFrame(() => {
      const startTimeField = document.getElementById(startTimeFieldId) as HTMLInputElement;
      startTimeField?.focus();
    });
  };

  const handleStartTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setStartTime(nextValue);
    setSuccessMessage(null);
    setErrorMessage(null);
    setTimeRangeError(null);

    if (!nextValue) {
      return;
    }

    const parsedStart = parseSimpleTime(nextValue);
    if (!parsedStart) {
      return;
    }

    if (dueDate === startDate) {
      setEndTime(addMinutesToTimeString(nextValue, durationMinutes));
    }
  };

  const handleEndTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setEndTime(nextValue);
    setSuccessMessage(null);
    setErrorMessage(null);
    setTimeRangeError(null);

    const nextDuration = computeDurationMinutes(startTime, nextValue);
    if (nextDuration !== null) {
      setDurationMinutes(nextDuration);
    }
  };

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(event.target.value);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleAttachmentInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files ? Array.from(event.target.files) : [];
    if (!fileList.length) return;

    setSuccessMessage(null);
    setErrorMessage(null);

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const created: TaskNoteAttachment[] = [];

    for (const file of fileList) {
      // Validate file type
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImage = file.type.startsWith('image/');
      
      if (!isPdf && !isImage) {
        setErrorMessage("Only images and PDF files can be attached.");
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage(`${file.name} is too large. Maximum size is 10MB.`);
        continue;
      }

      try {
        // Upload to S3 and get CloudFront URL
        const uploadedUrl = await uploadFile(file);
        created.push({
          id: generateAttachmentId(),
          fileName: file.name || "Attachment",
          mimeType: file.type || undefined,
          url: uploadedUrl, // Store URL instead of dataUrl
          uploadedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to upload attachment", error);
        setErrorMessage(`Failed to upload ${file.name}. Please try again.`);
      }
    }

    if (created.length) {
      setNoteAttachments((prev) => [...prev, ...created]);
    }

    event.target.value = "";
  };

  // Add drag-and-drop for attachments
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;

    setSuccessMessage(null);
    setErrorMessage(null);

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const created: TaskNoteAttachment[] = [];

    for (const file of files) {
      // Validate file type
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImage = file.type.startsWith('image/');
      
      if (!isPdf && !isImage) {
        setErrorMessage("Only images and PDF files can be attached.");
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage(`${file.name} is too large. Maximum size is 10MB.`);
        continue;
      }

      try {
        // Upload to S3 and get CloudFront URL
        const uploadedUrl = await uploadFile(file);
        created.push({
          id: generateAttachmentId(),
          fileName: file.name || "Attachment",
          mimeType: file.type || undefined,
          url: uploadedUrl, // Store URL instead of dataUrl
          uploadedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to upload attachment", error);
        setErrorMessage(`Failed to upload ${file.name}. Please try again.`);
      }
    }

    if (created.length) {
      setNoteAttachments((prev) => [...prev, ...created]);
    }
  }, []);

  const handleProjectFilesSelected = useCallback((files: FileItem[]) => {
    if (!files.length) return;

    setSuccessMessage(null);
    setErrorMessage(null);

    const attachments: TaskNoteAttachment[] = [];
    let invalidFiles = false;

    files.forEach((file) => {
      if (!file.url) return;
      const extension = getFileExtension(file.fileName || "");
      if (!TASK_ATTACHMENT_EXTENSIONS.has(extension)) {
        invalidFiles = true;
        return;
      }
      attachments.push({
        id: generateAttachmentId(),
        fileName: file.fileName || "Attachment",
        mimeType: guessMimeTypeFromExtension(extension),
        url: file.url,
      });
    });

    if (invalidFiles) {
      setErrorMessage("Only images and PDF files can be attached.");
    }

    if (!attachments.length) return;

    setNoteAttachments((prev) => {
      const existingUrls = new Set(prev.map((attachment) => attachment.url));
      const toAdd = attachments.filter((attachment) => !existingUrls.has(attachment.url));
      return toAdd.length ? [...prev, ...toAdd] : prev;
    });
  }, []);

  const canBrowseProjectFiles = Boolean(projectId && activeProject?.projectId === projectId);

  const handleOpenProjectFiles = useCallback(() => {
    if (!projectId) {
      notify("warning", "Select a project before browsing its files.");
      return;
    }
    if (!activeProject || activeProject.projectId !== projectId) {
      notify("warning", "Set this project as active to access its files.");
      return;
    }
    fileManagerRef.current?.open();
  }, [projectId, activeProject]);

  const [attachmentPopoverOpen, setAttachmentPopoverOpen] = useState(false);

  const closeAttachmentPopover = useCallback(() => {
    setAttachmentPopoverOpen(false);
  }, []);

  useEffect(() => {
    if (!attachmentPopoverOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (attachmentPopoverRef.current?.contains(target)) return;
      if (attachmentPopoverButtonRef.current?.contains(target)) return;
      setAttachmentPopoverOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [attachmentPopoverOpen]);

  useEffect(() => {
    if (!open) {
      closeAttachmentPopover();
    }
  }, [open, closeAttachmentPopover]);

  const handleUploadFromComputer = () => {
    attachmentInputRef.current?.click();
    closeAttachmentPopover();
  };

  const handleProjectFilesOption = () => {
    if (!canBrowseProjectFiles) return;
    handleOpenProjectFiles();
    closeAttachmentPopover();
  };

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setNoteAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
    setSuccessMessage(null);
    setErrorMessage(null);
  }, []);

  const handleAttachmentClick = useCallback((index: number, event: React.MouseEvent) => {
    event.stopPropagation();

    if ((event.target as HTMLElement).closest("button, a")) {
      return;
    }

    const attachment = noteAttachments[index];
    if (!attachment || !attachment.url) return;

    const mimeType = (attachment.mimeType || "").toLowerCase();
    const extension = attachment.fileName.split(".").pop()?.toLowerCase() || "";
    const previewableImageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg"];
    const isImage = mimeType.startsWith("image/") || previewableImageExtensions.includes(extension);
    const isPdf = mimeType === "application/pdf" || extension === "pdf";

    if (!isImage && !isPdf) return;

    setSelectedAttachmentIndex(index);
    setPreviewOpen(true);
  }, [noteAttachments]);

  const handleClosePreview = useCallback(() => {
    setPreviewOpen(false);
    setSelectedAttachmentIndex(null);
  }, []);

  useEffect(() => {
    if (selectedAttachmentIndex === null) return;
    if (selectedAttachmentIndex < noteAttachments.length) return;
    handleClosePreview();
  }, [selectedAttachmentIndex, noteAttachments.length, handleClosePreview]);

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(event.target.value as TaskStatus);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!effectiveProjectId) {
      const errorMsg = "Add a project before creating tasks.";
      setProjectError(errorMsg);
      setErrorMessage(null);
      notify("error", errorMsg);
      return;
    }

    if (!trimmedTitle) {
      const errorMsg = "Give the task a name before saving.";
      setTitleError(errorMsg);
      setErrorMessage(null);
      notify("error", errorMsg);
      titleInputRef.current?.focus();
      return;
    }

    if (!startDate) {
      const errorMsg = "Add a start date before saving.";
      setStartDateError(errorMsg);
      setErrorMessage(null);
      notify("error", errorMsg);
      document.getElementById(startDateFieldId)?.focus();
      return;
    }

    if (!dueDate) {
      const errorMsg = "Add an end date before saving.";
      setDueDateError(errorMsg);
      setErrorMessage(null);
      notify("error", errorMsg);
      return;
    }

    const startTimeValue = startTime.trim();
    const endTimeValue = endTime.trim();
    if (startTimeValue || endTimeValue) {
      if (!startTimeValue || !endTimeValue) {
        const errorMsg = "Add both a start time and end time.";
        setTimeRangeError(errorMsg);
        setErrorMessage(null);
        notify("error", errorMsg);
        return;
      }

      const startDateTime = new Date(`${startDate}T${startTimeValue}:00`);
      const endDateTime = new Date(`${dueDate}T${endTimeValue}:00`);
      if (
        Number.isNaN(startDateTime.getTime()) ||
        Number.isNaN(endDateTime.getTime()) ||
        endDateTime.getTime() <= startDateTime.getTime()
      ) {
        const errorMsg = "End date/time must be after start date/time.";
        setTimeRangeError(errorMsg);
        setErrorMessage(null);
        notify("error", errorMsg);
        return;
      }
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTimeRangeError(null);
    const eventType: QuickCreateTaskModalEventType = isEditing ? "update" : "create";
    const normalizedStatusForPayload = PATCHABLE_STATUSES.includes(status) ? status : undefined;
    const statusForPayload = !isEditing
      ? normalizedStatusForPayload === "in_progress"
        ? normalizedStatusForPayload
        : undefined
      : normalizedStatusForPayload;

    const startAtIso = startTimeValue ? `${startDate}T${startTimeValue}:00` : undefined;
    const endAtIso = endTimeValue ? `${dueDate}T${endTimeValue}:00` : undefined;
    const dueDateIso = endAtIso ?? (dueDate || undefined);

    try {
      const trimmedAddress = addressSearch.trim();
      const locationPayload = selectedLocation
        ? { lat: selectedLocation.lat, lng: selectedLocation.lng }
        : undefined;

      const resolvedProjectId =
        effectiveProjectId ||
        initialTaskRef.current?.projectId ||
        projectId ||
        scopedProjectId ||
        task?.projectId ||
        "";

      if (!resolvedProjectId) {
        const errorMsg = "Add a project before saving this task.";
        setProjectError(errorMsg);
        setErrorMessage(null);
        setSubmitting(false);
        notify("error", errorMsg);
        return;
      }

      const payload: Task = {
        projectId: resolvedProjectId,
        title: formattedTitle,
        description: description.trim() || undefined,
        dueDate: dueDateIso,
        ...(startAtIso
          ? { startAt: startAtIso }
          : isEditing && initialTaskRef.current?.startAt != null && initialTaskRef.current?.startAt !== ""
            ? { startAt: null }
            : {}),
        ...(endAtIso
          ? { endAt: endAtIso }
          : isEditing && initialTaskRef.current?.endAt != null && initialTaskRef.current?.endAt !== ""
            ? { endAt: null }
            : {}),
        ...(statusForPayload ? { status: statusForPayload as 'todo' | 'in_progress' | 'done' } : {}),
        ...(trimmedAddress ? { address: trimmedAddress } : {}),
        ...(locationPayload ? { location: locationPayload } : {}),
      };

      const trimmedAssigneeTokens = assigneeTokens.map((token) => token.trim()).filter(Boolean);

      if (trimmedAssigneeTokens.length) {
        const assigneeUserIds = Array.from(
          new Set(
            trimmedAssigneeTokens
              .map((token) => extractAssigneeUserId(token))
              .filter((id): id is string => Boolean(id)),
          ),
        );
        const missingUserIds = assigneeUserIds.filter((id) => !projectTeamUserIdSet.has(id));
        if (missingUserIds.length && resolvedProjectId) {
          await Promise.all(
            missingUserIds.map((uid) =>
              apiFetch(
                `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(resolvedProjectId)}/team`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId: uid }),
                },
              ),
            ),
          );
        }

        payload.assigneeTokens = trimmedAssigneeTokens;
        payload.assigneeIds = trimmedAssigneeTokens;
        payload.assigneeId = trimmedAssigneeTokens[0];
      } else if (isEditing) {
        payload.assigneeId = "";
        payload.assigneeIds = [];
        payload.assigneeTokens = [];
      }

      if (noteAttachments.length) {
        payload.noteAttachments = noteAttachments;
      } else if (isEditing) {
        payload.noteAttachments = [];
      }


      const resolvedTaskId =
        taskId ??
        initialTaskRef.current?.taskId?.trim() ??
        initialTaskRef.current?.id?.trim() ??
        (task?.taskId?.trim() || task?.id?.trim() || null);

      if (isEditing && resolvedTaskId) {
        await updateTask({ ...payload, projectId: resolvedProjectId, taskId: resolvedTaskId });
        const savedAttachmentsSnapshot = noteAttachments.map((attachment) => ({ ...attachment }));
        const nextAssigneeTokens = [...trimmedAssigneeTokens];
        initialTaskRef.current = {
          ...(initialTaskRef.current ?? { projectId: resolvedProjectId }),
          projectId: resolvedProjectId,
          title: formattedTitle,
          description: description.trim(),
          dueDate: dueDateIso ?? "",
          startAt: startAtIso ?? null,
          endAt: endAtIso ?? null,
          status: normalizeStatus(status),
          assigneeTokens: parseAssigneeTokensInput(nextAssigneeTokens.length ? nextAssigneeTokens : []).sort(),
          assigneeIds: nextAssigneeTokens.length ? nextAssigneeTokens : [],
          assigneeId: nextAssigneeTokens.length ? nextAssigneeTokens[0] : null,
          address: trimmedAddress,
          location: normalizeLocation(locationPayload ? { ...locationPayload } : null),
          noteAttachments: sanitizeIncomingAttachments(savedAttachmentsSnapshot),
        };
        setSuccessMessage("Task updated. Changes saved.");
        onUpdated?.();
      } else {
        await createTask(payload);
        setSuccessMessage("Task created. You'll see it in your lists shortly.");
        setTitle("");
        setDescription("");
        setStartDate("");
        setDueDate("");
        setStartTime(DEFAULT_TASK_START_TIME);
        setEndTime(DEFAULT_TASK_END_TIME);
        setDurationMinutes(DEFAULT_TASK_DURATION_MINUTES);
        setAddressSearch("");
        setAddressSuggestions([]);
        setSelectedLocation(null);
        setAssigneeTokens([]);
        setNoteAttachments([]);
        setStatus("todo");
        setTitleError(null);
        setProjectError(null);
        setStartDateError(null);
        requestAnimationFrame(() => {
          titleInputRef.current?.focus({ preventScroll: true });
        });
      }

      onCreated({ type: eventType });
    } catch (error) {
      console.error("Failed to save task", error);
      setErrorMessage(
        isEditing
          ? "We couldn't update that task. Please try again."
          : "We couldn't create that task. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!taskId || !effectiveProjectId) {
      return;
    }

    setDeleting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteTask({ projectId: effectiveProjectId, taskId });
      onDeleted?.();
      onCreated({ type: "delete" });
      onClose();
    } catch (error) {
      console.error("Failed to delete task", error);
      setErrorMessage("We couldn't delete that task. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!taskId || !effectiveProjectId) {
      setErrorMessage("We couldn't find that task or its project.");
      return;
    }

    setArchiving(true);
    try {
      if (status === "archived") {
        await unarchiveTask(effectiveProjectId, taskId);
        const message = "Task unarchived and marked as completed.";
        setSuccessMessage(message);
        setErrorMessage(null);
        notify("success", message);
      } else {
        await archiveTask(effectiveProjectId, taskId);
        const message = "Task archived. You can find it under ‘Archived’ if needed.";
        setSuccessMessage(message);
        setErrorMessage(null);
        notify("success", message);
      }
      await onUpdated?.();
    } catch (error) {
      console.error("Failed to update archive status", error);
      setErrorMessage("We couldn't update the task. Please try again.");
      notify("error", "Failed to update the task status.");
    } finally {
      setArchiving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!taskId || !effectiveProjectId) return;
    if (isBusy) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await requestTaskReview(effectiveProjectId, taskId, { note: "" });
      notify("success", "Task submitted for review!");
      await onUpdated?.();
      onClose();
    } catch (error) {
      console.error("Failed to submit task for review", error);
      const apiError = error as { status?: number };
      if (apiError?.status === 403) {
        notify("error", "You don't have permission to submit this task for review.");
      } else if (apiError?.status === 409) {
        notify("error", "Task is not in the correct state for review.");
      } else {
        notify("error", "Failed to submit task for review. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveReview = async () => {
    if (!taskId || !effectiveProjectId) return;
    if (isBusy) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (!isAwaitingApproval) {
        await requestTaskReview(effectiveProjectId, taskId, { note: "" });
      }
      await approveTaskReview(effectiveProjectId, taskId, { note: "" });
      notify("success", "Task approved!");
      await onUpdated?.();
      onClose();
    } catch (error) {
      console.error("Failed to approve task", error);
      const apiError = error as { status?: number };
      if (apiError?.status === 403) {
        notify("error", "Only admins can approve tasks.");
      } else if (apiError?.status === 409) {
        notify("error", "Task is not in the correct state for approval.");
      } else {
        notify("error", "Failed to approve task. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDone = async () => {
    if (!taskId || !effectiveProjectId) return;
    if (isBusy) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await approveTask(effectiveProjectId, taskId, { note: "" });
      notify("success", "Task marked as done!");
      await onUpdated?.();
      onClose();
    } catch (error) {
      console.error("Failed to mark task as done", error);
      const apiError = error as { status?: number };
      if (apiError?.status === 403) {
        notify("error", "Only admins can mark tasks as done.");
      } else if (apiError?.status === 409) {
        notify("error", "Task is not in the correct state for completion.");
      } else {
        notify("error", "Failed to mark task as done. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!taskId || !effectiveProjectId) return;
    if (isBusy) return;

    const notePrompt = window.prompt(
      "Enter a short note explaining what needs to change before requesting it.",
      "Please adjust the scope to ...",
    );
    if (notePrompt === null) {
      return;
    }
    const trimmedNote = notePrompt.trim();
    if (!trimmedNote) {
      notify("error", "A note is required when requesting changes.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await requestTaskChanges(effectiveProjectId, taskId, { note: trimmedNote });
      notify("success", "Changes requested for this task.");
      await onUpdated?.();
      onClose();
    } catch (error) {
      console.error("Failed to request changes", error);
      const apiError = error as { status?: number };
      if (apiError?.status === 403) {
        notify("error", "You don't have permission to request changes.");
      } else if (apiError?.status === 409) {
        notify("error", "Task is not in the correct state to request changes.");
      } else {
        notify("error", "Failed to request changes. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const previewAttachment =
    selectedAttachmentIndex !== null ? noteAttachments[selectedAttachmentIndex] : null;

  const previewModal = (
    <AttachmentPreviewModal
      attachment={previewAttachment}
      isOpen={previewOpen}
      onRequestClose={handleClosePreview}
    />
  );
  const projectFilesPicker = (
    <FileManagerComponent
      ref={fileManagerRef}
      showTrigger={false}
      selectionMode="multi"
      fileTypeFilter="all"
      onFileSelect={handleProjectFilesSelected}
    />
  );

  if (!open) {

    if (!previewOpen) return null;

    return previewModal;

  }



  const modalContent = (
    <div
      ref={modalRef}
      className={`${embedMode ? styles.embedModal : styles.createModal} ${isDragging ? styles.createModalDragging : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-task-title"
      aria-describedby={descriptionId}
      tabIndex={-1}
      onMouseDown={embedMode ? undefined : (event) => event.stopPropagation()}
      style={swipeOffset ? { transform: `translateY(${swipeOffset}px)` } : undefined}
    >
      {!embedMode && (
        <div 
          className={styles.grabZone}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div className={styles.grabHandle} />
        </div>
      )}
        <form
          ref={formRef}
          className={styles.createForm}
          onSubmit={handleSubmit}
          aria-describedby={feedbackRegionId}
          noValidate
        >
          <div className={styles.formBody} onClick={handleFormBodyClick}>
            <div className={styles.createHeader}>
              <div>
                <h2 id="quick-task-title">{modalTitle}</h2>
                <p id={descriptionId} className={styles.createDescription}>
                  {modalDescription}
                </p>
              </div>
              {embedMode && (
                <button
                  type="button"
                  onClick={handleClose}
                  className={styles.embedCloseButton}
                  aria-label="Close task details"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </div>
            {showProjectSelect ? (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor={projectFieldId}>
                  <span className={styles.fieldLabelText}>Project</span>
                </label>
                <select
                  id={projectFieldId}
                  aria-label="Project"
                  className={styles.selectInput}
                  value={projectId}
                  onChange={handleProjectChange}
                  disabled={!hasProjects || isBusy}
                  aria-describedby={projectDescribedBy}
                >
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {projectError ? (
                  <p id={projectErrorId} className={styles.fieldError} aria-live="polite">
                    {projectError}
                  </p>
                ) : null}
              </div>
            ) : null}
            {!hasProjects && !scopedProjectId ? (
              <p className={styles.helperText}>Add a project to start creating tasks.</p>
            ) : null}
            {isEditing && (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldHeader}>
                <label className={styles.fieldLabel}>
                  <span className={styles.fieldLabelText}>Status</span>
                </label>
                {isEditing && (
                  <span
                    className={`${styles.StatusBadge} ${styles[`StatusBadge${statusTone.charAt(0).toUpperCase() + statusTone.slice(1)}`]}`}
                  >
                    {statusBadgeData.label}
                  </span>
                )}
              </div>
              
              {isEditing ? (
                <>

                  {!hasAnyStatusAction && isStatusLocked && (
                    <p className={styles.helperText}>
                      Status changes to {formatStatusLabel(status)} happen in the task view.
                    </p>
                  )}

                  {PATCHABLE_STATUSES.includes(status) && (
                    <>
                      <label htmlFor={statusFieldId} className={styles.statusDropdownLabel}>
                        Or manually change to:
                      </label>
                      <select
                        id={statusFieldId}
                        aria-label="Task status"
                        className={styles.selectInput}
                        value={status}
                        onChange={handleStatusChange}
                        disabled={isBusy}
                      >
                        {STATUS_SELECT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              ) : (
                <select
                  id={statusFieldId}
                  aria-label="Task status"
                  className={styles.selectInput}
                  value={status}
                  onChange={handleStatusChange}
                  disabled={isBusy}
                >
                  {STATUS_SELECT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            )}
            {isEditing && (createdByName || createdById) ? (
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <span className={styles.fieldLabelText}>Created by</span>
                </div>
                <div className={styles.creatorDisplay}>
                  {createdByThumbnail ? (
                    <img
                      src={getFileUrl(createdByThumbnail)}
                      alt={createdByName || "Creator"}
                      className={styles.creatorAvatar}
                    />
                  ) : (
                    <div className={styles.creatorAvatar}>
                      {(createdByName || createdByUsername || createdByEmail || createdById || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <span className={styles.creatorName}>
                    {createdByName || createdByUsername || createdByEmail || createdById || "Unknown"}
                  </span>
                </div>
              </div>
            ) : null}
            <div className={styles.fieldGroup}>
              <div className={`${styles.fieldHeader} ${styles.assigneeLabelRow}`}>
                <div className={styles.fieldLabel} id={`${assigneeFieldId}-label`}>
                  <span className={styles.fieldLabelText}>Assignees</span>
                </div>
                <div className={styles.assigneeLabelActions}>
                  {assigneeTokens.length > 0 && (
                    <span className={styles.assigneeCountBadge}>Assignees · {assigneeTokens.length}</span>
                  )}
                  {(canAssignToSelf || assigneeTokens.length > 0) && (
                    <div className={styles.assigneeQuickActions}>
                      {canAssignToSelf && (
                        <button type="button" className={styles.assigneeActionButton} onClick={handleAssignToMe}>
                          Assign to me
                        </button>
                      )}
                      {assigneeTokens.length > 0 && (
                        <button type="button" className={styles.assigneeActionButton} onClick={handleClearAssignees}>
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.assigneeSelector}>
                <div
                  ref={assigneeFieldRef}
                  className={`${styles.assigneeField} ${assigneeTokens.length ? styles.assigneeFieldActive : ""}`}
                  tabIndex={0}
                  role="combobox"
                  id={assigneeFieldId}
                  aria-haspopup="listbox"
                  aria-expanded={assigneePopoverOpen}
                  aria-labelledby={`${assigneeFieldId}-label`}
                  aria-controls={assigneePopoverOpen ? assigneePopoverId : undefined}
                  aria-activedescendant={
                    assigneePopoverOpen && focusedAssigneeIndex >= 0
                      ? `${assigneePopoverId}-option-${focusedAssigneeIndex}`
                      : undefined
                  }
                  onKeyDown={handleAssigneeFieldKeyDown}
                  onClick={handleAssigneeFieldClick}
                >
                  <div className={styles.assigneeChips}>
                    {visibleAssignees.map((assignee) => (
                      <div key={assignee.value} className={styles.assigneeChip}>
                        <span className={styles.assigneeChipAvatar}>
                          {assignee.avatar ? (
                            <img src={assignee.avatar} alt="" aria-hidden="true" />
                          ) : (
                            assignee.label.slice(0, 1)
                          )}
                        </span>
                        <span className={styles.assigneeChipLabel}>{assignee.label}</span>
                        <button
                          type="button"
                          className={styles.assigneeChipRemove}
                          aria-label={`Remove ${assignee.label}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleAssignee(assignee.value);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {remainingAssigneeCount > 0 && (
                      <button
                        type="button"
                        className={styles.assigneeOverflowChip}
                        aria-label={`Show ${remainingAssigneeCount} more assignees`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openAssigneePopover();
                        }}
                      >
                        +{remainingAssigneeCount}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.assigneeGhostChip}
                      onClick={(event) => {
                        event.stopPropagation();
                        openAssigneePopover();
                      }}
                    >
                      {assigneeTokens.length ? "+ Add" : "+ Add assignee"}
                    </button>
                  </div>
                </div>
                {assigneePopoverOpen ? (
                  <div
                    ref={assigneePopoverRef}
                    className={styles.assigneePopover}
                    id={assigneePopoverId}
                    role="listbox"
                    aria-multiselectable="true"
                    onKeyDown={handleAssigneeKeyDown}
                  >
                    <div className={styles.assigneePopoverHeader}>
                      <div className={styles.assigneeSearchWrapper}>
                        <input
                          ref={assigneeSearchRef}
                          type="text"
                          className={styles.assigneeSearch}
                          placeholder="Search people…"
                          value={assigneeSearch}
                          onChange={(e) => setAssigneeSearch(e.target.value)}
                        />
                      </div>
                      <div className={styles.assigneePopoverMeta}>
                        {assigneeTokens.length > 0 && (
                          <span className={styles.assigneeSelectedCount}>
                            {assigneeTokens.length} selected
                          </span>
                        )}
                        <button type="button" className={styles.assigneeCloseButton} onClick={closeAssigneePopover}>
                          Close
                        </button>
                      </div>
                    </div>
                    <div className={styles.assigneeList}>
                      {sortedAssigneeOptions.map((option, index) => (
                        <button
                          type="button"
                          key={option.value}
                          id={`${assigneePopoverId}-option-${index}`}
                          role="option"
                          aria-selected={assigneeTokens.includes(option.value)}
                          className={`${styles.assigneeOption} ${
                            assigneeTokens.includes(option.value) ? styles.assigneeOptionSelected : ""
                          } ${focusedAssigneeIndex === index ? styles.focused : ""}`}
                          onClick={() => toggleAssignee(option.value)}
                        >
                          <input
                            type="checkbox"
                            checked={assigneeTokens.includes(option.value)}
                            readOnly
                            tabIndex={-1}
                          />
                          <span className={styles.assigneeOptionAvatar}>
                            {option.avatar ? (
                              <img src={option.avatar} alt="" aria-hidden="true" />
                            ) : (
                              option.label.slice(0, 1)
                            )}
                          </span>
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {assigneeTokens.length === 0 ? (
                <p className={styles.helperText}>Assign someone so it doesn't fall through the cracks.</p>
              ) : null}
            </div>
            {!hasCollaborators && collaboratorOptions.length === 0 ? (
              <p className={styles.helperText}>Invite collaborators to assign tasks.</p>
            ) : null}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={taskNameFieldId}>
                <span className={styles.fieldLabelText}>Task name</span>
              </label>
              <input
                id={taskNameFieldId}
                aria-label="Task name"
                type="text"
                className={styles.textInput}
                value={title}
                onChange={handleTitleChange}
                placeholder="What needs to get done?"
                disabled={isBusy}
                ref={titleInputRef}
                aria-describedby={taskNameDescribedBy}
              />
              {showTitleCounter ? (
                <span id={titleCounterId} className={styles.fieldMeta}>
                  {titleRemaining >= 0
                    ? `${titleRemaining} characters remaining`
                    : `${Math.abs(titleRemaining)} characters over recommended length`}
                </span>
              ) : null}
              {titleError ? (
                <p id={titleErrorId} className={styles.fieldError} aria-live="polite">
                  {titleError}
                </p>
              ) : null}
            </div>
            <div className={styles.fieldGroup}>
              <div className={styles.notesContainer}>
                <textarea
                  id={notesFieldId}
                  aria-label="Assignment"
                  className={styles.textarea}
                  value={description}
                  onChange={handleDescriptionChange}
                  placeholder="Assignment"
                  disabled={isBusy}
                  rows={4}
                  ref={notesRef}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
                {noteAttachments.length > 0 && (
                  <div className={styles.attachmentChips}>
                    {noteAttachments.map((attachment, index) => {
                      const isPdf = attachment.mimeType === 'application/pdf' || 
                                    attachment.fileName.toLowerCase().endsWith('.pdf');
                      
                      return (
                        <div 
                          key={attachment.id} 
                          className={styles.attachmentChip}
                          onClick={(e) => handleAttachmentClick(index, e)}
                          style={{ cursor: 'pointer' }}
                        >
                          {isPdf ? (
                            <FileText size={16} style={{ flexShrink: 0, color: 'var(--muted, #9aa0a6)' }} />
                          ) : (
                            <img src={attachment.url} alt={attachment.fileName} className={styles.chipPreview} />
                          )}
                          <span>{attachment.fileName}</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAttachment(attachment.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className={styles.attachmentButtonOverlay}>
                  <button
                    type="button"
                    ref={attachmentPopoverButtonRef}
                    className={styles.attachmentIconButton}
                    onClick={(event) => {
                      event.preventDefault();
                      setAttachmentPopoverOpen((current) => !current);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={attachmentPopoverOpen}
                    disabled={isBusy}
                  >
                    <Upload className={styles.attachmentIcon} size={16} aria-hidden="true" />
                  </button>
                  {attachmentPopoverOpen && (
                    <div className={styles.attachmentPopover} ref={attachmentPopoverRef} role="menu">
                      <button
                        type="button"
                        className={styles.attachmentPopoverItem}
                        onClick={handleUploadFromComputer}
                      >
                        Upload from computer
                      </button>
                      <button
                        type="button"
                        className={styles.attachmentPopoverItem}
                        onClick={handleProjectFilesOption}
                        disabled={!canBrowseProjectFiles}
                      >
                        <span className={styles.attachmentPopoverItemIcon}>
                          <Folder size={14} aria-hidden="true" />
                        </span>
                        Choose from project files
                      </button>
                    </div>
                  )}
                  <input
                    id={attachmentsFieldId}
                    className={styles.fileInput}
                    ref={attachmentInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    onChange={handleAttachmentInputChange}
                    disabled={isBusy}
                  />
                </div>
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <div className={styles.fieldHeader}>
                <label className={styles.fieldLabel} htmlFor={locationFieldId}>
                  <span className={styles.fieldLabelText}>Location</span>
                </label>
                <span className={styles.fieldOptional}>Optional</span>
              </div>
              <div className={styles.locationInputWrapper}>
                <input
                  ref={locationInputRef}
                  id={locationFieldId}
                  aria-label="Task location"
                  type="text"
                  className={`${styles.textInput} ${selectedLocation ? styles.textInputWithCoords : ''}`}
                  value={addressSearch}
                  onChange={handleAddressChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && addressSuggestions.length > 0) {
                      setAddressSuggestions([]);
                      e.preventDefault();
                    }
                  }}
                  placeholder="Search for an address or venue"
                  disabled={isBusy}
                  aria-autocomplete="list"
                  aria-expanded={addressSuggestions.length > 0}
                  aria-controls={addressSuggestions.length > 0 ? suggestionsListId : undefined}
                  aria-describedby={locationDescribedBy}
                />
                {selectedLocation ? (
                  <span id={locationHintId} className={styles.coordinatesDisplay}>
                    {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
                  </span>
                ) : null}
                {addressSuggestions.length > 0 ? (
                  <div ref={locationSuggestionsRef} className={styles.locationSuggestions} role="listbox" id={suggestionsListId}>
                    {addressSuggestions.map((suggestion) => (
                      <div key={suggestion.place_id} className={styles.locationSuggestionItem}>
                        <button
                          type="button"
                          className={styles.locationSuggestionButton}
                          role="option"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleAddressSuggestionSelect(suggestion)}
                        >
                          {suggestion.display_name}
                        </button>
                      </div>
                    ))}
                    {showWorldwideLink ? (
                      <button
                        type="button"
                        className={styles.worldwideLink}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => fetchGlobalAddressSuggestions(addressSearch)}
                      >
                        Search worldwide
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {!selectedLocation && userData?.defaultTaskLocation ? (
                <span
                  className={styles.defaultLocationLink}
                  onClick={() => {
                    const coords = { lat: userData.defaultTaskLocation!.lat, lng: userData.defaultTaskLocation!.lon };
                    setSelectedLocation(coords);
                    setAddressSearch(userData.defaultTaskLocation!.formattedAddress);
                  }}
                  title={userData.defaultTaskLocation.formattedAddress}
                >
                  Use default location
                </span>
              ) : selectedLocation && (!userData?.defaultTaskLocation || selectedLocation.lat !== userData.defaultTaskLocation.lat || selectedLocation.lng !== userData.defaultTaskLocation.lon) ? (
                <span
                  className={styles.defaultLocationLink}
                  onClick={() => {
                    const suggestion: NominatimSuggestion = {
                      place_id: 'selected',
                      display_name: addressSearch,
                      lat: selectedLocation.lat.toString(),
                      lon: selectedLocation.lng.toString(),
                    };
                    handleSetAsDefault(suggestion);
                  }}
                >
                  Set as default
                </span>
              ) : null}
            </div>
            <div className={styles.fieldGroup}>
              {/* Collapsible Due DateTime Section */}
              <div 
                className={styles.collapsibleHeader}
                onClick={toggleDueSection}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleDueSection();
                  }
                }}
                aria-expanded={isDueOpen}
                aria-controls="due-datetime-content"
              >
                <div className={styles.collapsibleHeaderLeft}>
                  <span className={styles.fieldLabelText}>Schedule</span>
                  {!isDueOpen && <span className={styles.collapsibleSummary}>{formatDueSummary()}</span>}
                </div>
                <button
                  type="button"
                  className={styles.calendarIconButton}
                  onClick={handleCalendarIconClick}
                  aria-label="Open date picker"
                  tabIndex={-1}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M2 6h12" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
                <svg
                  className={`${styles.chevronIcon} ${isDueOpen ? styles.chevronOpen : ''}`}
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M4 6L8 10L12 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              
              {isDueOpen && (
                <div id="due-datetime-content" className={styles.collapsibleContent}>
                  {showQuickDateChips && (
                    <div className={styles.scheduleQuickRow}>
                      <div
                        className={styles.quickChipsSmall}
                        role="group"
                        aria-label="Quick date shortcuts"
                      >
                        <button
                          type="button"
                          className={`${styles.quickChip} ${dueDate === todayValue ? styles.quickChipActive : ""}`}
                          onClick={() => handleDueDateQuickSelect(todayValue)}
                          disabled={isBusy}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          className={`${styles.quickChip} ${dueDate === tomorrowValue ? styles.quickChipActive : ""}`}
                          onClick={() => handleDueDateQuickSelect(tomorrowValue)}
                          disabled={isBusy}
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          className={`${styles.quickChip} ${dueDate === nextWeekValue ? styles.quickChipActive : ""}`}
                          onClick={() => handleDueDateQuickSelect(nextWeekValue)}
                          disabled={isBusy}
                        >
                          +7
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={styles.scheduleGrid}>
                    <div className={styles.scheduleColumn}>
                      <div className={styles.fieldHeader}>
                        <label className={styles.fieldLabel} htmlFor={startDateFieldId}>
                          <span className={styles.fieldLabelText}>Start date</span>
                        </label>
                      </div>
                      <input
                        id={startDateFieldId}
                        aria-label="Task start date"
                        type="date"
                        className={styles.textInput}
                        value={startDate}
                        onChange={handleStartDateInputChange}
                        onFocus={handleDueDateFocus}
                        onBlur={handleDueDateBlur}
                        disabled={isBusy}
                        aria-describedby={startDateError ? startDateErrorId : undefined}
                      />
                      {startDateError ? (
                        <p id={startDateErrorId} className={styles.fieldError} aria-live="polite">
                          {startDateError}
                        </p>
                      ) : null}

                      <div className={styles.fieldHeader}>
                        <label className={styles.fieldLabel} htmlFor={startTimeFieldId}>
                          <span className={styles.fieldLabelText}>Start time</span>
                        </label>
                        <span className={styles.fieldOptional}>Optional</span>
                      </div>
                      <input
                        id={startTimeFieldId}
                        aria-label="Task start time"
                        type="time"
                        className={styles.textInput}
                        value={startTime}
                        onChange={handleStartTimeChange}
                        onFocus={handleStartTimeFocus}
                        disabled={isBusy}
                        aria-describedby={timeRangeError ? timeRangeErrorId : undefined}
                      />
                    </div>

                    <div className={styles.scheduleColumn}>
                      <div className={styles.fieldHeader}>
                        <label className={styles.fieldLabel} htmlFor={dueDateFieldId}>
                          <span className={styles.fieldLabelText}>End date</span>
                        </label>
                      </div>
                      <input
                        id={dueDateFieldId}
                        aria-label="Task end date"
                        type="date"
                        className={styles.textInput}
                        value={dueDate}
                        onChange={handleDueDateInputChange}
                        onFocus={handleDueDateFocus}
                        onBlur={handleDueDateBlur}
                        disabled={isBusy}
                        aria-describedby={dueDateError ? dueDateErrorId : undefined}
                      />
                      {dueDateError ? (
                        <p id={dueDateErrorId} className={styles.fieldError} aria-live="polite">
                          {dueDateError}
                        </p>
                      ) : null}

                      <div className={styles.fieldHeader}>
                        <label className={styles.fieldLabel} htmlFor={endTimeFieldId}>
                          <span className={styles.fieldLabelText}>End time</span>
                        </label>
                        <span className={styles.fieldOptional}>Optional</span>
                      </div>
                      <input
                        id={endTimeFieldId}
                        aria-label="Task end time"
                        type="time"
                        className={styles.textInput}
                        value={endTime}
                        onChange={handleEndTimeChange}
                        onFocus={handleEndTimeFocus}
                        disabled={isBusy}
                        aria-describedby={timeRangeError ? timeRangeErrorId : undefined}
                      />
                    </div>
                  </div>
                  {timeRangeError ? (
                    <p id={timeRangeErrorId} className={styles.fieldError} aria-live="polite">
                      {timeRangeError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            {isEditing ? (
              <div className={styles.fieldGroup}>
                <div className={styles.fieldHeader}>
                  <label className={styles.fieldLabel}>
                    <span className={styles.fieldLabelText}>Review thread</span>
                  </label>
                </div>
                {reviewThreadEntries.length === 0 ? (
                  <p className={styles.helperText}>No review activity yet.</p>
                ) : (
                  <div className={styles.reviewThread}>
                    {reviewThreadGroups.map((group, groupIndex) => {
                      const currentSubmissionId =
                        typeof task?.currentSubmissionId === "string" ? task.currentSubmissionId.trim() : "";
                      const isCurrent = currentSubmissionId && currentSubmissionId === group.submissionId;
                      return (
                        <div key={group.submissionId} className={styles.reviewThreadGroup}>
                          <div className={styles.reviewThreadGroupHeader}>
                            <span>Submission {groupIndex + 1}</span>
                            {isCurrent ? <span className={styles.reviewThreadCurrent}>Current</span> : null}
                          </div>
                          {group.entries.map((entry, entryIndex) => {
                            const note = typeof entry.note === "string" ? entry.note.trim() : "";
                            return (
                              <div
                                key={entry.id ?? `${group.submissionId}-${entryIndex}`}
                                className={styles.reviewThreadEntry}
                              >
                                <div className={styles.reviewThreadMeta}>
                                  <span className={styles.reviewThreadAction}>
                                    {formatReviewActionLabel(entry.action)}
                                  </span>
                                  <span className={styles.reviewThreadBy}>· {formatReviewEntryActor(entry)}</span>
                                  {entry.createdAt ? (
                                    <span className={styles.reviewThreadTime}>· {formatReviewEntryTime(entry.createdAt)}</span>
                                  ) : null}
                                </div>
                                {note ? (
                                  <div className={styles.reviewThreadBubble}>
                                    {note}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
            <div id={feedbackRegionId} className={styles.feedbackRegion} aria-live="polite">
              {errorMessage ? (
                <div className={`${styles.feedback} ${styles.feedbackError}`}>{errorMessage}</div>
              ) : null}
              {successMessage ? (
                <div className={`${styles.feedback} ${styles.feedbackSuccess}`}>{successMessage}</div>
              ) : null}
            </div>
          </div>
          <div className={styles.actionBar}>
            {isEditing && hasAnyStatusAction && (
              <>
                {showSubmitForReviewButton && (
                  <button
                    type="button"
                    className={styles.statusActionButton}
                    onClick={handleSubmitForReview}
                    disabled={isBusy}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 11 12 14 22 4"></polyline>
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                    <span>Submit for review</span>
                  </button>
                )}
                {showApproveReviewButton && (
                  <button
                    type="button"
                    className={styles.statusActionButton}
                    onClick={handleApproveReview}
                    disabled={isBusy}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Approve</span>
                  </button>
                )}
                {showMarkDoneButton && (
                  <button
                    type="button"
                    className={styles.statusActionButton}
                    onClick={handleMarkDone}
                    disabled={isBusy}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Mark as done</span>
                  </button>
                )}
                {showRequestChangesButton && (
                  <button
                    type="button"
                    className={styles.statusActionButton}
                    onClick={handleRequestChanges}
                    disabled={isBusy}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span>Request changes</span>
                  </button>
                )}
                {(canArchiveTask || canUnarchiveTask) && (
                  <button
                    type="button"
                    className={styles.statusActionButton}
                    onClick={handleArchiveToggle}
                    disabled={isBusy}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="21 8 21 21 3 21 3 8"></polyline>
                      <rect x="1" y="3" width="22" height="5"></rect>
                      <line x1="10" y1="12" x2="14" y2="12"></line>
                    </svg>
                    <span>{archiving ? "Working…" : canUnarchiveTask ? "Unarchive task" : "Archive task"}</span>
                  </button>
                )}
              </>
            )}
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitDisabled}
            >
              {submitting ? <span className={styles.spinner} aria-hidden="true" /> : null}
              <span>{isEditing ? "Save changes" : "Save task"}</span>
            </button>
            {isEditing ? (
              <button
                type="button"
                className={styles.deleteButton}
                onClick={handleDelete}
                disabled={isBusy}
              >
                {deleting ? "Deleting…" : "Delete task"}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    );

  if (embedMode) {
    return (
      <>
        {modalContent}
        {previewModal}
        {projectFilesPicker}
        <ConfirmModal
          isOpen={showConfirmClose}
          onRequestClose={() => setShowConfirmClose(false)}
          onConfirm={() => {
            setShowConfirmClose(false);
            onClose();
          }}
          message="You have unsaved changes. Are you sure you want to close without saving?"
          confirmLabel="Close without saving"
          cancelLabel="Keep editing"
        />
      </>
    );
  }

  return (
    <>
      {createPortal(
        <div className={styles.createOverlay} role="presentation" onMouseDown={handleOverlayMouseDown}>
          {modalContent}
        </div>,
        document.body
      )}
      {previewModal}
      {projectFilesPicker}
      <ConfirmModal
        isOpen={showConfirmClose}
        onRequestClose={() => setShowConfirmClose(false)}
        onConfirm={() => {
          setShowConfirmClose(false);
          onClose();
        }}
        message="You have unsaved changes. Are you sure you want to close without saving?"
        confirmLabel="Close without saving"
        cancelLabel="Keep editing"
      />
    </>
  );
};

export type { TaskNoteAttachment } from "./QuickCreateTaskModal.types";

export default QuickCreateTaskModal;
