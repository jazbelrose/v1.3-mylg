// components/SlideToolbar.tsx - Unified toolbar with slide actions and text formatting
import React from "react";
import { Copy, Trash2, Download, Mic, Save, Clock } from "lucide-react";
import ToolbarPlugin from "@/dashboard/project/features/editor/components/Brief/plugins/ToolbarPlugin";
import "./SlideToolbar.css";

// Component that wraps ToolbarPlugin for use within LexicalComposer
const TextFormattingToolbar: React.FC<{ onPreview?: () => void; onSave?: () => void }> = ({ onPreview, onSave }) => (
  <ToolbarPlugin onPreview={onPreview} onSave={onSave} />
);

interface SlideToolbarProps {
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onMicToggle?: () => void;
  onSave?: () => void;
  onPreview?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  isMicActive?: boolean;
  // Current slide size preset (e.g. "1280x720")
  slideSizePreset?: "1280x720" | "1920x1080";
  // Handler to change the slide size preset
  onChangeSlideSize?: (preset: "1280x720" | "1920x1080") => void;
}

const SlideToolbar: React.FC<SlideToolbarProps> = ({
  onDuplicate,
  onDelete,
  onExport,
  onMicToggle,
  onSave,
  onPreview,
  isSaving = false,
  isDirty = false,
  isMicActive = false,
  slideSizePreset = "1280x720",
  onChangeSlideSize,
}) => {

  return (
    <div className="slide-toolbar">
      {/* Save Status */}
      <div className="save-status">
        {isSaving ? (
          <>
            <Clock size={16} />
            <span>Saving...</span>
          </>
        ) : isDirty ? (
          <>
            <span style={{ color: "#ff9800" }}>Unsaved changes</span>
          </>
        ) : (
          <>
            <span style={{ color: "#4caf50" }}>All changes saved</span>
          </>
        )}
      </div>

      {/* Mic Button */}
      {onMicToggle && (
        <button
          onClick={onMicToggle}
          className={`toolbar-item ${isMicActive ? "mic-active" : ""}`}
        >
          <Mic size={16} />
          {isMicActive ? "Stop" : "Mic"}
        </button>
      )}

      {/* Duplicate Button */}
      {onDuplicate && (
        <button
          onClick={onDuplicate}
          className="toolbar-item"
        >
          <Copy size={16} />
          Duplicate
        </button>
      )}

      {/* Delete Button */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="toolbar-item delete"
        >
          <Trash2 size={16} />
          Delete
        </button>
      )}

      {/* Export Button */}
      {onExport && (
        <button
          onClick={onExport}
          className="toolbar-item"
        >
          <Download size={16} />
          Export
        </button>
      )}

      {/* Save Button */}
      {onSave && (
        <button
          onClick={onSave}
          className="toolbar-item save"
          disabled={isSaving}
        >
          <Save size={16} />
          Save
        </button>
      )}

      {/* Slide Size Preset */}
      {onChangeSlideSize && (
        <div className="slide-size-selector">
          <label>Size</label>
          <select
            value={slideSizePreset}
            onChange={(e) => onChangeSlideSize(e.target.value as "1280x720" | "1920x1080")}
          >
            <option value="1280x720">1280 × 720 (16:9)</option>
            <option value="1920x1080">1920 × 1080 (16:9)</option>
          </select>
        </div>
      )}
    </div>
  );
};

export { TextFormattingToolbar };
export default SlideToolbar;
