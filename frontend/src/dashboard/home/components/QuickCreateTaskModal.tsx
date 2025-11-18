import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Task } from "@/shared/utils/api";
import {
  NOMINATIM_SEARCH_URL,
  apiFetch,
  createTask,
  deleteTask,
  archiveTask,
  unarchiveTask,
  updateTask,
  uploadFile,
  getFileUrl,
} from "@/shared/utils/api";
import { fetchLocationSuggestions, fetchGlobalLocationSuggestions, type Suggestion, type NominatimSuggestion } from "@/shared/utils/location";
import { useUser } from "@/app/contexts/useUser";
import { notify } from "@/shared/ui/ToastNotifications";

import styles from "./QuickCreateTaskModal.module.css";
import type {
  QuickCreateTaskModalEvent,
  QuickCreateTaskModalEventType,
  QuickCreateTaskModalTask,
  QuickCreateTaskLocation,
  TaskNoteAttachment,
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

function generateAttachmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeIncomingAttachments(
  attachments: TaskNoteAttachment[] | null | undefined,
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
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return toInputDate(parsed);
    }
  }

  return "";
}

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
  const { userData, allUsers, userId, isAdmin } = useUser();
  const [projectId, setProjectId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [addressSearch, setAddressSearch] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<NominatimSuggestion[]>([]);
  const [showWorldwideLink, setShowWorldwideLink] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Coordinates | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [currentLocationAddress, setCurrentLocationAddress] = useState<string | null>(null);
  const [assigneeTokens, setAssigneeTokens] = useState<string[]>([]);
  const [noteAttachments, setNoteAttachments] = useState<TaskNoteAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [dueDateError, setDueDateError] = useState<string | null>(null);
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
  const assigneePopoverRef = useRef<HTMLDivElement | null>(null);
  const assigneeFieldRef = useRef<HTMLDivElement | null>(null);
  const assigneeSearchRef = useRef<HTMLInputElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastOffsetRef = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const lastAppliedTaskRef = useRef<string | null>(null);
  const successMessageRef = useRef<string | null>(null);
  const baseId = useId();
  const descriptionId = `${baseId}-description`;
  const projectFieldId = `${baseId}-project`;
  const assigneeFieldId = `${baseId}-assignee`;
  const assigneePopoverId = `${baseId}-assignee-popover`;
  const taskNameFieldId = `${baseId}-task-name`;
  const titleCounterId = `${baseId}-title-counter`;
  const titleErrorId = `${baseId}-title-error`;
  const projectErrorId = `${baseId}-project-error`;
  const dueDateErrorId = `${baseId}-due-date-error`;
  const locationFieldId = `${baseId}-location`;
  const dueDateFieldId = `${baseId}-due-date`;
  const notesFieldId = `${baseId}-notes`;
  const attachmentsFieldId = `${baseId}-attachments`;
  const feedbackRegionId = `${baseId}-feedback`;
  const locationHintId = `${baseId}-location-hint`;
  const statusFieldId = `${baseId}-status`;

  const projectOptions = useMemo(() => projects ?? [], [projects]);
  const hasProjects = projectOptions.length > 0;
  const isEditing = Boolean(taskId);
  const resolvedActiveProjectName = useMemo(() => {
    if (activeProjectName && activeProjectName.trim()) {
      return activeProjectName.trim();
    }

    const targetId = activeProjectId || scopedProjectId || projectId;
    if (!targetId) return "";
    const found = projectOptions.find((project) => project.id === targetId);
    return found?.name ?? "";
  }, [activeProjectId, activeProjectName, projectId, projectOptions, scopedProjectId]);
  const collaboratorIds = useMemo(() => {
    const baseIds = Array.isArray(userData?.collaborators)
      ? userData.collaborators.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0
        )
      : [];

    const rawUserId = typeof userData?.userId === "string" ? userData.userId.trim() : "";
    if (!rawUserId) {
      return baseIds;
    }

    const alreadyIncludesSelf = baseIds.some((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return false;
      const [, extractedId] = trimmed.includes("__") ? trimmed.split("__") : [null, null];
      const normalizedEntryId = extractedId?.trim() || trimmed;
      return normalizedEntryId === rawUserId;
    });

    return alreadyIncludesSelf ? baseIds : [...baseIds, rawUserId];
  }, [userData?.collaborators, userData?.userId]);

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
  }, [allUsers, assigneeTokens, collaboratorIds]);

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
  const effectiveProjectId = useMemo(() => {
    // When editing a task, always use the task's original project ID
    if (isEditing && projectId) {
      return projectId;
    }

    if (scopedProjectId) {
      return scopedProjectId;
    }

    if (projectId && projectOptions.some((project) => project.id === projectId)) {
      return projectId;
    }

    return projectOptions[0]?.id ?? "";
  }, [isEditing, projectId, projectOptions, scopedProjectId]);
  const trimmedTitle = title.trim();
  const titleRemaining = 120 - title.length;
  const showTitleCounter = titleRemaining <= 20;
  const canSubmit = Boolean(effectiveProjectId && trimmedTitle);
  const isBusy = submitting || deleting || archiving;

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
      const result = await fetchLocationSuggestions(query, userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined, {
        limit: 5,
        includeCurrentLocation: true,
        currentLocationAddress: currentLocationAddress || undefined,
      });

      setAddressSuggestions(result.suggestions);
      setShowWorldwideLink(result.showWorldwideLink);
    },
    [userLocation, currentLocationAddress]
  );

  const fetchGlobalAddressSuggestions = useCallback(
    async (query: string) => {
      const suggestions = await fetchGlobalLocationSuggestions(query, userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined, {
        limit: 8,
        includeCurrentLocation: true,
        currentLocationAddress: currentLocationAddress || undefined,
      });

      setAddressSuggestions(suggestions);
      setShowWorldwideLink(false); // Hide the link since we're now showing global results
    },
    [userLocation, currentLocationAddress]
  );

  const resetForm = useCallback(() => {
    setProjectId("");
    setTitle("");
    setDescription("");
    setDueDate("");
    setAddressSearch("");
    setAddressSuggestions([]);
    setShowWorldwideLink(false);
    setSelectedLocation(null);
    setAssigneeTokens([]);
    setNoteAttachments([]);
    setSubmitting(false);
    setDeleting(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTitleError(null);
    setProjectError(null);
    setDueDateError(null);
    setTaskId(null);
    setStatus("todo");
    setArchiving(false);
    setReviewerId(null);
    setCreatedById(null);
    setCreatedByName(null);
    setCreatedByUsername(null);
    setCreatedByEmail(null);
    setCreatedByThumbnail(null);
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
      setTitle(typeof taskData.title === "string" ? taskData.title : "");
      setDescription(typeof taskData.description === "string" ? taskData.description : "");
      setDueDate(toDateInputString(taskData.dueDate));
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
    setDueDateError(null);
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
    lastAppliedTaskRef.current = taskKey;
  }, [open, task, applyTaskToForm]);

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
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, isBusy]);

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
          setUserLocation(null);
          setCurrentLocationAddress(null);
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
    if (dueDate) {
      setDueDateError(null);
    }
  }, [dueDate]);


  const descriptionCopy = activeProjectId
    ? `Launch work for ${resolvedActiveProjectName || "this project"}.`
    : "Launch work for any project without leaving this view.";
  const showProjectSelect = !scopedProjectId && hasProjects;
  const todayValue = getOffsetDate(0);
  const tomorrowValue = getOffsetDate(1);
  const nextWeekValue = getOffsetDate(7);
  const isSubmitDisabled = isBusy || !canSubmit;
  const modalTitle = isEditing ? "Edit task" : "Create a task";
  const modalDescription = isEditing
    ? "Update the basics or reassign work. Use the task view for reviews and approvals."
    : descriptionCopy;
  const hasCustomStatusOption = !STATUS_SELECT_OPTIONS.some((option) => option.value === status);
  const isStatusLocked = READ_ONLY_STATUSES.includes(status);
  const normalizedCurrentUserId = normalizeUserIdentifier(userId);
  const normalizedReviewerId = normalizeUserIdentifier(reviewerId);
  const isReviewer = Boolean(
    normalizedReviewerId && normalizedCurrentUserId && normalizedReviewerId === normalizedCurrentUserId,
  );
  const canArchiveTask = Boolean(isEditing && status === "done" && (isAdmin || isReviewer));
  const canUnarchiveTask = Boolean(isEditing && status === "archived" && (isAdmin || isReviewer));
  const taskNameDescribedBy = [
    showTitleCounter ? titleCounterId : null,
    titleError ? titleErrorId : null,
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || undefined;
  const projectDescribedBy = projectError ? projectErrorId : undefined;
  const locationDescribedBy = selectedLocation ? locationHintId : undefined;

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
      onClose();
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
      onClose();
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
    } else {
      const coords = { lat: parseFloat(suggestion.lat), lng: parseFloat(suggestion.lon) };
      setSelectedLocation(coords);
      setAddressSearch(suggestion.display_name);
    }
    setAddressSuggestions([]);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

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

  const handleDueDateInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDueDate(event.target.value);
    setSuccessMessage(null);
    setErrorMessage(null);
    setDueDateError(null);
  };

  const handleDueDateQuickSelect = (value: string) => {
    setDueDate(value);
    setSuccessMessage(null);
    setErrorMessage(null);
    setDueDateError(null);
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

    const created: TaskNoteAttachment[] = [];

    for (const file of fileList) {
      if (file.type && !file.type.startsWith("image/")) {
        setErrorMessage("Only image files can be attached to notes.");
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
        setErrorMessage("We couldn't upload one of the images. Please try again.");
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

    const created: TaskNoteAttachment[] = [];

    for (const file of files) {
      if (file.type && !file.type.startsWith("image/")) {
        setErrorMessage("Only image files can be attached to notes.");
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
        setErrorMessage("We couldn't upload one of the images. Please try again.");
      }
    }

    if (created.length) {
      setNoteAttachments((prev) => [...prev, ...created]);
    }
  }, []);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setNoteAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
    setSuccessMessage(null);
    setErrorMessage(null);
  }, []);

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

    if (!dueDate) {
      const errorMsg = "Add a due date before saving.";
      setDueDateError(errorMsg);
      setErrorMessage(null);
      notify("error", errorMsg);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const eventType: QuickCreateTaskModalEventType = isEditing ? "update" : "create";
    const normalizedStatusForPayload = PATCHABLE_STATUSES.includes(status) ? status : undefined;
    const statusForPayload = !isEditing
      ? normalizedStatusForPayload === "in_progress"
        ? normalizedStatusForPayload
        : undefined
      : normalizedStatusForPayload;

    let dueDateIso: string | undefined;
    if (dueDate) {
      const parsed = new Date(`${dueDate}T00:00:00`);
      dueDateIso = Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }

    try {
      const trimmedAddress = addressSearch.trim();
      const locationPayload = selectedLocation
        ? { lat: selectedLocation.lat, lng: selectedLocation.lng }
        : undefined;

      const payload: Task = {
        projectId: effectiveProjectId,
        title: trimmedTitle,
        description: description.trim() || undefined,
        dueDate: dueDateIso,
        ...(statusForPayload ? { status: statusForPayload } : {}),
        ...(trimmedAddress ? { address: trimmedAddress } : {}),
        ...(locationPayload ? { location: locationPayload } : {}),
      };

      const trimmedAssigneeTokens = assigneeTokens.map((token) => token.trim()).filter(Boolean);

      if (trimmedAssigneeTokens.length) {
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

      if (isEditing && taskId) {
        await updateTask({ ...payload, taskId });
        setSuccessMessage("Task updated. Changes saved.");
        onUpdated?.();
      } else {
        await createTask(payload);
        setSuccessMessage("Task created. You'll see it in your lists shortly.");
        setTitle("");
        setDescription("");
        setDueDate("");
        setAddressSearch("");
        setAddressSuggestions([]);
        setSelectedLocation(null);
        setAssigneeTokens([]);
        setNoteAttachments([]);
        setStatus("todo");
        setTitleError(null);
        setProjectError(null);
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

  if (!open) {
    return null;
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
                  onClick={onClose}
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
            <div className={styles.fieldGroup}>
              <div className={styles.fieldHeader}>
                <label className={styles.fieldLabel} htmlFor={statusFieldId}>
                  <span className={styles.fieldLabelText}>Status</span>
                </label>
              </div>
              <select
                id={statusFieldId}
                aria-label="Task status"
                className={styles.selectInput}
                value={status}
                onChange={handleStatusChange}
                disabled={isBusy || isStatusLocked}
              >
                {hasCustomStatusOption ? (
                  <option value={status} disabled={isStatusLocked}>
                    {formatStatusLabel(status)}
                  </option>
                ) : null}
                {STATUS_SELECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {isStatusLocked ? (
                <p className={styles.helperText}>
                  Status changes to {formatStatusLabel(status)} happen in the task view.
                </p>
              ) : null}
            </div>
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
              <div className={styles.fieldHeader}>
                <label className={styles.fieldLabel} htmlFor={locationFieldId}>
                  <span className={styles.fieldLabelText}>Location</span>
                </label>
                <span className={styles.fieldOptional}>Optional</span>
              </div>
              <div className={styles.locationInputWrapper}>
                <input
                  id={locationFieldId}
                  aria-label="Task location"
                  type="text"
                  className={styles.textInput}
                  value={addressSearch}
                  onChange={handleAddressChange}
                  placeholder="Search for an address or venue"
                  disabled={isBusy}
                  aria-autocomplete="list"
                  aria-expanded={addressSuggestions.length > 0}
                  aria-controls={addressSuggestions.length > 0 ? suggestionsListId : undefined}
                  aria-describedby={locationDescribedBy}
                />
                {addressSuggestions.length > 0 ? (
                  <div className={styles.locationSuggestions} role="listbox" id={suggestionsListId}>
                    {addressSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.place_id}
                        type="button"
                        className={styles.locationSuggestionButton}
                        role="option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleAddressSuggestionSelect(suggestion)}
                      >
                        {suggestion.display_name}
                      </button>
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
              {selectedLocation ? (
                <span id={locationHintId} className={styles.fieldMeta}>
                  Saved coordinates: {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
                </span>
              ) : null}
            </div>
            <div className={styles.fieldGroup}>
              <div className={styles.fieldHeader}>
                <label className={styles.fieldLabel} htmlFor={dueDateFieldId}>
                  <span className={styles.fieldLabelText}>Due date</span>
                </label>
              </div>
              <input
                id={dueDateFieldId}
                aria-label="Task due date"
                type="date"
                className={styles.textInput}
                value={dueDate}
                onChange={handleDueDateInputChange}
                disabled={isBusy}
                aria-describedby={dueDateError ? dueDateErrorId : undefined}
              />
              {dueDateError ? (
                <p id={dueDateErrorId} className={styles.fieldError} aria-live="polite">
                  {dueDateError}
                </p>
              ) : null}
              <div className={styles.quickChips} role="group" aria-label="Quick due date shortcuts">
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
            <div className={styles.fieldGroup}>
              <div className={styles.fieldHeader}>
                <label className={styles.fieldLabel} htmlFor={notesFieldId}>
                  <span className={styles.fieldLabelText}>Notes</span>
                </label>
                <span className={styles.fieldOptional}>Optional</span>
              </div>
              <textarea
                id={notesFieldId}
                aria-label="Task notes"
                className={styles.textarea}
                value={description}
                onChange={handleDescriptionChange}
                placeholder="Add context or links."
                disabled={isBusy}
                rows={4}
                ref={notesRef}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
              {noteAttachments.length > 0 && (
                <div className={styles.attachmentChips}>
                  {noteAttachments.map((attachment) => (
                    <div key={attachment.id} className={styles.attachmentChip}>
                      <img src={attachment.url} alt={attachment.fileName} className={styles.chipPreview} />
                      <span>{attachment.fileName}</span>
                      <button onClick={() => handleRemoveAttachment(attachment.id)}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.notesFooter}>
                <label htmlFor={attachmentsFieldId} className={styles.attachmentInputLabel}>
                  <span className={styles.attachmentIcon}>📎</span>
                  <span>Add files</span>
                </label>
                <input
                  id={attachmentsFieldId}
                  className={styles.fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAttachmentInputChange}
                  disabled={isBusy}
                />
              </div>
            </div>
            <div id={feedbackRegionId} className={styles.feedbackRegion} aria-live="polite">
              {errorMessage ? (
                <div className={`${styles.feedback} ${styles.feedbackError}`}>{errorMessage}</div>
              ) : null}
              {successMessage ? (
                <div className={`${styles.feedback} ${styles.feedbackSuccess}`}>{successMessage}</div>
              ) : null}
            </div>
            <div className={styles.actionBar}>
              {isEditing && (canArchiveTask || canUnarchiveTask) ? (
                <button
                  type="button"
                  className={styles.archiveToggleButton}
                  onClick={handleArchiveToggle}
                  disabled={isBusy}
                >
                  {archiving ? "Working…" : canUnarchiveTask ? "Unarchive task" : "Archive task"}
                </button>
              ) : null}
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
              <button
                type="submit"
                className={styles.submitButton}
                disabled={isSubmitDisabled}
              >
                {submitting ? <span className={styles.spinner} aria-hidden="true" /> : null}
                <span>{isEditing ? "Save changes" : "Save task"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    );

  if (embedMode) {
    return modalContent;
  }

  return createPortal(
    <div className={styles.createOverlay} role="presentation" onMouseDown={handleOverlayMouseDown}>
      {modalContent}
    </div>,
    document.body
  );
};

export default QuickCreateTaskModal;
