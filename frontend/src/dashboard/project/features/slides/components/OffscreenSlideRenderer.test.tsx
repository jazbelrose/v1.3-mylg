import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';

import OffscreenSlideRenderer from './OffscreenSlideRenderer';

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

