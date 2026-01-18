import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import styles from "./OrgDropdownPill.module.css";

export type OrgDropdownOrg = {
  orgId: string;
  name?: string | null;
};

export type OrgDropdownPillProps = {
  orgs: OrgDropdownOrg[];
  activeOrgId: string | null | undefined;
  onChange: (orgId: string) => void;
  disabled?: boolean;
  menuLabel?: string;
  align?: "start" | "end";
  sideOffset?: number;
  className?: string;
};

export default function OrgDropdownPill({
  orgs,
  activeOrgId,
  onChange,
  disabled = false,
  menuLabel = "Org",
  align = "start",
  sideOffset = 8,
  className = "",
}: OrgDropdownPillProps) {
  const activeOrgName = React.useMemo(() => {
    const match = orgs.find((o) => o.orgId === activeOrgId);
    return match?.name || match?.orgId || null;
  }, [activeOrgId, orgs]);

  const triggerLabel = activeOrgName ?? (orgs.length ? "Select…" : "No orgs");

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={[styles.trigger, className].filter(Boolean).join(" ")}
          aria-haspopup="menu"
          aria-label="Switch organization"
          title="Switch org"
          disabled={disabled}
        >
          <span className={styles.value}>{triggerLabel}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} sideOffset={sideOffset} align={align} collisionPadding={12}>
          <DropdownMenu.Label className={styles.menuLabel}>{menuLabel}</DropdownMenu.Label>
          <DropdownMenu.Separator className={styles.menuSeparator} />

          {orgs.length ? (
            <DropdownMenu.RadioGroup value={activeOrgId ?? ""} onValueChange={onChange}>
              {orgs.map((org) => (
                <DropdownMenu.RadioItem key={org.orgId} value={org.orgId} className={styles.menuRadioItem}>
                  <span className={styles.menuRadioLabel}>{org.name || org.orgId}</span>
                  <DropdownMenu.ItemIndicator className={styles.menuRadioIndicator}>✓</DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          ) : (
            <div className={styles.menuHint}>No orgs yet.</div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
