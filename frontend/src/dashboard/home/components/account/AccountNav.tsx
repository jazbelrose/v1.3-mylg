import React from "react";
import { CreditCard, Shield, User } from "lucide-react";

import SegmentedControl, { type SegmentedOption } from "./ui/SegmentedControl";
import styles from "./accountPage.module.css";

export type AccountPanelKey = "profile" | "security" | "payments";

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
  { key: "security", label: "Security", description: "Password and sign-in", Icon: Shield },
  { key: "payments", label: "Payments", description: "Pay vendors and get paid", Icon: CreditCard },
];

export default function AccountNav({ value, onChange }: AccountNavProps) {
  const mobileOptions = React.useMemo<Array<SegmentedOption<AccountPanelKey>>>(
    () => NAV_ITEMS.map((i) => ({ value: i.key, label: i.key === "profile" ? "Profile" : i.key === "security" ? "Security" : "Payments" })),
    []
  );

  return (
    <>
      <div className={styles.navMobile}>
        <SegmentedControl<AccountPanelKey> value={value} onChange={onChange} options={mobileOptions} aria-label="Account sections" />
      </div>

      <nav className={styles.navDesktop} aria-label="Account navigation">
        {NAV_ITEMS.map(({ key, label, description, Icon }) => {
          const active = key === value;
          return (
            <button
              key={key}
              type="button"
              className={[styles.navItem, active ? styles.navItemActive : ""].filter(Boolean).join(" ")}
              onClick={() => onChange(key)}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.navIcon} aria-hidden>
                <Icon size={18} />
              </span>
              <span className={styles.navCopy}>
                <span className={styles.navLabel}>{label}</span>
                <span className={styles.navDescription}>{description}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

