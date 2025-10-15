import { useCallback, useEffect, useRef, useState } from "react";
import { uploadData } from "aws-amplify/storage";
import { Area } from "react-easy-crop";

import type { Project } from "@/app/contexts/DataProvider";

import type { ThumbnailModalState } from "../projectHeaderTypes";

interface ThumbnailModalConfig {
  activeProject: Project | null;
  localProject: Project;
  setLocalProject: (project: Project) => void;
  queueUpdate: (payload: Partial<Project>) => Promise<void>;
  onActiveProjectChange?: (project: Project) => void;
  setActiveProject: (project: Project) => void;
  notifyUpdate: (fields: Partial<Project>) => void;
  onReturnToSettings: () => void;
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    img.src = url;
  });
}

async function getCroppedImg(imageSrc: string, cropArea: Area, type = "image/jpeg") {
  const img = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = cropArea.width;
  canvas.height = cropArea.height;
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
    cropArea.width,
    cropArea.height
  );
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob as Blob), type);
  });
}

export function useThumbnailModal({
  activeProject,
  localProject,
  setLocalProject,
  queueUpdate,
  onActiveProjectChange,
  setActiveProject,
  notifyUpdate,
  onReturnToSettings,
}: ThumbnailModalConfig): ThumbnailModalState {
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [returnToSettings, setReturnToSettings] = useState(false);

  useEffect(() => {
    if (isOpen && preview) {
      const id = setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 50);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [isOpen, preview]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const open = (fromSettings = false) => {
    setReturnToSettings(fromSettings);
    setIsOpen(true);
  };

  const close = useCallback(() => {
    setIsOpen(false);
    if (returnToSettings) {
      setReturnToSettings(false);
      onReturnToSettings();
    }
  }, [returnToSettings, onReturnToSettings]);

  const onFileChange: ThumbnailModalState["onFileChange"] = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const previewURL = URL.createObjectURL(file);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(previewURL);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  };

  const onDragOver: ThumbnailModalState["onDragOver"] = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave: ThumbnailModalState["onDragLeave"] = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const onDrop: ThumbnailModalState["onDrop"] = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      const previewURL = URL.createObjectURL(file);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(previewURL);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  };

  const remove = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedFile(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const upload = useCallback(async () => {
    if (!selectedFile || !activeProject) return;
    try {
      setIsUploading(true);
      const croppedBlob =
        croppedAreaPixels && preview
          ? await getCroppedImg(preview, croppedAreaPixels, selectedFile.type)
          : selectedFile;

      const baseKey = `project-thumbnails/${activeProject.projectId}/${selectedFile.name}`;
      await uploadData({
        key: baseKey,
        data: croppedBlob,
        options: { accessLevel: "public" },
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const fullKey = `public/${baseKey}`;

      const updatedProject: Project = {
        ...localProject,
        thumbnails: Array.from(new Set([fullKey, ...(localProject.thumbnails || [])])),
      };
      setLocalProject(updatedProject);
      onActiveProjectChange?.(updatedProject);
      setActiveProject(updatedProject);

      await queueUpdate({ thumbnails: [fullKey] });
      notifyUpdate({ thumbnails: [fullKey] });
    } catch (error) {
      console.error("Error uploading thumbnail:", error);
    } finally {
      setIsUploading(false);
      close();
    }
  }, [
    selectedFile,
    activeProject,
    croppedAreaPixels,
    preview,
    localProject,
    setLocalProject,
    onActiveProjectChange,
    setActiveProject,
    queueUpdate,
    notifyUpdate,
    close,
  ]);

  return {
    isOpen,
    preview,
    isDragging,
    isUploading,
    crop,
    zoom,
    onCropChange: setCrop,
    onZoomChange: setZoom,
    onCropComplete: (area: Area) => setCroppedAreaPixels(area),
    fileInputRef,
    open,
    close,
    onFileChange,
    onDragOver,
    onDragLeave,
    onDrop,
    remove,
    upload,
    setPreview,
  };
}
