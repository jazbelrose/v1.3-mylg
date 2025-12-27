import {
  $createNodeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  type RangeSelection,
  type LexicalNode,
} from "lexical";
import { TextBoxNode } from "../nodes/TextBoxNode";
import { ResizableImageNode } from "../nodes/ResizableImageNode";
import { SvgNode } from "../nodes/SvgNode";
import { getSlideNodeSelectionKeys } from "./slideSelectionUtils";

export type SlideStackingAction =
  | "bringToFront"
  | "sendToBack"
  | "bringForward"
  | "sendBackward";

export function isSlideStackableNode(node: LexicalNode): boolean {
  return (
    node instanceof TextBoxNode ||
    node instanceof ResizableImageNode ||
    node instanceof SvgNode
  );
}

function collectStackableKeysInSubtree(node: LexicalNode, out: string[]): void {
  if (isSlideStackableNode(node)) {
    out.push(node.getKey());
  }

  const maybeChildren = (node as unknown as { getChildren?: () => LexicalNode[] }).getChildren;
  if (typeof maybeChildren !== "function") {
    return;
  }

  for (const child of maybeChildren.call(node)) {
    collectStackableKeysInSubtree(child, out);
  }
}

type SelectionSnapshot =
  | { kind: "node"; keys: string[] }
  | { kind: "range"; selection: RangeSelection }
  | { kind: "other" };

function findNearestStackable(node: LexicalNode | null): LexicalNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if (isSlideStackableNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

function getSelectedKeysForStacking(): { keys: string[]; snapshot: SelectionSnapshot } {
  // Prefer the slide selection helper (keeps modifier-selection rules consistent).
  // This reads Lexical selection under the hood, so it must be called in update/read scope.
  const slideKeys = getSlideNodeSelectionKeys();
  if (slideKeys.length > 0) {
    return { keys: slideKeys, snapshot: { kind: "node", keys: slideKeys } };
  }

  const selection = $getSelection();

  if ($isNodeSelection(selection)) {
    const keys = selection.getNodes().map((n) => n.getKey());
    return { keys, snapshot: { kind: "node", keys } };
  }

  // If the caret is inside a TextBox (RangeSelection), allow arranging that TextBox
  // without forcing a node-selection state afterward.
  if ($isRangeSelection(selection)) {
    const anchorNode = selection.anchor.getNode();
    const stackable = findNearestStackable(anchorNode);
    const keys = stackable ? [stackable.getKey()] : [];
    return { keys, snapshot: { kind: "range", selection: selection.clone() } };
  }

  return { keys: [], snapshot: { kind: "other" } };
}

function restoreNodeSelection(keys: string[]): void {
  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) {
    $setSelection(null);
    return;
  }

  const nextSel = $createNodeSelection();
  for (const key of uniqueKeys) {
    const node = $getNodeByKey<LexicalNode>(key);
    if (node && node.isAttached()) {
      nextSel.add(key);
    }
  }

  if (nextSel.getNodes().length === 0) {
    $setSelection(null);
  } else {
    $setSelection(nextSel);
  }
}

/**
 * Reorders only stackable nodes among the root children.
 * Must be called inside `editor.update()`.
 */
