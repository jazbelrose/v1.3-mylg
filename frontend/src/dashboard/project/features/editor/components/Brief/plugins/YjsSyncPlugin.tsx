import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

/* --- Minimal typings for a Yjs-like provider we rely on --- */
type YDocLike = {
  on: (event: "update", cb: () => void) => void;
  off: (event: "update", cb: () => void) => void;
  /** In real Yjs: `doc.share` is a Map<string, AbstractType<any>> */
  share?: Map<string, unknown>;
};

type ProviderLike = {
  doc: YDocLike;
  /** y-websocket exposes `whenSynced: Promise<void>` */
  whenSynced?: Promise<void>;
  /** y-protocols/provider exposes an EventEmitter-style API */
  once?: (event: "sync", cb: () => void) => void;
} | null;

type Props = {
  provider: ProviderLike;
};

export default function YjsSyncPlugin({ provider }: Props): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!provider) return;

    let disposed = false;

    const onUpdate = () => {
      // Trigger a benign editor update to keep Lexical in sync with Yjs changes
      editor.update(() => {});
    };

    provider.doc.on("update", onUpdate);

    // Wait for initial sync, then log some diagnostics and tick the editor state
    const runAfterSync = async () => {
      try {
        if (provider.whenSynced && typeof (provider.whenSynced as Promise<void>).then === "function") {
          await provider.whenSynced;
        } else if (typeof provider.once === "function") {
          await new Promise<void>((resolve) => provider.once!("sync", resolve));
        }

        if (disposed) return;

        const typeKeys = Array.from(provider.doc?.share?.keys?.() ?? []);
         
        console.log("[Yjs] Synced. Types:", typeKeys);

        editor.update(() => {});
      } catch (e) {
         
        console.warn("[Yjs] whenSynced wait failed:", e);
      }
    };

    void runAfterSync();

    return () => {
      disposed = true;
      provider.doc.off("update", onUpdate);
    };
  }, [editor, provider]);

  return null;
}









