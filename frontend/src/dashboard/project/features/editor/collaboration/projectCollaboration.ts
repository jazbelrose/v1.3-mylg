import { YJS_WS_URL } from "@/config/realtime";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

const PROJECT_NAMESPACE_PREFIX = "project";
const CANVAS_TEXT_MAP_KEY = "canvasTexts";

export type CanvasTextListener = (json: string | null) => void;

interface CollaborationEntry {
  doc: Y.Doc;
  provider: WebsocketProvider;
  persistence: IndexeddbPersistence;
  canvasTextMap: Y.Map<string>;
  listeners: Map<string, Set<CanvasTextListener>>;
}

const collaborations = new Map<string, CollaborationEntry>();

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, "");

const createCollaborationEntry = (projectId: string): CollaborationEntry => {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(
    stripTrailingSlash(YJS_WS_URL),
    `${PROJECT_NAMESPACE_PREFIX}:${projectId}`,
    doc
  );

  const persistence = new IndexeddbPersistence(`${PROJECT_NAMESPACE_PREFIX}:${projectId}`, doc);
  persistence.on("synced", () => {
    console.log(`[collab] IndexedDB synced for project ${projectId}`);
  });

  const canvasTextMap = doc.getMap<string>(CANVAS_TEXT_MAP_KEY);
  const listeners = new Map<string, Set<CanvasTextListener>>();

  canvasTextMap.observe((event) => {
    event.keysChanged.forEach((key) => {
      const current = canvasTextMap.get(key) ?? null;
      const callbacks = listeners.get(key);
      if (!callbacks) return;
      callbacks.forEach((cb) => {
        try {
          cb(current);
        } catch (err) {
          console.error("[collab] Canvas listener error", err);
        }
      });
    });
  });

  return { doc, provider, persistence, canvasTextMap, listeners };
};

export const ensureProjectCollaboration = (
  projectId: string
): CollaborationEntry => {
  let entry = collaborations.get(projectId);
  if (!entry) {
    entry = createCollaborationEntry(projectId);
    collaborations.set(projectId, entry);
  }
  return entry;
};

export const getCanvasTextSnapshot = (
  projectId: string,
  objectId: string
): string | null => {
  const entry = ensureProjectCollaboration(projectId);
  return entry.canvasTextMap.get(objectId) ?? null;
};

export const setCanvasTextSnapshot = (
  projectId: string,
  objectId: string,
  json: string
): void => {
  const entry = ensureProjectCollaboration(projectId);
  entry.canvasTextMap.set(objectId, json);
};

export const removeCanvasTextSnapshot = (
  projectId: string,
  objectId: string
): void => {
  const entry = ensureProjectCollaboration(projectId);
  entry.canvasTextMap.delete(objectId);
};

export const subscribeToCanvasText = (
  projectId: string,
  objectId: string,
  listener: CanvasTextListener
): (() => void) => {
  const entry = ensureProjectCollaboration(projectId);
  let set = entry.listeners.get(objectId);
  if (!set) {
    set = new Set();
    entry.listeners.set(objectId, set);
  }
  set.add(listener);
  listener(entry.canvasTextMap.get(objectId) ?? null);
  return () => {
    const currentSet = entry.listeners.get(objectId);
    if (!currentSet) return;
    currentSet.delete(listener);
    if (currentSet.size === 0) {
      entry.listeners.delete(objectId);
    }
  };
};

export const getProjectProvider = (
  projectId: string
): WebsocketProvider => ensureProjectCollaboration(projectId).provider;

export const getProjectDoc = (projectId: string): Y.Doc => ensureProjectCollaboration(projectId).doc;

export const getCanvasTextMap = (projectId: string): Y.Map<string> =>
  ensureProjectCollaboration(projectId).canvasTextMap;

