import Cropper from "react-easy-crop";
import { Image as ImageIcon } from "lucide-react";

import Modal from "@/shared/ui/ModalWithStack";

import modalStyles from "@/dashboard/home/components/finish-line-component.module.css";

import type { ThumbnailModalState } from "../projectHeaderTypes";

import styles from "./thumbnail-modal.module.css";

interface ThumbnailModalProps {
  modal: ThumbnailModalState;
  currentThumbnailUrl?: string;
}

const ThumbnailModal = ({ modal, currentThumbnailUrl = "" }: ThumbnailModalProps) => (
  <Modal
    isOpen={modal.isOpen}
    onRequestClose={modal.close}
    contentLabel="Change Thumbnail"
    closeTimeoutMS={300}
    className={{
      base: modalStyles.modalContent,
      afterOpen: modalStyles.modalContentAfterOpen,
      beforeClose: modalStyles.modalContentBeforeClose,
    }}
    overlayClassName={modalStyles.modalOverlay}
  >
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.title}>Choose a Thumbnail</h4>
        <p className={styles.subtitle}>
          Upload a new image to refresh how your project appears across dashboards and shared views.
        </p>
      </div>

      <div className={styles.dropzoneWrapper}>
        <div
          role="button"
          tabIndex={0}
          className={`${styles.dropzone} ${modal.isDragging ? styles.dropzoneActive : ""}`}
          onClick={() => modal.fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              modal.fileInputRef.current?.click();
            }
          }}
          onDragOver={modal.onDragOver}
          onDragLeave={modal.onDragLeave}
          onDrop={modal.onDrop}
        >
          <input type="file" accept="image/*" ref={modal.fileInputRef} onChange={modal.onFileChange} hidden />

          {modal.preview ? (
            <div className={styles.cropper}>
              <Cropper
                image={modal.preview}
                crop={modal.crop}
                zoom={modal.zoom}
                aspect={1}
                onCropChange={modal.onCropChange}
                onZoomChange={modal.onZoomChange}
                onCropComplete={(_, area) => modal.onCropComplete(area)}
                objectFit="cover"
              />
            </div>
          ) : currentThumbnailUrl ? (
            <img src={currentThumbnailUrl} alt="Current project thumbnail" className={styles.previewImage} />
          ) : (
            <div className={styles.placeholder}>
              <ImageIcon size={32} aria-hidden="true" />
              <span>Click or drag an image to upload</span>
            </div>
          )}

          {modal.isDragging && <div className={styles.dragOverlay}>Drop to upload</div>}

          {modal.isUploading && (
            <div className={styles.uploadOverlay}>
              <div className="dot-loader">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>
      </div>

      {modal.preview ? (
        <div className={styles.controls}>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={modal.zoom}
            onChange={(event) => modal.onZoomChange(parseFloat(event.target.value))}
            className={styles.rangeInput}
          />
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={modal.upload}
              disabled={modal.isUploading || !modal.preview}
            >
              Save thumbnail
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={modal.remove}
              disabled={modal.isUploading}
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.mutedText}>
          Recommended resolution: at least 512 × 512px. Square images look best.
        </p>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.cancelButton} onClick={modal.close} disabled={modal.isUploading}>
          Cancel
        </button>
      </div>
    </div>
  </Modal>
);

export default ThumbnailModal;
