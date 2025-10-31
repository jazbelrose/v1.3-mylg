import { v4 as uuid } from "uuid";
import type { LayerEntity, LayerEntityType } from "./types";

interface FabricSerializedObject {
  id?: string | number;
  name?: string;
  type?: string;
  visible?: boolean;
  opacity?: number;
  lockMovementX?: boolean;
  lockMovementY?: boolean;
  [key: string]: unknown;
}

const fabricTypeToLayerType = (type?: string): LayerEntityType => {
  switch (type) {
    case "i-text":
    case "textbox":
    case "text":
      return "text";
    case "image":
      return "image";
    case "rect":
    case "triangle":
    case "ellipse":
    case "circle":
    case "path":
    case "line":
      return "shape";
    default:
      return "foreign";
  }
};

const cloneFabricObject = (obj: FabricSerializedObject): FabricSerializedObject => {
  try {
    return JSON.parse(JSON.stringify(obj)) as FabricSerializedObject;
  } catch {
    return { ...obj };
  }
};

export const fabricObjectToLayer = (
  obj: FabricSerializedObject,
  index = 0
): LayerEntity => {
  const idValue = obj.id ?? uuid();
  const id = typeof idValue === "string" ? idValue : String(idValue);
  const type = fabricTypeToLayerType(obj.type);
  const name = obj.name ?? `${obj.type ?? "Layer"} ${index + 1}`;
  const visible = obj.visible !== false;
  const locked = Boolean(obj.lockMovementX && obj.lockMovementY);
  const opacity = typeof obj.opacity === "number" ? obj.opacity : 1;

  return {
    id,
    name,
    type,
    order: typeof obj.order === "number" ? obj.order : index,
    opacity,
    visible,
    locked,
    source: "fabric",
    data: { fabric: cloneFabricObject(obj) },
  };
};

export const fabricJsonToLayers = (
  json: string | Record<string, unknown> | null | undefined
): LayerEntity[] => {
  if (!json) return [];
  let payload: Record<string, unknown>;
  if (typeof json === "string") {
    try {
      payload = JSON.parse(json) as Record<string, unknown>;
    } catch (err) {
      console.error("Failed to parse fabric JSON", err);
      return [];
    }
  } else if (typeof json === "object") {
    payload = json as Record<string, unknown>;
  } else {
    return [];
  }

  const objects = Array.isArray((payload as { objects?: unknown[] }).objects)
    ? ((payload as { objects: FabricSerializedObject[] }).objects ?? [])
    : [];
  return objects
    .map((obj, index) => fabricObjectToLayer(obj, index))
    .sort((a, b) => a.order - b.order);
};

export const layerToFabricData = (
  layer: LayerEntity
): FabricSerializedObject | null => {
  if (layer.data && typeof layer.data.fabric === "object") {
    return cloneFabricObject(layer.data.fabric as FabricSerializedObject);
  }
  return null;
};

export const updateLayerFabricData = (
  layer: LayerEntity,
  fabricData: FabricSerializedObject
): LayerEntity => ({
  ...layer,
  data: {
    ...(layer.data ?? {}),
    fabric: cloneFabricObject(fabricData),
  },
});

