import { createContext, useContext } from "react";

/** Minimal shape of a Yjs Awareness instance that we rely on */
type AwarenessLike = {
  on: (event: "change", listener: () => void) => void;
  off: (event: "change", listener: () => void) => void;
  getStates: () => Map<number, Record<string, unknown>>;
};

/** Minimal shape of the provider we need (e.g., y-websocket provider) */
type ProviderLike = {
  awareness: AwarenessLike;
} | null;

type LocksMap = Record<string, string>; // nodeId -> userName

type ImageLockContextValue = {
  locks: LocksMap;
  provider: ProviderLike;
};

export const ImageLockContext = createContext<ImageLockContextValue | null>(null);

export const useImageLocks = (): ImageLockContextValue => {
  const ctx = useContext(ImageLockContext);
  if (!ctx) {
    throw new Error("useImageLocks must be used within ImageLockPlugin");
  }
  return ctx;
};









