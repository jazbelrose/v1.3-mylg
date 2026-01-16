import React from "react";
import { CreditCard, User } from "lucide-react";

import SegmentedControl, { type SegmentedOption } from "./ui/SegmentedControl";
import styles from "./accountPage.module.css";

export type AccountPanelKey = "profile" | "payments";

type AccountNavProps = {
  value: AccountPanelKey;
  onChange: (next: AccountPanelKey) => void;
};

const NAV_ITEMS: Array<{
  key: AccountPanelKey;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { key: "profile", label: "Account info", description: "Profile and preferences", Icon: User },
  { key: "payments", label: "Payments", description: "Pay vendors and get paid", Icon: CreditCard },
];

export default function AccountNav({ value, onChange }: AccountNavProps) {
  const mobileOptions = React.useMemo<Array<SegmentedOption<AccountPanelKey>>>(
    () =>
      NAV_ITEMS.map((i) => ({
        value: i.key,
        label: i.key === "profile" ? "Account" : "Payments",
      })),
    []
  );

  return (
    <>
      <div className={styles.navMobile}>
        <SegmentedControl<AccountPanelKey> value={value} onChange={onChange} options={mobileOptions} aria-label="Account sections" />
      </div>

      <nav className={styles.navDesktop} aria-label="Account navigation" role="tablist">
        <div className={styles.tabs}>
          {NAV_ITEMS.map(({ key, label, Icon }) => {
            const active = key === value;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                className={[styles.tab, active ? styles.tabActive : ""].filter(Boolean).join(" ")}
                onClick={() => onChange(key)}
              >
                <Icon size={16} className={styles.tabIcon} aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

