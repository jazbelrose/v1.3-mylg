import { useSyncExternalStore } from "react";

export type ActiveGroupSelection =
  | {
      groupId: string;
      memberKeys: string[];
    }
  | null;

let currentSelection: ActiveGroupSelection = null;
const listeners = new Set<() => void>();

function isEqual(a: ActiveGroupSelection, b: ActiveGroupSelection): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.groupId !== b.groupId) return false;
  if (a.memberKeys.length !== b.memberKeys.length) return false;
  for (let i = 0; i < a.memberKeys.length; i++) {
    if (a.memberKeys[i] !== b.memberKeys[i]) return false;
  }
  return true;
}

export function setActiveGroupSelection(next: ActiveGroupSelection): void {
  if (isEqual(currentSelection, next)) return;
  currentSelection = next;
  listeners.forEach((listener) => listener());
}

export function getActiveGroupSelection(): ActiveGroupSelection {
  return currentSelection;
}

export function subscribeActiveGroupSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveGroupSelection(): ActiveGroupSelection {
  return useSyncExternalStore(
    subscribeActiveGroupSelection,
    getActiveGroupSelection,
    getActiveGroupSelection
  );
}

