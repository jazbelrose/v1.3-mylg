// LayoutGeneratorPanel.tsx - Floating layout generator panel for slide editor
import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, X, Check, LayoutGrid, ImagePlus, FolderOpen, Upload, Trash2 } from "lucide-react";
import {
  generatePictureFrameLayout,
  type PictureFrameLayoutResult,
  type LayoutMode,
} from "@/dashboard/project/features/slides/lib/pictureFrameLayoutGenerator";
import { FileManager, type FileItem } from "@/dashboard/project/components/FileManager";
import "./LayoutGeneratorPanel.css";

export interface LayoutGeneratorPanelProps {
  open: boolean;
  onClose: () => void;
  onApply: (count: number, mode: LayoutMode, seed: string, images?: string[]) => void;
}

export const LayoutGeneratorPanel: React.FC<LayoutGeneratorPanelProps> = ({
  open,
  onClose,
  onApply,
}) => {
  const [count, setCount] = useState(6);
  const [mode, setMode] = useState<LayoutMode>("grid");
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const [preview, setPreview] = useState<PictureFrameLayoutResult | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generate preview when panel opens or params change
  useEffect(() => {
    if (open) {
      const result = generatePictureFrameLayout(count, {
        mode,
        seed,
        canvasWidth: 1920,
        canvasHeight: 1080,
        margin: { top: 96, right: 120, bottom: 96, left: 120 },
        gutter: 24,
        minFrameWidth: 220,
        minFrameHeight: 160,
      });
      setPreview(result);
    }
  }, [open, count, mode, seed]);

  // Reset seed when opening
  useEffect(() => {
    if (open) {
      setSeed(`${Date.now()}`);
    }
  }, [open]);

  const handleGenerate = useCallback(() => {
    setSeed(`${Date.now()}`);
  }, []);

  const handleApply = useCallback(() => {
    // Pass selected images to onApply - they will be randomly distributed to frames
    onApply(count, mode, seed, selectedImages.length > 0 ? selectedImages : undefined);
    setSelectedImages([]);
    onClose();
  }, [count, mode, seed, selectedImages, onApply, onClose]);

  const handleCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(20, Number(e.target.value) || 1));
    setCount(val);
  }, []);

  const handleModeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(e.target.value as LayoutMode);
  }, []);

  // Handle file selection from computer
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    );

    // Create object URLs for selected files - these are temporary local URLs
    // In a real scenario, we'd upload them to S3 first, but for now we use blob URLs
    const newUrls = imageFiles.map((file) => URL.createObjectURL(file));
    setSelectedImages((prev) => [...prev, ...newUrls]);

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Handle file selection from project files
  const handleProjectFileSelect = useCallback((files: FileItem[]) => {
    const imageFiles = files.filter((f) => {
      const ext = f.fileName.toLowerCase().split(".").pop() || "";
      return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
    });

    const imageUrls = imageFiles.map((f) => f.url);
    setSelectedImages((prev) => [...prev, ...imageUrls]);
    setIsFileManagerOpen(false);
  }, []);

  // Remove a selected image
  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages((prev) => {
      const newImages = [...prev];
      // Revoke blob URL if it's a local file
      if (newImages[index].startsWith("blob:")) {
        URL.revokeObjectURL(newImages[index]);
      }
      newImages.splice(index, 1);
      return newImages;
    });
  }, []);

  // Clear all selected images
  const handleClearImages = useCallback(() => {
    selectedImages.forEach((url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    });
    setSelectedImages([]);
  }, [selectedImages]);

  if (!open) return null;

  return (
    <div className="layout-generator-panel">
      <div className="layout-generator-panel__header">
        <LayoutGrid size={16} />
        <span className="layout-generator-panel__title">Layout Generator</span>
        <button
          type="button"
          className="layout-generator-panel__close"
          onClick={onClose}
          title="Cancel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="layout-generator-panel__body">
        <div className="layout-generator-panel__controls">
          <div className="layout-generator-panel__field">
            <label htmlFor="layout-gen-count">Frames:</label>
            <input
              id="layout-gen-count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={handleCountChange}
              className="layout-generator-panel__input"
            />
          </div>

          <div className="layout-generator-panel__field">
            <label htmlFor="layout-gen-mode">Mode:</label>
            <select
              id="layout-gen-mode"
              value={mode}
              onChange={handleModeChange}
              className="layout-generator-panel__select"
            >
              <option value="grid">Grid</option>
              <option value="masonry">Masonry</option>
            </select>
          </div>
        </div>

        {preview && (
          <div className="layout-generator-panel__preview">
            <svg
              viewBox="0 0 192 108"
              className="layout-generator-panel__preview-svg"
              aria-label={`Preview: ${preview.frames.length} frames`}
            >
              <rect
                x={0}
                y={0}
                width={192}
                height={108}
                fill="rgba(16, 17, 18, 0.8)"
                rx={2}
              />
              {preview.frames.map((frame, i) => {
                // Show selected images in preview frames if available
                const imageUrl = selectedImages[i % selectedImages.length];
                return (
                  <g key={i}>
                    {imageUrl ? (
                      <image
                        href={imageUrl}
                        x={frame.x / 10}
                        y={frame.y / 10}
                        width={frame.width / 10}
                        height={frame.height / 10}
                        preserveAspectRatio="xMidYMid slice"
                        clipPath={`inset(0 round 1.6px)`}
                      />
                    ) : null}
                    <rect
                      x={frame.x / 10}
                      y={frame.y / 10}
                      width={frame.width / 10}
                      height={frame.height / 10}
                      rx={1.6}
                      fill={imageUrl ? "none" : "rgba(255,255,255,0.15)"}
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth={0.5}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Image Selection Section */}
        <div className="layout-generator-panel__images-section">
          <div className="layout-generator-panel__images-header">
            <ImagePlus size={14} />
            <span>Pre-fill with Images</span>
            <span className="layout-generator-panel__images-count">
              {selectedImages.length > 0 ? `(${selectedImages.length})` : "(optional)"}
            </span>
          </div>

          <div className="layout-generator-panel__images-actions">
            <button
              type="button"
              className="layout-generator-panel__btn layout-generator-panel__btn--icon"
              onClick={() => fileInputRef.current?.click()}
              title="Upload images from computer"
            >
              <Upload size={14} />
              <span>Computer</span>
            </button>
            <button
              type="button"
              className="layout-generator-panel__btn layout-generator-panel__btn--icon"
              onClick={() => setIsFileManagerOpen(true)}
              title="Select from project files"
            >
              <FolderOpen size={14} />
              <span>Project</span>
            </button>
            {selectedImages.length > 0 && (
              <button
                type="button"
                className="layout-generator-panel__btn layout-generator-panel__btn--icon layout-generator-panel__btn--danger"
                onClick={handleClearImages}
                title="Clear all images"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {selectedImages.length > 0 && (
            <div className="layout-generator-panel__images-grid">
              {selectedImages.map((url, i) => (
                <div key={i} className="layout-generator-panel__image-thumb">
                  <img src={url} alt={`Selected ${i + 1}`} />
                  <button
                    type="button"
                    className="layout-generator-panel__image-remove"
                    onClick={() => handleRemoveImage(i)}
                    title="Remove image"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="layout-generator-panel__actions">
          <button
            type="button"
            className="layout-generator-panel__btn layout-generator-panel__btn--secondary"
            onClick={handleGenerate}
            title="Re-generate with new random seed"
          >
            <RefreshCw size={14} />
            <span>Regenerate</span>
          </button>

          <button
            type="button"
            className="layout-generator-panel__btn layout-generator-panel__btn--primary"
            onClick={handleApply}
            title="Apply layout to slide"
          >
            <Check size={14} />
            <span>Apply</span>
          </button>
        </div>
      </div>

      {/* Hidden file input for computer uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />

      {/* File manager modal for project files */}
      {isFileManagerOpen && (
        <FileManager
          isOpen={isFileManagerOpen}
          onRequestClose={() => setIsFileManagerOpen(false)}
          onFileSelect={handleProjectFileSelect}
          selectionMode="multi"
          fileTypeFilter="images"
        />
      )}
    </div>
  );
};

export default LayoutGeneratorPanel;
