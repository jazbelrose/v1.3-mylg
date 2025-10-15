// smoke-presign.mjs
// Simple smoke script to test the GALLERY_UPLOAD_URL presign endpoint.
// Usage: node ./scripts/smoke-presign.mjs <projectId> <fileName> <contentType>

import fetch from 'node-fetch';

const [projectId, fileName, contentType] = process.argv.slice(2);
if (!projectId || !fileName || !contentType) {
  console.error('Usage: node scripts/smoke-presign.mjs <projectId> <fileName> <contentType>');
  process.exit(2);
}

const BASE = process.env.VITE_API_BASE || 'https://bevnkraeqa.execute-api.us-west-2.amazonaws.com';
const URL = `${BASE}/projects/galleries/upload`;

(async () => {
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, fileName, contentType }),
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body:', text);
  } catch (err) {
    console.error('Request failed', err);
    process.exit(1);
  }
})();
