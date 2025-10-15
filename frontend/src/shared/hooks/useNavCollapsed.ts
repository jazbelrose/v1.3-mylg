import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";

type NavPage = "dashboard" | "project" | "hq";

type UseNavCollapsedReturn = [boolean, Dispatch<SetStateAction<boolean>>];

const STORAGE_KEYS: Record<NavPage, string> = {
  dashboard: "nav-collapsed-dashboard",
  project: "nav-collapsed-project",
  hq: "nav-collapsed-hq",
};

const DEFAULTS: Record<NavPage, boolean> = {
  dashboard: false,
  project: true,
  hq: false,
};

export function useNavCollapsed(page: NavPage): UseNavCollapsedReturn {
  const storageKey = STORAGE_KEYS[page];
  const defaultValue = DEFAULTS[page];

  const readValue = useCallback(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }

    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue === null) {
        return defaultValue;
      }

      return storedValue === "true";
    } catch {
      return defaultValue;
    }
  }, [defaultValue, storageKey]);

  const [collapsed, setCollapsed] = useState<boolean>(() => readValue());

  useEffect(() => {
    setCollapsed(readValue());
  }, [readValue]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, collapsed ? "true" : "false");
    } catch {
      // ignore storage write errors
    }
  }, [collapsed, storageKey]);

  return [collapsed, setCollapsed];
}

export default useNavCollapsed;
