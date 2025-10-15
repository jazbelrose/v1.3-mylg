import { slugify } from "@/shared/utils/slug";
import { Gallery } from "./types";

export function getUniqueSlug(
  desiredSlug: string,
  galleries: Gallery[] = [],
  legacyGalleries: Gallery[] = [],
  pending: string[] = []
): { slug: string; count: number } {
  const existingSlugs = [...legacyGalleries, ...galleries].map(
    (g) => g.slug || slugify(g.name || "")
  );
  let slug = desiredSlug;
  let count = 0;
  while (existingSlugs.includes(slug) || pending.includes(slug)) {
    count += 1;
    slug = `${desiredSlug}-${count}`;
  }
  return { slug, count };
}

export function getPreviewUrl(galleryItem: Gallery = {}): string | null {
  return (
    galleryItem.coverImageUrl ||
    galleryItem.pageImageUrls?.[0] ||
    galleryItem.imageUrls?.[0] ||
    (Array.isArray(galleryItem.images)
      ? typeof galleryItem.images[0] === "string"
        ? galleryItem.images[0]
        : galleryItem.images[0]?.url
      : null) ||
    galleryItem.url ||
    galleryItem.updatedSvgUrl ||
    null
  );
}









