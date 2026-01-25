import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { Sparkles, X, AlertCircle, Info } from "lucide-react";
import styles from "./task-spellbook-modal.module.css";
import type { CalendarEvent, CalendarTask } from "../utils";
import { fmtLocal, safeDate } from "../utils";
import { blockMinutesFromWindow, getFocusBlockWindow, type FocusBlockWindowId, FOCUS_BLOCK_WINDOWS } from "@/shared/utils/focusBlockWindows";
import { packTasksIntoFocusBlock, type PackedTask } from "@/shared/utils/packTasksIntoFocusBlock";
import {
  buildSpellbookVariants,
  parseSpellbookInput,
  buildTaskSpellbookDraft,
  detectInputMode,
  draftItemsToLegacy,
  type SpellbookParseResult,
  type SpellbookVariant,
  type SpellbookVariantId,
  type TaskSpellbookDraft,
  type TaskSpellbookMode,
} from "../lib/taskSpellbook";
import {
  type TaskSpellbookApplyMode,
  getDefaultApplyMode,
  type TaskDraftItem,
} from "../lib/taskSpellbookDraft";

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
  focusBlockWindowId: FocusBlockWindowId;
  /** Apply mode - CREATE_ONLY or SCHEDULE_IN_WINDOW */
  applyMode: TaskSpellbookApplyMode;
  /** Full draft envelope for apply (preview == apply) */
  draft?: TaskSpellbookDraft;
  /** Pre-packed tasks for apply (to ensure preview == apply) */
  packedTasks?: PackedTask[];
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

