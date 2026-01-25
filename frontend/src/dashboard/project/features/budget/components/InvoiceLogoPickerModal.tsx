/**
 * InvoiceLogoPickerModal - Modal for selecting/uploading organization logo
 *
 * Pattern: Matches Project Thumbnail modal UX with two tabs:
 * 1. Organization files (grid of existing images from org files)
 * 2. Upload (drag/drop or click to upload new image)
 *
 * When uploading, the file is saved to org files automatically.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { list as amplifyList } from "aws-amplify/storage";
import { uploadData } from "aws-amplify/storage";
import { Image as ImageIcon, Upload, FolderOpen, Check, X } from "lucide-react";
import { toast } from "react-toastify";

import Modal from "@/shared/ui/ModalWithStack";
import { getFileUrl } from "@/shared/utils/api";
import { useOrg } from "@/app/contexts/useOrg";
import { useFileReferenceTracking } from "@/shared/hooks/useFileReferenceTracking";

import modalStyles from "@/dashboard/home/components/finish-line-component.module.css";
import styles from "./invoice-logo-picker-modal.module.css";

type TabId = "org-files" | "upload";

interface OrgImageFile {
  key: string;
  url: string;
  fileName: string;
  lastModified?: number;
}

interface InvoiceLogoPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLogoUrl: string | null;
  onSelectLogo: (logoKey: string) => void;
  onRemoveLogo: () => void;
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

const isImageFile = (key: string): boolean => {
  const lower = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

const InvoiceLogoPickerModal: React.FC<InvoiceLogoPickerModalProps> = ({
  isOpen,
  onClose,
  currentLogoUrl,
  onSelectLogo,
  onRemoveLogo,
}) => {
  const { activeOrgId, updateOrgBranding } = useOrg();
  const { trackFileUsage } = useFileReferenceTracking();
  const [activeTab, setActiveTab] = useState<TabId>("org-files");
  const [orgImages, setOrgImages] = useState<OrgImageFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedImageKey, setSelectedImageKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load org images when modal opens
  useEffect(() => {
    if (!isOpen || !activeOrgId) return;
    let cancelled = false;

    const loadOrgImages = async () => {
      setIsLoadingFiles(true);
      try {
        const prefix = `orgs/${activeOrgId}/uploads/`;
        const result = await amplifyList({
          path: `public/${prefix}`,
          options: { listAll: true },
        });

        if (cancelled) return;

        const images: OrgImageFile[] = (result.items || [])
          .filter((item) => item.path && isImageFile(item.path))
          .map((item) => {
            const key = item.path || "";
            const fileName = key.split("/").pop() || key;
            return {
              key,
              url: getFileUrl(key),
              fileName,
              lastModified: item.lastModified ? new Date(item.lastModified).getTime() : undefined,
            };
          })
          .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

        setOrgImages(images);
      } catch (error) {
        console.error("Failed to load org images:", error);
        setOrgImages([]);
      } finally {
        if (!cancelled) setIsLoadingFiles(false);
      }
    };

    loadOrgImages();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeOrgId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedImageKey(null);
      setUploadPreview(null);
      setPendingUploadFile(null);
      setActiveTab("org-files");
    }
  }, [isOpen]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setUploadPreview(previewUrl);
    setPendingUploadFile(file);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const previewUrl = URL.createObjectURL(file);
    setUploadPreview(previewUrl);
    setPendingUploadFile(file);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUploadAndSelect = useCallback(async () => {
    if (!pendingUploadFile) {
      toast.error("No file selected");
      return;
    }
    if (!activeOrgId) {
      toast.error("No organization selected");
      return;
    }

    setIsUploading(true);
    try {
      const timestamp = Date.now();
      const safeName = pendingUploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uploadKey = `orgs/${activeOrgId}/uploads/${timestamp}-${safeName}`;

      await uploadData({
        key: uploadKey,
        data: pendingUploadFile,
        options: { accessLevel: "public" },
      });

      const fullKey = uploadKey.startsWith("public/") ? uploadKey : `public/${uploadKey}`;

      // Track file reference for org logo
      const logoUrl = getFileUrl(fullKey);
      trackFileUsage(logoUrl, 'org', activeOrgId, 'logo').catch(() => {
        // Silent fail - don't block logo selection
      });

      // Update org branding (optional, don't block on failure)
      try {
        await updateOrgBranding(activeOrgId, { logoUrl: fullKey });
      } catch (brandingError) {
        console.warn("Failed to save branding to org:", brandingError);
      }

      // Notify parent
      onSelectLogo(fullKey);

      // Cleanup
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
      setUploadPreview(null);
      setPendingUploadFile(null);

      toast.success("Logo uploaded successfully");
      onClose();
    } catch (error) {
      console.error("Failed to upload logo:", error);
      toast.error("Failed to upload logo");
    } finally {
      setIsUploading(false);
    }
  }, [pendingUploadFile, activeOrgId, updateOrgBranding, onSelectLogo, onClose, uploadPreview, trackFileUsage]);

  const handleSelectFromOrgFiles = useCallback(async () => {
    if (!selectedImageKey) {
      toast.error("No image selected");
      return;
    }

    try {
      // Track file reference for org logo (from existing files)
      if (activeOrgId) {
        const logoUrl = getFileUrl(selectedImageKey);
        trackFileUsage(logoUrl, 'org', activeOrgId, 'logo').catch(() => {
          // Silent fail - don't block logo selection
        });
      }

      // Update org branding (optional, don't block on failure)
      if (activeOrgId) {
        try {
          await updateOrgBranding(activeOrgId, { logoUrl: selectedImageKey });
        } catch (brandingError) {
          console.warn("Failed to save branding to org:", brandingError);
        }
      }

      // Notify parent
      onSelectLogo(selectedImageKey);
      toast.success("Logo updated successfully");
      onClose();
    } catch (error) {
      console.error("Failed to select logo:", error);
      toast.error("Failed to select logo");
    }
  }, [selectedImageKey, activeOrgId, updateOrgBranding, onSelectLogo, onClose, trackFileUsage]);

  const handleRemoveLogo = useCallback(async () => {
    try {
      // Update org branding (optional, don't block on failure)
      if (activeOrgId) {
        try {
          await updateOrgBranding(activeOrgId, { logoUrl: null });
        } catch (brandingError) {
          console.warn("Failed to remove branding from org:", brandingError);
        }
      }

      onRemoveLogo();
      toast.success("Logo removed");
      onClose();
    } catch (error) {
      console.error("Failed to remove logo:", error);
      toast.error("Failed to remove logo");
    }
  }, [activeOrgId, updateOrgBranding, onRemoveLogo, onClose]);

  const clearUploadPreview = useCallback(() => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(null);
    setPendingUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadPreview]);

  const canConfirm = useMemo(() => {
    if (activeTab === "upload") return Boolean(pendingUploadFile);
    return Boolean(selectedImageKey);
  }, [activeTab, pendingUploadFile, selectedImageKey]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Choose a Logo"
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
          <h4 className={styles.title}>Choose a Logo</h4>
          <p className={styles.subtitle}>
            Select an existing image from your organization files or upload a new one.
          </p>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "org-files" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("org-files")}
          >
            <FolderOpen size={16} />
            Organization Files
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "upload" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            <Upload size={16} />
            Upload
          </button>
        </div>

        {/* Tab Content */}
        <div className={styles.tabContent}>
          {activeTab === "org-files" && (
            <div className={styles.orgFilesTab}>
              {isLoadingFiles ? (
                <div className={styles.loading}>Loading images...</div>
              ) : orgImages.length === 0 ? (
                <div className={styles.emptyState}>
                  <ImageIcon size={32} />
                  <span>No images found in organization files</span>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setActiveTab("upload")}
                  >
                    Upload an image
                  </button>
                </div>
              ) : (
                <div className={styles.imageGrid}>
                  {orgImages.map((img) => (
                    <button
                      key={img.key}
                      type="button"
                      className={`${styles.imageCard} ${selectedImageKey === img.key ? styles.imageCardSelected : ""}`}
                      onClick={() => setSelectedImageKey(img.key)}
                    >
                      <img src={img.url} alt={img.fileName} className={styles.imagePreview} />
                      {selectedImageKey === img.key && (
                        <div className={styles.selectedBadge}>
                          <Check size={14} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "upload" && (
            <div className={styles.uploadTab}>
              <div
                className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
                onClick={() => !uploadPreview && fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!uploadPreview) fileInputRef.current?.click();
                  }
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  hidden
                />

                {uploadPreview ? (
                  <div className={styles.uploadPreviewWrapper}>
                    <img src={uploadPreview} alt="Upload preview" className={styles.uploadPreviewImage} />
                    <button
                      type="button"
                      className={styles.clearPreviewButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        clearUploadPreview();
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className={styles.placeholder}>
                    <Upload size={32} />
                    <span>Click or drag an image to upload</span>
                  </div>
                )}

                {isDragging && <div className={styles.dragOverlay}>Drop to upload</div>}
                {isUploading && (
                  <div className={styles.uploadOverlay}>
                    <div className="dot-loader">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
              </div>

              <p className={styles.mutedText}>
                Recommended: at least 512×512. PNG with transparency looks best.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {currentLogoUrl && (
              <button type="button" className={styles.removeButton} onClick={handleRemoveLogo}>
                Remove logo
              </button>
            )}
          </div>
          <div className={styles.footerRight}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={activeTab === "upload" ? handleUploadAndSelect : handleSelectFromOrgFiles}
              disabled={!canConfirm || isUploading}
            >
              {isUploading ? "Uploading..." : "Use selected"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default InvoiceLogoPickerModal;
