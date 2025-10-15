import React, {
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { ImageLockContext } from "./ImageLockContext";

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

type Props = PropsWithChildren<{
  provider: ProviderLike;
}>;

export default function ImageLockPlugin({ provider, children }: Props) {
  const [locks, setLocks] = useState<LocksMap>({});

  useEffect(() => {
    if (!provider) return;

    const { awareness } = provider;

    const updateLocks = () => {
      const states = Array.from(awareness.getStates().values());
      const next: LocksMap = {};

      for (const state of states) {
        // Expecting: state.imageLock = { nodeId: string, userName: string }
        const lock = (state as { imageLock?: { nodeId?: string; userName?: string } })?.imageLock;

        if (lock?.nodeId && lock?.userName) {
          next[lock.nodeId] = lock.userName;
        }
      }
      setLocks(next);
    };

    awareness.on("change", updateLocks);
    updateLocks();

    return () => {
      awareness.off("change", updateLocks);
    };
  }, [provider]);

  return (
    <ImageLockContext.Provider value={{ locks, provider }}>
      {children}
    </ImageLockContext.Provider>
  );
}









