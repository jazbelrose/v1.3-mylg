export function getFileUrl(key) {
  const bucket = process.env.FILE_BUCKET || 'mylg-files-v12';
  const region = process.env.AWS_REGION || 'us-west-2';
  const cloudfront = process.env.FILE_CDN;
  if (cloudfront) {
    return `${cloudfront.replace(/\/$/, '')}/${encodeURIComponent(key)}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`;
}

export function normalizeFileUrl(urlOrKey) {
  if (!urlOrKey) return urlOrKey;
  if (urlOrKey.startsWith('http')) {
    const bucket = process.env.FILE_BUCKET || 'mylg-files-v12';
    return urlOrKey.replace(/mylg-files-v\d+/, bucket);
  }
  return getFileUrl(urlOrKey);
}
