import { SvgNode } from "./SvgNode";

export function $createSvgNode({
  svg,
  x = 0,
  y = 0,
  width = 300,
  height = 200,
  rotation = 0,
  locked = false,
}: {
  svg: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  locked?: boolean;
}): SvgNode {
  return new SvgNode(svg, x, y, width, height, rotation, undefined, locked);
}

export function $isSvgNode(node: unknown): node is SvgNode {
  return node instanceof SvgNode;
}
