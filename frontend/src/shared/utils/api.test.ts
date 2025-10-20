import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, getFileUrl } from './api';
import { rateLimiter } from './securityUtils';

vi.mock('./waitForAuthReady', () => ({
  waitForAuthReady: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('./securityUtils', () => ({
  csrfProtection: { addToHeaders: vi.fn().mockReturnValue({}) },
  rateLimiter: { isAllowed: vi.fn().mockReturnValue(true) },
  logSecurityEvent: vi.fn(),
}));

// Ensure mocks are restored between tests
beforeEach(() => {
  vi.restoreAllMocks();
  // Ensure rate limiter always allows requests in tests
  vi.mocked(rateLimiter.isAllowed).mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('returns primitive JSON values without replacing them with empty objects', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('"hello"', { headers: { 'Content-Type': 'application/json' } })
    );

    const data = await apiFetch<string>('https://example.com/data');
    expect(data).toBe('hello');
  });

  it('returns null when server responds with JSON null', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('null', { headers: { 'Content-Type': 'application/json' } })
    );

    const data = await apiFetch<null>('https://example.com/null');
    expect(data).toBeNull();
  });
});

describe('getFileUrl', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FILE_CDN', '');
    vi.stubEnv('VITE_FILE_BUCKET', '');
    vi.stubEnv('VITE_S3_FILES_BUCKET', '');
    vi.stubEnv('VITE_AWS_REGION', '');
    vi.stubEnv('VITE_S3_REGION', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('encodes each path segment without encoding slashes', () => {
    const result = getFileUrl('public/projects/My Folder/image 1.png');
    expect(result).toBe(
      'https://mylg-files-v12.s3.us-west-2.amazonaws.com/public/projects/My%20Folder/image%201.png'
    );
  });

  it('does not double-encode already encoded segments', () => {
    const result = getFileUrl('public/projects/My%20Folder/image%201.png');
    expect(result).toBe(
      'https://mylg-files-v12.s3.us-west-2.amazonaws.com/public/projects/My%20Folder/image%201.png'
    );
  });

  it('rewrites matching http urls to use the configured bucket base', () => {
    const result = getFileUrl('https://mylg-files-v12.s3.us-west-2.amazonaws.com/public/avatars/me.png');
    expect(result).toBe(
      'https://mylg-files-v12.s3.us-west-2.amazonaws.com/public/avatars/me.png'
    );
  });
});








