import React, {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { v4 as uuid } from "uuid";
import { useData } from "@/app/contexts/useData";
import type { Project } from "@/app/contexts/DataProvider";
import { EDIT_PROJECT_URL, apiFetch } from "@/shared/utils/api";
import { notify } from "@/shared/ui/ToastNotifications";
import {
  LayerEntity,
  LayerGroupState,
  LayerStageOperation,
} from "./types";
import { fabricJsonToLayers } from "./fabricTransforms";

const DEFAULT_GROUPS: Array<Pick<LayerGroupState, "id" | "name">> = [
  { id: "brief", name: "Brief" },
  { id: "canvas", name: "Canvas" },
  { id: "moodboard", name: "Moodboard" },
];

const determineGroupId = (layer: LayerEntity): string => {
  if (layer.type === "brief" || layer.source === "lexical") return "brief";
  if (layer.type === "moodboard" || layer.source === "moodboard") return "moodboard";
  if (layer.type === "group" && layer.meta?.groupId) {
    return String(layer.meta.groupId);
  }
  return "canvas";
};

const coerceLayer = (layer: Partial<LayerEntity>): LayerEntity => ({
  id: layer.id ?? uuid(),
  name: layer.name ?? "Layer",
  type: layer.type ?? "shape",
  order: layer.order ?? 0,
  opacity: layer.opacity ?? 1,
  visible: layer.visible ?? true,
  locked: layer.locked ?? false,
  parentId: layer.parentId ?? null,
  children: layer.children ?? [],
  data: layer.data ? { ...layer.data } : undefined,
  source: layer.source,
  meta: layer.meta ? { ...layer.meta } : undefined,
});

const deriveGroups = (
  layers: LayerEntity[],
  previous: LayerGroupState[] | null
): LayerGroupState[] => {
  const baseLookup = new Map<string, LayerGroupState>();
  (previous ?? []).forEach((group) => {
    baseLookup.set(group.id, group);
  });

  const ensureGroup = (id: string, name: string): LayerGroupState => {
    const existing = baseLookup.get(id);
    if (existing) {
      return {
        ...existing,
        name,
        layerIds: [],
      };
    }
    return {
      id,
      name,
      opacity: 1,
      visible: true,
      layerIds: [],
    };
  };

  const groups = DEFAULT_GROUPS.map(({ id, name }) => ensureGroup(id, name));
  const dynamicGroups = (previous ?? [])
    .filter((group) => !DEFAULT_GROUPS.some((g) => g.id === group.id))
    .map((group) => ({ ...group, layerIds: [] }));

  const merged = [...groups, ...dynamicGroups];
  const lookup = new Map(merged.map((group) => [group.id, group] as const));

  layers.forEach((layer) => {
    const groupId = determineGroupId(layer);
    const group = lookup.get(groupId);
    if (group) {
      group.layerIds.push(layer.id);
    }
  });

  return merged;
};

interface LayerStageContextValue {
  layers: LayerEntity[];
  groups: LayerGroupState[];
  isHydrating: boolean;
  pendingOperations: LayerStageOperation[];
  addLayer: (layer: Partial<LayerEntity>) => LayerEntity;
  updateLayer: (
    id: string,
    changes: Partial<LayerEntity>,
    options?: { silent?: boolean }
  ) => void;
  removeLayer: (id: string, options?: { silent?: boolean }) => void;
  reorderLayer: (
    id: string,
    order: number,
    options?: { silent?: boolean }
  ) => void;
  setGroupOpacity: (
    id: string,
    opacity: number,
    options?: { silent?: boolean }
  ) => void;
  setGroupVisibility: (
    id: string,
    visible: boolean,
    options?: { silent?: boolean }
  ) => void;
  registerGroup: (
    group: LayerGroupState,
    options?: { overwrite?: boolean }
  ) => void;
  commitOperations: (options?: { silent?: boolean }) => Promise<void>;
  hydrate: (options?: { projectId?: string; layers?: LayerEntity[] }) => Promise<void>;
  replaceLayers: (layers: LayerEntity[], options?: { silent?: boolean }) => void;
}

const LayerStageContext = createContext<LayerStageContextValue | null>(null);

export const useLayerStage = (): LayerStageContextValue => {
  const ctx = useContext(LayerStageContext);
  if (!ctx) {
    throw new Error("useLayerStage must be used within a LayerStageProvider");
  }
  return ctx;
};

interface ProviderProps extends PropsWithChildren {
  projectId?: string | null;
}

export const LayerStageProvider: React.FC<ProviderProps> = ({
  projectId: projectIdProp,
  children,
}) => {
  const { activeProject, setActiveProject } = useData() as {
    activeProject?: Project | null;
    setActiveProject: React.Dispatch<React.SetStateAction<Project | null>>;
  };
  const derivedProjectId = projectIdProp ?? activeProject?.projectId ?? null;
  const projectIdRef = useRef<string | null>(derivedProjectId ?? null);

  const [layers, setLayers] = useState<LayerEntity[]>(() =>
    Array.isArray(activeProject?.layers)
      ? [...(activeProject?.layers as LayerEntity[])]
      : []
  );
  const [groups, setGroups] = useState<LayerGroupState[]>(() =>
    deriveGroups(layers, Array.isArray(activeProject?.layerGroups)
      ? (activeProject?.layerGroups as LayerGroupState[])
      : null)
  );
  const [isHydrating, setIsHydrating] = useState<boolean>(false);
  const [pendingOperations, setPendingOperations] = useState<LayerStageOperation[]>([]);
  const groupsRef = useRef<LayerGroupState[]>(groups);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    projectIdRef.current = derivedProjectId;
  }, [derivedProjectId]);

  const syncProject = useCallback(
    (nextLayers: LayerEntity[], nextGroups: LayerGroupState[]) => {
      setActiveProject((prev) => {
        if (!prev || prev.projectId !== projectIdRef.current) return prev ?? null;
        return {
          ...prev,
          layers: nextLayers,
          layerGroups: nextGroups,
        } as Project;
      });
    },
    [setActiveProject]
  );

  const enqueueOperation = useCallback((operation: LayerStageOperation) => {
    setPendingOperations((prev) => [...prev, operation]);
  }, []);

  const handleHydrate = useCallback(
    async (options?: { projectId?: string; layers?: LayerEntity[] }) => {
      const projectId = options?.projectId ?? projectIdRef.current;
      const fallbackLayers = options?.layers;
      if (!projectId) {
        const nextLayers = fallbackLayers ?? [];
        const nextGroups = deriveGroups(nextLayers, null);
        setLayers(nextLayers);
        setGroups(nextGroups);
        syncProject(nextLayers, nextGroups);
        setPendingOperations([]);
        return;
      }

      setIsHydrating(true);
      try {
        let remoteLayers: LayerEntity[] | null = null;
        try {
          const apiUrl = `${EDIT_PROJECT_URL}/${projectId}`;
          const data = await apiFetch(apiUrl);
          if (Array.isArray(data?.layers)) {
            remoteLayers = data.layers as LayerEntity[];
          } else if (typeof data?.canvasJson === "string") {
            remoteLayers = fabricJsonToLayers(data.canvasJson);
          }
        } catch (err) {
          console.error("Failed to fetch layer data", err);
          notify(
            "error",
            "Unable to load layers from server. Using cached data where available."
          );
        }

        const nextLayers = remoteLayers ?? fallbackLayers ?? [];
        const nextGroups = deriveGroups(nextLayers, groups);
        setLayers(nextLayers);
        setGroups(nextGroups);
        syncProject(nextLayers, nextGroups);
        setPendingOperations([]);
      } finally {
        setIsHydrating(false);
      }
    },
    [groups, syncProject]
  );

  useEffect(() => {
    if (!derivedProjectId) {
      setLayers([]);
      setGroups(deriveGroups([], null));
      setPendingOperations([]);
      return;
    }
    const activeLayers = Array.isArray(activeProject?.layers)
      ? (activeProject?.layers as LayerEntity[])
      : undefined;
    void handleHydrate({ projectId: derivedProjectId, layers: activeLayers });
  }, [derivedProjectId, activeProject?.layers, handleHydrate]);

  const addLayer = useCallback(
    (layerInput: Partial<LayerEntity>): LayerEntity => {
      const layer = coerceLayer({
        ...layerInput,
        order:
          layerInput.order ??
          (layers.length ? Math.max(...layers.map((item) => item.order)) + 1 : 0),
      });
      setLayers((prev) => {
        const next = [...prev, layer].sort((a, b) => a.order - b.order);
        const nextGroups = deriveGroups(next, groups);
        setGroups(nextGroups);
        syncProject(next, nextGroups);
        return next;
      });
      enqueueOperation({ type: "ADD_LAYER", layer });
      return layer;
    },
    [layers, groups, enqueueOperation, syncProject]
  );

  const updateLayer = useCallback(
    (id: string, changes: Partial<LayerEntity>, options?: { silent?: boolean }) => {
      setLayers((prev) => {
        const next = prev.map((layer) =>
          layer.id === id ? { ...layer, ...changes } : layer
        );
        const nextGroups = deriveGroups(next, groups);
        setGroups(nextGroups);
        syncProject(next, nextGroups);
        return next;
      });
      if (!options?.silent) {
        enqueueOperation({ type: "UPDATE_LAYER", id, changes });
      }
    },
    [groups, enqueueOperation, syncProject]
  );

  const removeLayer = useCallback(
    (id: string, options?: { silent?: boolean }) => {
      setLayers((prev) => {
        const next = prev.filter((layer) => layer.id !== id);
        const nextGroups = deriveGroups(next, groups);
        setGroups(nextGroups);
        syncProject(next, nextGroups);
        return next;
      });
      if (!options?.silent) {
        enqueueOperation({ type: "REMOVE_LAYER", id });
      }
    },
    [groups, enqueueOperation, syncProject]
  );

  const reorderLayer = useCallback(
    (id: string, order: number, options?: { silent?: boolean }) => {
      setLayers((prev) => {
        const next = prev.map((layer) =>
          layer.id === id ? { ...layer, order } : layer
        );
        const sorted = next.sort((a, b) => a.order - b.order);
        const nextGroups = deriveGroups(sorted, groups);
        setGroups(nextGroups);
        syncProject(sorted, nextGroups);
        return [...sorted];
      });
      if (!options?.silent) {
        enqueueOperation({ type: "REORDER_LAYER", id, order });
      }
    },
    [groups, enqueueOperation, syncProject]
  );

  const setGroupOpacity = useCallback(
    (id: string, opacity: number, options?: { silent?: boolean }) => {
      setGroups((prev) => {
        const next = prev.map((group) =>
          group.id === id ? { ...group, opacity } : group
        );
        syncProject(layers, next);
        return next;
      });
      if (!options?.silent) {
        enqueueOperation({ type: "SET_GROUP_OPACITY", id, opacity });
      }
    },
    [layers, enqueueOperation, syncProject]
  );

  const setGroupVisibility = useCallback(
    (id: string, visible: boolean, options?: { silent?: boolean }) => {
      setGroups((prev) => {
        const next = prev.map((group) =>
          group.id === id ? { ...group, visible } : group
        );
        syncProject(layers, next);
        return next;
      });
      if (!options?.silent) {
        enqueueOperation({ type: "SET_GROUP_VISIBILITY", id, visible });
      }
    },
    [layers, enqueueOperation, syncProject]
  );

  const registerGroup = useCallback(
    (group: LayerGroupState, options?: { overwrite?: boolean }) => {
      setGroups((prev) => {
        const exists = prev.some((item) => item.id === group.id);
        if (exists && !options?.overwrite) {
          return prev;
        }
        const filtered = prev.filter((item) => item.id !== group.id);
        const next = [...filtered, { ...group }];
        syncProject(layers, next);
        return next;
      });
    },
    [layers, syncProject]
  );

  const commitOperations = useCallback(
    async (options?: { silent?: boolean }) => {
      const projectId = projectIdRef.current;
      if (!projectId || pendingOperations.length === 0) return;
      try {
        await apiFetch(`${EDIT_PROJECT_URL}/${projectId}/layers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operations: pendingOperations }),
        });
        setPendingOperations([]);
        if (!options?.silent) {
          notify("success", "Layers saved");
        }
      } catch (err) {
        console.error("Failed to persist layer operations", err);
        if (!options?.silent) {
          notify("error", "Failed to save layers. Changes are kept locally.");
        }
      }
    },
    [pendingOperations]
  );

  const replaceLayers = useCallback(
    (incomingLayers: LayerEntity[], options?: { silent?: boolean }) => {
      setLayers((prev) => {
        const next = incomingLayers.map((layer) => coerceLayer(layer));
        const prevMap = new Map(prev.map((layer) => [layer.id, layer] as const));
        const nextMap = new Map(next.map((layer) => [layer.id, layer] as const));

        const operations: LayerStageOperation[] = [];

        next.forEach((layer) => {
          const existing = prevMap.get(layer.id);
          if (!existing) {
            operations.push({ type: "ADD_LAYER", layer });
            return;
          }
          const changes: Partial<LayerEntity> = {};
          (Object.keys(layer) as Array<keyof LayerEntity>).forEach((key) => {
            const nextValue = layer[key];
            const prevValue = existing[key];
            if (JSON.stringify(nextValue) !== JSON.stringify(prevValue)) {
              (changes as Record<string, unknown>)[key] = nextValue as never;
            }
          });
          if (Object.keys(changes).length > 0) {
            operations.push({ type: "UPDATE_LAYER", id: layer.id, changes });
          }
        });

        prev.forEach((layer) => {
          if (!nextMap.has(layer.id)) {
            operations.push({ type: "REMOVE_LAYER", id: layer.id });
          }
        });

        const nextGroups = deriveGroups(next, groupsRef.current ?? null);
        setGroups(nextGroups);
        syncProject(next, nextGroups);

        if (!options?.silent && operations.length > 0) {
          setPendingOperations((prevOps) => [...prevOps, ...operations]);
        }

        return next;
      });
    },
    [syncProject]
  );

  const value = useMemo<LayerStageContextValue>(
    () => ({
      layers,
      groups,
      isHydrating,
      pendingOperations,
      addLayer,
      updateLayer,
      removeLayer,
      reorderLayer,
      setGroupOpacity,
      setGroupVisibility,
      registerGroup,
      commitOperations,
      hydrate: handleHydrate,
      replaceLayers,
    }),
    [
      layers,
      groups,
      isHydrating,
      pendingOperations,
      addLayer,
      updateLayer,
      removeLayer,
      reorderLayer,
      setGroupOpacity,
      setGroupVisibility,
      registerGroup,
      commitOperations,
      handleHydrate,
      replaceLayers,
    ]
  );

  return (
    <LayerStageContext.Provider value={value}>
      {children}
    </LayerStageContext.Provider>
  );
};

