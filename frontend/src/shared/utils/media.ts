import { getFileUrl } from './api';

const ABSOLUTE_URL_REGEX = /^(?:https?:|data:|blob:)/i;

const applyCacheBust = (url: string, cacheBust?: string | number): string => {
  if (cacheBust === undefined || cacheBust === null || cacheBust === '') {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${cacheBust}`;
};

export const resolveStoredFileUrl = (
  value?: string | null,
  fallback?: string | null,
  options?: { cacheBust?: string | number }
): string => {
  const cacheBust = options?.cacheBust;

  if (fallback && fallback.trim()) {
    return applyCacheBust(fallback.trim(), cacheBust);
  }

  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const [rawPath, ...queryParts] = trimmed.split('?');
  const query = queryParts.length ? `?${queryParts.join('?')}` : '';

  if (!rawPath) {
    return '';
  }

  if (ABSOLUTE_URL_REGEX.test(rawPath)) {
    const absolute = rawPath.startsWith('//') ? `https:${rawPath}` : rawPath;
    return applyCacheBust(`${absolute}${query}`, cacheBust);
  }

  const resolved = `${getFileUrl(rawPath)}${query}`;
  return applyCacheBust(resolved, cacheBust);
};

