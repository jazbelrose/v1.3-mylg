import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";

/**
 * Shared provider interface between the brief (Lexical) editor and the canvas.
 * We extend the stock WebsocketProvider with helper utilities for retrieving
 * Y.Text instances for individual Fabric objects. This allows us to synchronize
 * text overlays without creating additional websocket rooms.
 */
export interface SharedYjsProvider extends WebsocketProvider {
  /** Primary shared type used by the brief editor. */
  sharedType?: Y.Text;
  /** Cache of Y.Text instances keyed by Fabric object id. */
  textMap?: Map<string, Y.Text>;
  /** Lazily provide a Y.Text instance for a Fabric object id. */
  getTextForObject?: (objectId: string) => Y.Text;
}

