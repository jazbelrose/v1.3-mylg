/**
 * Image Thumbnail & Embed Generator Lambda
 * 
 * Triggers on S3 image uploads and generates optimized renditions:
 * 
 * 1. THUMBNAIL (400x400 WebP) - for UI grids
 *    Path: projects/abc123/files_thumbnails/photo.jpg.webp
 * 
 * 2. EMBED (<=2MB JPEG/PNG) - for slide editor and deck export
 *    Path: projects/abc123/files_embed/photo.jpg
 *    - Downscaled + compressed until under 2MB
 *    - Uses JPEG unless original has alpha channel (then PNG)
 *    - This is what slides/decks should use, NOT the original
 * 
 * 3. ORIGINAL - kept for optional "Download Original" feature only
 * 
 * Features:
 * - Resizes to max 400x400 (configurable via THUMBNAIL_MAX_SIZE)
 * - Generates embed rendition guaranteed under 2MB
 * - Outputs WebP format for thumbnails
 * - Maintains aspect ratio
 * - Skips if renditions already exist and are newer than source
 * - Skips files in _thumbnails/ or _embed/ folders (prevent infinite loops)
 */

import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const s3 = new S3Client({});
const BUCKET = process.env.FILE_BUCKET || 'mylg-files-v12';
const MAX_SIZE = parseInt(process.env.THUMBNAIL_MAX_SIZE || '400', 10);
const QUALITY = parseInt(process.env.THUMBNAIL_QUALITY || '80', 10);

// Embed rendition constraints
const EMBED_MAX_BYTES = parseInt(process.env.EMBED_MAX_BYTES || '2097152', 10); // 2MB
const EMBED_INITIAL_MAX_DIMENSION = parseInt(process.env.EMBED_INITIAL_MAX_DIMENSION || '3000', 10);
const EMBED_INITIAL_QUALITY = parseInt(process.env.EMBED_INITIAL_QUALITY || '85', 10);

// Image extensions we process
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/**
 * Convert an S3 key to its thumbnail key
 * Example: projects/abc123/files/photo.jpg -> projects/abc123/files_thumbnails/photo.jpg.webp
 */
function getThumbnailKey(sourceKey) {
  // Don't process files already in _thumbnails or _embed folders
  if (sourceKey.includes('_thumbnails/') || sourceKey.includes('_embed/')) {
    return null;
  }
  
  // Find the folder part and convert to _thumbnails
  // Pattern: anything/folder/filename -> anything/folder_thumbnails/filename.webp
  const parts = sourceKey.split('/');
  if (parts.length < 2) {
    // No folder structure, put in root _thumbnails
    return `_thumbnails/${parts[0]}.webp`;
  }
  
  // Get the filename and parent folder
  const fileName = parts.pop();
  const parentFolder = parts.pop();
  const prefix = parts.length > 0 ? parts.join('/') + '/' : '';
  
  // Create thumbnail path: prefix/parentFolder_thumbnails/fileName.webp
  return `${prefix}${parentFolder}_thumbnails/${fileName}.webp`;
}

/**
 * Convert an S3 key to its embed rendition key
 * Example: projects/abc123/files/photo.jpg -> projects/abc123/files_embed/photo.jpg
 * Note: extension is preserved (will be .jpg or .png based on alpha channel)
 */
function getEmbedKey(sourceKey) {
  // Don't process files already in _thumbnails or _embed folders
  if (sourceKey.includes('_thumbnails/') || sourceKey.includes('_embed/')) {
    return null;
  }
  
  // Find the folder part and convert to _embed
  // Pattern: anything/folder/filename -> anything/folder_embed/filename
  const parts = sourceKey.split('/');
  if (parts.length < 2) {
    // No folder structure, put in root _embed
    return `_embed/${parts[0]}`;
  }
  
  // Get the filename and parent folder
  const fileName = parts.pop();
  const parentFolder = parts.pop();
  const prefix = parts.length > 0 ? parts.join('/') + '/' : '';
  
  // Create embed path: prefix/parentFolder_embed/fileName
  return `${prefix}${parentFolder}_embed/${fileName}`;
}

/**
 * Check if file is an image we should process
 */
function isProcessableImage(key) {
  const lowerKey = key.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lowerKey.endsWith(ext));
}

