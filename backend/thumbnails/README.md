# Thumbnails Service

Serverless AWS thumbnail generation for slides using Serverless Framework.

## Features

- Generates thumbnails from Lexical JSON representation of slides
- Uses Puppeteer for HTML-to-PNG rendering
- Resizes with Sharp
- Caches based on content hash
- Stores in S3, serves via CloudFront CDN

## API

POST /thumbnails

Body:
```json
{
  "lexicalJson": {
    "elements": [
      {
        "type": "text",
        "content": "Hello World",
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 50,
        "rotation": 0,
        "fontSize": 16,
        "color": "black",
        "background": "transparent"
      }
    ],
    "background": "white"
  },
  "width": 320,
  "height": 180,
  "projectId": "proj123",
  "slideId": "slide1"
}
```

Response:
```json
{
  "url": "https://cdn.mylg.app/secure/thumbnails/proj123/slide1/hash.png"
}
```

## Deployment

```bash
cd backend/thumbnails
npm install
npx serverless deploy --stage dev
```

## Testing

Use Postman or curl to test the endpoint.

Example curl:
```bash
curl -X POST https://your-api-gateway-url/dev/thumbnails \
  -H "Content-Type: application/json" \
  -d '{"lexicalJson": {"elements": [{"type": "text", "content": "Test", "x": 10, "y": 10}]}, "projectId": "test", "slideId": "s1"}'
```</content>
<parameter name="filePath">d:\MYLG\App\v1.3-mylg\backend\thumbnails\README.md