import {
  $createNodeSelection,
  $createParagraphNode,
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
import { PictureFrameNode } from "../nodes/PictureFrameNode";
import { SvgNode } from "../nodes/SvgNode";
import { getSlideNodeSelectionKeys } from "./slideSelectionUtils";

export type SlideStackingAction =
  | "bringToFront"
  | "sendToBack"
  | "bringForward"
  | "sendBackward";

export function isSlideStackableNode(node: LexicalNode): boolean {
  // Prefer type checks because `instanceof` can be brittle under HMR / module duplication.
  const type = node.getType();
  if (type === "text-box" || type === "resizable-image" || type === "picture-frame" || type === "svg") {
    return true;
  }

  return (
    node instanceof TextBoxNode ||
    node instanceof ResizableImageNode ||
    node instanceof PictureFrameNode ||
    node instanceof SvgNode
  );
}

function isDebugEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("debugSlidesStacking") === "1";
  } catch {
    return false;
  }
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
 * Normalizes content so each root child that participates in stacking contains at most
 * one stackable *direct* child. This avoids "group" behavior when multiple images/SVGs
 * live inside the same paragraph.
 *
 * Must be called inside `editor.update()`.
 */
function normalizeRootChildrenForStacking(debug: boolean): void {
  const root = $getRoot();
  const rootChildren = root.getChildren();

  const isIgnorableParagraphChild = (node: LexicalNode): boolean => {
    const type = node.getType();
    if (type === "linebreak") {
      return true;
    }
    if (type === "text") {
      return node.getTextContent().trim() === "";
    }
    return false;
  };

  for (const child of rootChildren) {
    if (child.getType() !== "paragraph") {
      continue;
    }

    const maybeChildren = (child as unknown as { getChildren?: () => LexicalNode[] }).getChildren;
    if (typeof maybeChildren !== "function") {
      continue;
    }

    const directChildren = maybeChildren.call(child);
    if (directChildren.length <= 1) {
      continue;
    }

    const stackableDirectChildren = directChildren.filter(isSlideStackableNode);
    if (stackableDirectChildren.length <= 1) {
      continue;
    }

    // Only split paragraphs that are "pure stacking wrappers" to avoid surprising text edits.
    const hasNonIgnorableNonStackables = directChildren.some(
      (node) => !isSlideStackableNode(node) && !isIgnorableParagraphChild(node)
    );
    if (hasNonIgnorableNonStackables) {
      continue;
    }

    // Strip empty text/linebreak nodes before splitting to keep the shape predictable.
    for (const node of directChildren) {
      if (!isSlideStackableNode(node) && isIgnorableParagraphChild(node)) {
        node.remove();
      }
    }

    let insertAfter: LexicalNode = child;
    for (let i = 1; i < stackableDirectChildren.length; i++) {
      const stackable = stackableDirectChildren[i];
      const paragraph = $createParagraphNode();
      paragraph.append(stackable);
      insertAfter.insertAfter(paragraph);
      insertAfter = paragraph;
    }

    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[slides stacking] normalized paragraph into", stackableDirectChildren.length, "containers");
    }
  }
}

/**
 * Reorders only stackable nodes among the root children.
 * Must be called inside `editor.update()`.
 */
export function reorderSlideStackablesInRoot(action: SlideStackingAction): void {
  const debug = isDebugEnabled();
  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[slides stacking] reorder called:", action);
  }

  normalizeRootChildrenForStacking(debug);

  const root = $getRoot();
  const rootChildren = root.getChildren();
  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      "[slides stacking] root children count:",
      rootChildren.length,
      "types:",
      rootChildren.map((n) => n.getType())
    );
  }

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

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[slides stacking] stacking containers found:", stackingContainers.length);
  }
  if (stackingContainers.length <= 1) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[slides stacking] not enough containers to reorder, exiting");
    }
    return;
  }

  const { keys: selectedKeys, snapshot } = getSelectedKeysForStacking();
  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[slides stacking] selected keys:", selectedKeys, "snapshot:", snapshot.kind);
  }

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
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[slides stacking] no selected containers, exiting");
    }
    return;
  }
  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      "[slides stacking] selected container indices:",
      Array.from(selectedContainerSet)
    );
  }

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

  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[slides stacking] reordering complete, updating root");
  }
  root.clear();
  root.append(...rebuiltChildren);

  if (snapshot.kind === "node") {
    restoreNodeSelection(snapshot.keys);
  } else if (snapshot.kind === "range") {
    // Preserve caret/selection while typing inside a TextBox.
    $setSelection(snapshot.selection);
  }
}
