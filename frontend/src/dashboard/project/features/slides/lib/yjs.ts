// lib/yjs.ts - Yjs connection manager for per-slide collaboration
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { YJS_WS_URL } from "@/config/realtime";

interface SlideProvider {
  provider: WebsocketProvider;
  persistence: IndexeddbPersistence;
  doc: Y.Doc;
}

// Cache of active providers per slide
const slideProviders = new Map<string, SlideProvider>();

/**
 * Get or create a Yjs provider for a specific slide
 */
export function getSlideProvider(slideId: string): SlideProvider {
  const existing = slideProviders.get(slideId);
  if (existing) {
    return existing;
  }

  // Create new Y.Doc for this slide
  const doc = new Y.Doc();

  // Create IndexedDB persistence
  const persistence = new IndexeddbPersistence(`slide-${slideId}`, doc);
  
  persistence.on("synced", () => {
    console.log(`[Slides] IndexedDB synced for slide: ${slideId}`);
  });

  // Create WebSocket provider for real-time collaboration
  const provider = new WebsocketProvider(
    YJS_WS_URL.replace(/\/$/, ""),
    `slide-${slideId}`,
    doc
  );

  const slideProvider = { provider, persistence, doc };
  slideProviders.set(slideId, slideProvider);

  return slideProvider;
}

/**
 * Disconnect and cleanup a slide provider
 */
export function disconnectSlideProvider(slideId: string): void {
  const existing = slideProviders.get(slideId);
  if (existing) {
    console.log(`[Slides] Disconnecting provider for slide: ${slideId}`);
    existing.provider.disconnect();
    existing.persistence.destroy().catch((err) => {
      console.error(`[Slides] Error destroying persistence for slide ${slideId}:`, err);
    });
    slideProviders.delete(slideId);
  }
}

/**
 * Disconnect all slide providers (cleanup on unmount)
 */
export function disconnectAllSlideProviders(): void {
  console.log(`[Slides] Disconnecting all slide providers (${slideProviders.size} active)`);
  slideProviders.forEach((_, slideId) => {
    disconnectSlideProvider(slideId);
  });
}

/**
 * Get the shared text type for a slide
 */
export function getSlideSharedText(slideId: string): Y.Text {
  const { doc } = getSlideProvider(slideId);
  return doc.getText("lexical");
}
