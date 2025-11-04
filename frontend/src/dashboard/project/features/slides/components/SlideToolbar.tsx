// SlideToolbar component - toolbar with slide actions
import React from "react";
import {
  Plus,
  Copy,
  Trash2,
  Download,
  Mic,
  Save,
  CheckCircle,
} from "lucide-react";

interface SlideToolbarProps {
  onNewSlide: () => void;
  onDuplicateSlide: () => void;
  onDeleteSlide: () => void;
  onExport: () => void;
  onMicToggle?: () => void;
  isSaving?: boolean;
  isSaved?: boolean;
  canDelete?: boolean;
}

/**
 * Toolbar component with slide management actions
 */
export const SlideToolbar: React.FC<SlideToolbarProps> = ({
  onNewSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onExport,
  onMicToggle,
  isSaving = false,
  isSaved = true,
  canDelete = true,
}) => {
  return (
    <div className="slide-toolbar">
      <div className="slide-toolbar-group">
        <button
          className="slide-toolbar-btn"
          onClick={onNewSlide}
          title="New Slide"
          aria-label="New Slide"
        >
          <Plus size={20} />
          <span>New</span>
        </button>

        <button
          className="slide-toolbar-btn"
          onClick={onDuplicateSlide}
          title="Duplicate Slide"
          aria-label="Duplicate Slide"
        >
          <Copy size={20} />
          <span>Duplicate</span>
        </button>

        <button
          className="slide-toolbar-btn"
          onClick={onDeleteSlide}
          disabled={!canDelete}
          title={canDelete ? "Delete Slide" : "Cannot delete last slide"}
          aria-label="Delete Slide"
        >
          <Trash2 size={20} />
          <span>Delete</span>
        </button>
      </div>

      <div className="slide-toolbar-group">
        <button
          className="slide-toolbar-btn"
          onClick={onExport}
          title="Export to PDF"
          aria-label="Export to PDF"
        >
          <Download size={20} />
          <span>Export</span>
        </button>

        {onMicToggle && (
          <button
            className="slide-toolbar-btn"
            onClick={onMicToggle}
            title="Voice Input"
            aria-label="Voice Input"
          >
            <Mic size={20} />
            <span>Mic</span>
          </button>
        )}

        <div className="slide-toolbar-status">
          {isSaving ? (
            <>
              <Save size={18} className="animate-pulse" />
              <span>Saving...</span>
            </>
          ) : isSaved ? (
            <>
              <CheckCircle size={18} className="text-green-500" />
              <span>Saved</span>
            </>
          ) : (
            <>
              <Save size={18} />
              <span>Unsaved</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
