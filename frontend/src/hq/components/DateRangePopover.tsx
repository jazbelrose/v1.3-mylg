import * as React from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar, Check } from "lucide-react";
import styles from "./DateRangePopover.module.css";

export type DateRangePreset = "all" | "today" | "7d" | "30d" | "90d" | "month" | "ytd" | "custom";

type PresetOption = {
  value: DateRangePreset;
  label: string;
};

const PRESETS: PresetOption[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "month", label: "This month" },
  { value: "ytd", label: "Year to date" },
];

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getPresetLabel(preset: DateRangePreset): string {
  return PRESETS.find((p) => p.value === preset)?.label || "All time";
}

type Props = {
  preset: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomRangeChange?: (from: string, to: string) => void;
  className?: string;
};

const DateRangePopover: React.FC<Props> = ({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomRangeChange,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [draftPreset, setDraftPreset] = React.useState<DateRangePreset>(preset);
  const [draftFrom, setDraftFrom] = React.useState(customFrom || "");
  const [draftTo, setDraftTo] = React.useState(customTo || "");

  // Sync draft with props when popover opens
  React.useEffect(() => {
    if (isOpen) {
      setDraftPreset(preset);
      setDraftFrom(customFrom || "");
      setDraftTo(customTo || "");
    }
  }, [isOpen, preset, customFrom, customTo]);

  const handlePresetClick = (value: DateRangePreset) => {
    setDraftPreset(value);
    if (value !== "custom") {
      setDraftFrom("");
      setDraftTo("");
    }
  };

  const handleApply = () => {
    if (draftPreset === "custom" && draftFrom && draftTo) {
      onPresetChange("custom");
      onCustomRangeChange?.(draftFrom, draftTo);
    } else if (draftPreset !== "custom") {
      onPresetChange(draftPreset);
    }
    setIsOpen(false);
  };

  const handleReset = () => {
    setDraftPreset("all");
    setDraftFrom("");
    setDraftTo("");
    onPresetChange("all");
    setIsOpen(false);
  };

  // Build trigger display text
  const getTriggerText = (): string => {
    if (preset === "custom" && customFrom && customTo) {
      const from = new Date(customFrom + "T00:00:00");
      const to = new Date(customTo + "T00:00:00");
      if (from.getFullYear() === to.getFullYear()) {
        return `${formatShortDate(from)} – ${formatShortDate(to)}, ${from.getFullYear()}`;
      }
      return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
    }
    return getPresetLabel(preset);
  };

  const canApply =
    draftPreset !== "custom" || (draftPreset === "custom" && draftFrom && draftTo);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={[styles.trigger, className].filter(Boolean).join(" ")}
          aria-label="Select date range"
        >
          <Calendar size={14} className={styles.triggerIcon} aria-hidden />
          <span className={styles.triggerLabel}>Date range</span>
          <span className={styles.triggerSep}>·</span>
          <span className={styles.triggerValue}>{getTriggerText()}</span>
          <span className={styles.triggerChevron}>▾</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className={styles.content} align="end">
        <div className={styles.body}>
          {/* Presets section */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Presets</div>
            <div className={styles.presetList}>
              {PRESETS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={[
                    styles.presetItem,
                    draftPreset === opt.value ? styles.presetItemSelected : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handlePresetClick(opt.value)}
                >
                  <span className={styles.presetLabel}>{opt.label}</span>
                  {draftPreset === opt.value && (
                    <Check size={14} className={styles.presetCheck} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom range section */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Custom range</div>
            <div className={styles.customInputs}>
              <div className={styles.dateField}>
                <label className={styles.dateLabel}>From</label>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={draftFrom}
                  onChange={(e) => {
                    setDraftFrom(e.target.value);
                    if (e.target.value && draftTo) {
                      setDraftPreset("custom");
                    }
                  }}
                />
              </div>
              <div className={styles.dateField}>
                <label className={styles.dateLabel}>To</label>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={draftTo}
                  onChange={(e) => {
                    setDraftTo(e.target.value);
                    if (draftFrom && e.target.value) {
                      setDraftPreset("custom");
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer with actions */}
        <div className={styles.footer}>
          <button type="button" className={styles.resetBtn} onClick={handleReset}>
            Reset
          </button>
          <button
            type="button"
            className={styles.applyBtn}
            onClick={handleApply}
            disabled={!canApply}
          >
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePopover;
