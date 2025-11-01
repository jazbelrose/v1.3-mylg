import type { FabricSnapshot } from "../types";

export const sanitizeSnapshot = (snapshot: FabricSnapshot | null): FabricSnapshot | null => {
  if (!snapshot) return null;
  const sanitized: FabricSnapshot = {
    version: snapshot.version || "6.0.0",
    objects: Array.isArray(snapshot.objects) ? snapshot.objects : [],
  };
  if (snapshot.background) sanitized.background = snapshot.background;
  if (snapshot.width) sanitized.width = snapshot.width;
  if (snapshot.height) sanitized.height = snapshot.height;
  return sanitized;
};

export const mergeSnapshots = (
  base: FabricSnapshot | null,
  incoming: FabricSnapshot | null
): FabricSnapshot | null => {
  if (!incoming) return base ? { ...base } : null;
  if (!base) return { ...incoming, objects: [...incoming.objects] };

  const mergedObjects = Array.isArray(incoming.objects)
    ? [...incoming.objects]
    : Array.isArray(base.objects)
      ? [...base.objects]
      : [];

  return {
    version: incoming.version || base.version || "6.0.0",
    objects: mergedObjects,
    background: incoming.background ?? base.background,
    width: incoming.width ?? base.width,
    height: incoming.height ?? base.height,
  };
};

export const snapshotToString = (snapshot: FabricSnapshot | null): string =>
  JSON.stringify(snapshot ?? null);

export const stringToSnapshot = (value: string | null | undefined): FabricSnapshot | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as FabricSnapshot;
    return sanitizeSnapshot(parsed);
  } catch (err) {
    console.warn("Failed to parse fabric snapshot", err);
    return null;
  }
};
