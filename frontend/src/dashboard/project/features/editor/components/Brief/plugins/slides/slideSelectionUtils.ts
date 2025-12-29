import {
  $createNodeSelection,
  $getNodeByKey,
  $setSelection,
  type LexicalNode,
} from "lexical";
import { $createTextBoxNode, $isTextBoxNode, TextBoxNode } from "../nodes/TextBoxNode";
import {
  ResizableImageNode,
  $createResizableImageNode,
} from "../nodes/ResizableImageNode";
import {
  PictureFrameNode,
  $createPictureFrameNode,
} from "../nodes/PictureFrameNode";
import { SvgNode } from "../nodes/SvgNode";
import { $createSvgNode } from "../nodes/SvgNodeUtils";
import {
  applyModifierNodeSelection,
  getSlideNodeSelectionKeys,
  isCopyGesture,
  type ModifierKeys,
  type SelectionUpdate,
} from "./slideSelection";

export {
  applyModifierNodeSelection,
  getSlideNodeSelectionKeys,
  isCopyGesture,
  type ModifierKeys,
  type SelectionUpdate,
};

type CloneRecord = { originalKey: string; cloneKey: string };

export type DuplicateResult = {
  clones: CloneRecord[];
  cloneKeys: string[];
};

export function duplicateSlideNodes(
  keys: string[],
  options: { offsetX?: number; offsetY?: number; selectClones?: boolean } = {}
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

  if (clones.length > 0 && options.selectClones !== false) {
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

  if (node instanceof PictureFrameNode) {
    return clonePictureFrameNode(node);
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
    clone.append((child as unknown as { clone: () => LexicalNode }).clone());
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

function clonePictureFrameNode(node: PictureFrameNode): PictureFrameNode {
  return $createPictureFrameNode({
    x: node.getX(),
    y: node.getY(),
    width: node.getWidth(),
    height: node.getHeight(),
    rotation: node.getRotation(),
    imageSrc: node.getImageSrc(),
    fit: node.getFit(),
    radius: node.getRadius(),
    border: node.getBorder(),
    background: node.getBackground(),
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
  } else if (node instanceof PictureFrameNode) {
    node.setX(node.getX() + dx);
    node.setY(node.getY() + dy);
  } else if (node instanceof ResizableImageNode) {
    node.setX(node.getX() + dx);
    node.setY(node.getY() + dy);
  } else if (node instanceof SvgNode) {
    node.setX(node.getX() + dx);
    node.setY(node.getY() + dy);
  }
}
