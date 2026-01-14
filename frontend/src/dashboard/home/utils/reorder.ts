export const moveIdBeforeTarget = (
  ids: string[],
  sourceId: string,
  targetId?: string,
): string[] => {
  if (!sourceId) return ids.slice();
  const current = ids.filter((id) => typeof id === "string");

  const withoutSource = current.filter((id) => id !== sourceId);
  if (!targetId) {
    return [...withoutSource, sourceId];
  }

  const insertIndex = withoutSource.indexOf(targetId);
  if (insertIndex === -1) {
    return [...withoutSource, sourceId];
  }

  const next = withoutSource.slice();
  next.splice(insertIndex, 0, sourceId);
  return next;
};

export const arraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};
