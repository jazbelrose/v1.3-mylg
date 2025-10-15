export const getFileNameFromUrl = (url?: string): string => {
  if (!url) return "";
  return url.split("/").pop() || "";
};

export default getFileNameFromUrl;









