import { apiFetch, PROJECTS_URL } from "@/shared/utils/api";

export interface DeckPageRecord {
  projectId: string;
  pageId: string;
  name: string;
  canvasJson: string;
  revision: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
}

export interface DeckExportResponse {
  status: string;
  suggestedFilenames?: {
    pdf?: string;
    site?: string;
  };
  pdfDataUri?: string;
  siteDataUri?: string;
}

const withProjectBase = (projectId: string, suffix: string) => {
  const trimmed = projectId?.trim();
  if (!trimmed) throw new Error("projectId is required");
  return `${PROJECTS_URL}/${encodeURIComponent(trimmed)}${suffix}`;
};

export async function listDeckPages(projectId: string): Promise<DeckPageRecord[]> {
  const url = withProjectBase(projectId, "/deck-pages");
  const response = await apiFetch(url);
  const items = Array.isArray(response?.items) ? response.items : response;
  return (items as DeckPageRecord[]).map(normalizeDeckPage);
}

export async function getDeckPage(projectId: string, pageId: string): Promise<DeckPageRecord | null> {
  const url = withProjectBase(projectId, `/deck-pages/${encodeURIComponent(pageId)}`);
  const response = await apiFetch(url);
  if (!response) return null;
  return normalizeDeckPage(response as DeckPageRecord);
}

export async function upsertDeckPage(
  projectId: string,
  pageId: string,
  payload: Partial<Pick<DeckPageRecord, "name" | "canvasJson" | "revision">>
): Promise<DeckPageRecord> {
  const url = withProjectBase(projectId, `/deck-pages/${encodeURIComponent(pageId)}`);
  const response = await apiFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return normalizeDeckPage(response as DeckPageRecord);
}

export async function deleteDeckPage(projectId: string, pageId: string): Promise<void> {
  const url = withProjectBase(projectId, `/deck-pages/${encodeURIComponent(pageId)}`);
  await apiFetch(url, { method: "DELETE" });
}

export async function exportDeckPage(
  projectId: string,
  pageId: string
): Promise<DeckExportResponse> {
  const url = withProjectBase(projectId, `/deck-pages/${encodeURIComponent(pageId)}/export`);
  const response = await apiFetch(url, { method: "POST" });
  return response as DeckExportResponse;
}

function normalizeDeckPage(value: DeckPageRecord): DeckPageRecord {
  const revision = Number(value?.revision);
  return {
    projectId: value.projectId,
    pageId: value.pageId,
    name: value.name || "Untitled page",
    canvasJson: typeof value.canvasJson === "string" ? value.canvasJson : JSON.stringify(value.canvasJson ?? {}),
    revision: Number.isFinite(revision) ? revision : 0,
    updatedAt: value.updatedAt ?? null,
    updatedBy: value.updatedBy ?? null,
    createdAt: value.createdAt ?? null,
  };
}
