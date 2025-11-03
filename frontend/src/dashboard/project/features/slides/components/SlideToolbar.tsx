// components/SlideToolbar.tsx - Toolbar with slide actions
import React from "react";
import { Copy, Trash2, Download, Mic, Save, Clock } from "lucide-react";

interface SlideToolbarProps {
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onMicToggle?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  isMicActive?: boolean;
}

const SlideToolbar: React.FC<SlideToolbarProps> = ({
  onDuplicate,
  onDelete,
  onExport,
  onMicToggle,
  onSave,
  isSaving = false,
  isDirty = false,
  isMicActive = false,
}) => {
  const buttonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    backgroundColor: "white",
    border: "1px solid #ddd",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    color: "#333",
    transition: "all 0.2s",
  };

  const handleMouseOver = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = "#f0f0f0";
  };

  const handleMouseOut = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = "white";
  };

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        right: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "8px",
        padding: "12px 16px",
        backgroundColor: "white",
        borderBottom: "1px solid #ddd",
      }}
    >
      {/* Save Status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginRight: "auto",
          fontSize: "13px",
          color: "#666",
        }}
      >
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
          style={{
            ...buttonStyle,
            backgroundColor: isMicActive ? "#ff5252" : "white",
            color: isMicActive ? "white" : "#333",
            borderColor: isMicActive ? "#ff5252" : "#ddd",
          }}
          onMouseOver={(e) => {
            if (!isMicActive) handleMouseOver(e);
          }}
          onMouseOut={(e) => {
            if (!isMicActive) handleMouseOut(e);
          }}
        >
          <Mic size={16} />
          {isMicActive ? "Stop" : "Mic"}
        </button>
      )}

      {/* Duplicate Button */}
      {onDuplicate && (
        <button
          onClick={onDuplicate}
          style={buttonStyle}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
        >
          <Copy size={16} />
          Duplicate
        </button>
      )}

      {/* Delete Button */}
      {onDelete && (
        <button
          onClick={onDelete}
          style={{
            ...buttonStyle,
            color: "#f44336",
            borderColor: "#f44336",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#ffebee";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "white";
          }}
        >
          <Trash2 size={16} />
          Delete
        </button>
      )}

      {/* Export Button */}
      {onExport && (
        <button
          onClick={onExport}
          style={buttonStyle}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
        >
          <Download size={16} />
          Export
        </button>
      )}

      {/* Save Button */}
      {onSave && (
        <button
          onClick={onSave}
          style={{
            ...buttonStyle,
            backgroundColor: "#007bff",
            color: "white",
            borderColor: "#007bff",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#0056b3";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#007bff";
          }}
          disabled={isSaving}
        >
          <Save size={16} />
          Save
        </button>
      )}
    </div>
  );
};

export default SlideToolbar;
