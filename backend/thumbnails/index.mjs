import AWS from 'aws-sdk';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import crypto from 'crypto';

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

export const generateThumbnail = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { lexicalJson, width = 320, height = 180, projectId, slideId } = body;

    if (!lexicalJson) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing lexicalJson' }),
      };
    }

    // Hash the input for caching
    const inputHash = hashInput(lexicalJson);
    const key = `thumbnails/${projectId}/${slideId}/${inputHash}.png`;

    // Check if thumbnail already exists
    try {
      await s3.headObject({ Bucket: BUCKET_NAME, Key: key }).promise();
      // Exists, return URL
      const url = `https://${CDN_DOMAIN}/secure/${key}`;
      return {
        statusCode: 200,
        body: JSON.stringify({ url }),
      };
    } catch (err) {
      // Not found, generate
    }

    // Render HTML
    const html = await renderLexicalToHtml(lexicalJson);

    // Generate thumbnail
    const thumbnailBuffer = await generateThumbnail(html, width, height);

    // Upload to S3
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: thumbnailBuffer,
      ContentType: 'image/png',
      ACL: 'private', // Since using CDN with signed URLs
    }).promise();

    // Return URL
    const url = `https://${CDN_DOMAIN}/${key}`;

    return {
      statusCode: 200,
      body: JSON.stringify({ url }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};</content>
<parameter name="filePath">d:\MYLG\App\v1.3-mylg\backend\thumbnails\handler.js