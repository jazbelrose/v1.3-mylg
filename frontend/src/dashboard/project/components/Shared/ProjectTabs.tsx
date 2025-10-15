import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ProjectTabItem } from "./useProjectTabs";

interface ProjectTabsProps {
  tabs: ProjectTabItem[];
  activeIndex: number;
  getFromIndex: () => number;
  storageKey: string;
  confirmNavigate: (path: string) => void;
}

const ProjectTabs = ({
  tabs,
  activeIndex,
  getFromIndex,
  storageKey,
  confirmNavigate,
}: ProjectTabsProps) => {
  const tabRefs = useRef<HTMLButtonElement[]>([]);
  const [sliderStyle, setSliderStyle] = useState<{ width: number; left: number }>(
    { width: 0, left: 0 }
  );
  const [transitionEnabled, setTransitionEnabled] = useState(false);

  useEffect(() => {
    tabRefs.current = tabRefs.current.slice(0, tabs.length);
  }, [tabs.length]);

  const updateSlider = useCallback(() => {
    const el = tabRefs.current[activeIndex];
    if (el) {
      setSliderStyle({ width: el.offsetWidth, left: el.offsetLeft });
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem(storageKey, String(activeIndex));
    }
  }, [activeIndex, storageKey]);

  useLayoutEffect(() => {
    const fromEl = tabRefs.current[getFromIndex()];
    if (fromEl) {
      setSliderStyle({ width: fromEl.offsetWidth, left: fromEl.offsetLeft });
    }
    setTransitionEnabled(false);
  }, [getFromIndex]);

  useEffect(() => {
    requestAnimationFrame(() => {
      setTransitionEnabled(true);
      updateSlider();
    });
  }, [updateSlider]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.addEventListener("resize", updateSlider);
    return () => window.removeEventListener("resize", updateSlider);
  }, [updateSlider]);

  return (
    <div
      className="segmented-control with-slider"
      role="tablist"
      aria-label="Project navigation"
    >
      <span
        className="tab-slider"
        style={{
          width: sliderStyle.width,
          transform: `translateX(${sliderStyle.left}px)`,
          transition: transitionEnabled ? undefined : "none",
        }}
        aria-hidden="true"
      />

      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={tab.key}
            type="button"
            ref={(el) => {
              if (el) tabRefs.current[index] = el;
            }}
            onClick={() => confirmNavigate(tab.path)}
            className={isActive ? "active" : ""}
            aria-pressed={isActive}
          >
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ProjectTabs;
