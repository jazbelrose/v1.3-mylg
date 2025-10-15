import React, { Fragment } from "react";
import Modal from "../../../../shared/ui/ModalWithStack";
import { GalleryVerticalEnd } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faEye, faEyeSlash, faImage, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";

import styles from "./gallery-component.module.css";
import { getFileUrl } from "../../../../shared/utils/api";
import { getPreviewUrl } from "./GalleryUtils";
import type { GalleryController } from "./types";
import { slugify } from "../../../../shared/utils/slug";

interface GalleryModalProps {
  controller: GalleryController;
}

const GalleryModal: React.FC<GalleryModalProps> = ({ controller }) => {
  const {
    isModalOpen,
    closeModal,
    isConfirmingDelete,
    handleModalDragOver,
    handleModalDragLeave,
    handleModalDrop,
    handleFileChange,
    handleCoverFileChange,
    fileInputRef,
    coverInputRef,
    hasGalleries,
    showForm,
    editingIndex,
    setEditingIndex,
    setShowForm,
    isAdmin,
    isBuilder,
    isDesigner,
    displayedGalleries,
    isEditing,
    editingCombinedIndex,
    legacyCount,
    handleChangeCover,
    coverUploadingIndex,
    startEdit,
    handleDeleteGallery,
    handleGalleryNavigate,
    recentlyCreated,
    handleUpload,
    handleSaveEdit,
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    selectedFile,
    uploading,
    galleryName,
    setGalleryName,
    gallerySlug,
    setGallerySlug,
    galleries,
    galleryPassword,
    setGalleryPassword,
    galleryPasswordEnabled,
    setGalleryPasswordEnabled,
    showPassword,
    setShowPassword,
    galleryTimeout,
    setGalleryTimeout,
    galleryUrl,
    setGalleryUrl,
    uploadProgress,
    isModalDragging,
  } = controller;

  const canManage = isAdmin || isBuilder || isDesigner;

  return (
    <Modal
      isOpen={isModalOpen}
      onRequestClose={closeModal}
      contentLabel="Gallery Modal"
      shouldCloseOnOverlayClick={!isConfirmingDelete}
      style={{ overlay: { pointerEvents: isConfirmingDelete ? "none" : "auto" } }}
      className={{
        base: styles.modalContent,
        afterOpen: styles.modalContentAfterOpen,
        beforeClose: styles.modalContentBeforeClose,
      }}
      overlayClassName={{
        base: styles.modalOverlay,
        afterOpen: styles.modalOverlayAfterOpen,
        beforeClose: styles.modalOverlayBeforeClose,
      }}
      closeTimeoutMS={300}
    >
      <div
        className={`${styles.modalInner} ${
          !hasGalleries && !showForm && editingIndex === null ? styles.modalInnerEmpty : ""
        }`}
        onDragOver={handleModalDragOver}
        onDragLeave={handleModalDragLeave}
        onDrop={handleModalDrop}
      >
        <input
          type="file"
          accept=".svg,.pdf"
          onChange={handleFileChange}
          ref={fileInputRef}
          className={styles.hiddenInput}
        />
        <input
          type="file"
          accept="image/*"
          onChange={handleCoverFileChange}
          ref={coverInputRef}
          className={styles.hiddenInput}
        />

        {hasGalleries || showForm || editingIndex !== null ? (
          <Fragment>
            {(showForm || editingIndex !== null) && (
              <div className={styles.editHeader}>
                {editingIndex !== null && (
                  <button
                    className={styles.iconButton}
                    onClick={() => handleDeleteGallery((editingIndex as number) + legacyCount)}
                    aria-label="Delete gallery"
                    title="Delete gallery"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                )}
                <button
                  className={styles.iconButton}
                  onClick={() => {
                    setEditingIndex(null);
                    setShowForm(false);
                  }}
                  aria-label="Close edit mode"
                  title="Close"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            )}

            {canManage && !(showForm || editingIndex !== null) && (
              <button
                className={`modal-submit-button uploads ${styles.newButton}`}
                onClick={() => {
                  setEditingIndex(null);
                  setGalleryName("");
                  setGallerySlug("");
                  setGalleryPassword("");
                  setGalleryUrl("");
                  setShowPassword(false);
                  setGalleryPasswordEnabled(false);
                  setGalleryTimeout(15);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                  setShowForm(true);
                }}
              >
                New Gallery
              </button>
            )}

            {displayedGalleries.length > 0 && (
              <div className={styles.listContainer}>
                <ul className={styles.galleryList}>
                  {displayedGalleries.map((galleryItem, idx) => {
                    const index = isEditing ? (editingCombinedIndex as number) : idx;
                    const slug = galleryItem.slug || slugify(galleryItem.name || "");
                    const isLegacy = index < legacyCount;
                    const isProcessingItem = galleryItem.uploading || galleryItem.processing;
                    const ready = recentlyCreated.includes(slug);
                    const previewUrl = getPreviewUrl(galleryItem);

                    return (
                      <li key={`${slug}-${idx}`} className={styles.listItem}>
                        <div
                          className={`${styles.listRow} ${
                            editingIndex !== null && index === (editingIndex as number) + legacyCount
                              ? styles.activeRow
                              : ""
                          } ${isProcessingItem ? styles.processingRow : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={async () => {
                            if (isProcessingItem) return;
                            await handleGalleryNavigate(galleryItem, slug);
                            closeModal();
                          }}
                          onKeyDown={async (e) => {
                            if (isProcessingItem) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              await handleGalleryNavigate(galleryItem, slug);
                              closeModal();
                            }
                          }}
                        >
                          {previewUrl ? (
                            <img
                              src={previewUrl ? getFileUrl(previewUrl) : ""}
                              className={`${styles.thumbnail} ${styles.listThumbnail}`}
                              alt=""
                            />
                          ) : (
                            <GalleryVerticalEnd
                              size={40}
                              className={`${styles.thumbnail} ${styles.listThumbnail}`}
                            />
                          )}

                          <div className={styles.listInfo}>
                            <span className={styles.listLink}>{galleryItem.name}</span>
                            <span className={styles.slugLabel}>{slug}</span>

                            {galleryItem.uploading && (
                              <span className={styles.statusMessage}>
                                Uploading... {galleryItem.progress || 0}%
                              </span>
                            )}
                            {!galleryItem.uploading && galleryItem.processing && (
                              <span className={styles.statusMessage}>
                                Creating gallery
                                <span className={`${styles.dotSpinner} ${styles.inlineSpinner}`}>
                                  <span />
                                  <span />
                                  <span />
                                </span>
                              </span>
                            )}
                            {!galleryItem.uploading && !galleryItem.processing && ready && (
                              <span className={styles.statusMessage}>
                                Ready <span className={styles.readyIcon}>✓</span>
                              </span>
                            )}
                          </div>

                          {canManage && !isProcessingItem && (
                            <div
                              className={`${styles.actions} ${
                                editingIndex !== null &&
                                index === (editingIndex as number) + legacyCount
                                  ? styles.hideOnEdit
                                  : ""
                              }`}
                            >
                              <button
                                className={styles.iconButton}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleChangeCover(index);
                                }}
                                aria-label={`Change cover for ${galleryItem.name} gallery`}
                                disabled={coverUploadingIndex === index}
                              >
                                {coverUploadingIndex === index ? (
                                  <span className={styles.dotSpinner}>
                                    <span />
                                    <span />
                                    <span />
                                  </span>
                                ) : (
                                  <FontAwesomeIcon icon={faImage} />
                                )}
                              </button>

                              {!isLegacy && (
                                <Fragment>
                                  <button
                                    className={styles.iconButton}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(index);
                                    }}
                                    aria-label={`Edit ${galleryItem.name} gallery`}
                                  >
                                    <FontAwesomeIcon icon={faEdit} />
                                  </button>
                                  <button
                                    className={styles.iconButton}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteGallery(index);
                                    }}
                                    aria-label={`Delete ${galleryItem.name} gallery`}
                                  >
                                    <FontAwesomeIcon icon={faTrash} />
                                  </button>
                                </Fragment>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {canManage && hasGalleries && !showForm && editingIndex === null && (
              <div className={styles.dropHint}>
                Drag a SVG or PDF file here to create a new gallery
              </div>
            )}
          </Fragment>
        ) : (
          <div
            className={styles.emptyDropArea}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className={styles.emptyDropHint}>
              Drag or click a SVG or PDF file to create a new gallery
            </span>
          </div>
        )}

        {(showForm || editingIndex !== null) && (
          <div className={styles.modalActions}>
            <div className={styles.formColumn}>
              <input
                type="text"
                placeholder="Gallery Name"
                value={galleryName}
                onChange={(e) => setGalleryName(e.target.value)}
                className="modal-input"
              />
              <input
                type="text"
                placeholder="Slug"
                value={gallerySlug}
                onChange={(e) => setGallerySlug(e.target.value)}
                className="modal-input"
              />
              <input
                type="text"
                placeholder="URL"
                value={galleryUrl}
                onChange={(e) => setGalleryUrl(e.target.value)}
                className="modal-input"
              />

              {editingIndex !== null && galleries[editingIndex]?.svgUrl && (
                <a
                  href={getFileUrl(galleries[editingIndex].svgUrl)}
                  download
                  className={styles.originalLink}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2L3 9h3v8h6v-6h2v6h6V9h3z" />
                  </svg>
                  {galleries[editingIndex].svgUrl.split("/").pop()}
                </a>
              )}

              <div className={styles.passwordRow}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={galleryPassword}
                  onChange={(e) => setGalleryPassword(e.target.value)}
                  className="modal-input"
                />
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                </button>
                <label className={styles.enableLabel}>
                  <input
                    type="checkbox"
                    checked={galleryPasswordEnabled}
                    onChange={(e) => setGalleryPasswordEnabled(e.target.checked)}
                  />
                  Enable
                </label>
              </div>

              <div className={styles.timeoutGroup}>
                <label
                  htmlFor="gallery-timeout"
                  className={`modal-label ${styles.timeoutLabel}`}
                >
                  Password Timeout (minutes)
                </label>
                <div className={styles.timeoutInputRow}>
                  <input
                    id="gallery-timeout"
                    type="number"
                    min={1}
                    value={galleryTimeout}
                    onChange={(e) => setGalleryTimeout(Number(e.target.value))}
                    className={`modal-input ${styles.timeoutInput}`}
                  />
                  <span className={styles.timeoutUnit}>min</span>
                </div>
                <div className={styles.helperText}>How long the password remains valid.</div>
              </div>
            </div>

            {editingIndex === null ? (
              <div className={styles.uploadColumn}>
                <div
                  className={`${styles.dragArea} ${isDragging ? styles.dragging : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {isDragging && <div className={styles.dragOverlay}>Drop file to upload</div>}
                  {selectedFile ? <span>{selectedFile.name}</span> : <span>Click or drag a SVG or PDF file here</span>}
                </div>

                <button
                  className="modal-submit-button uploads"
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      Uploading
                      <span className={`${styles.dotSpinner} ${styles.inlineSpinner}`}>
                        <span />
                        <span />
                        <span />
                      </span>
                    </>
                  ) : (
                    "Upload"
                  )}
                </button>
              </div>
            ) : (
              <button className="modal-submit-button uploads" onClick={handleSaveEdit}>
                Save
              </button>
            )}

            <button
              className="modal-submit-button uploads"
              onClick={() => {
                setEditingIndex(null);
                setShowForm(false);
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* bottom Close button removed — Close/Cancel are available in the form actions when needed */}

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div style={{ marginTop: "10px" }}>Uploading... {uploadProgress}%</div>
        )}

        {isModalDragging && !showForm && editingIndex === null && (
          <div className={styles.modalDropHint}>Drop file to create gallery</div>
        )}
      </div>
    </Modal>
  );
};

export default GalleryModal;
