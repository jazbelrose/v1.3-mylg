import { useCallback, useEffect, useMemo, useRef, useState, FormEvent } from "react";
import type { MouseEvent as ReactMouseEvent, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import { normalizeMessage } from "@/shared/utils/websocketUtils";
import { getColor } from "@/shared/utils/colorUtils";
import { addDays, startOfWeek } from "@/dashboard/home/utils/dateUtils";
import {
  createBudgetItem,
  updateBudgetItem,
  createEvent as createEventApi,
  updateEvent as updateEventApi,
  deleteEvent as deleteEventApi,
} from "@/shared/utils/api";
import { slugify } from "@/shared/utils/slug";
import { useBudget } from "@/dashboard/project/features/budget/context/BudgetContext";
import { notify } from "@/shared/ui/ToastNotifications";
import { useDayOverlay } from "./hooks";
import { parseBudget } from "@/shared/utils/budgetUtils";
import { buildWeekMatrix } from "./utils";
import {
  computeEventTotalHours,
  computeFinalCost,
  formatDateLabel,
  getDateKey,
  safeParse,
} from "./utils";
import type { Project, TimelineEvent } from "./types";
import { INTERACTIVE_SAFE_PAD, WRAPPER_INTERACTIVE_SELECTOR } from "./constants";
import EventList from "./EventList";
import EventModal from "./EventModal";

export interface CalendarControllerOptions {
  project: Project;
  initialFlashDate?: string | null;
  onDateSelect?: (dateKey: string | null) => void;
  onWrapperClick?: () => void;
  dayHeaderIdPrefix: string;
  showEventList?: boolean;
}

export interface CalendarControllerResult {
  wrapperHover: boolean;
  wrapperHandlers: {
    onClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
    onMouseEnter: (event: ReactMouseEvent<HTMLDivElement>) => void;
    onMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
    onMouseLeave: () => void;
  };
  monthTitle: string;
  weekdayLabels: string[];
  weeks: ReturnType<typeof buildWeekMatrix>;
  startDate: Date | null;
  endDate: Date | null;
  projectColor: string;
  selectedKey: string | null;
  todayKey: string | null;
  flashKey: string | null;
  rangeSet: Set<string>;
  eventsByDate: Record<string, TimelineEvent[]>;
  openDay: (anchor: HTMLButtonElement, meta: { date: Date; dayKey: string; inMonth: boolean }) => void;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  overlayState: {
    isOpen: boolean;
    isMobile: boolean;
    anchor: HTMLButtonElement | null;
    dayKey: string | null;
    dateLabel: string;
    events: TimelineEvent[];
    headerId: string;
    close: (options?: { focus?: boolean }) => void;
    onNew: () => void;
    onEdit: (event: TimelineEvent) => void;
    onDelete: (event: TimelineEvent) => void;
  };
  eventList: null | {
    component: ReactElement;
  };
  modal: {
    component: ReactElement;
  };
}

function buildLandingDate(startDate: Date | null, endDate: Date | null, today: Date) {
  if (!startDate) return today;
  if (today < startDate) return startDate;
  if (endDate && today > endDate) return endDate;
  return today;
}

function buildDefaultStartDate(startDate: Date | null, endDate: Date | null, today: Date) {
  if (startDate) {
    const rangeEnd = endDate || new Date(startDate.getTime() + 30 * 86400000);
    const midTime = startDate.getTime() + (rangeEnd.getTime() - startDate.getTime()) / 2;
    const mid = new Date(midTime);
    return new Date(mid.getFullYear(), mid.getMonth(), 1);
  }
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

export function useCalendarController({
  project,
  initialFlashDate,
  onDateSelect,
  onWrapperClick,
  dayHeaderIdPrefix,
  showEventList = false,
}: CalendarControllerOptions): CalendarControllerResult {
  const navigate = useNavigate();
  const { activeProject, user } = useData();
  const { ws } = useSocket() || {};

  const startDate = useMemo(
    () => safeParse((project?.productionStart as string) || (project?.dateCreated as string)),
    [project?.productionStart, project?.dateCreated]
  );

  const endDate = useMemo(() => {
    const parsed = safeParse(project?.finishline as string);
    if (!parsed && startDate) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + 30);
      return d;
    }
    return parsed;
  }, [project?.finishline, startDate]);

  const today = useMemo(() => new Date(), []);
  const landingDate = useMemo(() => buildLandingDate(startDate, endDate, today), [
    startDate,
    endDate,
    today,
  ]);

  const defaultActiveStartDate = useMemo(
    () => buildDefaultStartDate(startDate, endDate, today),
    [startDate, endDate, today]
  );

  const [selectedDate, setSelectedDate] = useState<Date>(landingDate);
  const [activeStartDate, setActiveStartDate] = useState<Date>(defaultActiveStartDate);
  const userNavigatedRef = useRef(false);

  const [events, setEvents] = useState<TimelineEvent[]>(project?.timelineEvents || []);

  const [showModal, setShowModal] = useState(false);
  const [eventDesc, setEventDesc] = useState("");
  const [eventHours, setEventHours] = useState<string>("");
  const [startDateInput, setStartDateInput] = useState<string>(getDateKey(selectedDate) || "");
  const [endDateInput, setEndDateInput] = useState<string>(getDateKey(selectedDate) || "");
  const [descOptions, setDescOptions] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const ignoreNextWrapperClickRef = useRef(false);
  const [wrapperHover, setWrapperHover] = useState(false);
  const lastInteractiveRectRef = useRef<DOMRect | null>(null);

  const { budgetHeader, budgetItems, setBudgetItems } = useBudget();

  const [flashDate, setFlashDate] = useState<Date | null>(
    initialFlashDate ? safeParse(initialFlashDate) : null
  );

  const projectColor = useMemo(
    () => project?.color || getColor(project?.projectId || project?.title || "project"),
    [project?.color, project?.projectId, project?.title]
  );

  const monthStart = useMemo(
    () => new Date(activeStartDate.getFullYear(), activeStartDate.getMonth(), 1),
    [activeStartDate]
  );

  const weeks = useMemo(() => buildWeekMatrix(monthStart), [monthStart]);

  const monthTitle = useMemo(
    () => monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [monthStart]
  );

  const weekdayLabels = useMemo(() => {
    const base = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, idx) =>
      addDays(base, idx).toLocaleDateString(undefined, { weekday: "short" })
    );
  }, []);

  const selectedKey = getDateKey(selectedDate);
  const flashKey = getDateKey(flashDate);
  const todayKey = getDateKey(today);

  const rangeSet = useMemo(() => {
    const set = new Set<string>();
    if (startDate && endDate) {
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        set.add(getDateKey(d)!);
      }
    }
    return set;
  }, [startDate, endDate]);

  const eventsByDate = useMemo(
    () =>
      events.reduce<Record<string, TimelineEvent[]>>((acc, ev) => {
        if (ev.date) {
          (acc[ev.date] ||= []).push(ev);
        }
        return acc;
      }, {}),
    [events]
  );

  const overlay = useDayOverlay();
  const lastActiveDayRef = useRef<HTMLButtonElement | null>(null);

  const closeDayOverlay = useCallback(
    (options?: { focus?: boolean }) => {
      const wasOpen = overlay.isOpen;
      overlay.close();
      if (!wasOpen || options?.focus === false) return;
      if (lastActiveDayRef.current) {
        lastActiveDayRef.current.focus({ preventScroll: true });
      }
    },
    [overlay]
  );

  const updateWrapperHover = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (overlay.isOpen) {
        lastInteractiveRectRef.current = null;
        setWrapperHover(false);
        return;
      }

      const target = event.target as Element | null;
      const interactiveEl = target?.closest(WRAPPER_INTERACTIVE_SELECTOR) as HTMLElement | null;

      if (interactiveEl) {
        const rect = interactiveEl.getBoundingClientRect();
        lastInteractiveRectRef.current = new DOMRect(
          rect.left - INTERACTIVE_SAFE_PAD,
          rect.top - INTERACTIVE_SAFE_PAD,
          rect.width + INTERACTIVE_SAFE_PAD * 2,
          rect.height + INTERACTIVE_SAFE_PAD * 2
        );
        setWrapperHover(false);
        return;
      }

      const safeRect = lastInteractiveRectRef.current;
      if (safeRect) {
        const { clientX, clientY } = event;
        if (
          clientX >= safeRect.left &&
          clientX <= safeRect.right &&
          clientY >= safeRect.top &&
          clientY <= safeRect.bottom
        ) {
          setWrapperHover(false);
          return;
        }
      }

      lastInteractiveRectRef.current = null;
      setWrapperHover(true);
    },
    [overlay.isOpen]
  );

  const wrapperHandlers = useMemo(
    () => ({
      onClick: (event: React.MouseEvent<HTMLDivElement>) => {
        if (showModal) return;
        if (overlay.isOpen) {
          closeDayOverlay();
          return;
        }
        if (ignoreNextWrapperClickRef.current) {
          ignoreNextWrapperClickRef.current = false;
          return;
        }

        const target = event.target as Node | null;
        if (target instanceof Element && target.closest(WRAPPER_INTERACTIVE_SELECTOR)) {
          return;
        }

        if (onWrapperClick) {
          onWrapperClick();
          return;
        }

        navigate("/dashboard/calendar");
      },
      onMouseEnter: updateWrapperHover,
      onMouseMove: updateWrapperHover,
      onMouseLeave: () => {
        lastInteractiveRectRef.current = null;
        setWrapperHover(false);
      },
    }),
    [
      closeDayOverlay,
      navigate,
      onWrapperClick,
      overlay.isOpen,
      showModal,
      updateWrapperHover,
    ]
  );

  const handleDateSelection = useCallback(
    (date: Date) => {
      userNavigatedRef.current = true;
      setSelectedDate(date);
      onDateSelect?.(getDateKey(date));
    },
    [onDateSelect]
  );

  useEffect(() => {
    if (initialFlashDate) {
      const d = safeParse(initialFlashDate);
      if (d) {
        setSelectedDate(d);
        setActiveStartDate(new Date(d.getFullYear(), d.getMonth(), 1));
        setFlashDate(d);
      }
    }
  }, [initialFlashDate]);

  useEffect(() => {
    if (!ws || !project?.projectId) return;

    const payload = JSON.stringify({
      action: "setActiveConversation",
      conversationId: `project#${project.projectId}`,
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
  }, [ws, project?.projectId]);

  useEffect(() => {
    if (!userNavigatedRef.current) setSelectedDate(landingDate);
  }, [landingDate]);

  useEffect(() => {
    if (initialFlashDate) return;
    if (!userNavigatedRef.current) setActiveStartDate(defaultActiveStartDate);
  }, [defaultActiveStartDate, initialFlashDate]);

  useEffect(() => {
    userNavigatedRef.current = false;
  }, [project?.projectId]);

  useEffect(() => {
    setEvents(project?.timelineEvents || []);
  }, [project]);

  useEffect(() => {
    if (!flashDate) return;
    const t = window.setTimeout(() => setFlashDate(null), 800);
    return () => window.clearTimeout(t);
  }, [flashDate]);

  const overlayEvents = overlay.dayKey ? eventsByDate[overlay.dayKey] || [] : [];
  const overlayDateLabel = overlay.date ? formatDateLabel(overlay.date) : "";
  const overlayHeaderId = useMemo(
    () => (overlay.dayKey ? `${dayHeaderIdPrefix}-${overlay.dayKey}` : `${dayHeaderIdPrefix}`),
    [dayHeaderIdPrefix, overlay.dayKey]
  );

  const extractDescOptions = useCallback((evts: TimelineEvent[]) => {
    return Array.from(
      new Set(
        evts
          .map((ev) => (ev.description || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );
  }, []);

  useEffect(() => {
    setDescOptions(extractDescOptions(events));
  }, [events, extractDescOptions]);

  const getNextElementKey = useCallback(() => {
    const slug = slugify((activeProject?.title || "").trim());
    let max = 0;
    budgetItems.forEach((it: Record<string, unknown>) => {
      if (typeof it.elementKey === "string") {
        const match = it.elementKey.match(/-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > max) max = num;
        }
      }
    });
    const nextNum = String(max + 1).padStart(4, "0");
    return `${slug}-${nextNum}`;
  }, [activeProject?.title, budgetItems]);

  const getNextElementId = useCallback(
    (cat?: string) => {
      if (!cat) return "";
      let max = 0;
      budgetItems.forEach((it: Record<string, unknown>) => {
        if (it.category === cat && typeof it.elementId === "string") {
          const match = it.elementId.match(/-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > max) max = num;
          }
        }
      });
      return `${cat}-${String(max + 1).padStart(4, "0")}`;
    },
    [budgetItems]
  );

  const [createLineItem, setCreateLineItem] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [elementKey, setElementKey] = useState<string>("");
  const [elementId, setElementId] = useState<string>("");
  const [quantity, setQuantity] = useState<number | string>(1);
  const [unit, setUnit] = useState<string>("Each");
  const [budgetedCost, setBudgetedCost] = useState<string>("");
  const [markup, setMarkup] = useState<string>("");
  const [finalCost, setFinalCost] = useState<string>("");

  useEffect(() => {
    if (createLineItem) {
      const cat = category || "AUDIO-VISUAL";
      if (!category) setCategory(cat);
      setElementKey(getNextElementKey());
      setElementId(getNextElementId(cat));
    }
  }, [createLineItem, getNextElementKey, getNextElementId, category]);

  useEffect(() => {
    if (createLineItem && category) {
      setElementId(getNextElementId(category));
    }
  }, [category, createLineItem, getNextElementId]);

  useEffect(() => {
    setFinalCost(computeFinalCost(quantity, budgetedCost, markup));
  }, [quantity, budgetedCost, markup]);

  const resetModalState = useCallback(() => {
    setEventDesc("");
    setEventHours("");
    setEditId(null);
    setCreateLineItem(false);
    setCategory("");
    setElementKey("");
    setElementId("");
    setQuantity(1);
    setUnit("Each");
    setBudgetedCost("");
    setMarkup("");
    setFinalCost("");
    const key = getDateKey(selectedDate) || "";
    setStartDateInput(key);
    setEndDateInput(key);
  }, [selectedDate]);

  const openAddEventModal = useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>, dateKeyParam?: string) => {
      event?.stopPropagation();
      event?.preventDefault();
      closeDayOverlay({ focus: false });
      resetModalState();
      const key = dateKeyParam || getDateKey(selectedDate) || "";
      const parsed = safeParse(key);
      if (parsed) {
        setSelectedDate(parsed);
      }
      setStartDateInput(key);
      setEndDateInput(key);
      setShowModal(true);
    },
    [closeDayOverlay, resetModalState, selectedDate]
  );

  const openEditEventModal = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      const ev = events.find((e) => e.id === id);
      if (!ev) return;

      const d = safeParse(ev.date) || new Date();
      setSelectedDate(d);
      setEventDesc((ev.description || "").toUpperCase());
      setEventHours(String(ev.hours ?? ""));
      setStartDateInput(ev.date || getDateKey(selectedDate) || "");
      setEndDateInput(ev.date || getDateKey(selectedDate) || "");
      setEditId(id);

      if (ev.budgetItemId) {
        const item = budgetItems.find((it) => it.budgetItemId === ev.budgetItemId);
        if (item) {
          setCreateLineItem(true);
          setCategory(String((item as Record<string, unknown>).category || ""));
          setElementKey(String((item as Record<string, unknown>).elementKey || ""));
          setElementId(String((item as Record<string, unknown>).elementId || ""));
          setQuantity(((item as Record<string, unknown>).quantity as number) ?? 1);
          setUnit(String((item as Record<string, unknown>).unit || "Each"));
          setBudgetedCost(
            (item as Record<string, unknown>).itemBudgetedCost != null
              ? String((item as Record<string, unknown>).itemBudgetedCost)
              : ""
          );
          setMarkup(
            (item as Record<string, unknown>).itemMarkUp != null
              ? `${((item as Record<string, unknown>).itemMarkUp as number || 0) * 100}%`
              : ""
          );
          setFinalCost(
            (item as Record<string, unknown>).itemFinalCost != null
              ? computeFinalCost(
                  ((item as Record<string, unknown>).quantity as number) ?? 1,
                  (item as Record<string, unknown>).itemBudgetedCost as number | string,
                  `${((item as Record<string, unknown>).itemMarkUp as number || 0) * 100}%`
                )
              : ""
          );
        } else {
          setCreateLineItem(false);
        }
      } else {
        setCreateLineItem(false);
      }
      setShowModal(true);
    },
    [budgetItems, events, selectedDate]
  );

  const goToPrevMonth = useCallback(() => {
    const prev = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    setActiveStartDate(prev);
    userNavigatedRef.current = true;
  }, [monthStart]);

  const goToNextMonth = useCallback(() => {
    const next = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    setActiveStartDate(next);
    userNavigatedRef.current = true;
  }, [monthStart]);

  const notifyAnalytics = useCallback((action: "open" | "create" | "edit", dayKey: string, projectId?: string) => {
    if (typeof window === "undefined") return;
    const analytics = (window as typeof window & {
      analytics?: { track?: (event: string, data?: Record<string, unknown>) => void };
    }).analytics;
    analytics?.track?.(`project_calendar_day_${action}`, {
      source: "calendar-day",
      date: dayKey,
      projectId,
    });
  }, []);

