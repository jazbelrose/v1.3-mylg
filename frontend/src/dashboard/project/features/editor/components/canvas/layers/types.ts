export type LayerEntityType =
  | "shape"
  | "image"
  | "text"
  | "foreign"
  | "group"
  | "brief"
  | "moodboard";

export interface LayerEntity {
  id: string;
  name: string;
  type: LayerEntityType;
  order: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  parentId?: string | null;
  children?: string[];
  data?: Record<string, unknown>;
  source?: "fabric" | "lexical" | "moodboard" | "external";
  meta?: Record<string, unknown>;
}

export type LayerOperation =
  | { type: "ADD_LAYER"; layer: LayerEntity }
  | { type: "UPDATE_LAYER"; id: string; changes: Partial<LayerEntity> }
  | { type: "REMOVE_LAYER"; id: string }
  | { type: "REORDER_LAYER"; id: string; order: number }
  | { type: "HYDRATE_LAYERS"; layers: LayerEntity[] };

export interface LayerGroupState {
  id: string;
  name: string;
  opacity: number;
  visible: boolean;
  layerIds: string[];
}

export type LayerStageOperation =
  | LayerOperation
  | { type: "SET_GROUP_OPACITY"; id: string; opacity: number }
  | { type: "SET_GROUP_VISIBILITY"; id: string; visible: boolean }
  | { type: "REGISTER_GROUP"; group: LayerGroupState };

export interface LayerStageSnapshot {
  layers: LayerEntity[];
  groups: LayerGroupState[];
}

export interface LayerStageCommitResponse {
  success: boolean;
  error?: string;
}

