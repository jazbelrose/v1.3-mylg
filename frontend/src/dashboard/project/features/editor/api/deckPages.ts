import { apiFetch, DECK_PAGES_URL } from "@/shared/utils/api";

export interface DeckPageMetadata {
  pageId: string;
  name?: string;
  sortOrder?: number;
  isSuperSheet?: boolean;
}

export interface CreateDeckPageInput {
  projectId: string;
  name?: string;
  afterPageId?: string | null;
  sourcePageId?: string | null;
}

export type DeckPagesResponse =
  | DeckPageMetadata[]
  | {
      pages?: DeckPageMetadata[];
    };

const ensureBaseUrl = (): string => {
  const baseUrl = (DECK_PAGES_URL || "").trim();
  if (!baseUrl) {
    throw new Error("Deck pages API is not configured");
  }
  return baseUrl;
};

const sanitizeName = (name: unknown, fallback: string): string => {
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }
  return fallback;
};

const sanitizeSortOrder = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
};

const normalizeMetadata = (
  metadata: DeckPageMetadata,
  index: number
): DeckPageMetadata => ({
  pageId: metadata.pageId,
  name: sanitizeName(metadata.name, `Page ${index + 1}`),
  sortOrder: sanitizeSortOrder(metadata.sortOrder, index),
  isSuperSheet: metadata.isSuperSheet === true,
});

const toArray = (response: DeckPagesResponse): DeckPageMetadata[] => {
  if (Array.isArray(response)) {
    return response;
  }
  if (response && typeof response === "object" && Array.isArray(response.pages)) {
    return response.pages;
  }
  return [];
};

export async function fetchDeckPages(projectId: string): Promise<DeckPageMetadata[]> {
  if (!projectId) return [];
  const baseUrl = ensureBaseUrl();
  const url = `${baseUrl}?projectId=${encodeURIComponent(projectId)}`;
  const response = await apiFetch<DeckPagesResponse>(url);
  return toArray(response)
    .filter((page): page is DeckPageMetadata => Boolean(page && typeof page.pageId === "string"))
    .map((page, index) => normalizeMetadata(page, index))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function createDeckPage(
  input: CreateDeckPageInput
): Promise<DeckPageMetadata> {
  const { projectId, name, afterPageId, sourcePageId } = input;
  if (!projectId) {
    throw new Error("projectId is required to create a deck page");
  }
  const baseUrl = ensureBaseUrl();
  const body = {
    projectId,
    name,
    afterPageId: afterPageId ?? null,
    sourcePageId: sourcePageId ?? null,
  };
  const response = await apiFetch<DeckPageMetadata>(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const metadata = response ?? ({} as DeckPageMetadata);
  return normalizeMetadata(metadata, metadata.sortOrder ?? 0);
}

export async function reorderDeckPages(
  projectId: string,
  pageIds: string[]
): Promise<void> {
  if (!projectId) {
    throw new Error("projectId is required to reorder deck pages");
  }
  const baseUrl = ensureBaseUrl();
  await apiFetch<void>(`${baseUrl}/order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, pageIds }),
  });
}
