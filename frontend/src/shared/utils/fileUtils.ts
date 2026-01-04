export const getFileNameFromUrl = (url?: string): string => {
  if (!url) return "";
  return url.split("/").pop() || "";
};

/**
 * Generates a unique S3 key for uploading a file to the lexical folder.
 * Uses timestamp and random ID to prevent naming collisions.
 * 
 * @param fileName - Original file name
 * @param projectId - Project ID for the S3 key path
 * @returns S3 key in format: projects/{projectId}/lexical/{timestamp}_{randomId}_{safeName}
 */
export const generateUniqueLexicalImageKey = (fileName: string, projectId: string): string => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 8);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `projects/${projectId}/lexical/${timestamp}_${randomId}_${safeName}`;
};

export default getFileNameFromUrl;









