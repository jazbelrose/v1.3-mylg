# Image Thumbnails & Embed Service

S3-triggered Lambda that automatically generates optimized image renditions for uploaded images.

## Renditions Generated

When an image is uploaded to S3, this service generates TWO renditions:

### 1. Thumbnail (for UI grids)
- **Size**: Max 400x400px
- **Format**: WebP (best compression)
- **Path**: `{folder}_thumbnails/{filename}.webp`
- **Use case**: File manager grid, slide thumbnails, quick previews

### 2. Embed (for slides/deck export)
- **Size**: Dynamically sized to be **≤ 2MB**
- **Format**: JPEG (or PNG if image has alpha channel)
- **Path**: `{folder}_embed/{filename}`
- **Use case**: Slide editor, deck exports, presentations
- **Guarantee**: Images are downscaled/compressed until under 2MB

### Original (for download)
- The original file is preserved at its upload location
- Use for "Download Original" feature only
- **Never embed originals in slides** - use the embed rendition

## Path Structure

```
Original:  projects/{projectId}/files/photo.jpg
Thumbnail: projects/{projectId}/files_thumbnails/photo.jpg.webp
Embed:     projects/{projectId}/files_embed/photo.jpg
```

## Frontend Usage

```typescript
import { getEmbedUrl, getThumbnailUrl, getFileUrl } from '@/shared/utils/api';

// For slide editor / deck export (<=2MB guaranteed)
const embedUrl = getEmbedUrl(imageKey, { fallbackToOriginal: true });

// For UI grids (tiny preview)
const thumbUrl = getThumbnailUrl(imageKey, { fallbackToOriginal: true });

// For download original
const originalUrl = getFileUrl(imageKey);
```

## How It Works

1. **Trigger**: When an image is uploaded to the S3 bucket, the Lambda is triggered
2. **Process**: The image is resized to max 400x400px and converted to WebP
3. **Store**: Thumbnail is saved to a parallel `_thumbnails/` path

## Supported Formats

Input: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` (case-insensitive)
Output: `.webp` (best compression + quality ratio)

## Configuration

Environment variables:
- `FILE_BUCKET`: S3 bucket name (default: `mylg-files-v12`)
- `THUMBNAIL_MAX_SIZE`: Max dimension in pixels (default: `400`)
- `THUMBNAIL_QUALITY`: WebP quality 0-100 (default: `80`)
- `EMBED_MAX_BYTES`: Max size for embed rendition (default: `2097152` = 2MB)
- `EMBED_INITIAL_MAX_DIMENSION`: Starting max dimension for embed (default: `3000`)
- `EMBED_INITIAL_QUALITY`: Starting JPEG quality for embed (default: `85`)

## Deployment

**IMPORTANT**: Sharp requires Linux binaries for Lambda. Use Docker to install dependencies:

```bash
cd backend/image-thumbnails

# Remove any existing Windows node_modules
rm -rf node_modules package-lock.json

# Install using Docker with Linux node image
docker run --rm -v "$(pwd):/app" -w /app node:20-slim npm install

# Deploy
npx serverless deploy --stage dev
```

**Note**: Requires the shared-layer to be deployed first.

## Setting Up S3 Trigger (Existing Bucket)

Since the S3 bucket already exists, you need to manually configure the S3 notification:

### Option 1: AWS CLI

```bash
# Get the Lambda ARN
LAMBDA_ARN=$(aws lambda get-function --function-name image-thumbnails-dev-generateThumbnail --query 'Configuration.FunctionArn' --output text)

# Add permission for S3 to invoke the Lambda
aws lambda add-permission \
  --function-name image-thumbnails-dev-generateThumbnail \
  --statement-id s3-trigger \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::mylg-files-v12

# Create notification configuration (save as notification.json)
cat > notification.json << EOF
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "$LAMBDA_ARN",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {"Name": "suffix", "Value": ".jpg"},
            {"Name": "suffix", "Value": ".jpeg"},
            {"Name": "suffix", "Value": ".png"},
            {"Name": "suffix", "Value": ".webp"},
            {"Name": "suffix", "Value": ".gif"}
          ]
        }
      }
    }
  ]
}
EOF

# Apply the notification configuration
aws s3api put-bucket-notification-configuration \
  --bucket mylg-files-v12 \
  --notification-configuration file://notification.json
```

### Option 2: AWS Console

1. Go to S3 → mylg-files-v12 → Properties → Event notifications
2. Create notification:
   - Name: `image-thumbnail-generator`
   - Event types: `All object create events`
   - Filter suffix: `.jpg` (create one for each: .jpeg, .png, .webp, .gif)
   - Destination: Lambda function → `image-thumbnails-dev-generateThumbnail`

## Manual Regeneration

You can manually regenerate thumbnails via HTTP:

```bash
# Single file
curl -X POST https://your-api-gateway/dev/thumbnails/regenerate \
  -H "Content-Type: application/json" \
  -d '{"key": "projects/abc123/files/photo.jpg"}'

# Multiple files
curl -X POST https://your-api-gateway/dev/thumbnails/regenerate \
  -H "Content-Type: application/json" \
  -d '{"keys": ["path/to/image1.jpg", "path/to/image2.png"]}'
```

## Backfill Existing Images

To generate thumbnails for all existing images:

```bash
cd backend/scripts
node backfill-thumbnails.mjs --dry-run  # Preview what would be processed
node backfill-thumbnails.mjs --prefix "projects/" --limit 100  # Process 100 files
node backfill-thumbnails.mjs  # Process all images
```

## Performance

Typical results:
- 5MB JPEG → ~50KB WebP thumbnail (99% reduction)
- 2MB PNG → ~30KB WebP thumbnail (98% reduction)
- Processing time: 200-500ms per image

## Frontend Integration

The frontend uses `getThumbnailUrl()` from `FileManagerUtils.tsx` to convert 
file URLs to thumbnail URLs. The function looks for `_thumbnails/` paths.

```typescript
// FileManagerUtils.tsx
export const getThumbnailUrl = (url: string, folderKey: string) => {
  // Converts: /projects/{projectId}/files/photo.jpg
  // To:       /projects/{projectId}/files_thumbnails/photo.jpg.webp
};
```

The `FileThumb` component will:
1. Try to load the thumbnail URL first
2. If thumbnail 404s, fall back to the original image
3. Cache loaded thumbnails to prevent reload flash on scroll
