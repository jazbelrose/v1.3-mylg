import React, { useEffect, useRef, useState } from "react";
import ReactModal from "react-modal";
import { FileImageOutlined } from "@ant-design/icons";
import { uploadData } from "aws-amplify/storage";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
} from "lexical";
import { $createResizableImageNode } from "./nodes/ResizableImageNode";
import { DEFAULT_IMAGE_BORDER_RADIUS } from "./nodes/imageBorderRadius";
import { useData } from "@/app/contexts/useData";
import { S3_PUBLIC_BASE, getFileUrl } from "@/shared/utils/api";
import { OPEN_IMAGE_COMMAND } from "../commands";
import FileManagerComponent, { type FileItem } from "@/dashboard/project/components/FileManager/FileManager";
import { notify } from "@/shared/ui/ToastNotifications";
import styles from "./ImagePlugin.module.css";

type Props = {
  showToolbarButton?: boolean;
};

type ProjectLike = {
  projectId?: string | null;
} | null;

const encodeS3Key = (key: string = "") =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\+/g, "%20"))
    .join("/");

// Bind modal to the app element for accessibility (avoid during SSR)
if (typeof document !== "undefined") {
  ReactModal.setAppElement("#root");
}

export default function ImagePlugin({ showToolbarButton = true }: Props) {
  const { activeProject } = useData() as { activeProject: ProjectLike };
  const [isOpen, setIsOpen] = useState(false);
  const [url, setURL] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [editor] = useLexicalComposerContext();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  // Allow other UI (palette/shortcut) to open the modal
  useEffect(() => {
    const unregister = editor.registerCommand<void>(
      OPEN_IMAGE_COMMAND as LexicalCommand<void>,
      () => {
        setIsOpen(true);
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
    return unregister;
  }, [editor]);

  const handleFileUpload = async (fs: File[]): Promise<string[]> => {
    if (!fs.length || !activeProject?.projectId) return [];

    setIsUploading(true);
    const uploads = fs.map(async (f) => {
      const key = `projects/${activeProject.projectId}/lexical/${f.name}`;
      try {
        const { result } = await uploadData({
          key,
          data: f,
          options: { accessLevel: "public" },
        });
        console.log("Upload completed:", result);
        const publicKey = key.startsWith("public/") ? key : `public/${key}`;
        return `${S3_PUBLIC_BASE}${encodeS3Key(publicKey)}`;
      } catch (error) {
        console.error("Error uploading file:", error);
        return null;
      }
    });

    const results = await Promise.all(uploads);
    setIsUploading(false);
    return results.filter((src): src is string => src !== null);
  };

  const insertImageNode = (src: string, width = 400, height = 300) => {
    editor.update(() => {
      const node = $createResizableImageNode({
        src,
        altText: "Image",
        width,
        height,
        originalAspectRatio: width / height,
        borderRadius: DEFAULT_IMAGE_BORDER_RADIUS,
      });
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertNodes([node]);
      } else {
        $insertNodes([node]);
      }
    });
  };

  const handleFileSelectedFromManager = (selectedFiles: FileItem[]) => {
    selectedFiles.forEach((selectedFile) => {
      const src = getFileUrl(selectedFile.url);
      
      // Validate it's an image
      const extension = selectedFile.fileName.split(".").pop()?.toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(extension || '');
      
      if (!isImage) {
        notify("error", "Only image files can be inserted");
        return;
      }

      // Load image to get dimensions
      const img = new Image();
      img.src = src;

      img.onload = () => {
        insertImageNode(src, img.width || 400, img.height || 300);
      };

      img.onerror = () => {
        console.error("Failed to load image:", src);
        // Still insert as fallback
        insertImageNode(src, 400, 300);
      };
    });
    setIsOpen(false);
  };

  const onAddImage = async () => {
    let srcs: string[] = [];
    if (!url.trim() && files.length) {
      srcs = (await handleFileUpload(files)) ?? [];
    } else if (url.trim()) {
      srcs = [url.trim()];
    }

    srcs.forEach((src) => {
      const img = new Image();
      img.src = src;

      img.onload = () => {
        insertImageNode(src, img.width || 400, img.height || 300);
      };

      img.onerror = () => {
        console.error("Failed to load image:", src);
        editor.update(() => {
          const selection = $getSelection();
          const text = $createTextNode(src);
          if ($isRangeSelection(selection)) {
            selection.insertNodes([text]);
          } else {
            $insertNodes([text]);
          }
        });
      };
    });

    setFiles([]);
    setURL("");
    setIsOpen(false);
  };

  const canSubmit =
    (!!url.trim() || !!files.length) && !isUploading && !!activeProject?.projectId;

  return (
    <div>
      {showToolbarButton && (
        <button
          aria-label="Add Image"
          type="button"
         style={{ background: "none", border: "none", cursor: "pointer", paddingRight: 18 }}
          onClick={() => setIsOpen(true)}
        >
          <FileImageOutlined style={{ fontSize: 18, color: "black" }} />
        </button>
      )}

      <input
        type="file"
        multiple
        ref={inputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const selectedFiles = Array.from(e.target.files || []);
          if (selectedFiles.length) setFiles(selectedFiles);
          e.currentTarget.value = "";
        }}
      />

      <ReactModal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(false)}
        overlayClassName={styles.modalOverlay}
        className={styles.modalContent}
        contentLabel="Add Image"
        shouldCloseOnOverlayClick
        shouldCloseOnEsc
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add Images</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => setIsOpen(false)}
          >
            &times;
          </button>
        </div>

        <div className={styles.formSection}>
          <input
            type="url"
            value={url}
            onChange={(e) => setURL(e.target.value)}
            placeholder="Add Image URL"
            className={styles.urlInput}
          />
          
          <div className={styles.dropdownContainer} ref={dropdownRef}>
            <button
              type="button"
              className={styles.dropdownButton}
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <span>{files.length ? `${files.length} file(s) selected` : "Upload Images"}</span>
              <span className={styles.dropdownArrow}>▾</span>
            </button>
            
            {showDropdown && (
              <div className={styles.dropdownMenu}>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    inputRef.current?.click();
                    setShowDropdown(false);
                  }}
                >
                  Upload from Computer
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setShowDropdown(false);
                    setIsFileManagerOpen(true);
                  }}
                >
                  Choose from Project Files
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={styles.actionButtons}>
          <button
            type="button"
            onClick={onAddImage}
            disabled={!canSubmit}
            className={styles.primaryButton}
          >
            {isUploading ? "Uploading..." : "Add Images"}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className={styles.secondaryButton}
          >
            Cancel
          </button>
        </div>
      </ReactModal>

      {isFileManagerOpen && (
        <FileManagerComponent
          isOpen={isFileManagerOpen}
          onRequestClose={() => setIsFileManagerOpen(false)}
          showTrigger={false}
          folder="uploads"
          selectionMode="multi"
          onFileSelect={handleFileSelectedFromManager}
          fileTypeFilter="images"
        />
      )}
    </div>
  );
}









