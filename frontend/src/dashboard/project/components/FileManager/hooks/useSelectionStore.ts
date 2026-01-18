/**
 * useSelectionStore - High-performance selection state management
 * 
 * Avoids re-rendering all tiles when selection changes by:
 * 1. Storing selection in a ref (not state)
 * 2. Using a subscription pattern so only affected tiles re-render
 * 3. Providing stable callbacks that never change reference
 * 
 * Usage:
 *   const store = useSelectionStore();
 *   // In tile: const isSelected = useIsSelected(store, item.url);
 */

import { useRef, useSyncExternalStore } from 'react';

export interface SelectionStore {
  /** Get current selection (read-only snapshot) */
  getSelection: () => ReadonlySet<string>;
  /** Check if a specific item is selected (non-reactive) */
  isSelected: (url: string) => boolean;
  /** Toggle a single item's selection */
  toggle: (url: string) => void;
  /** Set selection to a specific set of URLs */
  set: (urls: Iterable<string>) => void;
  /** Add multiple URLs to selection (for range select) */
  addRange: (urls: string[]) => void;
  /** Clear all selection */
  clear: () => void;
  /** Select all from a list */
  selectAll: (urls: string[]) => void;
  /** Subscribe to selection changes (for useSyncExternalStore) */
  subscribe: (callback: () => void) => () => void;
  /** Get selection snapshot for useSyncExternalStore */
  getSnapshot: () => ReadonlySet<string>;
}

function createSelectionStore(): SelectionStore {
  let selection = new Set<string>();
  const listeners = new Set<() => void>();
  
  const notify = () => {
    listeners.forEach(listener => listener());
  };
  
  const subscribe = (callback: () => void) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  };
  
  const getSelection = () => selection as ReadonlySet<string>;
  const getSnapshot = getSelection;
  
  const isSelected = (url: string) => selection.has(url);
  
  const toggle = (url: string) => {
    if (selection.has(url)) {
      selection.delete(url);
    } else {
      selection.add(url);
    }
    notify();
  };
  
  const set = (urls: Iterable<string>) => {
    selection = new Set(urls);
    notify();
  };
  
  const addRange = (urls: string[]) => {
    urls.forEach(url => selection.add(url));
    notify();
  };
  
  const clear = () => {
    if (selection.size > 0) {
      selection = new Set();
      notify();
    }
  };
  
  const selectAll = (urls: string[]) => {
    if (selection.size === urls.length) {
      selection = new Set();
    } else {
      selection = new Set(urls);
    }
    notify();
  };
  
  return {
    getSelection,
    getSnapshot,
    isSelected,
    toggle,
    set,
    addRange,
    clear,
    selectAll,
    subscribe,
  };
}

/**
 * Hook to get/create a selection store instance.
 * Returns a stable store that persists across renders.
 */
export function useSelectionStore(): SelectionStore {
  const storeRef = useRef<SelectionStore | null>(null);
  
  if (!storeRef.current) {
    storeRef.current = createSelectionStore();
  }
  
  return storeRef.current;
}

/**
 * Hook to subscribe to whether a specific URL is selected.
 * Only re-renders when THIS item's selection state changes.
 */
export function useIsSelected(store: SelectionStore, url: string): boolean {
  return useSyncExternalStore(
    store.subscribe,
    () => store.isSelected(url),
    () => false // SSR fallback
  );
}

/**
 * Hook to subscribe to selection count.
 * Re-renders when any selection changes.
 */
export function useSelectionCount(store: SelectionStore): number {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSelection().size,
    () => 0
  );
}

/**
 * Hook to get selected URLs as array.
 * Re-renders when any selection changes.
 */
export function useSelectedUrls(store: SelectionStore): string[] {
  return useSyncExternalStore(
    store.subscribe,
    () => Array.from(store.getSelection()),
    () => []
  );
}
