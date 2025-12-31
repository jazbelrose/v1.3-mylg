import { $getNodeByKey, type LexicalNode } from "lexical";
import { collectGroupIndex } from "./grouping";

export type AlignEdge = "left" | "right" | "top" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export type Aabb = { minX: number; minY: number; maxX: number; maxY: number };
type NodeFrame = { x: number; y: number; width: number; height: number; rotation: number };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getNodeFrame(node: LexicalNode): NodeFrame | null {
  const anyNode = node as unknown as {
    getX?: () => number;
    getY?: () => number;
    getWidth?: () => number;
    getHeight?: () => number;
    getRotation?: () => number;
    getPosition?: () => { x: number; y: number };
    getSize?: () => { width: number; height: number };
  };

  const pos =
    typeof anyNode.getPosition === "function"
      ? anyNode.getPosition()
      : typeof anyNode.getX === "function" && typeof anyNode.getY === "function"
        ? { x: anyNode.getX(), y: anyNode.getY() }
        : null;

  const size =
    typeof anyNode.getSize === "function"
      ? anyNode.getSize()
      : typeof anyNode.getWidth === "function" && typeof anyNode.getHeight === "function"
        ? { width: anyNode.getWidth(), height: anyNode.getHeight() }
        : null;

  if (!pos || !size) return null;

  const rotation = typeof anyNode.getRotation === "function" ? anyNode.getRotation() : 0;

  return {
    x: isFiniteNumber(pos.x) ? pos.x : 0,
    y: isFiniteNumber(pos.y) ? pos.y : 0,
    width: isFiniteNumber(size.width) ? size.width : 0,
    height: isFiniteNumber(size.height) ? size.height : 0,
    rotation: isFiniteNumber(rotation) ? rotation : 0,
  };
}

