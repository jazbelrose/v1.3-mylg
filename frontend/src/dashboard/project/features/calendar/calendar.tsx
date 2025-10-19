import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  ProjectPageLayout,
  ProjectHeader,
  QuickLinksComponent,
  FileManager as FileManagerComponent,
} from "@/dashboard/project/components";
import type { QuickLinksRef } from "@/dashboard/project/components";
import { useProjectPalette } from "@/dashboard/project/hooks/useProjectPalette";
import { resolveProjectCoverUrl } from "@/dashboard/project/utils/theme";
import { useTeamMembers } from "@/dashboard/project/components/Shared/projectHeaderState/useTeamMembers";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/SocketContext";
import type { Project } from "@/app/contexts/DataProvider";
import {
  createEvent,
  fetchTasks,
  updateEvent,
  updateTask,
  deleteEvent,
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
  } = useData();

  const { ws } = useSocket();

  const [filesOpen, setFilesOpen] = useState(false);
  const quickLinksRef = useRef<QuickLinksRef | null>(null);

  const teamMembers = useTeamMembers(activeProject ?? null);

  const [timelineEvents, setTimelineEvents] = useState<ApiTimelineEvent[]>([]);
  const [projectTasks, setProjectTasks] = useState<ApiTask[]>([]);
  const tasksRef = useRef<ApiTask[]>([]);
  const previousTasksSnapshot = useRef<ApiTask[] | null>(null);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const initializedDateForProject = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    if (!activeProject || activeProject.projectId !== projectId) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, activeProject, fetchProjectDetails]);

  useEffect(() => {
    if (!projectId) return;
    const title = activeProject?.title;
    if (!title) return;

    const currentPath = location.pathname.split(/[?#]/)[0];
    if (!currentPath.includes("/calendar")) return;

    const canonicalPath = getProjectDashboardPath(projectId, title, "/calendar");
    if (currentPath === canonicalPath) return;

    navigate(canonicalPath, { replace: true });
  }, [projectId, activeProject?.title, location.pathname, navigate]);

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
      const repeatValue =
        input.repeat && input.repeat !== "Does not repeat" ? input.repeat : undefined;

      const trimmedTitle = input.title.trim();
      const trimmedDescription = input.description?.trim();
      const draftEventId = generateEventId();

      const startAtIso =
        !input.allDay && input.time
          ? (() => {
              const parsed = new Date(`${isoDate}T${input.time}`);
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
            })()
          : undefined;

      const endAtIso =
        !input.allDay && input.endTime
          ? (() => {
              const parsed = new Date(`${isoDate}T${input.endTime}`);
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
            })()
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
        const nextRepeat = resolveUpdatedString(repeatValue, undefined);
        if (nextRepeat !== undefined) {
          optionalStrings.repeat = nextRepeat;
        }
        const nextReminder = resolveUpdatedString(input.reminder, undefined);
        if (nextReminder !== undefined) {
          optionalStrings.reminder = nextReminder;
        }
        const nextEventType = resolveUpdatedString(input.eventType, undefined);
        if (nextEventType !== undefined) {
          optionalStrings.eventType = nextEventType;
        }
        const nextPlatform = resolveUpdatedString(input.platform, undefined);
        if (nextPlatform !== undefined) {
          optionalStrings.platform = nextPlatform;
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
          repeat: pickResolvedField("repeat"),
          reminder: pickResolvedField("reminder"),
          eventType: pickResolvedField("eventType"),
          platform: pickResolvedField("platform"),
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

        assignOptional("repeat", pickResolvedField("repeat"));
        assignOptional("reminder", pickResolvedField("reminder"));
        assignOptional("eventType", pickResolvedField("eventType"));
        assignOptional("platform", pickResolvedField("platform"));
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
      const repeatValue =
        input.repeat && input.repeat !== "Does not repeat" ? input.repeat : undefined;

      const trimmedTitle = input.title.trim();
      const trimmedDescription = input.description?.trim();
      const startAtIso =
        !input.allDay && input.time
          ? (() => {
              const parsed = new Date(`${isoDate}T${input.time}`);
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
            })()
          : undefined;

      const endAtIso =
        !input.allDay && input.endTime
          ? (() => {
              const parsed = new Date(`${isoDate}T${input.endTime}`);
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
            })()
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

      const previousRepeat =
        (target as { repeat?: unknown }).repeat ?? existingDetails.repeat;
      const resolvedRepeat = resolveUpdatedString(repeatValue, previousRepeat);
      if (resolvedRepeat !== undefined) {
        optionalUpdates.repeat = resolvedRepeat;
      }

      const previousReminder =
        (target as { reminder?: unknown }).reminder ?? existingDetails.reminder;
      const resolvedReminder = resolveUpdatedString(input.reminder, previousReminder);
      if (resolvedReminder !== undefined) {
        optionalUpdates.reminder = resolvedReminder;
      }

      const previousEventType =
        (target as { eventType?: unknown }).eventType ?? existingDetails.eventType;
      const resolvedEventType = resolveUpdatedString(
        input.eventType,
        previousEventType,
      );
      if (resolvedEventType !== undefined) {
        optionalUpdates.eventType = resolvedEventType;
      }

      const previousPlatform =
        (target as { platform?: unknown }).platform ?? existingDetails.platform;
      const resolvedPlatform = resolveUpdatedString(input.platform, previousPlatform);
      if (resolvedPlatform !== undefined) {
        optionalUpdates.platform = resolvedPlatform;
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

        const repeatField = pickResolvedField<string | null>("repeat");
        const reminderField = pickResolvedField<string | null>("reminder");
        const eventTypeField = pickResolvedField<string | null>("eventType");
        const platformField = pickResolvedField<string | null>("platform");

        const assignOptional = (field: string, value: unknown) => {
          const container = updatedEvent as Record<string, unknown>;
          if (value !== undefined) {
            container[field] = value;
          } else {
            delete container[field];
          }
        };

        assignOptional("repeat", repeatField);
        assignOptional("reminder", reminderField);
        assignOptional("eventType", eventTypeField);
        assignOptional("platform", platformField);

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

  const handleToggleTask = useCallback(
    async (taskId: string) => {
      if (!projectId) return;
      const previous = tasksRef.current;
      const target = previous.find(
        (task) => task.taskId === taskId || (task as { id?: string }).id === taskId,
      );
      if (!target) return;

      const nextStatus = target.status === "done" ? "todo" : "done";
      const optimistic = previous.map((task) =>
        task.taskId === target.taskId || (task as { id?: string }).id === taskId
          ? { ...task, status: nextStatus }
          : task,
      );

      previousTasksSnapshot.current = previous;
      tasksRef.current = optimistic;
      setProjectTasks(optimistic);

      try {
        await updateTask({
          ...target,
          projectId,
          taskId: target.taskId,
          status: nextStatus,
        });
      } catch (error) {
        console.error("Failed to toggle task", error);
        const snapshot = previousTasksSnapshot.current;
        if (snapshot) {
          tasksRef.current = snapshot;
          setProjectTasks(snapshot);
        }
      }
    },
    [projectId],
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
      navigate("/dashboard/projects/allprojects");
    },
    [navigate, setProjects, setSelectedProjects],
  );

  const handleBack = useCallback(() => {
    if (!projectId) {
      navigate("/dashboard/projects/allprojects");
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
      projectId={activeProject?.projectId}
      theme={projectPalette}
      header={
        <ProjectHeader
          activeProject={activeProject ?? null}
          parseStatusToNumber={parseStatusToNumber}
          userId={userId}
          onProjectDeleted={handleProjectDeleted}
          showWelcomeScreen={handleBack}
          onActiveProjectChange={handleActiveProjectChange}
          onOpenFiles={() => setFilesOpen(true)}
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

      <div className="calendar-page-wrapper">
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
          teamMembers={teamMembers}
          onRefreshTasks={refreshProjectTasks}
          taskProjects={quickCreateProjects}
          activeProjectId={activeProject?.projectId ?? null}
          activeProjectName={activeProject?.title ?? null}
          activeProjectColor={(activeProject?.color as string | undefined) ?? null}
        />
      </div>
    </ProjectPageLayout>
  );
};

export default CalendarPage;
