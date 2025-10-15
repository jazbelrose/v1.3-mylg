import { ChangeEventHandler, useMemo, useState } from "react";
import { uploadData } from "aws-amplify/storage";

import { S3_PUBLIC_BASE, updateGallery } from "@/shared/utils/api";
import { slugify } from "@/shared/utils/slug";
import { CoverOptions, Gallery, PendingCover } from "../types";

const COVER_PAGE_SIZE = 12;

interface GalleryCoverParams {
  legacyGalleries: Gallery[];
  setLegacyGalleries: React.Dispatch<React.SetStateAction<Gallery[]>>;
  galleries: Gallery[];
  setGalleries: React.Dispatch<React.SetStateAction<Gallery[]>>;
  coverInputRef: React.MutableRefObject<HTMLInputElement | null>;
  activeProjectId?: string;
  queueUpdate: (payload: Record<string, unknown>) => Promise<void>;
}

const getGalleryId = (gallery: Gallery = {}): string =>
  gallery.galleryId || gallery.id || gallery.slug || slugify(gallery.name || "");

const useGalleryCover = ({
  legacyGalleries,
  setLegacyGalleries,
  galleries,
  setGalleries,
  coverInputRef,
  activeProjectId,
  queueUpdate,
}: GalleryCoverParams) => {
  const [pendingCover, setPendingCover] = useState<PendingCover | null>(null);
  const [coverUploadingIndex, setCoverUploadingIndex] = useState<number | null>(null);
  const [coverOptions, setCoverOptions] = useState<CoverOptions | null>(null);
  const [coverPage, setCoverPage] = useState(0);

  const applyCoverUrl = async (
    index: number,
    isLegacy: boolean,
    galleryItem: Gallery,
    url?: string
  ) => {
    if (!url) return;
    const galleryId = getGalleryId(galleryItem);

    if (isLegacy) {
      const updated = legacyGalleries.map((g) =>
        getGalleryId(g) === galleryId ? { ...g, coverImageUrl: url } : g
      );
      try {
        await queueUpdate({ gallery: updated });
        setLegacyGalleries(updated);
      } catch (err) {
        console.error("Failed to update legacy gallery cover", err);
      }
    } else {
      const updated = galleries.map((g) =>
        getGalleryId(g) === galleryId ? { ...g, coverImageUrl: url } : g
      );
      try {
        await updateGallery(galleryId, {
          coverImageUrl: url,
          projectId: activeProjectId,
        });
        setGalleries(updated);
        await queueUpdate({
          galleryUpdate: { id: galleryId, coverImageUrl: url },
          galleries: updated,
        });
      } catch (err) {
        console.error("Failed to update gallery cover", err);
      }
    }
  };

  const handleChangeCover = (combinedIndex: number) => {
    const legacyCount = legacyGalleries.length;
    const isLegacy = combinedIndex < legacyCount;
    const galleryItem = isLegacy
      ? legacyGalleries[combinedIndex]
      : galleries[combinedIndex - legacyCount];
    if (!galleryItem) return;

    const possibleUrls = [
      ...(galleryItem.pageImageUrls || []),
      ...(galleryItem.imageUrls || []),
      ...(Array.isArray(galleryItem.images)
        ? galleryItem.images
            .map((img) => (typeof img === "string" ? img : img?.url))
            .filter(Boolean) as string[]
        : []),
    ];

    if (possibleUrls.length > 0) {
      setCoverOptions({ index: combinedIndex, isLegacy, gallery: galleryItem, urls: possibleUrls });
    } else {
      setPendingCover({ index: combinedIndex, isLegacy, gallery: galleryItem });
      if (coverInputRef.current) coverInputRef.current.value = "";
      coverInputRef.current?.click();
    }
  };

  const chooseCoverUrl = (url: string) => {
    if (!coverOptions) return;
    void applyCoverUrl(coverOptions.index, coverOptions.isLegacy, coverOptions.gallery, url);
    setCoverOptions(null);
  };

  const handleUploadNewCover = () => {
    if (!coverOptions) return;
    setPendingCover({
      index: coverOptions.index,
      isLegacy: coverOptions.isLegacy,
      gallery: coverOptions.gallery,
    });
    if (coverInputRef.current) coverInputRef.current.value = "";
    coverInputRef.current?.click();
    setCoverOptions(null);
  };

  const handleCoverFileChange: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0] || null;
    if (!file || !pendingCover || !activeProjectId) return;

    const galleryId = getGalleryId(pendingCover.gallery);
    const key = `projects/${activeProjectId}/galleries/${galleryId}/cover/${file.name}`;
    setCoverUploadingIndex(pendingCover.index);

    try {
      await uploadData({
        key,
        data: file,
        options: { accessLevel: "public" },
      });
      const encodedName = encodeURIComponent(file.name);
      const url = `${S3_PUBLIC_BASE}projects/${activeProjectId}/galleries/${galleryId}/cover/${encodedName}?t=${Date.now()}`;
      await applyCoverUrl(pendingCover.index, pendingCover.isLegacy, pendingCover.gallery, url);
    } catch (err) {
      console.error("Failed to upload cover image", err);
    } finally {
      setCoverUploadingIndex(null);
      setPendingCover(null);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const startIndex = coverPage * COVER_PAGE_SIZE;
  const endIndex = startIndex + COVER_PAGE_SIZE;
  const currentCoverUrls = useMemo(
    () => coverOptions?.urls.slice(startIndex, endIndex) || [],
    [coverOptions, startIndex, endIndex]
  );
  const totalCoverPages = coverOptions
    ? Math.ceil(coverOptions.urls.length / COVER_PAGE_SIZE)
    : 0;

  return {
    pendingCover,
    setPendingCover,
    coverUploadingIndex,
    coverOptions,
    setCoverOptions,
    coverPage,
    setCoverPage,
    handleChangeCover,
    chooseCoverUrl,
    handleUploadNewCover,
    handleCoverFileChange,
    currentCoverUrls,
    totalCoverPages,
    coverStartIndex: startIndex,
  };
};

export default useGalleryCover;
