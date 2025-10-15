#!/usr/bin/env node
// e2e-presign-upload.mjs
// Usage: node scripts/e2e-presign-upload.mjs <projectId> <fileName> <contentType> [idToken]
// Optionally set VITE_API_BASE env var to override default API base.

const args = process.argv.slice(2);
let [projectId, fileName, contentType, idToken] = args;
// Allow idToken to be provided via environment for convenience
idToken = idToken || process.env.TEST_ID_TOKEN || process.env.VITE_TEST_ID_TOKEN || undefined;
if (!projectId || !fileName || !contentType) {
  console.error('Usage: node scripts/e2e-presign-upload.mjs <projectId> <fileName> <contentType> [idToken]');
  process.exit(2);
}

const API_BASE = process.env.VITE_API_BASE || 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com';
const PRESIGN_URL = `${API_BASE}/projects/galleries/upload`;

const svgSample = `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">\n  <rect width="100%" height="100%" fill="#eee"/>\n  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif">Test SVG</text>\n</svg>`;

(async () => {
  try {
    console.log('POST presign to', PRESIGN_URL);
    const presignResp = await fetch(PRESIGN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ projectId, fileName, contentType }),
    });

    const presignText = await presignResp.text();
    console.log('Presign status:', presignResp.status);
    console.log('Presign body:', presignText);

    if (!presignResp.ok) process.exit(1);
    const presignJson = JSON.parse(presignText);
    const { uploadUrl, key, bucket } = presignJson;
    if (!uploadUrl || !key || !bucket) {
      console.error('Presign response missing uploadUrl/key/bucket');
      process.exit(1);
    }

    console.log('PUT to presigned URL...');
    const putResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: svgSample,
    });
    console.log('PUT status:', putResp.status);
    if (!putResp.ok) {
      const t = await putResp.text().catch(() => '');
      console.error('PUT failed:', putResp.status, t);
      process.exit(1);
    }

    const objectUrl = `https://${bucket}.s3.us-west-2.amazonaws.com/${encodeURIComponent(key)}`;
    console.log('HEAD object at', objectUrl);
    const headResp = await fetch(objectUrl, { method: 'HEAD' });
    console.log('HEAD status:', headResp.status);
    if (headResp.ok) {
      console.log('Upload verified. Object exists.');
    } else {
      console.error('Object not found after upload. Status:', headResp.status);
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error during E2E test:', err);
    process.exit(1);
  }
})();
