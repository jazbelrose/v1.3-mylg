import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { Sparkles, X } from "lucide-react";
import styles from "./task-spellbook-modal.module.css";
import type { CalendarEvent, CalendarTask } from "../utils";
import { fmtLocal, safeDate } from "../utils";
import { parseTimeToMinutes } from "./timelineLayout";
import { buildDoablePlans, type BusyBlock, type DoablePlan, type DoableDraft } from "../lib/doablePlanner";
import {
  buildSpellbookVariants,
  parseSpellbookInput,
  type SpellbookParseResult,
  type SpellbookVariant,
  type SpellbookVariantId,
} from "../lib/taskSpellbook";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

export type TaskSpellbookApplyRequest = {
  targetDate: string; // YYYY-MM-DD
  inputSource: "paste" | "load-today";
  existingTaskIds: string[];
  variantId: SpellbookVariantId;
  variant: SpellbookVariant;
  parseResult: SpellbookParseResult;
  autoPack: boolean;
  planId: string | null;
  plan: DoablePlan | null;
};

export type TaskSpellbookModalProps = {
  isOpen: boolean;
  anchorDate: Date;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  activeProjectId?: string | null;
  initialSource?: "paste" | "load-today";
  onClose: () => void;
  onApply: (request: TaskSpellbookApplyRequest) => Promise<void> | void;
  /** Active project accent color (hex format, e.g., "#FA3356") */
  accentColor?: string | null;
};

const buildBusyBlocksForDate = (dateIso: string, events: CalendarEvent[], tasks: CalendarTask[]): BusyBlock[] => {
  const busy: BusyBlock[] = [];

  events.forEach((event) => {
    if (event.date !== dateIso) return;
    if (!event.start || !event.end) return;
    const startMinutes = parseTimeToMinutes(event.start);
    const endMinutes = parseTimeToMinutes(event.end);
    if (startMinutes == null || endMinutes == null) return;
    if (endMinutes <= startMinutes) return;
    busy.push({ startMinutes, endMinutes });
  });

  tasks.forEach((task) => {
    if (task.due !== dateIso) return;
    if (!task.start || !task.end) return;
    const startMinutes = parseTimeToMinutes(task.start);
    const endMinutes = parseTimeToMinutes(task.end);
    if (startMinutes == null || endMinutes == null) return;
    if (endMinutes <= startMinutes) return;
    busy.push({ startMinutes, endMinutes });
  });

  return busy;
};

const isMeaningfulText = (value: string) => value.trim().length >= 3;

const formatEstHours = (totalMinutes: number) => {
  const hours = Math.round((totalMinutes / 60) * 2) / 2;
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  return `${hours % 1 === 0 ? String(Math.round(hours)) : String(hours)}h`;
};

const formatDurationHint = (minutes: number | undefined) => {
  const value = typeof minutes === "number" && Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  if (value <= 0) return "";
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const rem = value % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
};

const resolveTaskIdentifier = (task: CalendarTask) => {
  const source = task.source as unknown as { taskId?: string; id?: string };
  return source.taskId ?? source.id ?? task.id ?? null;
};

const resolveProjectId = (task: CalendarTask) => {
  const source = task.source as unknown as { projectId?: string };
  return source.projectId ?? null;
};

const buildLoadTodayCandidates = (dateIso: string, tasks: CalendarTask[], activeProjectId?: string | null) => {
  const cutoff = safeDate(dateIso);
  if (!cutoff) return [];

  return tasks
    .filter((task) => {
      if (activeProjectId && resolveProjectId(task) !== activeProjectId) return false;
      const due = task.due ?? null;
      if (!due) return false;
      const dueDate = safeDate(due);
      if (!dueDate) return false;
      if (dueDate.getTime() > cutoff.getTime()) return false;

      const isDone = task.done === true || task.status === "done" || task.status === "archived";
      if (isDone) return false;

      const kind = (task.kind ?? "").toLowerCase();
      if (kind === "intent") return false;
      if (kind === "focus_block") return false;
      if (task.focusBlockId) return false;
      if (task.start || task.end) return false;
      return true;
    })
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "") || (a.title ?? "").localeCompare(b.title ?? ""));
};

