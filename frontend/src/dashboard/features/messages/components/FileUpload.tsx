import React from "react";
import { FileUploadProps } from "../types";

const FileUpload: React.FC<FileUploadProps> = ({
  isDragging,
  children,
  onDrop,
  onDragOver,
  onDragLeave,
  setIsDragging,
}) => {
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    onDragOver(e);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    onDragLeave(e);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    onDrop(e);
  };

  return (
    <div
      className={`chat-window ${isDragging ? "dragging" : ""}`}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "15px",
        position: "relative",
        height: "100%",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && <div className="drag-overlay">Drop files to upload</div>}
    </div>
  );
};

export default FileUpload;








