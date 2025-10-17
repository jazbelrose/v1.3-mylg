import React from "react";
import { GalleryVerticalEnd } from "lucide-react";

import styles from "./gallery-component.module.css";
import { getPreviewUrl, resolveGallerySlug } from "./GalleryUtils";
import { Gallery } from "./types";
import { getFileUrl } from "../../../../shared/utils/api";

interface GalleryTriggerProps {
  gallery: Gallery | null;
  hasGalleries: boolean;
  hasClientGallerySelection: boolean;
  onOpenModal: () => void;
}

const GalleryTrigger: React.FC<GalleryTriggerProps> = ({
  gallery,
  hasGalleries,
  hasClientGallerySelection,
  onOpenModal,
}) => {
  const previewUrl = gallery ? getPreviewUrl(gallery) : null;
  const galleryName = gallery?.name?.trim() || (gallery ? "Untitled Gallery" : "");
  const slug = gallery ? resolveGallerySlug(gallery) : "";
  const helperText = hasGalleries
    ? hasClientGallerySelection
      ? "Peek at the latest uploads or jump into the full gallery."
      : "Select which gallery appears for your client."
    : "Create your first gallery to showcase work.";

  return (
    <div
      className={`dashboard-item view-gallery ${styles.galleryTrigger}`}
      onClick={onOpenModal}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenModal();
        }
      }}
    >
      <div className={styles.titleColumn}>
        <div className={styles.topRow}>
          <span>Galleries</span>
          {hasGalleries && (
            <span
              className={
                hasClientGallerySelection
                  ? styles.clientBadge
                  : `${styles.clientBadge} ${styles.clientBadgeMuted}`
              }
            >
              {hasClientGallerySelection ? "Client gallery" : "No selection"}
            </span>
          )}
        </div>
        <p className={styles.galleryHelperText}>{helperText}</p>
        {gallery && !hasClientGallerySelection && (
          <p className={styles.selectionHint}>Choose the client-facing gallery from the manager.</p>
        )}
      </div>

      <div className={styles.thumbsColumn}>
        {gallery ? (
          <div className={styles.selectedPreview}>
            {previewUrl ? (
              <img
                src={getFileUrl(previewUrl)}
                alt={galleryName}
                className={styles.selectedPreviewImage}
              />
            ) : (
              <div className={`${styles.thumbnailPlaceholder} ${styles.selectedPreviewFallback}`}>
                <GalleryVerticalEnd size={40} aria-hidden="true" />
              </div>
            )}
            {slug ? <span className={styles.selectedSlug}>/{slug}</span> : null}
          </div>
        ) : (
          <div className={styles.emptyState}>{hasGalleries ? "Select a client gallery" : "No galleries yet"}</div>
        )}
      </div>
    </div>
  );
};

export default GalleryTrigger;
