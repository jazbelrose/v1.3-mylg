import {
  $createNodeSelection,
  $copyNode,
  $getNodeByKey,
  $setSelection,
  ElementNode,
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
import { createGroupId, getNodeGroupId, setNodeGroupId } from "./grouping";

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
  const originalGroupIds = new Map<string, string>();

  for (const key of uniqueKeys) {
    const node = $getNodeByKey<LexicalNode>(key);
    if (!node) {
      continue;
    }

    const groupId = getNodeGroupId(node);
    if (groupId) {
      originalGroupIds.set(key, groupId);
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

  if (mapping.length > 0 && originalGroupIds.size > 0) {
    const remap = new Map<string, string>();
    mapping.forEach(({ originalKey, cloneKey }) => {
      const oldGroupId = originalGroupIds.get(originalKey);
      if (!oldGroupId) return;
      let newGroupId = remap.get(oldGroupId);
      if (!newGroupId) {
        newGroupId = createGroupId();
        remap.set(oldGroupId, newGroupId);
      }
      const cloneNode = $getNodeByKey<LexicalNode>(cloneKey);
      setNodeGroupId(cloneNode, newGroupId);
    });
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

  if (isLegacyImageNode(node)) {
    return cloneLegacyImageNode(node);
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

function isLegacyImageNode(node: LexicalNode): boolean {
  const ctor = node as unknown as { constructor?: { getType?: () => string } };
  return ctor?.constructor?.getType?.() === "image";
}

function cloneLegacyImageNode(node: LexicalNode): LexicalNode {
  return $copyNode(node);
}

function cloneLexicalSubtree(node: LexicalNode): LexicalNode {
  const clone = $copyNode(node);
  if (node instanceof ElementNode && clone instanceof ElementNode) {
    node.getChildren().forEach((child) => {
      clone.append(cloneLexicalSubtree(child));
    });
  }
  return clone;
}

function cloneTextBoxNode(node: TextBoxNode): TextBoxNode {
  const { x, y } = node.getPosition();
  const { width, height } = node.getSize();
  const rotation = node.getRotation();
  const clone = $createTextBoxNode(
    x,
    y,
    width,
    height,
    rotation,
    node.getLocked(),
    node.getBorder?.(),
    node.getBorderRadius?.(),
    node.getGroupId?.()
  );

  node.getChildren().forEach((child) => {
    clone.append(cloneLexicalSubtree(child));
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
    border: typeof (node as unknown as { getBorder?: () => any }).getBorder === "function"
      ? (node as unknown as { getBorder: () => any }).getBorder()
      : undefined,
    locked: node.getLocked(),
    groupId: typeof (node as unknown as { getGroupId?: () => string | null }).getGroupId === "function"
      ? (node as unknown as { getGroupId: () => string | null }).getGroupId()
      : null,
  });
}

function clonePictureFrameNode(node: PictureFrameNode): PictureFrameNode {
  const position = node.getImagePosition();
  return $createPictureFrameNode({
    x: node.getX(),
    y: node.getY(),
    width: node.getWidth(),
    height: node.getHeight(),
    rotation: node.getRotation(),
    imageSrc: node.getImageSrc(),
    fit: node.getFit(),
    radius: node.getRadius(),
    positionX: position.x,
    positionY: position.y,
    border: node.getBorder(),
    background: node.getBackground(),
    locked: node.getLocked(),
    groupId: node.getGroupId?.(),
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
    groupId: typeof (node as unknown as { getGroupId?: () => string | null }).getGroupId === "function"
      ? (node as unknown as { getGroupId: () => string | null }).getGroupId()
      : null,
  });
}

function bumpClonePosition(node: LexicalNode, dx: number, dy: number): void {
  if ($isTextBoxNode(node)) {
    const { x, y } = node.getPosition();
    node.setPosition(x + dx, y + dy);
  } else if (isLegacyImageNode(node)) {
    const anyNode = node as unknown as { getX?: () => number; getY?: () => number; setX?: (v: number) => void; setY?: (v: number) => void };
    if (typeof anyNode.getX === "function" && typeof anyNode.getY === "function" && typeof anyNode.setX === "function" && typeof anyNode.setY === "function") {
      anyNode.setX(anyNode.getX() + dx);
      anyNode.setY(anyNode.getY() + dy);
    }
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
