export type LayerGroupKey = "canvas";

export interface LayerGroupState {
  visible: boolean;
  opacity: number;
}

export interface SheetPageState {
  id: string;
  name: string;
  isSuperSheet?: boolean;
  groupStates: Record<LayerGroupKey, LayerGroupState>;
}

export interface SheetState {
  id: string;
  title: string;
  pageOrder: string[];
}
