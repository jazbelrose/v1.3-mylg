import { useCallback, useEffect, useMemo, useState } from "react";
import { MOBILE_QUERY } from "./constants";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const matcher = window.matchMedia(MOBILE_QUERY);
    const listener = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(matcher.matches);
    matcher.addEventListener("change", listener);
    return () => matcher.removeEventListener("change", listener);
  }, []);

  return isMobile;
}

interface DayOverlayState {
  anchor: HTMLButtonElement | null;
  date: Date;
  dayKey: string;
}

export function useDayOverlay() {
  const [state, setState] = useState<DayOverlayState | null>(null);
  const isMobile = useIsMobile();

  const open = useCallback((anchor: HTMLButtonElement, date: Date, dayKey: string) => {
    setState({ anchor, date, dayKey });
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  return useMemo(
    () => ({
      anchor: state?.anchor || null,
      date: state?.date || null,
      dayKey: state?.dayKey || null,
      isOpen: Boolean(state),
      isMobile,
      open,
      close,
    }),
    [state, isMobile, open, close]
  );
}
