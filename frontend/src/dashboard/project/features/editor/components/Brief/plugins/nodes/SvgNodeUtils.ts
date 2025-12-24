import { SvgNode } from "./SvgNode";

export function $createSvgNode({
  svg,
  x = 0,
  y = 0,
  width = 300,
  height = 200,
  rotation = 0,
}: {
  svg: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}): SvgNode {
  return new SvgNode(svg, x, y, width, height, rotation);
}

export function $isSvgNode(node: unknown): node is SvgNode {
  return node instanceof SvgNode;
}
