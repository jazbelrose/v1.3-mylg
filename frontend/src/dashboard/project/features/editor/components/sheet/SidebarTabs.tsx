import React from "react";
import classNames from "classnames";
import styles from "./SidebarTabs.module.css";

export type SidebarTabKey = "properties" | "layers" | "assets";

interface SidebarTabsProps {
  tabs: Array<{
    id: SidebarTabKey;
    label: string;
    content: React.ReactNode;
  }>;
  activeTab: SidebarTabKey;
  onChange: (tab: SidebarTabKey) => void;
}

const SidebarTabs: React.FC<SidebarTabsProps> = ({ tabs, activeTab, onChange }) => {
  return (
    <div className={styles.sidebarTabs}>
      <div className={styles.tabList} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={classNames(styles.tabTrigger, {
              [styles.tabTriggerActive]: activeTab === tab.id,
            })}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.tabPanel} role="tabpanel">
        {tabs.find((tab) => tab.id === activeTab)?.content ?? null}
      </div>
    </div>
  );
};

export default SidebarTabs;