const isMeaningfulText = (value: string) => value.trim().length >= 3;

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

      const isDone = task.done === true || task.status === "done";
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
  events: _events,
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
  const [focusBlockWindowId, setFocusBlockWindowId] = useState<FocusBlockWindowId>("balanced");
  const [isApplying, setIsApplying] = useState(false);
  const [selectedLoadTodayTaskIds, setSelectedLoadTodayTaskIds] = useState<Set<string>>(() => new Set());
  const [applyMode, setApplyMode] = useState<TaskSpellbookApplyMode>("SCHEDULE_IN_WINDOW");

  // Detect input mode and set default apply mode
  const detectedMode = useMemo<TaskSpellbookMode>(() => {
    if (inputSource === "load-today") return "structured";
    return detectInputMode(text);
  }, [inputSource, text]);

  // Update apply mode when detected mode changes
  useEffect(() => {
    if (!isOpen) return;
    const defaultMode = getDefaultApplyMode(detectedMode);
    setApplyMode(defaultMode);
  }, [detectedMode, isOpen]);

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
    if (inputSource === "paste") {
      const result = parseSpellbookInput(text);
      return { ...result, mode: detectedMode };
    }

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
    return { items, clusters, totalMinutes, mode: "structured" as TaskSpellbookMode };
  }, [detectedMode, inputSource, selectedLoadTodayTasks, text]);

  // Build draft envelope for preview == apply
  const draft = useMemo<TaskSpellbookDraft | null>(() => {
    if (inputSource !== "paste" || !isMeaningfulText(text)) return null;
    return buildTaskSpellbookDraft(text, {
      anchorDate: targetDate,
      focusBlockWindowId,
      startLocalTime: getFocusBlockWindow(focusBlockWindowId).startLocalTime,
      endLocalTime: getFocusBlockWindow(focusBlockWindowId).endLocalTime,
      windowMinutes: blockMinutesFromWindow(
        getFocusBlockWindow(focusBlockWindowId).startLocalTime,
        getFocusBlockWindow(focusBlockWindowId).endLocalTime
      ),
    });
  }, [focusBlockWindowId, inputSource, targetDate, text]);

  const variants = useMemo(() => buildSpellbookVariants(parseResult), [parseResult]);
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === variantId) ?? variants[0],
    [variants, variantId],
  );

  const selectedWindow = useMemo(() => getFocusBlockWindow(focusBlockWindowId), [focusBlockWindowId]);
  const blockMinutes = useMemo(
    () => blockMinutesFromWindow(selectedWindow.startLocalTime, selectedWindow.endLocalTime),
    [selectedWindow.endLocalTime, selectedWindow.startLocalTime],
  );

  const hasItems = parseResult.items.length > 0;

  // Pack tasks with weighted allocation for preview
  // This same packed result is sent to Apply to ensure preview == apply
  const previewTasks = useMemo(() => {
    if (!hasItems) return [];
    const baseItems = selectedVariant.items;
    // Include durationMinutes and kind for weighted packing
    const packable = baseItems.map((item, idx) => ({
      draftId: `item-${idx}`,
      title: item.title,
      durationMinutes: item.durationMinutes,
      kind: item.kind === "task" || item.kind === "intent" ? item.kind : ("task" as const),
      mergeKey: `${item.cluster}|${item.kind}|${item.tags[0] ?? "none"}`,
    }));
    return packTasksIntoFocusBlock(blockMinutes, packable, { minTaskMinutes: 15, maxTaskMinutes: 120 }).tasks;
  }, [blockMinutes, hasItems, selectedVariant.items]);

  const handleApply = useCallback(async () => {
    if (!selectedVariant) return;
    if (inputSource === "paste" && !isMeaningfulText(text)) return;
    if (inputSource === "load-today" && selectedLoadTodayTasks.length === 0) return;

    const resolvedTarget = safeDate(targetDate) ? targetDate : fmtLocal(anchorDate);

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
        focusBlockWindowId,
        applyMode,
        draft: draft ?? undefined,
        packedTasks: previewTasks,
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
    applyMode,
    draft,
    inputSource,
    focusBlockWindowId,
    onApply,
    onClose,
    parseResult,
    previewTasks,
    selectedLoadTodayTasks,
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

  const canApply =
    !isApplying &&
    (inputSource === "paste" ? isMeaningfulText(text) : selectedLoadTodayTasks.length > 0);

  const previewTaskCount = previewTasks.length;
  const previewAvg = previewTaskCount > 0 ? Math.round((blockMinutes / previewTaskCount) / 5) * 5 : 0;

  // Collect warnings from draft for display
  const draftWarnings = draft?.warnings ?? [];
  const showModeWarning = detectedMode === "narrative" || detectedMode === "timeline";

  if (!isOpen) return null;

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
                placeholder={`Paste anything: notes dump, PR bullets, checklists...\n\nExamples:\n- Site walk → measurements + photos (45m)\n- Drape plot v3 → elevations + softgoods (1h)\n- Step & repeat → proof review + approve (35m)\n- Vendor RFQs → scenic + print + labor (1h)\n- C4D/Redshift → hero render pass (2h)\n- Invoice draft + send (30m)`}
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
                    {applyMode === "SCHEDULE_IN_WINDOW" ? (
                      <>Creates: 1 Focus Block ({selectedWindow.startLocalTime}–{selectedWindow.endLocalTime}) • Tasks: {previewTaskCount}
                      {previewTaskCount > 0 ? ` • Weighted fit: ~${previewAvg}m avg` : ""}</>
                    ) : (
                      <>Creates: {previewTaskCount} tasks (unscheduled) • Total: ~{Math.round(parseResult.totalMinutes)}m</>
                    )}
                  </span>
                ) : (
                  <span>Paste anything to detect items.</span>
                )}
              </div>
              {showModeWarning && hasItems ? (
                <div className={styles.modeWarning}>
                  <Info size={14} aria-hidden />
                  <span>Narrative/timeline detected — defaulting to Create-only mode</span>
                </div>
              ) : null}
              {draftWarnings.filter(w => w.code === "date_mismatch").map((warning, idx) => (
                <div key={idx} className={styles.warningItem}>
                  <AlertCircle size={14} aria-hidden />
                  <span>{warning.message}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.rightPane}>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Breakdown style</div>
                <div className={styles.sectionHint}>Structure (time-free)</div>
              </div>
              <div className={styles.cardRail}>
                {variants.map((variant) => {
                  const taskCount = variant.items.filter((i) => i.kind === "task").length;
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
                          {taskCount} tasks
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
                <div className={styles.sectionTitle}>Focus Block</div>
                <div className={styles.sectionHint}>Plan (the only time knob)</div>
              </div>
              <div className={styles.planRail}>
                {FOCUS_BLOCK_WINDOWS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`${styles.planButton} ${
                      w.id === focusBlockWindowId ? styles.planButtonActive : ""
                    }`}
                    onClick={() => setFocusBlockWindowId(w.id)}
                    disabled={!hasItems}
                  >
                    <div className={styles.planTop}>
                      <div className={styles.planLabel}>{w.label}</div>
                      <div className={styles.planMetric}>{w.startLocalTime}–{w.endLocalTime}</div>
                    </div>
                    <div className={styles.planHint}>Creates 1 Focus Block container.</div>
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
            <div className={styles.applyModeToggle} role="radiogroup" aria-label="Apply mode">
              <button
                type="button"
                role="radio"
                aria-checked={applyMode === "CREATE_ONLY"}
                className={`${styles.applyModeButton} ${applyMode === "CREATE_ONLY" ? styles.applyModeButtonActive : ""}`}
                onClick={() => setApplyMode("CREATE_ONLY")}
                disabled={!hasItems}
              >
                Create tasks only
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={applyMode === "SCHEDULE_IN_WINDOW"}
                className={`${styles.applyModeButton} ${applyMode === "SCHEDULE_IN_WINDOW" ? styles.applyModeButtonActive : ""}`}
                onClick={() => setApplyMode("SCHEDULE_IN_WINDOW")}
                disabled={!hasItems}
              >
                Schedule in window
              </button>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.apply} disabled={!canApply} onClick={handleApply}>
              {isApplying ? "Applying..." : applyMode === "CREATE_ONLY" ? "Create Tasks" : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
