import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from './api';
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
});describe('apiFetch', () => {
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








