import AWS from 'aws-sdk';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import crypto from 'crypto';
import {
  corsHeadersFromEvent,
  preflightFromEvent,
  json,
} from '/opt/nodejs/utils/cors.mjs';

const BASE_CANVAS_WIDTH = 1920;
const BASE_CANVAS_HEIGHT = 1080;
const DEFAULT_BACKGROUND = '#101112';

// WebGL is not needed for thumbnails, so disable it to avoid extracting extra assets.
chromium.setGraphicsMode = false;

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.BUCKET_NAME;
const CDN_DOMAIN = process.env.CDN_DOMAIN;

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashInput(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function clampDimension(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(3840, Math.round(numeric)));
}

function safeSegment(value, fallback) {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  return raw.replace(/[^a-zA-Z0-9-_]/g, '-');
}

function parseColorToRgb(value) {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }
    const numeric = Number.parseInt(hex, 16);
    return {
      r: (numeric >> 16) & 255,
      g: (numeric >> 8) & 255,
      b: numeric & 255,
    };
  }
  const rgbMatch = color.match(/^rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => Number(part.trim()));
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      return { r: parts[0], g: parts[1], b: parts[2] };
    }
  }
  return null;
}

function pickTextColor(background) {
  const rgb = parseColorToRgb(background);
  if (!rgb) return '#f5f5f5';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? '#111111' : '#f5f5f5';
}

function applyTextFormatting(text, format = 0) {
  let output = text;
  const FORMAT = {
    bold: 1,
    italic: 2,
    strikethrough: 4,
    underline: 8,
    code: 16,
  };
  if (format & FORMAT.bold) output = `<strong>${output}</strong>`;
  if (format & FORMAT.italic) output = `<em>${output}</em>`;
  if (format & FORMAT.strikethrough) output = `<s>${output}</s>`;
  if (format & FORMAT.underline) output = `<u>${output}</u>`;
  if (format & FORMAT.code) output = `<code>${output}</code>`;
  return output;
}

function lexicalNodeToHtml(node) {
  if (!node) return '';
  const children = Array.isArray(node.children)
    ? node.children.map((child) => lexicalNodeToHtml(child)).join('')
    : '';

  switch (node.type) {
    case 'text': {
      const text = escapeHtml(node.text || '');
      return applyTextFormatting(text, node.format || 0);
    }
    case 'paragraph':
      return `<p>${children || '<br />'}</p>`;
    case 'heading': {
      const tag = node.tag || `h${node.level || 2}`;
      return `<${tag}>${children}</${tag}>`;
    }
    case 'quote':
      return `<blockquote>${children}</blockquote>`;
    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul';
      return `<${tag}>${children}</${tag}>`;
    }
    case 'listitem':
    case 'list-item':
      return `<li>${children}</li>`;
    case 'linebreak':
    case 'linebreaknode':
      return '<br />';
    case 'code':
      return `<pre><code>${escapeHtml(node.text || children)}</code></pre>`;
    default:
      return children;
  }
}

function renderDocumentContent(lexicalJson) {
  const root = lexicalJson?.root || lexicalJson?.document?.root;
  if (!root || !Array.isArray(root.children)) {
    return '<p></p>';
  }
  const content = root.children.map((child) => lexicalNodeToHtml(child)).join('');
  return content || '<p></p>';
}

