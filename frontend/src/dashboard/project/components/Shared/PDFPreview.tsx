// PDFPreview.tsx
import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { normalizeFileUrl } from '@/shared/utils/api';

// Set the worker (required by pdf.js)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

type PDFPreviewProps = {
  url: string;
  className?: string;
  title?: string;
  /** Page number to render (1-based). Defaults to 1. */
  page?: number;
  /** Render scale for the canvas. Defaults to 1.5. */
  scale?: number;
};

const resolvePdfUrl = (input: string): string => {
  if (!input) return '';
  if (input.startsWith('blob:') || input.startsWith('data:')) return input;
  return normalizeFileUrl(input);
};

const dataUrlToUint8Array = (input: string): Uint8Array | null => {
  const [, base64 = ''] = input.split(',', 2);
  if (!base64) return null;
  try {
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer;
  } catch {
    return null;
  }
};

const resolvePdfSource = async (
  input: string,
  signal: AbortSignal
): Promise<string | Uint8Array | null> => {
  if (!input) return null;
  if (input.startsWith('blob:')) {
    try {
      const response = await fetch(input, { signal });
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }
  if (input.startsWith('data:')) {
    return dataUrlToUint8Array(input);
  }
  return resolvePdfUrl(input);
};

const PDFPreview: React.FC<PDFPreviewProps> = ({
  url,
  className,
  title = 'PDF preview',
  page = 1,
  scale = 1.5,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    const controller = new AbortController();

    (async () => {
      try {
        const source = await resolvePdfSource(url, controller.signal);
        if (!source || cancelled) return;

        loadingTask =
          typeof source === 'string'
            ? pdfjsLib.getDocument(source)
            : pdfjsLib.getDocument({ data: source });

        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const pg = await pdf.getPage(page);
        if (cancelled) return;

        const viewport = pg.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await pg.render({ canvasContext: context, viewport }).promise;
      } catch {
        // Silently fail; surface a toast/log here if desired
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (loadingTask) {
        try {
          loadingTask.destroy();
        } catch {
          /* noop */
        }
      }
    };
  }, [url, page, scale]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%' }}
      className={className}
      title={title}
    />
  );
};

export default PDFPreview;


