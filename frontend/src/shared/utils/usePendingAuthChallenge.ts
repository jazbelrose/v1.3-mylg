import { useCallback, useEffect, useState } from 'react';
import { setWithTTL, getWithTTL } from './storageWithTTL';

const KEY = 'pendingAuthChallenge';
const TTL = 15 * 60 * 1000; // 15 minutes

interface UsePendingAuthChallengeReturn {
  pending: Record<string, unknown> | null;
  savePending: (data: Record<string, unknown>) => void;
  clearPending: () => void;
}

export default function usePendingAuthChallenge(): UsePendingAuthChallengeReturn {
  const [pending, setPending] = useState<Record<string, unknown> | null>(() => getWithTTL(KEY));

  const savePending = useCallback((data: Record<string, unknown>): void => {
    setWithTTL(KEY, data, TTL);
    setPending(data);
  }, []);

  const clearPending = useCallback((): void => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Silently fail if localStorage is not available
    }
    setPending(null);
  }, []);

  useEffect(() => {
    const data = getWithTTL(KEY);
    if (data) setPending(data as Record<string, unknown>);
  }, []);

  return { pending, savePending, clearPending };
}








