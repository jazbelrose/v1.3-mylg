import * as React from "react";
import * as Select from "@radix-ui/react-select";
import * as Tooltip from "@radix-ui/react-tooltip";

import styles from "./HqSelect.module.css";

export type HqSelectOption = {
  value: string;
  label: string;
  /** Short display label shown in the trigger (e.g., "All" instead of "All accounts") */
  shortLabel?: string;
  /** Tooltip text shown on hover when shortLabel is used */
  tooltip?: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  options: HqSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
};

const HqSelect: React.FC<Props> = ({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  ariaLabel,
  className,
}) => {
  const normalizedValue = value === "" ? undefined : value;
  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption?.shortLabel || selectedOption?.label;
  const tooltipText = selectedOption?.tooltip;

  const trigger = (
    <Select.Trigger
      className={[styles.trigger, className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
    >
      <span className={styles.triggerText}>
        {displayLabel || <Select.Value placeholder={placeholder} />}
      </span>
      <Select.Icon className={styles.icon} aria-hidden>
        ▾
      </Select.Icon>
    </Select.Trigger>
  );

  return (
    <Select.Root value={normalizedValue} onValueChange={onValueChange} disabled={disabled}>
      {tooltipText ? (
        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              {trigger}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className={styles.tooltip} sideOffset={6}>
                {tooltipText}
                <Tooltip.Arrow className={styles.tooltipArrow} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      ) : (
        trigger
      )}

      <Select.Portal>
        <Select.Content className={styles.content} position="popper" sideOffset={6}>
          <Select.Viewport className={styles.viewport}>
            {options.map((opt) => (
              <Select.Item key={opt.value} value={opt.value} disabled={opt.disabled} className={styles.item}>
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
};

export default HqSelect;
