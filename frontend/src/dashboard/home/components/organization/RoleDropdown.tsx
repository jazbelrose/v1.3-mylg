import React from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import styles from "./organization.module.css";
import type { OrgRole } from "./types";
import { ORG_ROLE_LABELS } from "./stubData";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type RoleDropdownProps = {
  value: OrgRole;
  options: OrgRole[];
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
  onChange: (nextRole: OrgRole) => void;
};

function roleLabel(role: OrgRole): string {
  return ORG_ROLE_LABELS[role] ?? String(role || "").replace(/^./, (c) => c.toUpperCase());
}

export default function RoleDropdown({
  value,
  options,
  disabled = false,
  loading = false,
  tooltip,
  onChange,
}: RoleDropdownProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${styles.chip} ${styles.chipButton} ${styles.roleTrigger}`}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          title={tooltip}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <span className={styles.roleTriggerLabel}>{roleLabel(value)}</span>
          {loading ? (
            <Loader2 size={14} className={styles.inlineSpinner} aria-label="Updating" />
          ) : disabled ? null : (
            <ChevronDown size={14} aria-hidden />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className={styles.dropdownMenu}
        onClick={(e) => e.stopPropagation()}
      >
        <div role="menu" aria-label="Role">
          {options.map((opt) => {
            const selected = opt === value;
            return (
              <button
                key={String(opt)}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`${styles.menuItem} ${selected ? styles.dropdownItemActive : ""}`}
                onClick={() => {
                  setOpen(false);
                  if (opt === value) return;
                  onChange(opt);
                }}
              >
                <span className={styles.dropdownCheck} aria-hidden>
                  {selected ? <Check size={14} /> : null}
                </span>
                {roleLabel(opt)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
