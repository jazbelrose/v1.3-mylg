import {
  $createNodeSelection,
  $getSelection,
  $isNodeSelection,
  $setSelection,
} from "lexical";
import { collectGroupIndex, expandKeysToGroups } from "./grouping";

export type ModifierKeys = Pick<MouseEvent, "shiftKey" | "ctrlKey" | "metaKey" | "altKey">;

export type SelectionUpdate = {
  selectedKeys: string[];
  nodeIsSelected: boolean;
};

export function getSlideNodeSelectionKeys(): string[] {
  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    return selection.getNodes().map((node) => node.getKey());
  }
  return [];
}

/**
 * Applies classic design-app selection rules to slide objects.
 * Expects to be called inside an editor.update/read scope.
 */
export function applyModifierNodeSelection(
  nodeKey: string,
  modifiers: ModifierKeys
): SelectionUpdate {
  const selection = $getSelection();
  const isToggle = Boolean(modifiers.ctrlKey || modifiers.metaKey);
  const isAdditive = Boolean(modifiers.shiftKey && !isToggle);
  let nextKeys: string[] = [];

  if ($isNodeSelection(selection)) {
    const currentKeys = selection.getNodes().map((node) => node.getKey());
    const groupIndex = collectGroupIndex();
    const currentExpanded = expandKeysToGroups(currentKeys, groupIndex);
    const clickedUnitKeys = expandKeysToGroups([nodeKey], groupIndex);
    const currentSet = new Set(currentExpanded);
    const clickedIsSelected = clickedUnitKeys.every((key) => currentSet.has(key));

    if (isToggle) {
      if (clickedIsSelected) {
        nextKeys = currentExpanded.filter((key) => !clickedUnitKeys.includes(key));
      } else {
        nextKeys = Array.from(new Set([...currentExpanded, ...clickedUnitKeys]));
      }
    } else if (isAdditive) {
      nextKeys = clickedIsSelected
        ? currentExpanded
        : Array.from(new Set([...currentExpanded, ...clickedUnitKeys]));
    } else {
      // Design-app behavior: clicking an already-selected node keeps the current multi-selection.
      // This enables "drag any selected item to move the whole selection" across node types.
      nextKeys = clickedIsSelected ? currentExpanded : clickedUnitKeys;
    }
  } else {
    // If this node is grouped, select the whole group.
    nextKeys = expandKeysToGroups([nodeKey], collectGroupIndex());
  }

  if (nextKeys.length === 0) {
    $setSelection(null);
  } else {
    const nodeSelection = $createNodeSelection();
    nextKeys.forEach((key) => nodeSelection.add(key));
    $setSelection(nodeSelection);
  }

  return { selectedKeys: nextKeys, nodeIsSelected: nextKeys.includes(nodeKey) };
}

export function isCopyGesture(modifiers: ModifierKeys): boolean {
  return Boolean(modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey);
}
