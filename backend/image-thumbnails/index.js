/**
 * Image Thumbnail Generator Lambda
 * 
 * Triggers on S3 image uploads and generates optimized thumbnails.
 * Thumbnails are stored in a parallel `_thumbnails/` path structure.
 * 
 * Example:
 *   Original:  projects/abc123/files/photo.jpg
 *   Thumbnail: projects/abc123/files_thumbnails/photo.jpg.webp
 * 
 * Features:
 * - Resizes to max 400x400 (configurable via THUMBNAIL_MAX_SIZE)
 * - Outputs WebP format for best compression
 * - Maintains aspect ratio
 * - Skips if thumbnail already exists and is newer than source
 * - Skips files in _thumbnails/ folders (prevent infinite loops)
 */

import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const s3 = new S3Client({});
const BUCKET = process.env.FILE_BUCKET || 'mylg-files-v12';
const MAX_SIZE = parseInt(process.env.THUMBNAIL_MAX_SIZE || '400', 10);
const QUALITY = parseInt(process.env.THUMBNAIL_QUALITY || '80', 10);

// Image extensions we process
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/**
 * Convert an S3 key to its thumbnail key
 * Example: projects/abc123/files/photo.jpg -> projects/abc123/files_thumbnails/photo.jpg.webp
 */
function getThumbnailKey(sourceKey) {
  // Don't process files already in _thumbnails folders
  if (sourceKey.includes('_thumbnails/')) {
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
 * Check if file is an image we should process
 */
function isProcessableImage(key) {
  const lowerKey = key.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lowerKey.endsWith(ext));
}

/**
 * Generate thumbnail from S3 event
 */
export async function generateThumbnail(event) {
  console.log('Thumbnail generator triggered:', JSON.stringify(event, null, 2));
  
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
    
    // Skip files already in _thumbnails folders
    if (key.includes('_thumbnails/')) {
      console.log(`Skipping file in _thumbnails folder: ${key}`);
      continue;
    }
    
    const thumbnailKey = getThumbnailKey(key);
    if (!thumbnailKey) {
      console.log(`Could not determine thumbnail key for: ${key}`);
      continue;
    }
    
    try {
      // Check if thumbnail already exists and is newer than source
      const [sourceHead, thumbHead] = await Promise.allSettled([
        s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
        s3.send(new HeadObjectCommand({ Bucket: bucket, Key: thumbnailKey })),
      ]);
      
      if (thumbHead.status === 'fulfilled') {
        const sourceLastMod = sourceHead.status === 'fulfilled' 
          ? new Date(sourceHead.value.LastModified).getTime() 
          : 0;
        const thumbLastMod = new Date(thumbHead.value.LastModified).getTime();
        
        if (thumbLastMod >= sourceLastMod) {
          console.log(`Thumbnail already up-to-date: ${thumbnailKey}`);
          results.push({ key, thumbnailKey, status: 'skipped', reason: 'up-to-date' });
          continue;
        }
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
      
      // Generate thumbnail with sharp
      const thumbnail = await sharp(imageBuffer)
        .resize(MAX_SIZE, MAX_SIZE, {
          fit: 'inside',        // Maintain aspect ratio, fit within bounds
          withoutEnlargement: true,  // Don't upscale small images
        })
        .webp({ quality: QUALITY })
        .toBuffer();
      
      console.log(`Thumbnail size: ${thumbnail.length} bytes (${Math.round(thumbnail.length / imageBuffer.length * 100)}% of original)`);
      
      // Upload thumbnail
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnail,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000', // 1 year cache
        Metadata: {
          'source-key': key,
          'generated-at': new Date().toISOString(),
        },
      }));
      
      console.log(`Thumbnail generated: ${thumbnailKey}`);
      results.push({ 
        key, 
        thumbnailKey, 
        status: 'success',
        originalSize: imageBuffer.length,
        thumbnailSize: thumbnail.length,
        reduction: `${Math.round((1 - thumbnail.length / imageBuffer.length) * 100)}%`,
      });
      
    } catch (error) {
      console.error(`Failed to generate thumbnail for ${key}:`, error);
      results.push({ key, thumbnailKey, status: 'error', error: error.message });
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
