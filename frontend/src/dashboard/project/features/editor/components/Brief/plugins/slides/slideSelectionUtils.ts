import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  type LexicalNode,
} from "lexical";
import { $createTextBoxNode, $isTextBoxNode, TextBoxNode } from "../nodes/TextBoxNode";
import {
  ResizableImageNode,
  $createResizableImageNode,
} from "../nodes/ResizableImageNode";
import { SvgNode } from "../nodes/SvgNode";
import { $createSvgNode } from "../nodes/SvgNodeUtils";

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

type CloneRecord = { originalKey: string; cloneKey: string };

export type DuplicateResult = {
  clones: CloneRecord[];
  cloneKeys: string[];
};

export function duplicateSlideNodes(
  keys: string[],
  options: { offsetX?: number; offsetY?: number } = {}
): DuplicateResult {
  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) {
    return { clones: [], cloneKeys: [] };
  }

  const dx = options.offsetX ?? 8;
  const dy = options.offsetY ?? 8;

  const clones: LexicalNode[] = [];
  const mapping: CloneRecord[] = [];

  for (const key of uniqueKeys) {
    const node = $getNodeByKey<LexicalNode>(key);
    if (!node) {
      continue;
    }

    const clone = cloneSlideNode(node);
    if (!clone) {
      continue;
    }

    node.insertAfter(clone);
    bumpClonePosition(clone, dx, dy);
    clones.push(clone);
    mapping.push({ originalKey: key, cloneKey: clone.getKey() });
  }

  if (clones.length > 0) {
    const nextSelection = $createNodeSelection();
    clones.forEach((clone) => nextSelection.add(clone.getKey()));
    $setSelection(nextSelection);
  }

  return { clones: mapping, cloneKeys: clones.map((clone) => clone.getKey()) };
}

function cloneSlideNode(node: LexicalNode): LexicalNode | null {
  if ($isTextBoxNode(node)) {
    return cloneTextBoxNode(node);
  }

  if (node instanceof ResizableImageNode) {
    return cloneResizableImageNode(node);
  }

  if (node instanceof SvgNode) {
    return cloneSvgNode(node);
  }

  return null;
}

function cloneTextBoxNode(node: TextBoxNode): TextBoxNode {
  const { x, y } = node.getPosition();
  const { width, height } = node.getSize();
  const rotation = node.getRotation();
  const clone = $createTextBoxNode(x, y, width, height, rotation, node.getLocked());

  node.getChildren().forEach((child) => {
    clone.append((child as LexicalNode).clone());
  });

  return clone;
}

function cloneResizableImageNode(node: ResizableImageNode): ResizableImageNode {
  return $createResizableImageNode({
    src: node.getSrc(),
    altText: node.getAltText(),
    width: node.getWidth(),
    height: node.getHeight(),
    originalAspectRatio: node.getOriginalAspectRatio(),
    x: node.getX(),
    y: node.getY(),
    rotation: node.getRotation(),
    borderRadius: node.getBorderRadius(),
    locked: node.getLocked(),
  });
}

function cloneSvgNode(node: SvgNode): SvgNode {
  return $createSvgNode({
    svg: node.getSvg(),
    x: node.getX(),
    y: node.getY(),
    width: node.getWidth(),
    height: node.getHeight(),
    rotation: node.getRotation(),
    locked: node.getLocked(),
  });
}

function bumpClonePosition(node: LexicalNode, dx: number, dy: number): void {
  if ($isTextBoxNode(node)) {
    const { x, y } = node.getPosition();
    node.setPosition(x + dx, y + dy);
  } else if (node instanceof ResizableImageNode) {
    node.setX(node.getX() + dx);
    node.setY(node.getY() + dy);
  } else if (node instanceof SvgNode) {
    node.setX(node.getX() + dx);
    node.setY(node.getY() + dy);
  }
}
