// LayoutGeneratorPanel.tsx - Floating layout generator panel for slide editor
import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, X, Check, LayoutGrid } from "lucide-react";
import {
  generatePictureFrameLayout,
  type PictureFrameLayoutResult,
  type LayoutMode,
} from "@/dashboard/project/features/slides/lib/pictureFrameLayoutGenerator";
import "./LayoutGeneratorPanel.css";

export interface LayoutGeneratorPanelProps {
  open: boolean;
  onClose: () => void;
  onApply: (count: number, mode: LayoutMode, seed: string) => void;
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
    onApply(count, mode, seed);
    onClose();
  }, [count, mode, seed, onApply, onClose]);

  const handleCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(20, Number(e.target.value) || 1));
    setCount(val);
  }, []);

  const handleModeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(e.target.value as LayoutMode);
  }, []);

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
              {preview.frames.map((frame, i) => (
                <rect
                  key={i}
                  x={frame.x / 10}
                  y={frame.y / 10}
                  width={frame.width / 10}
                  height={frame.height / 10}
                  rx={1.6}
                  fill="rgba(255,255,255,0.15)"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth={0.5}
                />
              ))}
            </svg>
          </div>
        )}

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
    </div>
  );
};

export default LayoutGeneratorPanel;
