import Cropper from "react-easy-crop";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { Image as ImageIcon, Pipette, Trash } from "lucide-react";

import type { Project } from "@/app/contexts/DataProvider";
import { generateSequentialPalette } from "@/shared/utils/colorUtils";
import Modal from "@/shared/ui/ModalWithStack";

import styles from "./project-settings-modal.module.css";

import type {
  ColorModalState,
  DeleteConfirmationModalState,
  EditNameModalState,
  InvoiceInfoModalState,
  SettingsModalState,
  ThumbnailModalState,
} from "../projectHeaderTypes";

interface SettingsModalProps {
  modal: SettingsModalState;
  project: Project | null;
  editNameModal: EditNameModalState;
  thumbnailModal: ThumbnailModalState;
  colorModal: ColorModalState;
  invoiceInfoModal: InvoiceInfoModalState;
  deleteModal: DeleteConfirmationModalState;
  isAdmin: boolean;
  getFileUrlForThumbnail: (thumbnail: string) => string;
}

const DEFAULT_ACCENT = "#6e7bff";
const DEFAULT_ACCENT_RGB = "110, 123, 255";

const SettingsModal = ({
  modal,
  project,
  editNameModal,
  thumbnailModal,
  colorModal,
  invoiceInfoModal,
  deleteModal,
  isAdmin,
  getFileUrlForThumbnail,
}: SettingsModalProps) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const resolvedProjectColor = useMemo(() => {
    const color = (project?.color as string | undefined) || "";
    return color && color.trim() ? color : DEFAULT_ACCENT;
  }, [project?.color]);

  useEffect(() => {
    if (!modal.isOpen) return;

    const currentName = project?.title || "";
    if (editNameModal.updatedName !== currentName) {
      editNameModal.setUpdatedName(currentName);
    }

    const invoiceDefaults: InvoiceInfoModalState["fields"] = {
      invoiceBrandName: String(project?.invoiceBrandName ?? ""),
      invoiceBrandAddress: String(project?.invoiceBrandAddress ?? ""),
      invoiceBrandPhone: String(project?.invoiceBrandPhone ?? ""),
      clientName: String(project?.clientName ?? ""),
      clientAddress: String(project?.clientAddress ?? ""),
      clientPhone: String(project?.clientPhone ?? ""),
      clientEmail: String(project?.clientEmail ?? ""),
    };

    (Object.keys(invoiceDefaults) as Array<keyof InvoiceInfoModalState["fields"]>).forEach((key) => {
      const desired = invoiceDefaults[key];
      if (invoiceInfoModal.fields[key] !== desired) {
        invoiceInfoModal.setField(key, desired);
      }
    });

    if (colorModal.selectedColor !== resolvedProjectColor) {
      colorModal.setSelectedColor(resolvedProjectColor);
    }

    setIsConfirmingDelete(false);
  }, [
    modal.isOpen,
    project?.title,
    project?.invoiceBrandName,
    project?.invoiceBrandAddress,
    project?.invoiceBrandPhone,
    project?.clientName,
    project?.clientAddress,
    project?.clientPhone,
    project?.clientEmail,
    editNameModal,
    invoiceInfoModal,
    colorModal,
    resolvedProjectColor,
  ]);

  const accentStyles = useMemo(() => {
    const source = colorModal.selectedColor || resolvedProjectColor;
    const palette = generateSequentialPalette(source, 3);
    const start = palette[0] ?? source;
    const end = palette[palette.length - 1] ?? source;

    const rgbFromHex = (hex: string) => {
      const normalized = hex.replace("#", "");
      const value = parseInt(normalized, 16);
      const r = (value >> 16) & 255;
      const g = (value >> 8) & 255;
      const b = value & 255;
      return `${r}, ${g}, ${b}`;
    };

    const accentRgb = palette[1] ? rgbFromHex(palette[1] as string) : DEFAULT_ACCENT_RGB;

    return {
      "--settings-accent": source,
      "--settings-accent-rgb": accentRgb,
      "--settings-accent-gradient-start": start,
      "--settings-accent-gradient-end": end,
      "--settings-shadow-rgb": rgbFromHex(end),
    } as CSSProperties;
  }, [colorModal.selectedColor, resolvedProjectColor]);

  const handleDropzoneClick = useCallback(() => {
    thumbnailModal.fileInputRef.current?.click();
  }, [thumbnailModal.fileInputRef]);

  const currentThumbnailKey = (project?.thumbnails?.[0] as string | undefined) || "";
  const currentThumbnailUrl = useMemo(() => {
    if (!currentThumbnailKey) return "";
    try {
      return getFileUrlForThumbnail(currentThumbnailKey);
    } catch (error) {
      console.error("Failed to resolve thumbnail url", error);
      return "";
    }
  }, [currentThumbnailKey, getFileUrlForThumbnail]);

  const baseProjectName = project?.title || "";
  const isNameDirty = editNameModal.updatedName.trim() !== baseProjectName.trim();

  const baseColor = resolvedProjectColor.toLowerCase();
  const selectedColor = (colorModal.selectedColor || resolvedProjectColor).toLowerCase();
  const isColorDirty = baseColor !== selectedColor;

  const handleResetColor = useCallback(() => {
    colorModal.setSelectedColor(resolvedProjectColor);
  }, [colorModal, resolvedProjectColor]);

  const handleResetName = useCallback(() => {
    editNameModal.setUpdatedName(baseProjectName);
  }, [editNameModal, baseProjectName]);

  const handleConfirmDelete = useCallback(async () => {
    if (!isAdmin || isDeleting) return;
    try {
      setIsDeleting(true);
      await deleteModal.confirm();
      modal.close();
    } catch (error) {
      console.error("Failed to delete project", error);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteModal, modal, isAdmin, isDeleting]);

  const handleClose = useCallback(() => {
    modal.close();
  }, [modal]);

  return (
    <Modal
      isOpen={modal.isOpen}
      onRequestClose={handleClose}
      contentLabel="Project Settings"
      closeTimeoutMS={300}
      className={{ base: "", afterOpen: "", beforeClose: "" }}
      overlayClassName={{
        base: styles.overlay,
        afterOpen: styles.overlay,
        beforeClose: styles.overlay,
      }}
    >
      <div className={styles.modal} style={accentStyles}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>Project Settings</h2>
            <p className={styles.subtitle}>
              Fine-tune your project details, branding, billing preferences, and administrative actions in one place.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={handleClose} aria-label="Close settings">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>

        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Project Identity</h3>
              <p className={styles.sectionDescription}>
                Update the project name and thumbnail that appear across dashboards and shared views.
              </p>
            </div>

            <div className={styles.identityGrid}>
              <form className={styles.inlineForm} onSubmit={editNameModal.submit}>
                <label>
                  <span className={styles.sectionDescription}>Project name</span>
                  <input
                    className={styles.textInput}
                    type="text"
                    value={editNameModal.updatedName}
                    onChange={(event) => editNameModal.setUpdatedName(event.target.value)}
                    placeholder="Project name"
                  />
                </label>
                <div className={styles.actionsRow}>
                  <button className={styles.primaryButton} type="submit" disabled={!isNameDirty}>
                    Save name
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={handleResetName} disabled={!isNameDirty}>
                    Reset
                  </button>
                </div>
              </form>

              <div className={styles.thumbnailSection}>
                <div
                  role="button"
                  tabIndex={0}
                  className={`${styles.thumbnailDropzone} ${
                    thumbnailModal.isDragging ? styles.thumbnailDropzoneActive : ""
                }`}
                onClick={handleDropzoneClick}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleDropzoneClick();
                  }
                }}
                onDragOver={thumbnailModal.onDragOver}
                onDragLeave={thumbnailModal.onDragLeave}
                onDrop={thumbnailModal.onDrop}
              >
                <input
                  type="file"
                  accept="image/*"
                  ref={thumbnailModal.fileInputRef}
                  style={{ display: "none" }}
                  onChange={thumbnailModal.onFileChange}
                />
                {thumbnailModal.preview ? (
                  <div className={styles.thumbnailCropper}>
                    <Cropper
                      image={thumbnailModal.preview}
                      crop={thumbnailModal.crop}
                      zoom={thumbnailModal.zoom}
                      aspect={1}
                      onCropChange={thumbnailModal.onCropChange}
                      onZoomChange={thumbnailModal.onZoomChange}
                      onCropComplete={(_, area) => thumbnailModal.onCropComplete(area)}
                      objectFit="cover"
                    />
                  </div>
                ) : currentThumbnailUrl ? (
                  <img
                    src={currentThumbnailUrl}
                    alt="Current project thumbnail"
                    className={styles.thumbnailPreviewImage}
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                    <ImageIcon size={32} aria-hidden="true" />
                    <span>Click or drag an image to upload</span>
                  </div>
                )}

                {thumbnailModal.isDragging && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(10, 10, 12, 0.65)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#f7f8fc",
                    }}
                  >
                    Drop to upload
                  </div>
                )}

                {thumbnailModal.isUploading && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(10, 10, 12, 0.65)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div className="dot-loader">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
              </div>

              {thumbnailModal.preview ? (
                <div className={styles.thumbnailControls}>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={thumbnailModal.zoom}
                    onChange={(event) => thumbnailModal.onZoomChange(parseFloat(event.target.value))}
                    className={styles.rangeInput}
                  />
                  <div className={styles.actionsRow}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={thumbnailModal.upload}
                      disabled={thumbnailModal.isUploading || !thumbnailModal.preview}
                    >
                      Save thumbnail
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={thumbnailModal.remove}
                      disabled={thumbnailModal.isUploading}
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
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Branding Color</h3>
              <p className={styles.sectionDescription}>
                Align the project accent color with your brand palette. Preview updates instantly before saving.
              </p>
            </div>

            <div className={styles.colorSection}>
              <HexColorPicker color={colorModal.selectedColor || resolvedProjectColor} onChange={colorModal.setSelectedColor} />
              <div className={styles.colorInputs}>
                <HexColorInput
                  prefixed
                  color={colorModal.selectedColor || resolvedProjectColor}
                  onChange={colorModal.setSelectedColor}
                  className={styles.textInput}
                />
                <div className={styles.rgbText}>
                  RGB: {colorModal.hexToRgb(colorModal.selectedColor || resolvedProjectColor)}
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={colorModal.pickColorFromScreen}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <Pipette size={18} /> Pick from screen
                  </span>
                </button>
              </div>
              <div className={styles.actionsRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={colorModal.save}
                  disabled={!isColorDirty}
                >
                  Save color
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleResetColor}
                  disabled={!isColorDirty}
                >
                  Reset
                </button>
              </div>
            </div>
          </section>

          {isAdmin && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Danger Zone</h3>
                <p className={styles.sectionDescription}>
                  Permanently delete this project and all associated data. This action cannot be undone.
                </p>
              </div>
              {!isConfirmingDelete ? (
                <button
                  type="button"
                  className={styles.destructiveButton}
                  onClick={() => setIsConfirmingDelete(true)}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <Trash size={18} /> Delete project
                  </span>
                </button>
              ) : (
                <div className={styles.deleteConfirm}>
                  <button
                    type="button"
                    className={styles.destructiveButton}
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting…" : "Yes, delete project"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!isDeleting) setIsConfirmingDelete(false);
                    }}
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
        <div className={styles.footerShadow} aria-hidden="true" />
      </div>
    </Modal>
  );
};

export default SettingsModal;