export function reorderSlideStackablesInRoot(action: SlideStackingAction): void {
  console.log('[slideStacking] reorder called:', action);
  const root = $getRoot();
  const rootChildren = root.getChildren();
  console.log('[slideStacking] root children count:', rootChildren.length, 'types:', rootChildren.map(n => n.getType()));

  // Treat each root child as a "container". If it either is a stackable itself (TextBox)
  // or contains a stackable descendant (Image/Svg typically live inside paragraphs),
  // then it participates in stacking.
  const stackingContainers: LexicalNode[] = [];
  const containerIndices: number[] = [];
  const containerKeySets: Array<Set<string>> = [];

  for (let i = 0; i < rootChildren.length; i++) {
    const child = rootChildren[i];
    const keys: string[] = [];
    collectStackableKeysInSubtree(child, keys);
    if (keys.length > 0) {
      stackingContainers.push(child);
      containerIndices.push(i);
      containerKeySets.push(new Set(keys));
    }
  }

  console.log('[slideStacking] stacking containers found:', stackingContainers.length);
  if (stackingContainers.length <= 1) {
    console.log('[slideStacking] not enough containers to reorder, exiting');
    return;
  }

  const { keys: selectedKeys, snapshot } = getSelectedKeysForStacking();
  console.log('[slideStacking] selected keys:', selectedKeys, 'snapshot:', snapshot.kind);

  const selectedContainerSet = new Set<number>();
  for (let i = 0; i < containerKeySets.length; i++) {
    const keySet = containerKeySets[i];
    for (const key of selectedKeys) {
      if (keySet.has(key)) {
        selectedContainerSet.add(i);
        break;
      }
    }
  }

  if (selectedContainerSet.size === 0) {
    console.log('[slideStacking] no selected containers, exiting');
    return;
  }
  console.log('[slideStacking] selected container indices:', Array.from(selectedContainerSet));

  const nextContainers = [...stackingContainers];

  if (action === "bringToFront") {
    const unselected: LexicalNode[] = [];
    const selected: LexicalNode[] = [];
    for (let i = 0; i < nextContainers.length; i++) {
      if (selectedContainerSet.has(i)) {
        selected.push(nextContainers[i]);
      } else {
        unselected.push(nextContainers[i]);
      }
    }
    nextContainers.splice(0, nextContainers.length, ...unselected, ...selected);
  } else if (action === "sendToBack") {
    const selected: LexicalNode[] = [];
    const unselected: LexicalNode[] = [];
    for (let i = 0; i < nextContainers.length; i++) {
      if (selectedContainerSet.has(i)) {
        selected.push(nextContainers[i]);
      } else {
        unselected.push(nextContainers[i]);
      }
    }
    nextContainers.splice(0, nextContainers.length, ...selected, ...unselected);
  } else if (action === "bringForward") {
    // Forward swaps should iterate from end so multi-select moves as a coherent group.
    const selectedAt = new Set<number>();
    for (let i = 0; i < nextContainers.length; i++) {
      if (selectedContainerSet.has(i)) selectedAt.add(i);
    }
    for (let i = nextContainers.length - 2; i >= 0; i--) {
      const isSelected = selectedAt.has(i);
      const isAboveSelected = selectedAt.has(i + 1);
      if (isSelected && !isAboveSelected) {
        const tmp = nextContainers[i];
        nextContainers[i] = nextContainers[i + 1];
        nextContainers[i + 1] = tmp;
        selectedAt.delete(i);
        selectedAt.add(i + 1);
      }
    }
  } else if (action === "sendBackward") {
    // Backward swaps should iterate from start so multi-select moves as a coherent group.
    const selectedAt = new Set<number>();
    for (let i = 0; i < nextContainers.length; i++) {
      if (selectedContainerSet.has(i)) selectedAt.add(i);
    }
    for (let i = 1; i < nextContainers.length; i++) {
      const isSelected = selectedAt.has(i);
      const isBelowSelected = selectedAt.has(i - 1);
      if (isSelected && !isBelowSelected) {
        const tmp = nextContainers[i];
        nextContainers[i] = nextContainers[i - 1];
        nextContainers[i - 1] = tmp;
        selectedAt.delete(i);
        selectedAt.add(i - 1);
      }
    }
  }

  const rebuiltChildren = [...rootChildren];
  for (let i = 0; i < containerIndices.length; i++) {
    rebuiltChildren[containerIndices[i]] = nextContainers[i];
  }

  console.log('[slideStacking] reordering complete, updating root');
  root.clear();
  root.append(...rebuiltChildren);

  if (snapshot.kind === "node") {
    restoreNodeSelection(snapshot.keys);
  } else if (snapshot.kind === "range") {
    // Preserve caret/selection while typing inside a TextBox.
    $setSelection(snapshot.selection);
  }
}
