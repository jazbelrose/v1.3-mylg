import React from "react";
import Cropper, { type Area } from "react-easy-crop";
import { uploadData } from "aws-amplify/storage";
import { toast } from "react-toastify";

import Modal from "@/shared/ui/ModalWithStack";
import styles from "./avatarPickerModal.module.css";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

export type AvatarPickerResult = {
  key: string;
  previewUrl: string;
};

export type AvatarPickerModalProps = {
  open: boolean;
  onClose: () => void;
  userId: string;
  onSaved: (result: AvatarPickerResult) => void;
  canRemove?: boolean;
  onRemove?: () => void;
};

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    img.src = url;
  });
}

async function cropToSquare512(imageSrc: string, cropArea: Area, mimeType = "image/jpeg"): Promise<Blob> {
  const img = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(
    img,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Could not generate image blob"));
        else resolve(blob);
      },
      mimeType,
      mimeType === "image/jpeg" ? 0.92 : undefined
    );
  });
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function isSupportedImage(file: File): boolean {
  return file.type.startsWith("image/");
}

export default function AvatarPickerModal({ open, onClose, userId, onSaved, canRemove, onRemove }: AvatarPickerModalProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [miniPreview, setMiniPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (miniPreview) URL.revokeObjectURL(miniPreview);
    setMiniPreview(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsDragging(false);
    setIsUploading(false);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (miniPreview) URL.revokeObjectURL(miniPreview);
    };
  }, [miniPreview, previewUrl]);

  const setFile = React.useCallback(
    (file: File) => {
      if (!isSupportedImage(file)) {
        toast.error("Please choose an image file.");
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (miniPreview) URL.revokeObjectURL(miniPreview);
      setMiniPreview(null);
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    },
    [miniPreview, previewUrl]
  );

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (file) setFile(file);
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setFile(file);
  };

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  React.useEffect(() => {
    let cancelled = false;
    if (!previewUrl || !croppedAreaPixels) return;
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const blob = await cropToSquare512(previewUrl, croppedAreaPixels, "image/jpeg");
          if (cancelled) return;
          const nextUrl = URL.createObjectURL(blob);
          setMiniPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return nextUrl;
          });
        } catch {
          // ignore preview failures
        }
      })();
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [croppedAreaPixels, previewUrl]);

  const canSave = Boolean(selectedFile && previewUrl && !isUploading);

  const save = async () => {
    if (!selectedFile || !previewUrl) return;
    let progressTimer: number | null = null;
    try {
      setIsUploading(true);
      setProgress(0);

      progressTimer = window.setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + Math.max(1, Math.round((90 - p) / 8))));
      }, 120);

      const croppedBlob =
        croppedAreaPixels && previewUrl ? await cropToSquare512(previewUrl, croppedAreaPixels, "image/jpeg") : selectedFile;

      const filename = `userData-thumbnails/${userId}/avatar_${Date.now()}_${randomId()}.jpg`;
      const uploadTask = uploadData({
        key: filename,
        data: croppedBlob,
        options: { accessLevel: "guest", contentType: "image/jpeg" },
      });
      await uploadTask.result;

      if (progressTimer) window.clearInterval(progressTimer);
      setProgress(100);

      const localCroppedUrl = URL.createObjectURL(croppedBlob);
      onSaved({ key: filename, previewUrl: localCroppedUrl });
      toast.success("Photo updated.");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Couldn’t upload. Try again.");
      setProgress(0);
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      setIsUploading(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onRequestClose={() => {
        if (isUploading) return;
        onClose();
      }}
      contentLabel="Choose avatar"
      closeTimeoutMS={200}
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
    >
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Change photo</div>
          <div className={styles.subtitle}>Upload and crop a square avatar.</div>
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close" disabled={isUploading}>
          ×
        </button>
      </div>

      <div className={styles.body}>
        {!previewUrl ? (
          <div
            className={[styles.dropZone, isDragging ? styles.dropZoneDragging : ""].filter(Boolean).join(" ")}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className={styles.dropTitle}>Drag & drop an image</div>
            <div className={styles.dropHint}>or</div>
            <button type="button" className={styles.secondaryButton} onClick={onPickFile}>
              Upload image
            </button>
            <div className={styles.note}>Recommended 512×512+. Square images look best.</div>
          </div>
        ) : (
          <div className={styles.cropLayout}>
            <div className={styles.cropArea}>
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
              />
            </div>

            <div className={styles.side}>
              <div className={styles.previewSquircle} aria-label="Preview">
                {miniPreview ? <img src={miniPreview} alt="" /> : null}
              </div>

              <label className={styles.sliderRow}>
                <span>Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>

              <div className={styles.sideActions}>
                <button type="button" className={styles.secondaryButton} onClick={onPickFile} disabled={isUploading}>
                  Choose another
                </button>
                <button type="button" className={styles.secondaryButton} onClick={reset} disabled={isUploading}>
                  Reset
                </button>
              </div>

              {isUploading ? (
                <div className={styles.progressWrap} aria-label="Uploading">
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                  </div>
                  <div className={styles.progressLabel}>Uploading… {progress}%</div>
                </div>
              ) : null}
            </div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className={styles.hiddenInput} />
      </div>

      <div className={styles.footer}>
        {canRemove && onRemove ? (
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => {
              if (isUploading) return;
              onRemove();
              onClose();
            }}
            disabled={isUploading}
          >
            Remove photo
          </button>
        ) : null}
        <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={isUploading}>
          Cancel
        </button>
        <button type="button" className={styles.primaryButton} onClick={() => void save()} disabled={!canSave}>
          {isUploading ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
