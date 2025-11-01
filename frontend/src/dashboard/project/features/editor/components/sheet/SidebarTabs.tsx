import React, { useEffect, useMemo, useState } from "react";
import LayerTree from "./LayerTree";
import Inspector from "./Inspector";
import styles from "./SidebarTabs.module.css";
import type {
  LayerGroupKey,
  SheetPageState,
} from "@/dashboard/project/features/editor/types/sheet";

type SidebarTabKey = "properties" | "layers" | "assets";

interface SidebarTabsProps {
  page: SheetPageState | undefined;
  activeLayer: LayerGroupKey;
  onSelectLayer: (layer: LayerGroupKey) => void;
  onToggleVisibility: (layer: LayerGroupKey) => void;
  onChangeOpacity: (layer: LayerGroupKey, value: number) => void;
  disabled?: boolean;
}

const SidebarTabs: React.FC<SidebarTabsProps> = ({
  page,
  activeLayer,
  onSelectLayer,
  onToggleVisibility,
  onChangeOpacity,
  disabled,
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTabKey>("properties");

  useEffect(() => {
    if (!page) {
      setActiveTab("properties");
    }
  }, [page]);

  const tabs = useMemo(
    () => [
      { key: "properties" as SidebarTabKey, label: "Properties" },
      { key: "layers" as SidebarTabKey, label: "Layers" },
      { key: "assets" as SidebarTabKey, label: "Assets" },
    ],
    []
  );

  return (
    <aside className={styles.sidebar} aria-label="Editor sidebar">
      <div role="tablist" className={styles.tabList}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={styles.tab}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.panel}>
        {activeTab === "properties" && (
          <Inspector page={page} activeLayer={activeLayer} />
        )}
        {activeTab === "layers" && (
          <LayerTree
            page={page}
            activeLayer={activeLayer}
            onSelectLayer={onSelectLayer}
            onToggleVisibility={onToggleVisibility}
            onChangeOpacity={onChangeOpacity}
            disabled={disabled}
          />
        )}
        {activeTab === "assets" && (
          <div className={styles.assetsPane}>
            <p>Drop brand colors, logos, and uploads here soon.</p>
            <small>We’re carving out a dedicated space for reusable assets.</small>
          </div>
        )}
      </div>
    </aside>
  );
};

export default SidebarTabs;
