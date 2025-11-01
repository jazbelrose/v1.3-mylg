import React, {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { YJS_WS_URL } from "@/config/realtime";

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, "");

type CanvasDocContextValue = {
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  isReady: boolean;
  getText: (key: string) => Y.Text | null;
};

const CanvasDocContext = createContext<CanvasDocContextValue | undefined>(undefined);

type CanvasDocProviderProps = PropsWithChildren<{
  projectId?: string | null;
}>;

export const CanvasDocProvider: React.FC<CanvasDocProviderProps> = ({
  projectId,
  children,
}) => {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  useEffect(() => {
    const nextDoc = new Y.Doc();
    setDoc(nextDoc);

    const baseUrl = stripTrailingSlash(YJS_WS_URL);
    const room = projectId ? `project:${projectId}:canvas` : "canvas:local";

    const nextProvider = new WebsocketProvider(baseUrl, room, nextDoc, {
      connect: true,
    });
    setProvider(nextProvider);

    return () => {
      nextProvider.destroy();
      setProvider(null);
      nextDoc.destroy();
      setDoc(null);
    };
  }, [projectId]);

  const getText = useCallback(
    (key: string) => {
      if (!doc) return null;
      return doc.getText(key);
    },
    [doc]
  );

  const value = useMemo<CanvasDocContextValue>(
    () => ({
      doc,
      provider,
      isReady: Boolean(doc),
      getText,
    }),
    [doc, getText, provider]
  );

  return <CanvasDocContext.Provider value={value}>{children}</CanvasDocContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCanvasDoc = (): CanvasDocContextValue => {
  const ctx = useContext(CanvasDocContext);
  if (!ctx) {
    throw new Error("useCanvasDoc must be used within a CanvasDocProvider");
  }
  return ctx;
};