async function renderLexicalToHtml(lexicalJson, targetWidth, targetHeight, backgroundOverride) {
  const elements = Array.isArray(lexicalJson?.elements) ? lexicalJson.elements : [];
  const background = backgroundOverride || lexicalJson?.background || DEFAULT_BACKGROUND;
  const textColor = pickTextColor(background);
  const scale = Math.min(
    targetWidth / BASE_CANVAS_WIDTH,
    targetHeight / BASE_CANVAS_HEIGHT,
  );

  const elementHtml = elements
    .map((el = {}) => {
      const style = [
        'position: absolute',
        `left: ${Number(el.x) || 0}px`,
        `top: ${Number(el.y) || 0}px`,
        `width: ${Number(el.width) || 200}px`,
        `height: ${Number(el.height) || 50}px`,
        `transform: rotate(${Number(el.rotation) || 0}deg)`,
        `font-size: ${Number(el.fontSize) || 16}px`,
        `color: ${el.color || 'black'}`,
        `background: ${el.background || 'transparent'}`,
        `border: ${el.border || 'none'}`,
        `text-align: ${el.textAlign || 'left'}`,
        'overflow: hidden',
      ].join('; ');

      if (el.type === 'image' && el.src) {
        return `<img src="${escapeHtml(el.src)}" style="${style}" alt="" />`;
      }

      const content = escapeHtml(el.content || '');
      return `<div style="${style}" class="text-box">${content}</div>`;
    })
    .join('');

  const structuredHtml =
    elementHtml ||
    `<div class="lexical-doc" style="color:${textColor}">${renderDocumentContent(lexicalJson)}</div>`;

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          margin: 0;
          padding: 0;
          width: ${targetWidth}px;
          height: ${targetHeight}px;
          background: ${background};
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-family: Arial, sans-serif;
        }
        .slide-wrapper {
          width: ${BASE_CANVAS_WIDTH}px;
          height: ${BASE_CANVAS_HEIGHT}px;
          transform-origin: top left;
          transform: scale(${scale});
        }
        .slide-content {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .text-box {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        img {
          object-fit: contain;
        }
        .lexical-doc {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          padding: 80px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          justify-content: center;
        }
        .lexical-doc p,
        .lexical-doc h1,
        .lexical-doc h2,
        .lexical-doc h3,
        .lexical-doc h4,
        .lexical-doc h5,
        .lexical-doc h6 {
          margin: 0;
        }
        .lexical-doc blockquote {
          margin: 0;
          padding-left: 16px;
          border-left: 4px solid currentColor;
        }
      </style>
    </head>
    <body>
      <div class="slide-wrapper">
        <div class="slide-content">
          ${structuredHtml}
        </div>
      </div>
    </body>
  </html>`;
}

async function generateThumbnail(html, width, height) {
  const viewport = {
    width,
    height,
    deviceScaleFactor: 2,
  };

  let browser;
  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      defaultViewport: viewport,
      executablePath,
      headless: 'shell',
    });

    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.waitForTimeout(50);
    return await page.screenshot({ type: 'png' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function buildThumbnailKey(projectId, slideId, width, height, lexicalJson) {
  const safeProject = safeSegment(projectId, 'anonymous');
  const safeSlide = safeSegment(slideId, 'slide');
  const hash = hashInput({ lexicalJson, width, height });
  return `public/thumbnails/${safeProject}/${safeSlide}-${hash}-${width}x${height}.png`;
}

export async function handler(event) {
  if ((event?.httpMethod || event?.requestContext?.httpMethod) === 'OPTIONS') {
    return preflightFromEvent(event);
  }

  const headers = corsHeadersFromEvent(event);

  try {
    const body = JSON.parse(event?.body || '{}');
    const targetWidth = clampDimension(body?.width, 320);
    const targetHeight = clampDimension(body?.height, 180);
    const lexicalJson = body?.lexicalJson;
    const projectId = body?.projectId;
    const slideId = body?.slideId;
    const backgroundColor = body?.backgroundColor;

    if (!lexicalJson) {
      return json(400, headers, { error: 'Missing lexicalJson' });
    }
    if (!BUCKET_NAME) {
      throw new Error('BUCKET_NAME environment variable is not configured');
    }

    const html = await renderLexicalToHtml(lexicalJson, targetWidth, targetHeight, backgroundColor);
    const imageBuffer = await generateThumbnail(html, targetWidth, targetHeight);
    const key = buildThumbnailKey(projectId, slideId, targetWidth, targetHeight, lexicalJson);

    await s3
      .putObject({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: imageBuffer,
        ContentType: 'image/png',
        CacheControl: 'public,max-age=31536000,immutable',
      })
      .promise();

    const cdnBase =
      CDN_DOMAIN?.startsWith('http') || !CDN_DOMAIN
        ? CDN_DOMAIN || `https://${BUCKET_NAME}.s3.amazonaws.com`
        : `https://${CDN_DOMAIN}`;
    const url = `${cdnBase.replace(/\/$/, '')}/${key}`;

    return json(200, headers, { url });
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    const details =
      error instanceof Error ? error.stack || error.message : JSON.stringify(error);
    return json(500, headers, { error: 'Internal server error', details });
  }
}