const handleDayOpen = useCallback(
    (
      anchor: HTMLButtonElement,
      { date, dayKey }: { date: Date; dayKey: string; inMonth: boolean }
    ) => {
      if (!dayKey) return;

      if (overlay.isOpen && overlay.dayKey === dayKey) {
        closeDayOverlay();
        return;
      }

      handleDateSelection(date);
      userNavigatedRef.current = true;
      lastActiveDayRef.current = anchor;
      overlay.open(anchor, date, dayKey);
      notifyAnalytics("open", dayKey, project?.projectId);
    },
    [closeDayOverlay, handleDateSelection, notifyAnalytics, overlay, project?.projectId]
  );

  

  const handleDeleteEvent = useCallback(
    async (id: string | undefined) => {
      if (!id) return;
      const updated = events.filter((ev) => ev.id !== id);
      setEvents(updated);
      setDescOptions(extractDescOptions(updated));
      try {
        await deleteEventApi(project.projectId, id);
      } catch (err) {
        console.error("Error deleting event", err);
      }

      if (ws && (ws as WebSocket).readyState === WebSocket.OPEN) {
        const normalized = updated.map((ev) => {
          const eid = ev.id || uuid();
          return {
            ...ev,
            id: eid,
            eventId: ev.eventId || eid,
            createdAt: ev.createdAt || new Date().toISOString(),
          } as TimelineEvent;
        });
        ws.send(
          JSON.stringify(
            normalizeMessage(
              {
                action: "timelineUpdated",
                projectId: project.projectId,
                title: activeProject?.title,
                events: normalized,
                conversationId: `project#${project.projectId}`,
                username: user?.firstName || "Someone",
                senderId: user?.userId,
                timelineAction: "deleted",
              },
              "timelineUpdated"
            )
          )
        );
      }
    },
    [
      events,
      extractDescOptions,
      project.projectId,
      ws,
      activeProject?.title,
      user?.firstName,
      user?.userId,
    ]
  );

  const handleOverlayNew = useCallback(() => {
    const key = overlay.dayKey || getDateKey(selectedDate);
    if (!key) return;
    notifyAnalytics("create", key, project?.projectId);
    openAddEventModal(undefined, key);
  }, [notifyAnalytics, openAddEventModal, overlay.dayKey, project?.projectId, selectedDate]);

  const handleOverlayEdit = useCallback(
    (event: TimelineEvent) => {
      if (!event?.id) return;
      notifyAnalytics("edit", event.date, project?.projectId);
      closeDayOverlay({ focus: false });
      openEditEventModal(event.id);
    },
    [closeDayOverlay, notifyAnalytics, openEditEventModal, project?.projectId]
  );

  const handleOverlayDelete = useCallback(
    (event: TimelineEvent) => {
      if (!event?.id) return;
      const label = event.description ? `"${event.description}"` : "this event";
      const confirmed = window.confirm(`Delete ${label}?`);
      if (!confirmed) return;
      handleDeleteEvent(event.id);
    },
    [handleDeleteEvent]
  );

  const saveEvent = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();

      const start = safeParse(startDateInput) || selectedDate;
      let end = safeParse(endDateInput);
      if (!end || end < start) end = start;

      const desc = eventDesc.trim().toUpperCase();
      const existing = editId ? events.find((ev) => ev.id === editId) : null;
      const existingBudgetItemId = existing?.budgetItemId || null;

      let createdBudgetItemId: string | null = null;

      if (createLineItem && budgetHeader?.budgetId && project?.projectId) {
        try {
          const markNum = parseFloat(String(markup).replace(/%/g, ""));
          const markupNum = Number.isNaN(markNum) ? 0 : markNum / 100;
          const qtyNum = parseFloat(String(quantity)) || 0;
          const budgetNum = parseBudget(budgetedCost);
          const final = budgetNum * (1 + markupNum) * (qtyNum || 1);

          const itemData = {
            description: desc,
            category,
            elementKey,
            elementId,
            quantity: qtyNum,
            unit,
            itemBudgetedCost: budgetNum,
            itemMarkUp: markupNum,
            itemFinalCost: final,
            revision: budgetHeader.revision as number,
          };

          if (existingBudgetItemId) {
            const updated = await updateBudgetItem(
              project.projectId,
              existingBudgetItemId,
              itemData
            );
            setBudgetItems(
              budgetItems.map((it) => (it.budgetItemId === existingBudgetItemId ? updated : it))
            );
          } else {
            const item = await createBudgetItem(project.projectId, budgetHeader.budgetId as string, {
              ...itemData,
              budgetItemId: `LINE-${uuid()}`,
            });
            createdBudgetItemId = item.budgetItemId;
            setBudgetItems([...budgetItems, item]);
          }
        } catch (err) {
          console.error("Error creating budget item", err);
        }
      }

      const budgetItemId = createdBudgetItemId || existingBudgetItemId || null;

      const updated: TimelineEvent[] = editId !== null ? events.filter((ev) => ev.id !== editId) : [...events];

      const nowIso = new Date().toISOString();
      for (let d = new Date(start), i = 0; d <= (end as Date); d.setDate(d.getDate() + 1), i++) {
        const dateKey = getDateKey(d)!;
        const id = i === 0 && editId !== null ? editId : uuid();
        const ev: TimelineEvent = {
          id,
          eventId: id,
          date: dateKey,
          description: desc,
          hours: Number(eventHours),
          createdAt: nowIso,
          createdBy: user?.userId,
          ...(budgetItemId ? { budgetItemId } : {}),
        };
        updated.push(ev);
      }

      const existingIds = new Set(events.map((ev) => ev.id));
      const persisted: TimelineEvent[] = [];
      for (const ev of updated) {
        const eventId = ev.id || uuid();
        const payload = {
          projectId: project.projectId,
          eventId,
          id: eventId,
          date: ev.date,
          description: ev.description,
          hours: Number(ev.hours || 0),
          createdAt: ev.createdAt || new Date().toISOString(),
          createdBy: ev.createdBy || user?.userId,
          ...(ev.budgetItemId ? { budgetItemId: ev.budgetItemId } : {}),
        } as TimelineEvent & { projectId: string; eventId: string };
        try {
          if (existingIds.has(ev.id)) {
            await updateEventApi(payload);
          } else {
            await createEventApi(project.projectId, payload);
          }
          persisted.push(payload);
        } catch (err) {
          console.error("Error saving event", err);
        }
      }

      setEvents(persisted);
      setDescOptions(extractDescOptions(persisted));

      const timelineAction = editId ? "modified" : "added";

      if (ws && (ws as WebSocket).readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify(
            normalizeMessage(
              {
                action: "timelineUpdated",
                projectId: project.projectId,
                title: activeProject?.title,
                events: persisted,
                conversationId: `project#${project.projectId}`,
                username: user?.firstName || "Someone",
                senderId: user?.userId,
                timelineAction,
              },
              "timelineUpdated"
            )
          )
        );
      }

      notify("success", "Saved");
      closeDayOverlay();
      setShowModal(false);
      resetModalState();
    },
      [
        activeProject?.title,
        budgetHeader?.budgetId,
        budgetHeader?.revision,
        budgetItems,
        budgetedCost,
        category,
        closeDayOverlay,
        createLineItem,
        editId,
        elementId,
        elementKey,
        eventDesc,
        eventHours,
        events,
        extractDescOptions,
        markup,
        project.projectId,
        quantity,
        resetModalState,
        selectedDate,
        setBudgetItems,
        startDateInput,
        endDateInput,
        unit,
        user?.firstName,
        user?.userId,
        ws,
        setDescOptions,
      ]
  );

  const modalComponent = (
    <EventModal
      isOpen={showModal}
      isEditing={Boolean(editId)}
      startDateInput={startDateInput}
      endDateInput={endDateInput}
      eventDesc={eventDesc}
      eventHours={eventHours}
      createLineItem={createLineItem}
      category={category}
      elementKey={elementKey}
      elementId={elementId}
      quantity={quantity}
      unit={unit}
      budgetedCost={budgetedCost}
      markup={markup}
      finalCost={finalCost}
      descOptions={descOptions}
      onRequestClose={(event) => {
        if (event?.type === "click") {
          ignoreNextWrapperClickRef.current = true;
        }
        setShowModal(false);
      }}
      onSubmit={saveEvent}
      onChangeStartDate={(event) => setStartDateInput(event.target.value)}
      onChangeEndDate={(event) => setEndDateInput(event.target.value)}
      onChangeDescription={(event) => setEventDesc(event.target.value.toUpperCase())}
      onChangeHours={(event) => setEventHours(event.target.value)}
      onToggleCreateLineItem={(event) => setCreateLineItem(event.target.checked)}
      onChangeCategory={(event) => setCategory(event.target.value)}
      onChangeElementKey={(event) => setElementKey(event.target.value)}
      onChangeElementId={(event) => setElementId(event.target.value)}
      onChangeQuantity={(event) => setQuantity(event.target.value)}
      onChangeUnit={(event) => setUnit(event.target.value)}
      onChangeBudgetedCost={(event) => setBudgetedCost(event.target.value)}
      onBudgetedCostBlur={(event) => {
        const num = parseBudget(event.target.value);
        setBudgetedCost(num ? String(num) : "");
      }}
      onChangeMarkup={(event) => setMarkup(event.target.value)}
      onMarkupBlur={(event) => {
        const num = parseFloat(String(event.target.value).replace(/%/g, ""));
        if (!Number.isNaN(num)) setMarkup(`${num}%`);
        else setMarkup("");
      }}
    />
  );

  const eventsForSelected = useMemo(
    () => (selectedKey ? eventsByDate[selectedKey] || [] : []),
    [eventsByDate, selectedKey]
  );

  const orderedDateKeys = useMemo(() => Object.keys(eventsByDate).sort(), [eventsByDate]);

  const currentIndex = useMemo(
    () => (selectedKey ? orderedDateKeys.indexOf(selectedKey) : -1),
    [orderedDateKeys, selectedKey]
  );

  const hasPrevEvent = currentIndex > 0;
  const hasNextEvent = currentIndex >= 0 && currentIndex < orderedDateKeys.length - 1;

  const goToPrevEventDate = useCallback(() => {
    if (!hasPrevEvent) return;
    const prevKey = orderedDateKeys[currentIndex - 1];
    const parsed = safeParse(prevKey);
    if (parsed) {
      setSelectedDate(parsed);
      userNavigatedRef.current = true;
      setActiveStartDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  }, [currentIndex, hasPrevEvent, orderedDateKeys]);

  const goToNextEventDate = useCallback(() => {
    if (!hasNextEvent) return;
    const nextKey = orderedDateKeys[currentIndex + 1];
    const parsed = safeParse(nextKey);
    if (parsed) {
      setSelectedDate(parsed);
      userNavigatedRef.current = true;
      setActiveStartDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  }, [currentIndex, hasNextEvent, orderedDateKeys]);

  const totalHoursForDay = useMemo(() => computeEventTotalHours(eventsForSelected), [eventsForSelected]);
  const totalHoursForProject = useMemo(() => computeEventTotalHours(events), [events]);

  const eventListComponent = showEventList
    ? {
        component: (
          <EventList
            dateLabel={selectedKey || ""}
            events={eventsForSelected}
            projectColor={projectColor}
            totalHoursForDay={totalHoursForDay}
            totalHoursForProject={totalHoursForProject}
            hasPrevEvent={hasPrevEvent}
            hasNextEvent={hasNextEvent}
            onPrevEventDate={goToPrevEventDate}
            onNextEventDate={goToNextEventDate}
            onEdit={(id) => openEditEventModal(id)}
            onDelete={(id) => handleDeleteEvent(id)}
          />
        ),
      }
    : null;

  const overlayState = {
    isOpen: overlay.isOpen,
    isMobile: overlay.isMobile,
    anchor: overlay.anchor,
    dayKey: overlay.dayKey,
    dateLabel: overlayDateLabel,
    events: overlayEvents,
    headerId: overlayHeaderId,
    close: closeDayOverlay,
    onNew: handleOverlayNew,
    onEdit: handleOverlayEdit,
    onDelete: handleOverlayDelete,
  } as const;

  return {
    wrapperHover,
    wrapperHandlers,
    monthTitle,
    weekdayLabels,
    weeks,
    startDate,
    endDate,
    projectColor,
    selectedKey,
    todayKey,
    flashKey,
    rangeSet,
    eventsByDate,
    openDay: handleDayOpen,
    goToPrevMonth,
    goToNextMonth,
    overlayState,
    eventList: eventListComponent,
    modal: { component: modalComponent },
  };
}
