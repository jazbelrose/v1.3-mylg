import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __thumbsTesting } from './thumbnails';

// NOTE: Adjust import path above to match your repo structure.

function blobOf(text: string) {
  return new Blob([text], { type: 'image/png' });
}

describe('thumbnail retry + fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retries renderThumbnailOffscreen when html-to-image throws, then succeeds', async () => {
    const mod = await import('html-to-image');

    const spy = vi
      .fn()
      .mockRejectedValueOnce(new Error('detached'))
      .mockResolvedValueOnce(blobOf('ok'));

    // @ts-expect-error - test override
    mod.toBlob = spy;

    const blob = await __thumbsTesting.renderThumbnailOffscreen('s1', '{"text":"Hello"}', 320, 180, '#101112');
    expect(blob).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('falls back to placeholder after retries are exhausted', async () => {
    const mod = await import('html-to-image');

    const spy = vi.fn().mockRejectedValue(new Error('detached'));

    // @ts-expect-error - test override
    mod.toBlob = spy;

    const blob = await __thumbsTesting.renderThumbnailOffscreen('s1', '{"text":"Hello"}', 320, 180, '#101112');
    expect(blob).toBeTruthy(); // fallback blob
  });
});
