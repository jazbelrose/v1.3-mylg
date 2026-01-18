import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  ProjectPageLayout,
  ProjectHeader,
  QuickLinksComponent,
  FileManager as FileManagerComponent,
} from "@/dashboard/project/components";
import type { QuickLinksRef } from "@/dashboard/project/components";
import { useFilesNavigation } from "@/dashboard/project/components/Shared/hooks/useFilesNavigation";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import { useTeamMembers } from "@/dashboard/project/components/Shared/projectHeaderState/useTeamMembers";
import type { TeamMember as ProjectTeamMember } from "@/dashboard/project/components/Shared/types";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/SocketContext";
import type { Project } from "@/app/contexts/DataProvider";
import { notify } from "@/shared/ui/ToastNotifications";
import {
  createEvent,
  fetchEvents,
  fetchUserProfilesBatch,
  fetchTasks,
  updateEvent,
  deleteEvent,
  requestTaskReview,
  approveTask,
  type Task as ApiTask,
  type TimelineEvent as ApiTimelineEvent,
} from "@/shared/utils/api";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";

import CalendarSurface from "./components/CalendarSurface";
import type { CreateEventRequest } from "./CreateCalendarItemModal";
import type { QuickCreateTaskModalProject } from "@/dashboard/home/components/QuickCreateTaskModal";
import {
  CalendarEvent,
  compareDateStrings,
  generateEventId,
  normalizeTask,
  normalizeTimelineEvent,
  resolveUpdatedString,
  safeDate,
} from "./utils";

const CalendarPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    activeProject,
    setActiveProject,
    fetchProjectDetails,
    setProjects,
    setSelectedProjects,
    userId,
    isAdmin,
  } = useData();

  const { ws } = useSocket();

  const [filesOpen, setFilesOpen] = useState(false);
  const quickLinksRef = useRef<QuickLinksRef | null>(null);

  // Use files navigation hook for V2 support
  const { openFiles } = useFilesNavigation({
    projectId,
    projectTitle: activeProject?.title,
    openLegacyModal: () => setFilesOpen(true),
  });

  const teamMembers = useTeamMembers(activeProject ?? null);
  const [extraTeamMembers, setExtraTeamMembers] = useState<ProjectTeamMember[]>([]);
  const fetchedAssigneeIdsRef = useRef(new Set<string>());

  const effectiveTeamMembers = useMemo(() => {
    const merged = new Map<string, ProjectTeamMember>();
    (teamMembers ?? []).forEach((member) => {
      if (member?.userId) merged.set(member.userId, member);
    });
    extraTeamMembers.forEach((member) => {
      if (!member?.userId) return;
      if (!merged.has(member.userId)) merged.set(member.userId, member);
    });
    return Array.from(merged.values());
  }, [extraTeamMembers, teamMembers]);

  const [timelineEvents, setTimelineEvents] = useState<ApiTimelineEvent[]>([]);
  const [projectTasks, setProjectTasks] = useState<ApiTask[]>([]);
  const tasksRef = useRef<ApiTask[]>([]);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const initializedDateForProject = useRef<string | null>(null);
  const eventsLoadedForProject = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    if (!activeProject || activeProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, activeProject, fetchProjectDetails]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    fetchEvents(projectId)
      .then((events) => {
        if (cancelled) return;

        eventsLoadedForProject.current = projectId;
        setTimelineEvents(events);

        // optional: keep global state in sync
        setActiveProject((prev) =>
          prev && prev.projectId === projectId
            ? { ...prev, timelineEvents: events }
            : prev
        );

        setProjects((prev) =>
          Array.isArray(prev)
            ? prev.map((p) =>
                p.projectId === projectId ? { ...p, timelineEvents: events } : p
              )
            : prev
        );
      })
      .catch((err) => {
        console.error("Failed to fetch project events", err);
        if (!cancelled) setTimelineEvents([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, setActiveProject, setProjects]);

  useEffect(() => {
    if (!projectId) return;
    const title = activeProject?.title;
    if (!title) return;

    const locationState = location.state as { fromGlobalSearch?: boolean } | undefined;
    if (locationState?.fromGlobalSearch) {
      return;
    }

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes("/calendar")) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, "/calendar");
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [
    projectId,
    activeProject?.title,
    location.pathname,
    location.state,
    navigate,
  ]);

  useEffect(() => {
    if (!ws || !activeProject?.projectId) return;

    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `project#${activeProject.projectId}`,
    });

    const sendWhenReady = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        const onOpen = () => {
          ws.send(payload);
          ws.removeEventListener("open", onOpen);
        };
        ws.addEventListener("open", onOpen);
      }
    };

    sendWhenReady();
  }, [ws, activeProject?.projectId]);

  useEffect(() => {
    if (!activeProject) return;

    // don't override backend-fetched events
    if (eventsLoadedForProject.current === activeProject.projectId) return;

    const events = Array.isArray(activeProject.timelineEvents)
      ? (activeProject.timelineEvents as ApiTimelineEvent[])
      : [];
    setTimelineEvents(events);
  }, [activeProject]);

  useEffect(() => {
    tasksRef.current = projectTasks;
  }, [projectTasks]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetchTasks(projectId)
      .then((tasks) => {
        if (cancelled) return;
        setProjectTasks(tasks);
      })
      .catch((error) => {
        console.error("Failed to fetch project tasks", error);
        if (!cancelled) setProjectTasks([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectTasks || projectTasks.length === 0) return;

    const isViableUserId = (value: string): boolean => {
      const trimmed = value.trim();
      if (!trimmed) return false;
      if (trimmed.length > 128) return false;
      if (trimmed.includes(",")) return false;
      if (/\s/.test(trimmed)) return false;
      return true;
    };

    const knownIds = new Set((teamMembers ?? []).map((m) => m.userId).filter(Boolean));
    extraTeamMembers.forEach((m) => {
      if (m?.userId) knownIds.add(m.userId);
    });

    const idsToFetch = new Set<string>();
    const push = (candidate?: string | null) => {
      if (!candidate || typeof candidate !== "string") return;
      const trimmed = candidate.trim();
      if (!trimmed) return;

      const parts = trimmed.split("__");
      const id = (parts.length > 1 ? parts[parts.length - 1] : trimmed).trim();
      if (!isViableUserId(id)) return;
      if (knownIds.has(id)) return;
      if (fetchedAssigneeIdsRef.current.has(id)) return;
      idsToFetch.add(id);
    };

    projectTasks.forEach((task) => {
      push((task as { assigneeId?: string }).assigneeId);
      (task.assigneeIds ?? []).forEach((id) => push(id));
      (task.assigneeTokens ?? []).forEach((token) => push(token));
    });

    const ids = Array.from(idsToFetch);
    if (ids.length === 0) return;

    let cancelled = false;

    fetchUserProfilesBatch(ids)
      .then((profiles) => {
        if (cancelled) return;
        const members: ProjectTeamMember[] = (profiles ?? [])
          .filter((p) => Boolean(p?.userId))
          .map((p) => ({
            userId: String(p.userId),
            firstName: typeof p.firstName === "string" ? p.firstName : "",
            lastName: typeof p.lastName === "string" ? p.lastName : "",
            thumbnail:
              (typeof p.thumbnail === "string" && p.thumbnail) ||
              (typeof (p as { thumbnailUrl?: unknown }).thumbnailUrl === "string" &&
                (p as { thumbnailUrl?: string }).thumbnailUrl) ||
              (typeof (p as { avatar?: unknown }).avatar === "string" && (p as { avatar?: string }).avatar) ||
              (typeof (p as { avatarUrl?: unknown }).avatarUrl === "string" &&
                (p as { avatarUrl?: string }).avatarUrl) ||
              null,
          }));

        members.forEach((m) => fetchedAssigneeIdsRef.current.add(m.userId));
        setExtraTeamMembers((prev) => {
          const merged = new Map(prev.map((m) => [m.userId, m]));
          members.forEach((m) => {
            if (!merged.has(m.userId)) merged.set(m.userId, m);
          });
          return Array.from(merged.values());
        });
      })
      .catch(() => {
        // Ignore: calendar can still render initials for unknown users.
      });

    return () => {
      cancelled = true;
    };
  }, [extraTeamMembers, projectTasks, teamMembers]);

  useEffect(() => {
    if (!timelineEvents || timelineEvents.length === 0) return;

    const isViableUserId = (value: string): boolean => {
      const trimmed = value.trim();
      if (!trimmed) return false;
      if (trimmed.length > 128) return false;
      if (trimmed.includes(",")) return false;
      if (/\s/.test(trimmed)) return false;
      return true;
    };

    const knownIds = new Set((teamMembers ?? []).map((m) => m.userId).filter(Boolean));
    extraTeamMembers.forEach((m) => {
      if (m?.userId) knownIds.add(m.userId);
    });

    const idsToFetch = new Set<string>();
    const push = (candidate?: string | null) => {
      if (!candidate || typeof candidate !== "string") return;
      const trimmed = candidate.trim();
      if (!trimmed) return;
      const parts = trimmed.split("__");
      const id = (parts.length > 1 ? parts[parts.length - 1] : trimmed).trim();
      if (!isViableUserId(id)) return;
      if (knownIds.has(id)) return;
      if (fetchedAssigneeIdsRef.current.has(id)) return;
      idsToFetch.add(id);
    };

    timelineEvents.forEach((event) => {
      // guests (collaborators)
      const rawGuests = (event as { guests?: unknown }).guests;
      if (Array.isArray(rawGuests)) {
        rawGuests.forEach((value) => {
          if (typeof value === "string") push(value);
        });
      }
      // creator is commonly the primary avatar fallback
      push((event as { createdById?: string }).createdById);
      push((event as { createdBy?: string }).createdBy);
    });

    const ids = Array.from(idsToFetch);
    if (ids.length === 0) return;

    let cancelled = false;

    fetchUserProfilesBatch(ids)
      .then((profiles) => {
        if (cancelled) return;
        const members: ProjectTeamMember[] = (profiles ?? [])
          .filter((p) => Boolean(p?.userId))
          .map((p) => ({
            userId: String(p.userId),
            firstName: typeof p.firstName === "string" ? p.firstName : "",
            lastName: typeof p.lastName === "string" ? p.lastName : "",
            thumbnail:
              (typeof p.thumbnail === "string" && p.thumbnail) ||
              (typeof (p as { thumbnailUrl?: unknown }).thumbnailUrl === "string" &&
                (p as { thumbnailUrl?: string }).thumbnailUrl) ||
              (typeof (p as { avatar?: unknown }).avatar === "string" && (p as { avatar?: string }).avatar) ||
              (typeof (p as { avatarUrl?: unknown }).avatarUrl === "string" &&
                (p as { avatarUrl?: string }).avatarUrl) ||
              null,
          }));

        members.forEach((m) => fetchedAssigneeIdsRef.current.add(m.userId));
        setExtraTeamMembers((prev) => {
          const merged = new Map(prev.map((m) => [m.userId, m]));
          members.forEach((m) => {
            if (!merged.has(m.userId)) merged.set(m.userId, m);
          });
          return Array.from(merged.values());
        });
      })
      .catch(() => {
        // Ignore: calendar can still render initials for unknown users.
      });

    return () => {
      cancelled = true;
    };
  }, [extraTeamMembers, teamMembers, timelineEvents]);

  useEffect(() => {
    if (!projectId) return;
    if (initializedDateForProject.current !== projectId) {
      initializedDateForProject.current = projectId;
      const sorted = [...timelineEvents]
        .map((event) => safeDate(event.date))
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => a.getTime() - b.getTime());
      if (sorted.length > 0) {
        setCurrentDate(sorted[0]);
      } else {
        setCurrentDate(new Date());
      }
    }
  }, [projectId, timelineEvents]);

  const getEventIdentifier = useCallback((event: ApiTimelineEvent) => {
    const candidate =
      (event.eventId ??
        event.timelineEventId ??
        event.id ??
        (event as { [key: string]: unknown })["timestamp#uuid"] ??
        (event as { uuid?: string }).uuid ??
        (event as { event_id?: string }).event_id) ?? null;

    if (candidate != null && candidate !== "") {
      return String(candidate);
    }

    return `${event.date ?? ""}#${event.description ?? ""}`;
  }, []);

  const handleCreateEvent = useCallback(
    async (input: CreateEventRequest) => {
      if (!projectId) return;

      const isoDate = input.date;
      const trimmedTitle = input.title.trim();
      const trimmedDescription = input.description?.trim();
      const draftEventId = generateEventId();

      const startAtIso =
        !input.allDay && input.time
          ? `${isoDate}T${input.time}:00`
          : undefined;

      const endAtIso =
        !input.allDay && input.endTime
          ? `${isoDate}T${input.endTime}:00`
          : undefined;

      try {
        const baseBody: ApiTimelineEvent = {
          id: draftEventId,
          eventId: draftEventId,
          timelineEventId: draftEventId,
          date: isoDate,
          title: trimmedTitle,
          description: trimmedDescription ?? trimmedTitle,
          tags: input.tags,
          guests: input.guests,
          allDay: input.allDay,
          startAt: input.allDay ? null : startAtIso ?? null,
          endAt: input.allDay ? null : endAtIso ?? null,
        };

        const optionalStrings: Record<string, unknown> = {};
        const nextEventType = resolveUpdatedString(input.eventType, undefined);
        if (nextEventType !== undefined) {
          optionalStrings.eventType = nextEventType;
        }
        const nextLocation = resolveUpdatedString(input.location, undefined);
        if (nextLocation !== undefined) {
          optionalStrings.location = nextLocation;
        }

        const eventBody = {
          ...baseBody,
          ...optionalStrings,
        } as ApiTimelineEvent;

        const created = await createEvent(projectId, eventBody);

        const resolvedId =
          created.id || created.eventId || created.timelineEventId || draftEventId;
        const resolvedEventId = created.eventId || resolvedId;
        const resolvedTitle = (created as { title?: string }).title ?? trimmedTitle;
        const resolvedDescription =
          created.description ?? trimmedDescription ?? trimmedTitle;
        const resolvedAllDay =
          typeof created.allDay === "boolean" ? created.allDay : eventBody.allDay;
        const resolvedStartAt =
          resolvedAllDay
            ? null
            : typeof created.startAt === "string"
              ? created.startAt
              : (eventBody.startAt as string | null) ?? null;
        const resolvedEndAt =
          resolvedAllDay
            ? null
            : typeof created.endAt === "string"
              ? created.endAt
              : (eventBody.endAt as string | null) ?? null;

        const pickResolvedField = <T,>(field: string): T | undefined => {
          if (Object.prototype.hasOwnProperty.call(created, field)) {
            return (created as Record<string, unknown>)[field] as T;
          }
          if (Object.prototype.hasOwnProperty.call(eventBody, field)) {
            return (eventBody as Record<string, unknown>)[field] as T;
          }
          return undefined;
        };

        const normalized = normalizeTimelineEvent({
          ...created,
          id: resolvedId,
          eventId: resolvedEventId,
          title: resolvedTitle,
          description: resolvedDescription,
          date: created.date ?? isoDate,
          tags: created.tags ?? eventBody.tags ?? input.tags,
          guests:
            (Array.isArray((created as { guests?: unknown }).guests)
              ? (created as { guests?: string[] }).guests
              : undefined) ?? eventBody.guests,
          eventType: pickResolvedField("eventType"),
          location: pickResolvedField("location"),
          allDay: resolvedAllDay,
          startAt: resolvedStartAt,
          endAt: resolvedEndAt,
        });

        const asTimelineEvent: ApiTimelineEvent = {
          ...created,
          ...eventBody,
          id: resolvedId,
          eventId: resolvedEventId,
          title: resolvedTitle,
          description: resolvedDescription,
          date: created.date ?? isoDate,
          tags: created.tags ?? eventBody.tags ?? input.tags,
          guests:
            (Array.isArray((created as { guests?: unknown }).guests)
              ? (created as { guests?: string[] }).guests
              : undefined) ?? eventBody.guests,
          allDay: resolvedAllDay,
          startAt: resolvedStartAt,
          endAt: resolvedEndAt,
        };
        asTimelineEvent.projectId = (created as { projectId?: string }).projectId ?? projectId;
        asTimelineEvent.timelineEventId =
          (created as { timelineEventId?: string }).timelineEventId ?? resolvedEventId;

        const assignOptional = (field: string, value: unknown) => {
          const container = asTimelineEvent as Record<string, unknown>;
          if (value !== undefined) {
            container[field] = value;
          } else {
            delete container[field];
          }
        };

        assignOptional("eventType", pickResolvedField("eventType"));
        assignOptional("location", pickResolvedField("location"));
        delete (asTimelineEvent as Record<string, unknown>).repeat;
        delete (asTimelineEvent as Record<string, unknown>).reminder;
        delete (asTimelineEvent as Record<string, unknown>).platform;
        delete (asTimelineEvent as Record<string, unknown>).payload;
        delete (asTimelineEvent as Record<string, unknown>).meta;

        setTimelineEvents((prev) => [...prev, asTimelineEvent]);
        setActiveProject((prev) => {
          if (!prev || prev.projectId !== projectId) return prev;
          const nextTimeline = [...(prev.timelineEvents ?? []), asTimelineEvent];
          return { ...prev, timelineEvents: nextTimeline };
        });
        setProjects((prev) =>
          Array.isArray(prev)
            ? prev.map((project) =>
                project.projectId === projectId
                  ? {
                      ...project,
                      timelineEvents: [...(project.timelineEvents ?? []), asTimelineEvent],
                    }
                  : project,
              )
            : prev,
        );

        if (!normalized) return;
        const normalizedDate = safeDate(normalized.date);
        if (normalizedDate) {
          setCurrentDate(normalizedDate);
        }
      } catch (error) {
        console.error("Failed to create event", error);
        throw error;
      }
    },
    [projectId, setActiveProject, setProjects],
  );

  const handleUpdateEvent = useCallback(
    async (target: ApiTimelineEvent, input: CreateEventRequest) => {
      if (!projectId) return;

      const identifier = getEventIdentifier(target);
      const isoDate = input.date;
      const trimmedTitle = input.title.trim();
      const trimmedDescription = input.description?.trim();
      const startAtIso =
        !input.allDay && input.time
          ? `${isoDate}T${input.time}:00`
          : undefined;

      const endAtIso =
        !input.allDay && input.endTime
          ? `${isoDate}T${input.endTime}:00`
          : undefined;

      const existingDetails: Record<string, unknown> = {
        ...(((target as { meta?: Record<string, unknown> }).meta) ?? {}),
        ...((target.payload as Record<string, unknown>) ?? {}),
      };

      const eventId =
        target.eventId ??
        target.timelineEventId ??
        target.id ??
        (target as { event_id?: string }).event_id;

      if (!eventId) {
        throw new Error("Unable to determine event id for update");
      }

      const baseUpdate: ApiTimelineEvent & { projectId: string; eventId: string } = {
        projectId,
        eventId,
        title: trimmedTitle,
        description: trimmedDescription ?? trimmedTitle,
        date: isoDate,
        tags: input.tags,
        guests: input.guests,
        allDay: input.allDay,
        startAt: input.allDay ? null : startAtIso ?? null,
        endAt: input.allDay ? null : endAtIso ?? null,
      };

      const optionalUpdates: Record<string, unknown> = {};

      const previousEventType =
        (target as { eventType?: unknown }).eventType ?? existingDetails.eventType;
      const resolvedEventType = resolveUpdatedString(
        input.eventType,
        previousEventType,
      );
      if (resolvedEventType !== undefined) {
        optionalUpdates.eventType = resolvedEventType;
      }

      const previousLocation =
        (target as { location?: unknown }).location ??
        existingDetails.location ??
        (target as { platform?: unknown }).platform ??
        existingDetails.platform;
      const resolvedLocation = resolveUpdatedString(input.location, previousLocation);
      if (resolvedLocation !== undefined) {
        optionalUpdates.location = resolvedLocation;
      }

      const updatePayload = {
        ...baseUpdate,
        ...optionalUpdates,
      } satisfies ApiTimelineEvent & { projectId: string; eventId: string };

      try {
        const updated = await updateEvent(updatePayload);

        const resolvedAllDay =
          typeof updated.allDay === "boolean" ? updated.allDay : updatePayload.allDay;
        const resolvedStartAt =
          resolvedAllDay
            ? null
            : typeof updated.startAt === "string"
              ? updated.startAt
              : (updatePayload.startAt as string | null) ?? null;
        const resolvedEndAt =
          resolvedAllDay
            ? null
            : typeof updated.endAt === "string"
              ? updated.endAt
              : (updatePayload.endAt as string | null) ?? null;

        const pickResolvedField = <T,>(field: string): T | undefined => {
          if (Object.prototype.hasOwnProperty.call(updated, field)) {
            return (updated as Record<string, unknown>)[field] as T;
          }
          if (Object.prototype.hasOwnProperty.call(updatePayload, field)) {
            return (updatePayload as Record<string, unknown>)[field] as T;
          }
          if (Object.prototype.hasOwnProperty.call(target, field)) {
            return (target as Record<string, unknown>)[field] as T;
          }
          if (Object.prototype.hasOwnProperty.call(existingDetails, field)) {
            return existingDetails[field] as T;
          }
          return undefined;
        };

        const updatedEvent: ApiTimelineEvent = {
          ...target,
          ...updated,
          projectId,
          title: updated.title ?? trimmedTitle,
          description: updated.description ?? trimmedDescription ?? trimmedTitle,
          date: updated.date ?? isoDate,
          tags: Array.isArray(updated.tags) ? updated.tags : updatePayload.tags,
          guests:
            (Array.isArray((updated as { guests?: unknown }).guests)
              ? (updated as { guests?: string[] }).guests
              : undefined) ?? updatePayload.guests,
          allDay: resolvedAllDay,
          startAt: resolvedStartAt,
          endAt: resolvedEndAt,
        };

        updatedEvent.projectId =
          (updated as { projectId?: string }).projectId ?? projectId;

        updatedEvent.id =
          updated.id ??
          target.id ??
          target.eventId ??
          target.timelineEventId ??
          updatePayload.eventId;
        updatedEvent.eventId = updated.eventId ?? updatePayload.eventId;
        updatedEvent.timelineEventId =
          (updated as { timelineEventId?: string }).timelineEventId ??
          target.timelineEventId ??
          updatedEvent.eventId;

        const eventTypeField = pickResolvedField<string | null>("eventType");
        const locationField = pickResolvedField<string | null>("location");

        const assignOptional = (field: string, value: unknown) => {
          const container = updatedEvent as Record<string, unknown>;
          if (value !== undefined) {
            container[field] = value;
          } else {
            delete container[field];
          }
        };

        assignOptional("eventType", eventTypeField);
        assignOptional("location", locationField);
        delete (updatedEvent as Record<string, unknown>).repeat;
        delete (updatedEvent as Record<string, unknown>).reminder;
        delete (updatedEvent as Record<string, unknown>).platform;

        delete (updatedEvent as Record<string, unknown>).payload;
        delete (updatedEvent as Record<string, unknown>).meta;

        setTimelineEvents((previous) => {
          let found = false;
          const next = previous.map((event) => {
            if (getEventIdentifier(event) === identifier) {
              found = true;
              return updatedEvent;
            }
            return event;
          });
          return found ? next : [...next, updatedEvent];
        });

        setActiveProject((prev) => {
          if (!prev || prev.projectId !== projectId) return prev;
          const existing = Array.isArray(prev.timelineEvents)
            ? prev.timelineEvents
            : [];
          let found = false;
          const nextTimeline = existing.map((event) => {
            if (getEventIdentifier(event) === identifier) {
              found = true;
              return updatedEvent;
            }
            return event;
          });
          return {
            ...prev,
            timelineEvents: found ? nextTimeline : [...nextTimeline, updatedEvent],
          };
        });

        setProjects((prev) =>
          Array.isArray(prev)
            ? prev.map((project) => {
                if (project.projectId !== projectId) return project;
                const existing = Array.isArray(project.timelineEvents)
                  ? project.timelineEvents
                  : [];
                let found = false;
                const nextTimeline = existing.map((event) => {
                  if (getEventIdentifier(event) === identifier) {
                    found = true;
                    return updatedEvent;
                  }
                  return event;
                });
                return {
                  ...project,
                  timelineEvents: found ? nextTimeline : [...nextTimeline, updatedEvent],
                };
              })
            : prev,
        );

        const normalized = normalizeTimelineEvent(updatedEvent);
        if (normalized) {
          const normalizedDate = safeDate(normalized.date);
          if (normalizedDate) {
            setCurrentDate(normalizedDate);
          }
        }
      } catch (error) {
        console.error("Failed to update event", error);
        throw error;
      }
    },
    [projectId, getEventIdentifier, setActiveProject, setProjects],
  );

  const handleDeleteEvent = useCallback(
    async (target: ApiTimelineEvent) => {
      if (!projectId) return;

      const eventId =
        target.eventId ??
        target.timelineEventId ??
        target.id ??
        (target as { event_id?: string }).event_id;

      if (!eventId) {
        throw new Error("Unable to determine event id for delete");
      }

      const identifier = getEventIdentifier(target);
      const previousEvents = timelineEvents;
      const previousActiveProject = activeProject;
      let previousProjectsSnapshot: Project[] | null = null;

      const filterEvents = (items: ApiTimelineEvent[] | undefined | null) =>
        Array.isArray(items)
          ? items.filter((event) => getEventIdentifier(event) !== identifier)
          : items;

      setTimelineEvents((prev) =>
        prev.filter((event) => getEventIdentifier(event) !== identifier),
      );

      setActiveProject((prev) => {
        if (!prev || prev.projectId !== projectId) return prev;
        const filtered = filterEvents(prev.timelineEvents) ?? [];
        return {
          ...prev,
          timelineEvents: filtered,
        };
      });

      setProjects((prev) => {
        if (!Array.isArray(prev)) return prev;
        previousProjectsSnapshot = prev;
        return prev.map((project) => {
          if (project.projectId !== projectId) return project;
          const filtered = filterEvents(project.timelineEvents) ?? [];
          return {
            ...project,
            timelineEvents: filtered,
          };
        });
      });

      try {
        await deleteEvent(projectId, eventId);
      } catch (error) {
        console.error("Failed to delete event", error);
        setTimelineEvents(previousEvents);
        if (previousActiveProject?.projectId === projectId) {
          setActiveProject(previousActiveProject);
        }
        if (previousProjectsSnapshot) {
          setProjects(previousProjectsSnapshot);
        }
        throw error;
      }
    },
    [
      projectId,
      getEventIdentifier,
      timelineEvents,
      activeProject,
      setActiveProject,
      setProjects,
    ],
  );

  const refreshProjectTasks = useCallback(async () => {
    if (!projectId) return;

    try {
      const tasks = await fetchTasks(projectId);
      tasksRef.current = tasks;
      setProjectTasks(tasks);
    } catch (error) {
      console.error("Failed to refresh project tasks", error);
    }
  }, [projectId]);


  const handleToggleTask = useCallback(
    async (taskId: string) => {
      const existingTasks = tasksRef.current;
      const target = existingTasks.find(
        (task) => task.taskId === taskId || (task as { id?: string }).id === taskId,
      );
      if (!target) return;

      const resolvedProjectId = target.projectId ?? projectId;
      if (!resolvedProjectId) return;

      const normalizedStatus =
        typeof target.status === "string" ? target.status.trim().toLowerCase() : "";
      const isAwaitingApproval = normalizedStatus === "in_review";
      const isComplete = normalizedStatus === "done" || normalizedStatus === "archived";
      const canSubmitForReview =
        normalizedStatus === "to_do" ||
        normalizedStatus === "in_progress" ||
        normalizedStatus === "needs_changes";

      if (isComplete) {
        notify("info", "That task is already complete.");
        return;
      }

      if (isAwaitingApproval && !isAdmin) {
        notify("error", "Only admins can approve tasks that are in review.");
        return;
      }

      if (!isAwaitingApproval && !canSubmitForReview) {
        notify("error", "Task status doesn't allow this action.");
        return;
      }

      const resolvedTaskId = target.taskId ?? (target as { id?: string }).id ?? taskId;

      try {
        if (isAwaitingApproval) {
          await approveTask(resolvedProjectId, resolvedTaskId, { note: "" });
          notify("success", "Task marked as done!");
        } else {
          await requestTaskReview(resolvedProjectId, resolvedTaskId);
          notify("success", "Task submitted for review!");
        }
        await refreshProjectTasks();
      } catch (error) {
        console.error("Failed to update calendar task status", error);
        const apiError = error as { status?: number };
        if (apiError?.status === 403) {
          notify("error", "You don't have permission to perform this action.");
        } else if (apiError?.status === 409) {
          notify("error", "Task is not in the correct state for this action.");
        } else {
          notify("error", "Failed to update task. Please try again.");
        }
      }
    },
    [projectId, isAdmin, refreshProjectTasks],
  );

  // refreshProjectTasks moved above to avoid TDZ when used in handleToggleTask

  const parseStatusToNumber = useCallback((status?: string | number | null) => {
    if (status === undefined || status === null) return 0;
    const str = typeof status === "string" ? status : String(status);
    const num = parseFloat(str.replace("%", ""));
    return Number.isNaN(num) ? 0 : num;
  }, []);

  const handleProjectDeleted = useCallback(
    (deletedProjectId: string) => {
      setProjects((prev) => prev.filter((project) => project.projectId !== deletedProjectId));
      setSelectedProjects((prev) => prev.filter((id) => id !== deletedProjectId));
      navigate("/dashboard/projects");
    },
    [navigate, setProjects, setSelectedProjects],
  );

  const handleBack = useCallback(() => {
    if (!projectId) {
      navigate("/dashboard/projects");
      return;
    }
    const title = activeProject?.title;
    navigate(getProjectDashboardPath(projectId, title));
  }, [navigate, projectId, activeProject?.title]);

  const handleActiveProjectChange = useCallback(
    (updatedProject: Project) => {
      setActiveProject(updatedProject);
    },
    [setActiveProject],
  );

  const coverImage = useMemo(
    () => resolveProjectCoverUrl(activeProject ?? undefined),
    [activeProject],
  );
  const projectPalette = useProjectPalette(coverImage, {
    color: activeProject?.color,
  });

  const activeProjectStartDate = useMemo(() => {
    const productionStart = safeDate(activeProject?.productionStart as string);
    const createdAt = safeDate(activeProject?.dateCreated as string);
    return productionStart ?? createdAt ?? null;
  }, [activeProject?.productionStart, activeProject?.dateCreated]);

  const activeProjectEndDate = useMemo(
    () => safeDate(activeProject?.finishline as string) ?? null,
    [activeProject?.finishline],
  );

  const calendarEvents = useMemo(() => {
    const mapped = timelineEvents
      .map(normalizeTimelineEvent)
      .filter((event): event is CalendarEvent => event !== null);
    return mapped.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return compareDateStrings(a.start, b.start);
    });
  }, [timelineEvents]);

  const calendarTasks = useMemo(
    () => projectTasks.map(normalizeTask).sort((a, b) => compareDateStrings(a.due, b.due)),
    [projectTasks],
  );

  const quickCreateProjects = useMemo<QuickCreateTaskModalProject[]>(() => {
    if (!activeProject?.projectId) return [];

    const title = typeof activeProject.title === "string" ? activeProject.title.trim() : "";
    return [
      {
        id: activeProject.projectId,
        name: title || "Untitled project",
      },
    ];
  }, [activeProject]);

  return (
    <ProjectPageLayout
      projectId={projectId}
      theme={projectPalette}
      header={
        <ProjectHeader
          activeProject={activeProject ?? null}
          parseStatusToNumber={parseStatusToNumber}
          userId={userId}
          onProjectDeleted={handleProjectDeleted}
          showWelcomeScreen={handleBack}
          onActiveProjectChange={handleActiveProjectChange}
          onOpenFiles={openFiles}
          onOpenQuickLinks={() => quickLinksRef.current?.openModal()}
        />
      }
    >
      <QuickLinksComponent ref={quickLinksRef} hideTrigger />
      <FileManagerComponent
        isOpen={filesOpen}
        onRequestClose={() => setFilesOpen(false)}
        showTrigger={false}
        folder="uploads"
      />

      <CalendarSurface
        events={calendarEvents}
        tasks={calendarTasks}
        taskSources={projectTasks}
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        onCreateEvent={handleCreateEvent}
        onUpdateEvent={handleUpdateEvent}
        onDeleteEvent={handleDeleteEvent}
        onToggleTask={handleToggleTask}
        teamMembers={effectiveTeamMembers}
        onRefreshTasks={refreshProjectTasks}
        taskProjects={quickCreateProjects}
        activeProjectId={activeProject?.projectId ?? null}
        activeProjectName={activeProject?.title ?? null}
        activeProjectColor={(activeProject?.color as string | undefined) ?? null}
        activeProjectStartDate={activeProjectStartDate}
        activeProjectEndDate={activeProjectEndDate}
      />
    </ProjectPageLayout>
  );
};

export default CalendarPage;
