export interface Slide {
  id: string;
  title?: string;
  // Store key or URL to thumbnail; consumers can call getFileUrl() as needed
  thumbnail?: string;
  revision?: number;
  thumbRevision?: number;
  backgroundColor?: string; // Slide background color
  // Store key or URL to the background image; consumers can call getFileUrl() as needed
  backgroundImage?: string;
}
