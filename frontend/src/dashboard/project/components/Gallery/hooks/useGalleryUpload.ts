import {
  ChangeEventHandler,
  Dispatch,
  DragEventHandler,
  MutableRefObject,
  SetStateAction,
  useState,
} from "react";
import { toast } from "react-toastify";

import { GALLERY_UPLOAD_URL, apiFetch } from "@/shared/utils/api";
import { slugify } from "@/shared/utils/slug";
import { Gallery } from "../types";
import { getUniqueSlug } from "../GalleryUtils";

interface GalleryUploadParams {
  activeProjectId?: string;
  galleries: Gallery[];
  setGalleries: Dispatch<SetStateAction<Gallery[]>>;
  legacyGalleries: Gallery[];
  pendingSlugs: string[];
  setPendingSlugs: Dispatch<SetStateAction<string[]>>;
  galleryName: string;
  setGalleryName: Dispatch<SetStateAction<string>>;
  gallerySlug: string;
  setGallerySlug: Dispatch<SetStateAction<string>>;
  galleryPassword: string;
  galleryPasswordEnabled: boolean;
  galleryTimeout: number;
  setGalleryPassword: Dispatch<SetStateAction<string>>;
  setShowPassword: Dispatch<SetStateAction<boolean>>;
  setGalleryPasswordEnabled: Dispatch<SetStateAction<boolean>>;
  setGalleryTimeout: Dispatch<SetStateAction<number>>;
  setShowForm: Dispatch<SetStateAction<boolean>>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
}

const useGalleryUpload = ({
  activeProjectId,
  galleries,
  setGalleries,
  legacyGalleries,
  pendingSlugs,
  setPendingSlugs,
  galleryName,
  setGalleryName,
  gallerySlug,
  setGallerySlug,
  galleryPassword,
  galleryPasswordEnabled,
  galleryTimeout,
  setGalleryPassword,
  setShowPassword,
  setGalleryPasswordEnabled,
  setGalleryTimeout,
  setShowForm,
  fileInputRef,
}: GalleryUploadParams) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const addFile = (file: File | null) => {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    const allowed = ["svg", "pdf"];
    if (!ext || !allowed.includes(ext)) {
      toast.error("Only SVG or PDF files are allowed");
      return;
    }
    setSelectedFile(file);
    if (!galleryName) setGalleryName(file.name);
    if (!gallerySlug) setGallerySlug(slugify(file.name));
  };

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] || null;
    addFile(file);
  };

  const handleDragOver: DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave: DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop: DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] || null;
    addFile(file);
  };

  const uploadGalleryFile = async (
    file: File,
    name: string,
    slug: string,
    password: string,
    enabled: boolean,
    timeoutMs: number,
    onProgress?: (pct: number) => void
  ) => {
    const guessedContentType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/svg+xml');

    const presignRes = await apiFetch<{ uploadUrl: string; key: string }>(GALLERY_UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: activeProjectId,
        fileName: file.name,
        contentType: guessedContentType,
        galleryName: name || file.name,
        gallerySlug: slug || undefined,
        galleryPassword: password || undefined,
        passwordEnabled: enabled,
        passwordTimeout: timeoutMs,
      }),
    });

  const { uploadUrl } = presignRes;
  console.debug("[useGalleryUpload] presign response:", presignRes);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", isPdf ? "application/pdf" : "image/svg+xml");
  // NOTE: metadata (x-amz-meta-*) is included in the presigned URL by the server's signer.
  // Sending metadata headers here can cause signature mismatches or CORS preflight failures,
  // so we rely on the presigned URL and avoid sending x-amz-meta-* headers.
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed with status ${xhr.status}`));
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(file);
    });
  };

  const resetForm = () => {
    setSelectedFile(null);
    setGalleryName("");
    setGallerySlug("");
    setGalleryPassword("");
    setShowPassword(false);
    setGalleryPasswordEnabled(false);
    setGalleryTimeout(15);
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!selectedFile || !activeProjectId) return;

    setUploadProgress(0);
    setUploading(true);

    const baseName = galleryName || selectedFile.name;
    const baseSlug = gallerySlug || slugify(baseName);
    const { slug: uniqueSlug, count } = getUniqueSlug(baseSlug, galleries, legacyGalleries, pendingSlugs);
    const uniqueName = count > 0 ? `${baseName} ${count}` : baseName;
    setGalleryName(uniqueName);
    setGallerySlug(uniqueSlug);

    const optimisticId = Date.now() + "-" + Math.random().toString(36).slice(2);
    const optimisticGallery: Gallery = {
      name: uniqueName,
      slug: uniqueSlug,
      optimisticId,
      uploading: true,
      processing: false,
      progress: 0,
    };

    setGalleries((prev) => [...prev, optimisticGallery]);
    setPendingSlugs((prev) => [...prev, optimisticGallery.slug!]);

    const tryUpload = async (name: string, slug: string) => {
      await uploadGalleryFile(
        selectedFile,
        name,
        slug,
        galleryPassword,
        galleryPasswordEnabled,
        galleryTimeout * 60 * 1000,
        (pct) =>
          setGalleries((prev) =>
            prev.map((g) => (g.optimisticId === optimisticId ? { ...g, progress: pct } : g))
          )
      );
      setGalleries((prev) =>
        prev.map((g) =>
          g.optimisticId === optimisticId
            ? { ...g, uploading: false, processing: true, progress: 100 }
            : g
        )
      );
      resetForm();
    };

    try {
      await tryUpload(uniqueName, uniqueSlug);
    } catch (err: unknown) {
      if (String((err as Error)?.message || "").includes("409")) {
        try {
          const { slug: retrySlug, count: retryCount } = getUniqueSlug(
            baseSlug,
            [...galleries, { slug: uniqueSlug } as Gallery],
            legacyGalleries,
            pendingSlugs
          );
          const retryName = retryCount > 0 ? `${baseName} ${retryCount}` : baseName;
          setGallerySlug(retrySlug);
          setGalleryName(retryName);
          setPendingSlugs((prev) => prev.map((s) => (s === uniqueSlug ? retrySlug : s)));
          setGalleries((prev) =>
            prev.map((g) =>
              g.optimisticId === optimisticId ? { ...g, slug: retrySlug, name: retryName } : g
            )
          );
          await tryUpload(retryName, retrySlug);
        } catch (err2) {
          console.error("Gallery upload failed:", err2);
          setGalleries((prev) => prev.filter((g) => g.optimisticId !== optimisticId));
        }
      } else {
        console.error("Gallery upload failed:", err);
        setGalleries((prev) => prev.filter((g) => g.optimisticId !== optimisticId));
      }
    } finally {
      setUploadProgress(0);
      setUploading(false);
    }
  };

  return {
    selectedFile,
    setSelectedFile,
    uploadProgress,
    setUploadProgress,
    uploading,
    setUploading,
    isDragging,
    setIsDragging,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleUpload,
    addFile,
  };
};

export default useGalleryUpload;
