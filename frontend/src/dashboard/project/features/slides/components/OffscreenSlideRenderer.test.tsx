import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

// Deterministic renderer: immediately signals render completion for the requested slideId.
vi.mock('./SlideReadOnlyRenderer', async () => {
  const React = await import('react');
  const Mock = ({ slideId, onRendered }: any) => {
    React.useEffect(() => {
      onRendered?.(slideId);
    }, [slideId, onRendered]);
    return React.createElement('div', { 'data-testid': 'slide-readonly-renderer', 'data-slide-id': slideId });
  };

  return { default: Mock };
});

vi.mock('html-to-image', () => ({
  toPng: vi.fn(async (node: HTMLElement, options?: any) => {
    const slideId = node?.getAttribute?.('data-slide-id') ?? 'unknown';
    const fontsMode = options?.skipFonts ? 'skipFonts' : 'withFonts';
    return `data:image/png;base64,slide:${slideId};${fontsMode}`;
  }),
  toJpeg: vi.fn(async (node: HTMLElement, options?: any) => {
    const slideId = node?.getAttribute?.('data-slide-id') ?? 'unknown';
    const fontsMode = options?.skipFonts ? 'skipFonts' : 'withFonts';
    return `data:image/jpeg;base64,slide:${slideId};${fontsMode}`;
  }),
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

test('captures each slide exactly once and captures the intended slide DOM', async () => {
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
      {
        id: 'slide-2',
        title: 'Slide 2',
        order: 1,
        content: null,
        backgroundColor: '#101112',
      } as any,
    ],
    undefined,
    { imageFormat: 'png', pixelRatio: 1 }
  );

  expect(mockedToPng).toHaveBeenCalledTimes(2);
  expect(mockedToJpeg).toHaveBeenCalledTimes(0);
  expect(mockedToPng.mock.calls[0]?.[0]?.getAttribute('data-slide-id')).toBe('slide-1');
  expect(mockedToPng.mock.calls[1]?.[0]?.getAttribute('data-slide-id')).toBe('slide-2');

  expect(results.map((r) => r.slideId)).toEqual(['slide-1', 'slide-2']);
  expect(results[0]?.imageDataUrl).not.toBe(results[1]?.imageDataUrl);
});

test('defaults to skipFonts:false and retries with skipFonts:true only on failure', async () => {
  const ref = React.createRef<OffscreenSlideRendererRef>();
  render(<OffscreenSlideRenderer ref={ref} />);

  await waitFor(() => {
    expect(document.getElementById('offscreen-slide-renderer')).toBeTruthy();
    expect(ref.current).toBeTruthy();
  });

  const mockedToPng = vi.mocked(toPng);
  mockedToPng.mockClear();

  // Simulate a CSP/font-related failure on the first attempt.
  mockedToPng.mockImplementationOnce(async () => {
    throw new Error('CSP blocked font CSS');
  });

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
    { imageFormat: 'png', pixelRatio: 1 }
  );

  expect(mockedToPng).toHaveBeenCalledTimes(2);
  expect(mockedToPng.mock.calls[0]?.[1]?.skipFonts).toBe(false);
  expect(mockedToPng.mock.calls[1]?.[1]?.skipFonts).toBe(true);
  expect(results[0]?.imageDataUrl.includes('skipFonts')).toBe(true);
});