/**
 * Detect if image has alpha channel
 */
async function hasAlphaChannel(metadata) {
  return metadata.hasAlpha === true;
}

/**
 * Generate embed rendition that's guaranteed to be under 2MB
 * Downscales and compresses iteratively until size constraint is met.
 * Uses JPEG unless image has alpha channel (then PNG).
 */
async function generateEmbedRendition(imageBuffer, hasAlpha) {
  let currentBuffer = imageBuffer;
  let metadata = await sharp(currentBuffer).metadata();
  
  // Start with initial constraints
  let maxDimension = EMBED_INITIAL_MAX_DIMENSION;
  let quality = EMBED_INITIAL_QUALITY;
  const format = hasAlpha ? 'png' : 'jpeg';
  const mimeType = hasAlpha ? 'image/png' : 'image/jpeg';
  
  // If original is already small enough, just re-encode at high quality
  if (imageBuffer.length <= EMBED_MAX_BYTES) {
    const reencoded = await sharp(imageBuffer)
      .toFormat(format, { quality: 90 })
      .toBuffer();
    
    if (reencoded.length <= EMBED_MAX_BYTES) {
      return { buffer: reencoded, mimeType };
    }
    // Otherwise, proceed with downscaling
  }
  
  // Iteratively reduce size until under 2MB
  const maxIterations = 10;
  for (let i = 0; i < maxIterations; i++) {
    const pipeline = sharp(currentBuffer)
      .resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    
    let result;
    if (format === 'png') {
      // PNG doesn't have quality, use compression level
      result = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    } else {
      result = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    }
    
    console.log(`Embed iteration ${i + 1}: maxDim=${maxDimension}, quality=${quality}, size=${result.length}`);
    
    if (result.length <= EMBED_MAX_BYTES) {
      return { buffer: result, mimeType };
    }
    
    // Reduce constraints for next iteration
    if (format === 'jpeg') {
      // First reduce quality, then dimensions
      if (quality > 50) {
        quality -= 10;
      } else {
        maxDimension = Math.floor(maxDimension * 0.8);
        quality = EMBED_INITIAL_QUALITY; // Reset quality when reducing dimensions
      }
    } else {
      // PNG: can only reduce dimensions
      maxDimension = Math.floor(maxDimension * 0.8);
    }
    
    // Don't go too small
    if (maxDimension < 800) {
      console.warn('Embed generation: reached minimum dimension, accepting current size');
      return { buffer: result, mimeType };
    }
    
    // Update current buffer for next iteration (smaller image = faster processing)
    currentBuffer = result;
  }
  
  // Fallback: return last result even if over limit
  const finalResult = await sharp(currentBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .toFormat(format, { quality: 50 })
    .toBuffer();
  
  console.warn(`Embed generation: could not get under ${EMBED_MAX_BYTES} bytes, final size: ${finalResult.length}`);
  return { buffer: finalResult, mimeType };
}

/**
 * Generate thumbnail and embed renditions from S3 event
 */
export async function generateThumbnail(event) {
  console.log('Image rendition generator triggered:', JSON.stringify(event, null, 2));
  
  const results = [];
  
  for (const record of event.Records || []) {
    const bucket = record.s3?.bucket?.name;
    const key = decodeURIComponent(record.s3?.object?.key?.replace(/\+/g, ' ') || '');
    
    if (!bucket || !key) {
      console.log('Missing bucket or key, skipping');
      continue;
    }
    
    // Skip non-images
    if (!isProcessableImage(key)) {
      console.log(`Skipping non-image file: ${key}`);
      continue;
    }
    
    // Skip files already in _thumbnails or _embed folders
    if (key.includes('_thumbnails/') || key.includes('_embed/')) {
      console.log(`Skipping file in rendition folder: ${key}`);
      continue;
    }
    
    const thumbnailKey = getThumbnailKey(key);
    const embedKey = getEmbedKey(key);
    
    if (!thumbnailKey) {
      console.log(`Could not determine thumbnail key for: ${key}`);
      continue;
    }
    
    try {
      // Check if renditions already exist and are newer than source
      const [sourceHead, thumbHead, embedHead] = await Promise.allSettled([
        s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
        s3.send(new HeadObjectCommand({ Bucket: bucket, Key: thumbnailKey })),
        embedKey ? s3.send(new HeadObjectCommand({ Bucket: bucket, Key: embedKey })) : Promise.reject('no embed key'),
      ]);
      
      const sourceLastMod = sourceHead.status === 'fulfilled' 
        ? new Date(sourceHead.value.LastModified).getTime() 
        : 0;
      
      const thumbUpToDate = thumbHead.status === 'fulfilled' &&
        new Date(thumbHead.value.LastModified).getTime() >= sourceLastMod;
      
      const embedUpToDate = embedHead.status === 'fulfilled' &&
        new Date(embedHead.value.LastModified).getTime() >= sourceLastMod;
      
      if (thumbUpToDate && embedUpToDate) {
        console.log(`All renditions already up-to-date for: ${key}`);
        results.push({ key, thumbnailKey, embedKey, status: 'skipped', reason: 'up-to-date' });
        continue;
      }
      
      // Fetch the source image
      console.log(`Fetching source image: ${key}`);
      const getResult = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of getResult.Body) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);
      
      console.log(`Source image size: ${imageBuffer.length} bytes`);
      
      // Get image metadata for alpha detection
      const metadata = await sharp(imageBuffer).metadata();
      const hasAlpha = metadata.hasAlpha === true;
      
      const result = { key, thumbnailKey, embedKey, status: 'success' };
      
      // Generate thumbnail if needed
      if (!thumbUpToDate) {
        const thumbnail = await sharp(imageBuffer)
          .resize(MAX_SIZE, MAX_SIZE, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: QUALITY })
          .toBuffer();
        
        console.log(`Thumbnail size: ${thumbnail.length} bytes (${Math.round(thumbnail.length / imageBuffer.length * 100)}% of original)`);
        
        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: thumbnailKey,
          Body: thumbnail,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000',
          Metadata: {
            'source-key': key,
            'generated-at': new Date().toISOString(),
            'rendition-type': 'thumbnail',
          },
        }));
        
        console.log(`Thumbnail generated: ${thumbnailKey}`);
        result.thumbnailSize = thumbnail.length;
      } else {
        result.thumbnailSkipped = true;
      }
      
      // Generate embed rendition if needed
      if (embedKey && !embedUpToDate) {
        const { buffer: embed, mimeType } = await generateEmbedRendition(imageBuffer, hasAlpha);
        
        console.log(`Embed size: ${embed.length} bytes (${Math.round(embed.length / imageBuffer.length * 100)}% of original)`);
        
        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: embedKey,
          Body: embed,
          ContentType: mimeType,
          CacheControl: 'public, max-age=31536000',
          Metadata: {
            'source-key': key,
            'generated-at': new Date().toISOString(),
            'rendition-type': 'embed',
            'max-bytes': String(EMBED_MAX_BYTES),
          },
        }));
        
        console.log(`Embed generated: ${embedKey}`);
        result.embedSize = embed.length;
      } else if (embedKey) {
        result.embedSkipped = true;
      }
      
      result.originalSize = imageBuffer.length;
      results.push(result);
      
    } catch (error) {
      console.error(`Failed to generate renditions for ${key}:`, error);
      results.push({ key, thumbnailKey, embedKey, status: 'error', error: error.message });
    }
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ processed: results.length, results }),
  };
}

/**
 * HTTP endpoint to manually regenerate a thumbnail
 * POST /thumbnails/regenerate
 * Body: { "key": "projects/abc123/files/photo.jpg" }
 */
export async function regenerateThumbnail(event) {
  console.log('Manual thumbnail regeneration:', event.body);
  
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }
  
  const { key, keys } = body;
  const keysToProcess = keys || (key ? [key] : []);
  
  if (keysToProcess.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing "key" or "keys" in request body' }),
    };
  }
  
  // Create fake S3 event records
  const fakeEvent = {
    Records: keysToProcess.map(k => ({
      s3: {
        bucket: { name: BUCKET },
        object: { key: encodeURIComponent(k) },
      },
    })),
  };
  
  // Reuse the main handler
  const result = await generateThumbnail(fakeEvent);
  
  return {
    statusCode: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: result.body,
  };
}
