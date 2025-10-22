// PDFPreview.tsx
import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfWorkerFactory from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker';
import { normalizeFileUrl } from '@/shared/utils/api';

// Set the worker (required by pdf.js). Using the worker factory avoids relying on
// script URLs which can fail to load in the Vite dev server and lead to a blank
// preview canvas.
if (typeof window !== 'undefined') {
  const PdfWorker = pdfWorkerFactory as unknown as { new (): Worker };
  if (!pdfjsLib.GlobalWorkerOptions.workerPort) {
    pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
  }
}

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

    const resolvedUrl = resolvePdfUrl(url);
    if (!resolvedUrl) return;

    loadingTask = pdfjsLib.getDocument(resolvedUrl);

    (async () => {
      try {
        const task = loadingTask;
        if (!task) return;
        const pdf = await task.promise;
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


