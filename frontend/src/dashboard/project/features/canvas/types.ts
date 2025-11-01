export interface FabricSnapshot {
  version: string;
  objects: unknown[];
  background?: string;
  width?: number;
  height?: number;
}

export interface FabricDocument {
  documentId: string;
  projectId: string;
  pageId: string;
  snapshot: FabricSnapshot | null;
  updatedAt: string;
  updatedBy?: string;
}

export type FabricRealtimeMessage =
  | {
      type: "init";
      documentId: string;
      snapshot: FabricSnapshot | null;
      revision: number;
    }
  | {
      type: "update";
      documentId: string;
      snapshot: FabricSnapshot;
      revision: number;
      actorId: string;
    }
  | {
      type: "presence";
      documentId: string;
      userId: string;
      actorId: string;
      cursor?: { x: number; y: number };
      color?: string;
    }
  | {
      type: "ack";
      documentId: string;
      revision: number;
    }
  | {
      type: "error";
      documentId?: string;
      code: string;
      message: string;
    };

export interface FabricExportRequest {
  format: "pdf" | "static-site";
  scale?: number;
  includeBackground?: boolean;
}

export interface FabricExportResult {
  format: "pdf" | "static-site";
  url?: string;
  fileName?: string;
  dataUri?: string;
  expiresAt?: string;
}
