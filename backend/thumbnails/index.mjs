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

async function renderLexicalToHtml(lexicalJson, targetWidth, targetHeight) {
  const elements = Array.isArray(lexicalJson?.elements) ? lexicalJson.elements : [];
  const background = lexicalJson?.background || '#ffffff';
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
      </style>
    </head>
    <body>
      <div class="slide-wrapper">
        <div class="slide-content">
          ${elementHtml}
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
  return `thumbnails/${safeProject}/${safeSlide}-${hash}-${width}x${height}.png`;
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

    if (!lexicalJson) {
      return json(400, headers, { error: 'Missing lexicalJson' });
    }
    if (!BUCKET_NAME) {
      throw new Error('BUCKET_NAME environment variable is not configured');
    }

    const html = await renderLexicalToHtml(lexicalJson, targetWidth, targetHeight);
    const imageBuffer = await generateThumbnail(html, targetWidth, targetHeight);
    const key = buildThumbnailKey(projectId, slideId, targetWidth, targetHeight, lexicalJson);

    await s3
      .putObject({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: imageBuffer,
        ContentType: 'image/png',
        ACL: 'public-read',
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
