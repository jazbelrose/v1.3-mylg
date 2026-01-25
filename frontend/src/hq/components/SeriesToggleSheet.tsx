import React from "react";
import { BottomSheet } from "@/shared/components/BottomSheet";
import styles from "./SeriesToggleSheet.module.css";

export type SeriesVisibility = {
  balance: boolean;
  inflow: boolean;
  outflow: boolean;
};

type SeriesToggleSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  visibility: SeriesVisibility;
  onToggle: (key: keyof SeriesVisibility) => void;
};

/**
 * Mobile bottom sheet for toggling chart series visibility.
 * Multi-select: any combination of Balance, Inflow, Outflow can be on.
 */
const SeriesToggleSheet: React.FC<SeriesToggleSheetProps> = ({
  isOpen,
  onClose,
  visibility,
  onToggle,
}) => {
  const toggles: Array<{ key: keyof SeriesVisibility; label: string; color: string }> = [
    { key: "balance", label: "Balance", color: "rgba(45, 212, 191, 0.9)" },
    { key: "inflow", label: "Inflow", color: "rgba(45, 212, 191, 0.7)" },
    { key: "outflow", label: "Outflow", color: "rgba(250, 51, 86, 0.9)" },
  ];

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[40]}
      title="Chart Series"
    >
      <div className={styles.body}>
        {toggles.map((t) => {
          const isOn = visibility[t.key];
          return (
            <button
              key={t.key}
              type="button"
              className={styles.toggleRow}
              onClick={() => onToggle(t.key)}
              aria-pressed={isOn}
            >
              <span
                className={styles.colorDot}
                style={{ background: t.color }}
              />
              <span className={styles.toggleLabel}>{t.label}</span>
              <span className={`${styles.toggleSwitch} ${isOn ? styles.toggleSwitchOn : ""}`}>
                <span className={styles.toggleThumb} />
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
};

export default SeriesToggleSheet;
