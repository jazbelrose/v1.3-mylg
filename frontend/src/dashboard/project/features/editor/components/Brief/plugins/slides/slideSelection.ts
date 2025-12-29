import {
  $createNodeSelection,
  $getSelection,
  $isNodeSelection,
  $setSelection,
} from "lexical";

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

    if (isToggle) {
      if (currentKeys.includes(nodeKey)) {
        nextKeys = currentKeys.filter((key) => key !== nodeKey);
      } else {
        nextKeys = [...currentKeys, nodeKey];
      }
    } else if (isAdditive) {
      nextKeys = currentKeys.includes(nodeKey) ? currentKeys : [...currentKeys, nodeKey];
    } else {
      // Design-app behavior: clicking an already-selected node keeps the current multi-selection.
      // This enables "drag any selected item to move the whole selection" across node types.
      nextKeys = currentKeys.includes(nodeKey) ? currentKeys : [nodeKey];
    }
  } else {
    nextKeys = [nodeKey];
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