function rectToAabb(frame: NodeFrame): Aabb {
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  const rad = (frame.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = frame.width / 2;
  const halfH = frame.height / 2;
  const corners = [
    { dx: -halfW, dy: -halfH },
    { dx: halfW, dy: -halfH },
    { dx: halfW, dy: halfH },
    { dx: -halfW, dy: halfH },
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const { dx, dy } of corners) {
    const x = cx + dx * cos - dy * sin;
    const y = cy + dx * sin + dy * cos;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

function unionAabb(a: Aabb, b: Aabb): Aabb {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function getAabbSize(aabb: Aabb): { width: number; height: number } {
  return { width: aabb.maxX - aabb.minX, height: aabb.maxY - aabb.minY };
}

function isNodeLocked(node: LexicalNode): boolean {
  const anyNode = node as unknown as { getLocked?: () => boolean };
  return typeof anyNode.getLocked === "function" ? Boolean(anyNode.getLocked()) : false;
}

function setNodePosition(node: LexicalNode, next: { x: number; y: number }): void {
  const anyNode = node as unknown as {
    setX?: (value: number) => void;
    setY?: (value: number) => void;
    setPosition?: (x: number, y: number) => void;
    getLocked?: () => boolean;
  };

  if (typeof anyNode.getLocked === "function" && anyNode.getLocked()) return;

  if (typeof anyNode.setPosition === "function") {
    anyNode.setPosition(next.x, next.y);
  } else if (typeof anyNode.setX === "function" && typeof anyNode.setY === "function") {
    anyNode.setX(next.x);
    anyNode.setY(next.y);
  }
}

function moveNodeBy(node: LexicalNode, delta: { dx: number; dy: number }): void {
  const frame = getNodeFrame(node);
  if (!frame) return;
  setNodePosition(node, { x: frame.x + delta.dx, y: frame.y + delta.dy });
}

type Unit = {
  keys: string[];
  nodes: LexicalNode[];
  aabb: Aabb;
  locked: boolean;
};

function buildSelectionUnits(keys: string[]): Unit[] {
  const uniqueKeys = Array.from(new Set(keys));
  const selectedSet = new Set(uniqueKeys);
  const groupIndex = collectGroupIndex();

  const consumed = new Set<string>();
  const units: Unit[] = [];

  groupIndex.groupIdToKeys.forEach((memberKeys) => {
    if (memberKeys.length < 2) return;
    const fullySelected = memberKeys.every((key) => selectedSet.has(key));
    if (!fullySelected) return;
    memberKeys.forEach((key) => consumed.add(key));
    units.push({ keys: memberKeys, nodes: [], aabb: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, locked: false });
  });

  uniqueKeys.forEach((key) => {
    if (consumed.has(key)) return;
    units.push({ keys: [key], nodes: [], aabb: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, locked: false });
  });

  const result: Unit[] = [];

  for (const unit of units) {
    const nodes = unit.keys
      .map((key) => $getNodeByKey<LexicalNode>(key))
      .filter((node): node is LexicalNode => Boolean(node));
    if (nodes.length === 0) continue;

    const aabbs = nodes
      .map((node) => {
        const frame = getNodeFrame(node);
        return frame ? rectToAabb(frame) : null;
      })
      .filter((aabb): aabb is Aabb => Boolean(aabb));
    if (aabbs.length === 0) continue;

    const aabb = aabbs.reduce((acc, next) => unionAabb(acc, next));
    const locked = nodes.some((node) => isNodeLocked(node));

    result.push({ keys: unit.keys, nodes, aabb, locked });
  }

  return result;
}

export function computeAlignDeltas(aabbs: Aabb[], edge: AlignEdge): Array<{ dx: number; dy: number }> {
  if (aabbs.length === 0) return [];

  const bounds = aabbs.reduce((acc, next) => unionAabb(acc, next));
  return aabbs.map((aabb) => {
    switch (edge) {
      case "left":
        return { dx: bounds.minX - aabb.minX, dy: 0 };
      case "right":
        return { dx: bounds.maxX - aabb.maxX, dy: 0 };
      case "top":
        return { dx: 0, dy: bounds.minY - aabb.minY };
      case "bottom":
        return { dx: 0, dy: bounds.maxY - aabb.maxY };
    }
  });
}

export function computeDistributeDeltas(aabbs: Aabb[], axis: DistributeAxis): Array<{ dx: number; dy: number }> {
  if (aabbs.length < 3) return aabbs.map(() => ({ dx: 0, dy: 0 }));

  const order = aabbs
    .map((aabb, index) => ({ aabb, index }))
    .sort((a, b) => {
      if (axis === "horizontal") {
        if (a.aabb.minX !== b.aabb.minX) return a.aabb.minX - b.aabb.minX;
        return a.aabb.minY - b.aabb.minY;
      }
      if (a.aabb.minY !== b.aabb.minY) return a.aabb.minY - b.aabb.minY;
      return a.aabb.minX - b.aabb.minX;
    });

  const sorted = order.map((o) => o.aabb);
  const deltas = aabbs.map(() => ({ dx: 0, dy: 0 }));

  if (axis === "horizontal") {
    const start = sorted[0]!.minX;
    const end = sorted[sorted.length - 1]!.maxX;
    const totalWidth = sorted.reduce((sum, aabb) => sum + getAabbSize(aabb).width, 0);
    const gap = (end - start - totalWidth) / (sorted.length - 1);

    let cursor = sorted[0]!.minX + getAabbSize(sorted[0]!).width + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
      const aabb = sorted[i]!;
      const dx = cursor - aabb.minX;
      deltas[order[i]!.index] = { dx, dy: 0 };
      cursor += getAabbSize(aabb).width + gap;
    }

    return deltas;
  }

  const start = sorted[0]!.minY;
  const end = sorted[sorted.length - 1]!.maxY;
  const totalHeight = sorted.reduce((sum, aabb) => sum + getAabbSize(aabb).height, 0);
  const gap = (end - start - totalHeight) / (sorted.length - 1);

  let cursor = sorted[0]!.minY + getAabbSize(sorted[0]!).height + gap;
  for (let i = 1; i < sorted.length - 1; i++) {
    const aabb = sorted[i]!;
    const dy = cursor - aabb.minY;
    deltas[order[i]!.index] = { dx: 0, dy };
    cursor += getAabbSize(aabb).height + gap;
  }

  return deltas;
}

export function alignSlideNodes(keys: string[], edge: AlignEdge): void {
  const units = buildSelectionUnits(keys);
  if (units.length < 2) return;

  const deltas = computeAlignDeltas(
    units.map((unit) => unit.aabb),
    edge
  );

  units.forEach((unit, index) => {
    if (unit.locked) return;
    const delta = deltas[index];
    if (!delta) return;
    unit.nodes.forEach((node) => moveNodeBy(node, delta));
  });
}

export function distributeSlideNodes(keys: string[], axis: DistributeAxis): void {
  const units = buildSelectionUnits(keys);
  if (units.length < 3) return;

  const deltas = computeDistributeDeltas(
    units.map((unit) => unit.aabb),
    axis
  );

  units.forEach((unit, index) => {
    if (unit.locked) return;
    const delta = deltas[index];
    if (!delta) return;
    if (delta.dx === 0 && delta.dy === 0) return;
    unit.nodes.forEach((node) => moveNodeBy(node, delta));
  });
}

