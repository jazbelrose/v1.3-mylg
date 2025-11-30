export interface Slide {
  id: string;
  title?: string;
  // Store key or URL to thumbnail; consumers can call getFileUrl() as needed
  thumbnail?: string;
  backgroundColor?: string; // Slide background color
}

