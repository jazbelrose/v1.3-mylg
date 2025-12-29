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
// Must match SlideEditor SLIDE_PADDING = "96px 120px"
const STAGE_PADDING = '96px 120px';
// Bump when thumbnail rendering output changes (prevents CDN cache from serving old pixels).
const THUMBNAIL_RENDER_VERSION = 4;
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-west-2';
const FILE_BUCKET = process.env.FILE_BUCKET || process.env.ASSETS_BUCKET || 'mylg-files-v12';
const FILE_CDN = process.env.FILE_CDN;

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

function resolveAssetUrl(src) {
  if (!src || typeof src !== 'string') return '';
  if (/^https?:\/\//i.test(src)) return src;
  const base =
    FILE_CDN ||
    `https://${FILE_BUCKET}.s3.${REGION}.amazonaws.com`;
  return `${base.replace(/\/$/, '')}/${src.replace(/^\/+/, '')}`;
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

function sanitizeInlineStyle(style = '') {
  // Keep this conservative to avoid weird/unsafe CSS in Lambda HTML.
  const allowed = new Set([
    'font-size',
    'font-family',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'text-decoration',
    'text-transform',
    'color',
    'background-color',
    'text-shadow',
  ]);
  return String(style)
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .map((decl) => {
      const idx = decl.indexOf(':');
      if (idx === -1) return '';
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const val = decl.slice(idx + 1).trim();
      if (!allowed.has(prop) || !val) return '';
      return `${prop}:${val}`;
    })
    .filter(Boolean)
    .join(';');
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
      const formatted = applyTextFormatting(text, node.format || 0);
      const style = sanitizeInlineStyle(node.style || '');
      if (style) {
        return `<span style="${escapeHtml(style)}">${formatted}</span>`;
      }
      return formatted;
    }
    case 'paragraph': {
      // Lexical element alignment often shows up here.
      // (string formats: 'left'|'center'|'right'|'justify')
      const align =
        typeof node.format === 'string' && node.format
          ? `text-align:${node.format}`
          : '';
      const style = [align].filter(Boolean).join(';');
      return style
        ? `<p style="${escapeHtml(style)}">${children || '<br />'}</p>`
        : `<p>${children || '<br />'}</p>`;
    }
    case 'heading': {
      const tag = node.tag || `h${node.level || 2}`;
      return `<${tag}>${children}</${tag}>`;
    }
    case 'link': {
      const url = escapeHtml(node.url || '#');
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${children}</a>`;
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
    case 'text-box':
    case 'resizable-image':
    case 'image':
    case 'picture-frame':
    case 'svg':
      return '';
    default:
      return children;
  }
}

function sanitizeSvgMarkup(svg = '') {
  if (typeof svg !== 'string' || svg.trim().length === 0) return '';

  let out = svg;

  // Remove XML/doctype headers which can confuse HTML parsers.
  out = out.replace(/<\?xml[\s\S]*?\?>/gi, '');
  out = out.replace(/<!doctype[\s\S]*?>/gi, '');

  // Drop scripts and inline event handlers (conservative).
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '');

  // Prevent javascript: URLs in common href attributes.
  out = out.replace(/\s(?:href|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, '');

  return out.trim();
}

function ensureSvgSizingAttributes(svgMarkup) {
  if (typeof svgMarkup !== 'string' || svgMarkup.length === 0) return svgMarkup;

  const match = svgMarkup.match(/<svg\b([^>]*)>/i);
  if (!match) return svgMarkup;

  const attrs = match[1] || '';
  const hasWidth = /\bwidth\s*=\s*['"]/i.test(attrs);
  const hasHeight = /\bheight\s*=\s*['"]/i.test(attrs);
  const hasPreserve = /\bpreserveAspectRatio\s*=\s*['"]/i.test(attrs);
  const hasStyle = /\bstyle\s*=\s*['"]/i.test(attrs);

  let injected = attrs;
  if (!hasWidth) injected += ' width="100%"';
  if (!hasHeight) injected += ' height="100%"';
  if (!hasPreserve) injected += ' preserveAspectRatio="xMidYMid meet"';

  if (hasStyle) {
    injected = injected.replace(/\bstyle\s*=\s*(['"])([\s\S]*?)\1/i, (_m, q, styleValue) => {
      const nextStyle = `${styleValue};width:100%;height:100%;display:block;`;
      return `style=${q}${nextStyle}${q}`;
    });
  } else {
    injected += ' style="width:100%;height:100%;display:block;"';
  }

  return svgMarkup.replace(/<svg\b[^>]*>/i, `<svg${injected}>`);
}

function renderSvgLayer(node, textColor) {
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const width = Number(node.width) || 300;
  const height = Number(node.height) || 200;
  const rotation = Number(node.rotation) || 0;

  const sanitized = sanitizeSvgMarkup(node.svg || '');
  if (!sanitized || !/<svg\b/i.test(sanitized)) return '';

  const svgMarkup = ensureSvgSizingAttributes(sanitized);

  const style = [
    'position:absolute',
    'left:0',
    'top:0',
    `transform: translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`,
    'transform-origin:center center',
    `width:${width}px`,
    `height:${height}px`,
    'overflow:hidden',
    'color:' + (textColor || '#f5f5f5'),
  ].join('; ');

  return `<div class="svg-layer" style="${style}">${svgMarkup}</div>`;
}

function renderTextBoxLayer(node, textColor) {
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const width = Number(node.width) || 300;
  const height = Number(node.height) || 150;
  const rotation = Number(node.rotation) || 0;
  const inner =
    (Array.isArray(node.children) && node.children.map((child) => lexicalNodeToHtml(child)).join('')) ||
    '<p></p>';

  const style = [
    'position:absolute',
    'left:0',
    'top:0',
    `transform: translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`,
    'transform-origin: center center',
    `width:${width}px`,
    `height:${height}px`,
    'display:flex',
    'flex-direction:column',
    'justify-content:center',
    'padding:8px',
    'box-sizing:border-box',
    `color:${textColor}`,
  ].join('; ');

  return `<div class="text-layer" style="${style}">${inner}</div>`;
}

function formatBorderRadius(node) {
  if (!node || typeof node.borderRadius !== "object") {
    return "0px";
  }
  const topLeft = Number(node.borderRadius.topLeft) || 0;
  const topRight = Number(node.borderRadius.topRight) || 0;
  const bottomRight = Number(node.borderRadius.bottomRight) || 0;
  const bottomLeft = Number(node.borderRadius.bottomLeft) || 0;
  const allSame =
    topLeft === topRight &&
    topLeft === bottomRight &&
    topLeft === bottomLeft;
  return allSame
    ? `${topLeft}px`
    : `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`;
}

function renderImageLayer(node) {
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const width = Number(node.width) || 320;
  const height = Number(node.height) || 240;
  const rotation = Number(node.rotation) || 0;
  const src = resolveAssetUrl(node.src || node.fileKey || '');
  if (!src) return '';
  const alt = escapeHtml(node.altText || 'Image');
  const borderRadiusStyle = formatBorderRadius(node);
  const style = [
    'position:absolute',
    `left:${x}px`,
    `top:${y}px`,
    `transform: rotate(${rotation}deg)`,
    'transform-origin:center center',
    `width:${width}px`,
    `height:${height}px`,
    'overflow:hidden',
  ].join('; ');

  return `<div class="image-layer" style="${style}">
    <img src="${escapeHtml(src)}" alt="${alt}" style="width:100%;height:100%;object-fit:contain;object-position:center;border-radius:${borderRadiusStyle};" />
  </div>`;
}

function renderPictureFrameLayer(node) {
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const width = Number(node.width) || 320;
  const height = Number(node.height) || 240;
  const rotation = Number(node.rotation) || 0;
  const radius = Math.max(0, Number(node.radius) || 0);
  const fit = node.fit === 'contain' ? 'contain' : 'cover';
  const positionX = Number.isFinite(Number(node.positionX)) ? Number(node.positionX) : 50;
  const positionY = Number.isFinite(Number(node.positionY)) ? Number(node.positionY) : 50;
  const background = typeof node.background === 'string' && node.background.trim() ? node.background.trim() : '#2a2c2f';
  const border =
    node.border && typeof node.border === 'object'
      ? {
          enabled: Boolean(node.border.enabled),
          width: Math.max(0, Number(node.border.width) || 0),
          color: typeof node.border.color === 'string' && node.border.color.trim() ? node.border.color.trim() : '#ffffff',
        }
      : { enabled: false, width: 0, color: '#ffffff' };

  const borderStyle = border.enabled && border.width > 0 ? `${border.width}px solid ${border.color}` : 'none';

  const style = [
    'position:absolute',
    `left:${x}px`,
    `top:${y}px`,
    `transform: rotate(${rotation}deg)`,
    'transform-origin:center center',
    `width:${width}px`,
    `height:${height}px`,
    'overflow:hidden',
    `border-radius:${radius}px`,
    `border:${borderStyle}`,
    'box-sizing:border-box',
    `background:${escapeHtml(background)}`,
  ].join('; ');

  const src = resolveAssetUrl(node.imageSrc || '');
  if (!src) {
    // Lightweight checkerboard placeholder for empty frames.
    const placeholderStyle = [
      'width:100%',
      'height:100%',
      `background-color:${escapeHtml(background)}`,
      'background-image:linear-gradient(45deg, rgba(255,255,255,0.07) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.07) 75%, rgba(255,255,255,0.07)),linear-gradient(45deg, rgba(255,255,255,0.07) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.07) 75%, rgba(255,255,255,0.07))',
      'background-position:0 0, 10px 10px',
      'background-size:20px 20px',
    ].join(';');
    return `<div class="picture-frame-layer" style="${style}"><div style="${placeholderStyle}"></div></div>`;
  }

  return `<div class="picture-frame-layer" style="${style}">
    <img src="${escapeHtml(src)}" alt="Picture Frame" style="width:100%;height:100%;object-fit:${fit};object-position:${Math.max(0, Math.min(100, positionX))}% ${Math.max(0, Math.min(100, positionY))}%;display:block;" />
  </div>`;
}

function gatherLayerHtml(nodes, textColor, layers) {
  let handled = false;
  if (!Array.isArray(nodes)) return handled;

  for (const node of nodes) {
    if (!node) continue;
    switch (node.type) {
      case 'text-box':
        layers.push(renderTextBoxLayer(node, textColor));
        handled = true;
        break;
      case 'svg':
        layers.push(renderSvgLayer(node, textColor));
        handled = true;
        break;
      case 'resizable-image':
      case 'image':
        layers.push(renderImageLayer(node));
        handled = true;
        break;
      case 'picture-frame':
        layers.push(renderPictureFrameLayer(node));
        handled = true;
        break;
      case 'layout-container':
      case 'layout-item':
        if (gatherLayerHtml(node.children, textColor, layers)) {
          handled = true;
        }
        break;
      default:
        if (Array.isArray(node.children) && gatherLayerHtml(node.children, textColor, layers)) {
          handled = true;
        }
        break;
    }
  }
  return handled;
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
  const scaledWidth = BASE_CANVAS_WIDTH * scale;
  const scaledHeight = BASE_CANVAS_HEIGHT * scale;
  const offsetX = Math.max(0, (targetWidth - scaledWidth) / 2);
  const offsetY = Math.max(0, (targetHeight - scaledHeight) / 2);
  const slideWrapperStyle = [
    'position:absolute',
    `top:${offsetY}px`,
    `left:${offsetX}px`,
    `width:${BASE_CANVAS_WIDTH}px`,
    `height:${BASE_CANVAS_HEIGHT}px`,
    'transform-origin:top left',
    `transform:scale(${scale})`,
  ].join('; ');

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

      if (el.type === 'svg' && el.svg) {
        const sanitized = ensureSvgSizingAttributes(sanitizeSvgMarkup(el.svg));
        if (!sanitized || !/<svg\b/i.test(sanitized)) {
          return '';
        }
        return `<div class="svg-layer" style="${style};color:${escapeHtml(textColor)}">${sanitized}</div>`;
      }

      const content = escapeHtml(el.content || '');
      return `<div style="${style}" class="text-box">${content}</div>`;
    })
    .join('');

  const absoluteLayers = [];
  const root = lexicalJson?.root || lexicalJson?.document?.root;
  const rootChildren = Array.isArray(root?.children) ? root.children : [];
  const hasStructuredLayers = gatherLayerHtml(rootChildren, textColor, absoluteLayers);
  const fallbackDoc = renderDocumentContent({
    root: {
      children: rootChildren,
    },
  });

  const layerMarkup = absoluteLayers.join('');
  let structuredHtml;
  if (elementHtml && layerMarkup) {
    structuredHtml = `${elementHtml}${layerMarkup}`;
  } else if (elementHtml) {
    structuredHtml = elementHtml;
  } else if (layerMarkup) {
    structuredHtml = `<div class="slide-layers">${layerMarkup}</div>`;
  } else {
    structuredHtml = `<div class="lexical-doc" style="color:${textColor}">${fallbackDoc}</div>`;
  }

  // IMPORTANT:
  // Slide layers (images/textboxes/vectors) are positioned in full-stage coordinates.
  // Do not apply slide padding offsets here; padding is only for rich-text document flow.

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <link rel="stylesheet" href="${FILE_CDN || 'https://d3kix94vejprx7.cloudfront.net'}/public/styles/thumbnail.css">
      <style>
        html,
        body {
          margin: 0;
          padding: 0;
          width: ${targetWidth}px;
          height: ${targetHeight}px;
          background: ${background};
          overflow: hidden;
          font-family: var(--font-family-primary, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif);
        }
        body {
          position: relative;
        }
        .thumbnail-stage {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: ${background};
        }
        .slide-wrapper {
          position: absolute;
        }
        .slide-content {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .stage-padding {
          position: relative;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          padding: ${STAGE_PADDING};
          overflow: hidden;
        }
        .text-box {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .text-layer { 
          overflow: hidden; 
          scrollbar-width: none;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .text-layer::-webkit-scrollbar { display: none; }
        .text-layer p {
          margin: 0;
        }
        .slide-layers {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .image-layer img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
        }
        .svg-layer svg {
          display: block;
          width: 100%;
          height: 100%;
        }
        img {
          object-fit: contain;
        }
        .lexical-doc {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          padding: ${STAGE_PADDING};
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
      <div class="thumbnail-stage">
        <div class="slide-wrapper" style="${slideWrapperStyle}">
          <div class="slide-content">
            ${structuredHtml}
          </div>
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
      args: [
        ...puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--disable-web-security',
        '--allow-running-insecure-content',
      ],
      defaultViewport: viewport,
      executablePath,
      headless: 'shell',
    });

    const page = await browser.newPage();
    
    // Add logging for debugging font/CSS loading
    page.on('requestfailed', r =>
      console.log('REQ_FAIL', r.resourceType(), r.url(), r.failure()?.errorText)
    );

    page.on('response', async r => {
      const type = r.request().resourceType();
      if (type === 'stylesheet' || type === 'font') {
        if (!r.ok()) console.log('ASSET_BAD', type, r.status(), r.url());
      }
    });
    
    await page.setViewport(viewport);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Wait for fonts to load (prevents text reflow)
    await page.evaluate(async () => {
      if (!document.fonts) return;
      await document.fonts.ready;
    });
    await page.waitForFunction(() => !document.fonts || document.fonts.status === "loaded", { timeout: 15000 });
    
    // Log font status for debugging
    await page.evaluate(() => {
      console.log('FONT_STATUS', document.fonts?.status);
      console.log('FONT_FACES', [...(document.fonts?.values?.() ?? [])].map(f => ({
        family: f.family, weight: f.weight, style: f.style, status: f.status
      })));
    });
    
    // Wait longer for images to load
    await page.waitForTimeout(2000);
    
    // Wait for all images to load fully
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.every(img => img.complete && img.naturalWidth > 0);
    }, { timeout: 5000 });
    
    // Check if images loaded
    const imagesStatus = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      return Array.from(images).map(img => ({
        src: img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        currentSrc: img.currentSrc,
      }));
    });
    console.log('Images status:', JSON.stringify(imagesStatus, null, 2));
    
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
  const hash = hashInput({ lexicalJson, width, height, renderVersion: THUMBNAIL_RENDER_VERSION });
  return `public/thumbnails/${safeProject}/${safeSlide}-${hash}-${width}x${height}.png`;
}

export async function handler(event) {
  if ((event?.httpMethod || event?.requestContext?.httpMethod) === 'OPTIONS') {
    return preflightFromEvent(event);
  }

  const headers = corsHeadersFromEvent(event);

  try {
    const body = JSON.parse(event?.body || '{}');
    console.log('Received event body:', JSON.stringify(body, null, 2));
    const targetWidth = clampDimension(body?.width, 320);
    const targetHeight = clampDimension(body?.height, 180);
    const lexicalJson = body?.lexicalJson;
    const projectId = body?.projectId;
    const slideId = body?.slideId;
    const backgroundColor = body?.backgroundColor;

    console.log('Parsed inputs:', { targetWidth, targetHeight, projectId, slideId, backgroundColor });
    console.log('Lexical JSON:', JSON.stringify(lexicalJson, null, 2));

    if (!lexicalJson) {
      return json(400, headers, { error: 'Missing lexicalJson' });
    }
    if (!BUCKET_NAME) {
      throw new Error('BUCKET_NAME environment variable is not configured');
    }

    const html = await renderLexicalToHtml(lexicalJson, targetWidth, targetHeight, backgroundColor);
    console.log('Generated HTML length:', html.length);
    console.log('Generated HTML snippet:', html.substring(0, 500));

    const imageBuffer = await generateThumbnail(html, targetWidth, targetHeight);
    console.log('Screenshot buffer length:', imageBuffer.length);

    const key = buildThumbnailKey(projectId, slideId, targetWidth, targetHeight, lexicalJson);
    console.log('S3 key:', key);

    await s3
      .putObject({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: imageBuffer,
        ContentType: 'image/png',
        CacheControl: 'public,max-age=31536000,immutable',
      })
      .promise();

    console.log('S3 upload successful for key:', key);

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
