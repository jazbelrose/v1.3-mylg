import * as React from "react";
import * as Select from "@radix-ui/react-select";

import styles from "./HqSelect.module.css";

export type HqSelectOption = {
  value: string;
  label: string;
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

  return (
    <Select.Root value={normalizedValue} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger
        className={[styles.trigger, className].filter(Boolean).join(" ")}
        aria-label={ariaLabel}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon className={styles.icon} aria-hidden>
          ▾
        </Select.Icon>
      </Select.Trigger>

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
