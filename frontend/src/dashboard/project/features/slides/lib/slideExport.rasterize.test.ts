import { expect, test, vi, afterEach, beforeEach } from 'vitest';

vi.mock('html-to-image', () => ({
  toPng: vi.fn(async () => 'data:image/png;base64,abc'),
  toSvg: vi.fn(async () => 'data:image/svg+xml;charset=utf-8,<svg></svg>'),
}));

beforeEach(() => {
  vi.useFakeTimers();

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    setTimeout(() => cb(0), 0);
    return 0;
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('exportSlideAsSvg rasterize mode generates Affinity-compatible SVG with embedded PNG', async () => {
  const slideId = 'slide-1';

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-slide-id', slideId);
  const inner = document.createElement('div');
  inner.className = 'slide-editor__canvas-inner';
  inner.textContent = 'Hello';
  wrapper.appendChild(inner);
  document.body.appendChild(wrapper);

  const { exportSlideAsSvg } = await import('./slideExport');

  const exportPromise = exportSlideAsSvg({
    slideId,
    slideTitle: 'A & B "test"',
    rasterizeForDesignSoftware: true,
  });

  await vi.runAllTimersAsync();

  const svg = await exportPromise;
  expect(svg).toContain('href="data:image/png;base64,abc"');
  expect(svg).toContain('<title>A &amp; B "test"</title>');
  expect(svg).toContain('data-name="A &amp; B &quot;test&quot;"');
});

