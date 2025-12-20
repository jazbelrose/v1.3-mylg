const PIN_ORDER_STORAGE_KEY = "all-projects-pinned-order";

const parseStoredOrder = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((id) => typeof id === "string");
    }
  } catch {
    // ignore invalid JSON
  }
  return [];
};

export const readPinnedOrder = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    return parseStoredOrder(window.localStorage.getItem(PIN_ORDER_STORAGE_KEY));
  } catch {
    return [];
  }
};

export const writePinnedOrder = (order: string[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PIN_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // ignore storage errors
  }
};

export const reconcilePinnedOrder = (
  currentOrder: string[],
  pinnedIds: string[],
): string[] => {
  const filtered = currentOrder.filter((id) => pinnedIds.includes(id));
  const extras = pinnedIds.filter((id) => !filtered.includes(id));
  return [...filtered, ...extras];
};