const toDraftsFromVariant = (variant: SpellbookVariant): DoableDraft[] => {
  if (variant.focusBlocks.length > 0) {
    return variant.focusBlocks.map((block, idx) => ({
      id: `block-${idx}`,
      title: block.title,
      durationMinutes: block.durationMinutes,
    }));
  }

  return variant.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.kind === "task")
    .map(({ item, idx }) => ({
      id: `item-${idx}`,
      title: item.title,
      durationMinutes: item.durationMinutes,
    }));
};

function hexToRgb(hex: string): string {
  const cleaned = hex.replace("#", "");
  const bigint = parseInt(cleaned, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

export default function TaskSpellbookModal({
  isOpen,
  anchorDate,
  events,
  tasks,
  activeProjectId,
  initialSource = "paste",
  onClose,
  onApply,
  accentColor,
}: TaskSpellbookModalProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputSource, setInputSource] = useState<"paste" | "load-today">(initialSource);
  const [pasteText, setPasteText] = useState("");
  const [text, setText] = useState("");
  const [targetDate, setTargetDate] = useState<string>(() => fmtLocal(anchorDate));
  const [variantId, setVariantId] = useState<SpellbookVariantId>("producer-standard");
  const [autoPack, setAutoPack] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("balanced");
  const [isApplying, setIsApplying] = useState(false);
  const [selectedLoadTodayTaskIds, setSelectedLoadTodayTaskIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!isOpen) return;
    setTargetDate(fmtLocal(anchorDate));
  }, [anchorDate, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setInputSource(initialSource);
  }, [initialSource, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (inputSource === "paste") {
      setText(pasteText);
      return;
    }
  }, [inputSource, isOpen, pasteText, targetDate, tasks]);

  const loadTodayCandidates = useMemo(
    () => buildLoadTodayCandidates(targetDate, tasks, activeProjectId),
    [activeProjectId, targetDate, tasks],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (inputSource !== "load-today") return;
    const ids = new Set<string>();
    loadTodayCandidates.forEach((task) => {
      const id = resolveTaskIdentifier(task);
      if (id) ids.add(id);
    });
    setSelectedLoadTodayTaskIds(ids);
  }, [inputSource, isOpen, loadTodayCandidates]);

  const selectedLoadTodayTasks = useMemo(() => {
    if (inputSource !== "load-today") return [];
    const selected = selectedLoadTodayTaskIds;
    return loadTodayCandidates.filter((task) => {
      const id = resolveTaskIdentifier(task);
      return id ? selected.has(id) : false;
    });
  }, [inputSource, loadTodayCandidates, selectedLoadTodayTaskIds]);

  const parseResult = useMemo<SpellbookParseResult>(() => {
    if (inputSource === "paste") return parseSpellbookInput(text);

    const items = selectedLoadTodayTasks
      .map((task) => {
        const title = (task.title ?? "").trim();
        if (!title) return null;
        return {
          kind: "task" as const,
          raw: resolveTaskIdentifier(task) ?? title,
          title,
          cluster: (task.cluster ?? "").trim() || "General",
          tags: (task.tags ?? []).filter((t) => typeof t === "string"),
          durationMinutes: typeof task.durationMinutes === "number" && task.durationMinutes > 0 ? task.durationMinutes : 30,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const clusters = [...new Set(items.map((item) => item.cluster || "General"))];
    const totalMinutes = items.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
    return { items, clusters, totalMinutes };
  }, [inputSource, selectedLoadTodayTasks, text]);

  const variants = useMemo(() => buildSpellbookVariants(parseResult), [parseResult]);
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === variantId) ?? variants[0],
    [variants, variantId],
  );

  const busyBlocks = useMemo(() => buildBusyBlocksForDate(targetDate, events, tasks), [events, tasks, targetDate]);
  const drafts = useMemo(() => toDraftsFromVariant(selectedVariant), [selectedVariant]);
  const plans = useMemo(() => buildDoablePlans({ drafts, busy: busyBlocks }), [drafts, busyBlocks]);
  const selectedPlan = useMemo(
    () => (autoPack ? plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] : null),
    [autoPack, plans, selectedPlanId],
  );

  useEffect(() => {
    if (!autoPack) return;
    if (plans.some((plan) => plan.id === selectedPlanId)) return;
    setSelectedPlanId(plans[0]?.id ?? "balanced");
  }, [autoPack, plans, selectedPlanId]);

  const handleApply = useCallback(async () => {
    if (!selectedVariant) return;
    if (inputSource === "paste" && !isMeaningfulText(text)) return;
    if (inputSource === "load-today" && selectedLoadTodayTasks.length === 0) return;

    const resolvedTarget = safeDate(targetDate) ? targetDate : fmtLocal(anchorDate);
    const plan = autoPack ? selectedPlan : null;
    const planId = autoPack ? plan?.id ?? null : null;

    try {
      setIsApplying(true);
      await onApply({
        targetDate: resolvedTarget,
        inputSource,
        existingTaskIds:
          inputSource === "load-today"
            ? selectedLoadTodayTasks
                .map((task) => resolveTaskIdentifier(task))
                .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
            : [],
        variantId: selectedVariant.id,
        variant: selectedVariant,
        parseResult,
        autoPack,
        planId,
        plan,
      });
      onClose();
      setText("");
      setPasteText("");
      setInputSource("paste");
    } finally {
      setIsApplying(false);
    }
  }, [
    anchorDate,
    autoPack,
    inputSource,
    onApply,
    onClose,
    parseResult,
    selectedLoadTodayTasks,
    selectedPlan,
    selectedVariant,
    targetDate,
    text,
  ]);

  const accentStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!accentColor || typeof accentColor !== "string" || accentColor.trim() === "") {
      return undefined;
    }
    const trimmed = accentColor.trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
      return undefined;
    }
    const rgb = hexToRgb(trimmed);
    return {
      "--color-accent": trimmed,
      "--spellbook-accent-rgb": rgb,
    } as React.CSSProperties;
  }, [accentColor]);

  if (!isOpen) return null;

  const hasItems = parseResult.items.length > 0;
  const canApply =
    !isApplying &&
    (inputSource === "paste" ? isMeaningfulText(text) : selectedLoadTodayTasks.length > 0);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
      closeTimeoutMS={180}
      className={{
        base: styles.modal,
        afterOpen: styles.modalAfterOpen,
        beforeClose: styles.modalBeforeClose,
      }}
      overlayClassName={{
        base: styles.overlay,
        afterOpen: styles.overlayAfterOpen,
        beforeClose: styles.overlayBeforeClose,
      }}
    >
      <div className={styles.shell} style={accentStyle}>
        <div className={styles.header}>
          <div className={styles.title}>
            <Sparkles size={16} aria-hidden />
            <span>Spellbook</span>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.leftPane}>
            <div className={styles.sourceRow}>
              <div className={styles.sourceToggle} role="tablist" aria-label="Input source">
                <button
                  type="button"
                  className={`${styles.sourceButton} ${inputSource === "paste" ? styles.sourceButtonActive : ""}`}
                  onClick={() => setInputSource("paste")}
                  aria-selected={inputSource === "paste"}
                  role="tab"
                >
                  Paste
                </button>
                <button
                  type="button"
                  className={`${styles.sourceButton} ${inputSource === "load-today" ? styles.sourceButtonActive : ""}`}
                  onClick={() => {
                    if (inputSource === "paste") setPasteText(text);
                    setInputSource("load-today");
                  }}
                  aria-selected={inputSource === "load-today"}
                  role="tab"
                >
                  Load Today
                </button>
              </div>
              {inputSource === "load-today" ? (
                <div className={styles.loadTodayCount}>{selectedLoadTodayTasks.length} selected</div>
              ) : null}
            </div>

            {inputSource === "paste" ? (
              <textarea
                ref={inputRef}
                className={styles.textarea}
                placeholder={`Paste anything: notes dump, PR bullets, checklists...\n\nExamples:\n- GitHub: review PR #421 + merge (45m)\n- Production checklist: comms, load-in, backups\n- @Leah: handoff notes + next steps\n- @Jaz: QA pass + screenshots`}
                value={text}
                onChange={(event) => {
                  const next = event.target.value;
                  setText(next);
                  setPasteText(next);
                }}
                spellCheck={false}
              />
            ) : (
              <div className={styles.loadList} role="list" aria-label="Tasks due today">
                {loadTodayCandidates.length === 0 ? (
                  <div className={styles.loadEmpty}>No due/overdue unscheduled tasks found.</div>
                ) : (
                  loadTodayCandidates.map((task) => {
                    const id = resolveTaskIdentifier(task);
                    if (!id) return null;
                    const checked = selectedLoadTodayTaskIds.has(id);
                    const dur = formatDurationHint(task.durationMinutes);
                    const due = task.due ?? "";
                    return (
                      <label key={id} className={styles.loadRow} role="listitem">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = new Set(selectedLoadTodayTaskIds);
                            if (event.target.checked) next.add(id);
                            else next.delete(id);
                            setSelectedLoadTodayTaskIds(next);
                          }}
                        />
                        <div className={styles.loadMain}>
                          <div className={styles.loadTitle}>{task.title}</div>
                          <div className={styles.loadMeta}>
                            {due ? <span>Due {due}</span> : null}
                            {task.cluster ? <span>• {task.cluster}</span> : null}
                            {dur ? <span>• {dur}</span> : null}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            )}

            <div className={styles.quickMeta}>
              <div className={styles.summary} aria-live="polite">
                {hasItems ? (
                  <span>
                    Detected: {parseResult.items.length} items • {parseResult.clusters.length} clusters •{" "}
                    {formatEstHours(parseResult.totalMinutes)} est.
                  </span>
                ) : (
                  <span>Paste anything to detect items.</span>
                )}
              </div>
            </div>
          </div>

          <div className={styles.rightPane}>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Structures</div>
                <div className={styles.sectionHint}>Pick a preset</div>
              </div>
              <div className={styles.cardRail}>
                {variants.map((variant) => {
                  const taskCount = variant.items.filter((i) => i.kind === "task").length;
                  const totalTaskMinutes = variant.items.reduce(
                    (sum, item) => sum + (item.kind === "task" ? item.durationMinutes : 0),
                    0,
                  );
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      className={`${styles.card} ${variant.id === selectedVariant.id ? styles.cardActive : ""}`}
                      onClick={() => setVariantId(variant.id)}
                      disabled={!hasItems}
                    >
                      <div className={styles.cardTop}>
                        <div className={styles.cardLabel}>{variant.label}</div>
                        <div className={styles.cardMetric}>
                          {taskCount} • {formatEstHours(totalTaskMinutes)}
                        </div>
                      </div>
                      <div className={styles.cardHint}>{variant.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Plans</div>
                <div className={styles.sectionHint}>Balanced / Early / Late</div>
              </div>
              <div className={styles.planRail}>
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    className={`${styles.planButton} ${
                      autoPack && plan.id === selectedPlanId ? styles.planButtonActive : ""
                    }`}
                    onClick={() => setSelectedPlanId(plan.id)}
                    disabled={!hasItems || !autoPack}
                  >
                    <div className={styles.planTop}>
                      <div className={styles.planLabel}>{plan.label}</div>
                      <div className={styles.planMetric}>
                        {Math.round(plan.scheduledMinutes / 5) * 5}m
                        {plan.overflow.length > 0 ? ` • +${plan.overflow.length} overflow` : ""}
                      </div>
                    </div>
                    <div className={styles.planHint}>{plan.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.toggles}>
            <label className={styles.field}>
              <span>Date</span>
              <input
                className={styles.date}
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </label>
            <label className={`${styles.field} ${styles.checkboxField}`}>
              <span>Auto-pack into day</span>
              <input type="checkbox" checked={autoPack} onChange={(event) => setAutoPack(event.target.checked)} />
            </label>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.apply} disabled={!canApply} onClick={handleApply}>
              {isApplying ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
