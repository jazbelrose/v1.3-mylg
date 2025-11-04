// Yjs utilities for slides collaboration
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { YJS_WS_URL } from "@/config/realtime";

export interface SlideProvider {
  provider: WebsocketProvider;
  persistence: IndexeddbPersistence;
  doc: Y.Doc;
  disconnect: () => void;
}

/**
 * Create a Yjs provider for a specific slide
 */
export function createSlideProvider(
  projectId: string,
  slideId: string
): SlideProvider {
  const roomId = `${projectId}-slide-${slideId}`;
  const doc = new Y.Doc();

  // Create IndexedDB persistence for offline support
  const persistence = new IndexeddbPersistence(roomId, doc);
  
  persistence.on("synced", () => {
    console.log(`[Slides] IndexedDB synced for slide ${slideId}`);
  });

  // Create WebSocket provider for real-time collaboration
  const provider = new WebsocketProvider(
    YJS_WS_URL.replace(/\/$/, ""),
    roomId,
    doc
  );

  // Add debug listeners
  provider.on("status", (event: { status: string }) => {
    console.log(`[Slides] Provider status for slide ${slideId}:`, event.status);
  });

  provider.on("sync", (isSynced: boolean) => {
    console.log(`[Slides] Provider sync for slide ${slideId}:`, isSynced);
  });

  const disconnect = () => {
    console.log(`[Slides] Disconnecting provider for slide ${slideId}`);
    provider.disconnect();
    persistence.destroy().catch((err) => {
      console.error(`[Slides] Error destroying persistence for slide ${slideId}:`, err);
    });
  };

  return {
    provider,
    persistence,
    doc,
    disconnect,
  };
}
