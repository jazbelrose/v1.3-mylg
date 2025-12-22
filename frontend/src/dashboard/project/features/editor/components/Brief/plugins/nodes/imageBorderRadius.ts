export const IMAGE_BORDER_RADIUS_KEYS = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;

export type ImageBorderRadiusKey = (typeof IMAGE_BORDER_RADIUS_KEYS)[number];

export type ImageBorderRadiusState = Record<ImageBorderRadiusKey, number>;

export const DEFAULT_IMAGE_BORDER_RADIUS: ImageBorderRadiusState = {
  topLeft: 0,
  topRight: 0,
  bottomRight: 0,
  bottomLeft: 0,
};

function normalizeBorderRadiusValue(value: number | string | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.max(0, parsed);
}

export function mergeBorderRadius(
  base: ImageBorderRadiusState,
  updates?: Partial<ImageBorderRadiusState>
): ImageBorderRadiusState {
  if (!updates) {
    return { ...base };
  }
  const result: ImageBorderRadiusState = { ...base };
  IMAGE_BORDER_RADIUS_KEYS.forEach((key) => {
    if (updates[key] !== undefined) {
      result[key] = normalizeBorderRadiusValue(updates[key]);
    }
  });
  return result;
}

export function borderRadiusToCss(borderRadius: ImageBorderRadiusState): string {
  const { topLeft, topRight, bottomRight, bottomLeft } = borderRadius;
  const allSame =
    topLeft === topRight && topLeft === bottomRight && topLeft === bottomLeft;
  return allSame
    ? `${topLeft}px`
    : `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`;
}
