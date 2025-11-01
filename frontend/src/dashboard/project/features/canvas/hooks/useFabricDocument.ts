import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FABRIC_API_BASE_URL, FABRIC_EXPORT_TIMEOUT } from "@/config/fabric";
import type {
  FabricDocument,
  FabricExportRequest,
  FabricExportResult,
  FabricSnapshot,
} from "../types";
import { sanitizeSnapshot } from "../utils/fabricSerialization";

interface UseFabricDocumentOptions {
  documentId: string;
  projectId: string;
  pageId: string;
  userId?: string;
}

interface UseFabricDocumentResult {
  document: FabricDocument | null;
  loading: boolean;
  error: Error | null;
  saveSnapshot: (snapshot: FabricSnapshot) => Promise<void>;
  requestExport: (options: FabricExportRequest) => Promise<FabricExportResult>;
  refresh: () => Promise<void>;
}

const buildDocumentUrl = (projectId: string, pageId: string) =>
  `${FABRIC_API_BASE_URL.replace(/\/$/, "")}/projects/${projectId}/pages/${pageId}`;

export const useFabricDocument = ({
  documentId,
  projectId,
  pageId,
  userId,
}: UseFabricDocumentOptions): UseFabricDocumentResult => {
  const [document, setDocument] = useState<FabricDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const pendingSnapshotRef = useRef<FabricSnapshot | null>(null);
  const flushTimeoutRef = useRef<number | null>(null);

  const url = useMemo(() => buildDocumentUrl(projectId, pageId), [projectId, pageId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url, {
        headers: { "x-fabric-document-id": documentId },
      });
      if (!response.ok) throw new Error(`Failed to fetch fabric document (${response.status})`);
      const data = (await response.json()) as FabricDocument;
      setDocument({ ...data, snapshot: sanitizeSnapshot(data.snapshot) });
    } catch (err) {
      console.error("Failed to load fabric document", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [url, documentId]);

  useEffect(() => {
    load();
    return () => {
      if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    };
  }, [load]);

  const flushSnapshot = useCallback(async () => {
    const snapshot = pendingSnapshotRef.current;
    if (!snapshot) return;
    pendingSnapshotRef.current = null;
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-fabric-document-id": documentId,
          ...(userId ? { "x-fabric-user-id": userId } : {}),
        },
        body: JSON.stringify({ snapshot }),
      });
      if (!response.ok) {
        throw new Error(`Failed to persist fabric snapshot (${response.status})`);
      }
      const data = (await response.json()) as FabricDocument;
      setDocument({ ...data, snapshot: sanitizeSnapshot(data.snapshot) });
    } catch (err) {
      console.error("Failed to persist fabric snapshot", err);
      setError(err as Error);
    }
  }, [url, documentId, userId]);

  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    flushTimeoutRef.current = window.setTimeout(() => {
      flushSnapshot().catch(err => console.error(err));
    }, 1_000);
  }, [flushSnapshot]);

  const saveSnapshot = useCallback(
    async (snapshot: FabricSnapshot) => {
      pendingSnapshotRef.current = snapshot;
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const requestExport = useCallback(
    async (options: FabricExportRequest) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), FABRIC_EXPORT_TIMEOUT);
      try {
        const response = await fetch(`${url}/export`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-fabric-document-id": documentId,
          },
          body: JSON.stringify(options),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Export failed (${response.status})`);
        }
        return (await response.json()) as FabricExportResult;
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [url, documentId]
  );

  return {
    document,
    loading,
    error,
    saveSnapshot,
    requestExport,
    refresh: load,
  };
};
