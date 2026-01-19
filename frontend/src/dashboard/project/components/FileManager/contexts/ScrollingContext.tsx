/**
 * ScrollingContext - Shares scroll state across grid tiles
 * 
 * Avoids prop drilling isScrolling to every tile.
 * Tiles can subscribe to know when to show placeholders vs real thumbnails.
 */

import { createContext, useContext, useSyncExternalStore } from 'react';

// External store for scroll state (avoids React state update cascades)
let isScrolling = false;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return isScrolling;
}

function getServerSnapshot() {
  return false;
}

export function setScrolling(value: boolean) {
  if (isScrolling !== value) {
    isScrolling = value;
    listeners.forEach(l => l());
  }
}

/**
 * Hook to subscribe to scrolling state.
 * Returns true while user is actively scrolling the grid.
 */
export function useIsScrolling(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Optional context for more complex scenarios
interface ScrollingContextValue {
  setScrolling: (value: boolean) => void;
}

export const ScrollingContext = createContext<ScrollingContextValue>({
  setScrolling,
});

export function useScrollingContext() {
  return useContext(ScrollingContext);
}
