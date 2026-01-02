import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

vi.mock('html-to-image', () => ({
  toPng: vi.fn(async () => 'data:image/png;base64,AAAA'),
  toJpeg: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
}));

import { toJpeg, toPng } from 'html-to-image';
import OffscreenSlideRenderer, { type OffscreenSlideRendererRef } from './OffscreenSlideRenderer';

test('creates an offscreen portal container that remains renderable for capture', async () => {
  const { unmount } = render(<OffscreenSlideRenderer />);

  await waitFor(() => {
    const container = document.getElementById('offscreen-slide-renderer') as HTMLDivElement | null;
    expect(container).toBeTruthy();
    expect(container?.style.visibility).toBe('visible');
  });

  unmount();

  await waitFor(() => {
    expect(document.getElementById('offscreen-slide-renderer')).toBeNull();
  });
});

test('uses JPEG when configured via capture options', async () => {
  const ref = React.createRef<OffscreenSlideRendererRef>();
  render(<OffscreenSlideRenderer ref={ref} />);

  await waitFor(() => {
    expect(document.getElementById('offscreen-slide-renderer')).toBeTruthy();
    expect(ref.current).toBeTruthy();
  });

  const mockedToPng = vi.mocked(toPng);
  const mockedToJpeg = vi.mocked(toJpeg);
  mockedToPng.mockClear();
  mockedToJpeg.mockClear();

  const results = await ref.current!.captureAllSlides(
    [
      {
        id: 'slide-1',
        title: 'Slide 1',
        order: 0,
        content: null,
        backgroundColor: '#101112',
      } as any,
    ],
    undefined,
    { imageFormat: 'jpeg', pixelRatio: 1, jpegQuality: 0.8 }
  );

  expect(mockedToJpeg.mock.calls.length).toBeGreaterThan(0);
  expect(mockedToPng.mock.calls.length).toBe(0);
  expect(results[0]?.imageDataUrl.startsWith('data:image/jpeg')).toBe(true);
});
