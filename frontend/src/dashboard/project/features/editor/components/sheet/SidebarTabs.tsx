import React from "react";
import classNames from "classnames";
import styles from "./SidebarTabs.module.css";

export type SidebarTabKey = "properties" | "layers" | "assets";

interface SidebarTabsProps {
  activeTab: SidebarTabKey;
  onChange: (tab: SidebarTabKey) => void;
  panels: Partial<Record<SidebarTabKey, React.ReactNode>>;
}

const TAB_LABELS: Record<SidebarTabKey, string> = {
  properties: "Properties",
  layers: "Layers",
  assets: "Assets",
};

const SidebarTabs: React.FC<SidebarTabsProps> = ({ activeTab, onChange, panels }) => {
  return (
    <div className={styles.sidebarTabs}>
      <div className={styles.tabList} role="tablist" aria-label="Inspector panels">
        {(Object.keys(TAB_LABELS) as SidebarTabKey[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={classNames(styles.tabButton, {
              [styles.active]: activeTab === tab,
            })}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      <div className={styles.panel} role="tabpanel">
        {panels[activeTab] ?? (
          <div className={styles.emptyState}>
            <h4>{TAB_LABELS[activeTab]}</h4>
            <p>Nothing to show yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SidebarTabs;
