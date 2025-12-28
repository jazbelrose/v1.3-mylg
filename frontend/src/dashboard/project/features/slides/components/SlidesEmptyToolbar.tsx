import React from "react";
import { Plus, Upload } from "lucide-react";
import "./SlideToolbar.css";

type SlidesEmptyToolbarProps = {
  onNewSlide?: () => void;
  onImportPdf?: () => void;
  isImportingPdf?: boolean;
  importTitle?: string;
};

const SlidesEmptyToolbar: React.FC<SlidesEmptyToolbarProps> = ({
  onNewSlide,
  onImportPdf,
  isImportingPdf = false,
  importTitle,
}) => {
  return (
    <div className="slide-toolbar">
      <div className="toolbar-left">
        {onNewSlide && (
          <button type="button" className="toolbar-item" onClick={onNewSlide} title="New slide">
            <Plus size={18} />
          </button>
        )}
        {onImportPdf && (
          <button
            type="button"
            className="toolbar-item"
            onClick={onImportPdf}
            disabled={isImportingPdf}
            title={importTitle || (isImportingPdf ? "Importing slides…" : "Import PDF as slides")}
          >
            <Upload size={18} />
          </button>
        )}
      </div>
      <div className="toolbar-right">
        <div className="context-panel">
          <div className="context-hint">Create a slide with “+” to start editing.</div>
        </div>
      </div>
    </div>
  );
};

export default SlidesEmptyToolbar;

