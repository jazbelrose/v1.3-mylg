import AWS from 'aws-sdk';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import crypto from 'crypto';

// CORS utilities (inline for now)
const ALLOWED_ORIGINS = [
  'https://beta.mylg.studio',
  'https://mylg.studio',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://192.168.1.172:5173',
  'http://192.168.1.200:5173',
  'http://192.168.1.172:3000',
  'http://192.168.1.200:3000'
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'http://localhost:5173';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, x-csrf-token, X-Amz-Date, X-Amz-Security-Token, X-Amz-User-Agent, X-Amzn-Trace-Id',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'Authorization,x-amzn-RequestId,x-amz-apigw-id',
    'Access-Control-Max-Age': '600',
  };
}

function corsHeadersFromEvent(event) {
  const h = event?.headers || {};
  const origin = h.origin || h.Origin || h.ORIGIN || '';
  return corsHeaders(origin);
}

function json(statusCode, headers, body) {
  return {
    statusCode,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? ''),
  };
}

const s3 = new AWS.S3();

const BUCKET_NAME = process.env.BUCKET_NAME;
const CDN_DOMAIN = process.env.CDN_DOMAIN;

// Function to hash the input JSON
function hashInput(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

// Function to render Lexical JSON to HTML
async function renderLexicalToHtml(lexicalJson) {
  // Assume lexicalJson has elements array with type, content, x, y, rotation, etc.
  const elements = lexicalJson.elements || [];

  const elementHtml = elements.map(el => {
    const style = `
      position: absolute;
      left: ${el.x || 0}px;
      top: ${el.y || 0}px;
      width: ${el.width || 200}px;
      height: ${el.height || 50}px;
      transform: rotate(${el.rotation || 0}deg);
      font-size: ${el.fontSize || 16}px;
      color: ${el.color || 'black'};
      background: ${el.background || 'transparent'};
      border: ${el.border || 'none'};
      text-align: ${el.textAlign || 'left'};
      overflow: hidden;
    `;

    if (el.type === 'text') {
      return `<div style="${style}" class="text-box">${el.content || ''}</div>`;
    } else if (el.type === 'image') {
      return `<img src="${el.src}" style="${style}" />`;
    } else {
      return `<div style="${style}">${el.content || ''}</div>`;
    }
  }).join('');

  // Wrap in basic HTML structure
  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          width: 1920px;
          height: 1080px;
          background: ${lexicalJson.background || 'white'};
          font-family: Arial, sans-serif;
        }
        .slide-content {
          width: 100%;
          height: 100%;
          position: relative;
        }
        .text-box {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      </style>
    </head>
    <body>
      <div class="slide-content">
        ${elementHtml}
      </div>
    </body>
    </html>
  `;

  return fullHtml;
}

// Function to generate thumbnail
async function generateThumbnail(html, width = 320, height = 180) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/opt/headless-chromium',
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const screenshot = await page.screenshot({ type: 'png', fullPage: false });

    // Resize with Sharp
    const resized = await sharp(screenshot)
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();

    return resized;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function handler(event) {
  const CORS = corsHeadersFromEvent(event);

  try {
    const body = JSON.parse(event.body || '{}');
    const { lexicalJson, width = 320, height = 180, projectId, slideId } = body;

    if (!lexicalJson) {
      return json(400, CORS, { error: 'Missing lexicalJson' });
    }

    // Return a mock URL for testing
    const mockUrl = `https://via.placeholder.com/${width}x${height}.png?text=${slideId}`;

    return json(200, CORS, { url: mockUrl });
  } catch (error) {
    console.error('Error in handler:', error);
    return json(500, CORS, { error: 'Internal server error', details: error.message });
  }
}