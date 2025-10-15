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
import { useData } from "@/app/contexts/useData";
import { S3_PUBLIC_BASE } from "@/shared/utils/api";
import { OPEN_IMAGE_COMMAND } from "../commands";

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
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editor] = useLexicalComposerContext();

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

  const handleFileUpload = async (f: File | null): Promise<string | null> => {
    if (!f || !activeProject?.projectId) return null;

    const key = `projects/${activeProject.projectId}/lexical/${f.name}`;
    setIsUploading(true);

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
    } finally {
      setIsUploading(false);
    }
  };

  const insertImageNode = (src: string, width = 400, height = 300) => {
    editor.update(() => {
      const node = $createResizableImageNode({
        src,
        altText: "Image",
        width,
        height,
        originalAspectRatio: width / height,
      });
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertNodes([node]);
      } else {
        $insertNodes([node]);
      }
    });
  };

  const onAddImage = async () => {
    let src = url.trim();
    if (!src && file) {
      src = (await handleFileUpload(file)) ?? "";
    }

    if (src) {
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
    }

    setFile(null);
    setURL("");
    setIsOpen(false);
  };

  const canSubmit =
    (!!url.trim() || !!file) && !isUploading && !!activeProject?.projectId;

  return (
    <div>
      {showToolbarButton && (
        <button
          aria-label="Add Image"
          type="button"
          style={{
            background: isHovered ? "#eee" : "none",
            border: "none",
            cursor: "pointer",
            padding: "8px",
            borderRadius: "8px",
            transition: "background 0.3s ease",
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setIsOpen(true)}
        >
          <FileImageOutlined style={{ fontSize: 18, color: "#777" }} />
        </button>
      )}

      <input
        type="file"
        ref={inputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const selectedFile = e.target.files?.[0] ?? null;
          if (selectedFile) setFile(selectedFile);
          e.currentTarget.value = "";
        }}
      />

      <ReactModal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(false)}
        style={{
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          },
          content: {
            background: "#0c0c0c",
            padding: "20px",
            borderRadius: "10px",
            width: "400px",
            maxWidth: "90%",
            border: "1px solid white",
            boxShadow: "0 4px 12px rgba(250, 51, 86, 0.3)",
            inset: "unset",
            color: "white",
          },
        }}
        contentLabel="Add Image"
        shouldCloseOnOverlayClick
        shouldCloseOnEsc
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "20px", color: "white" }}>Add Image</h2>
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              fontSize: "20px",
              cursor: "pointer",
              color: "white",
            }}
            onClick={() => setIsOpen(false)}
          >
            &times;
          </button>
        </div>

        <div style={{ marginBottom: "15px" }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setURL(e.target.value)}
            placeholder="Add Image URL"
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "10px",
              border: "1px solid white",
              borderRadius: "5px",
              background: "#1b1b1b",
              color: "white",
            }}
          />
          <button
            type="button"
            style={{
              width: "100%",
              padding: "10px",
              background: "#1b1b1b",
              border: "1px solid white",
              borderRadius: "5px",
              color: "white",
              cursor: "pointer",
            }}
            onClick={() => inputRef.current?.click()}
          >
            {file ? file.name : "Upload Image"}
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={onAddImage}
            disabled={!canSubmit}
            style={{
              flex: 1,
              padding: "10px",
              background: canSubmit ? "#FA3356" : "#555",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: canSubmit ? "pointer" : "not-allowed",
              marginRight: "10px",
            }}
          >
            {isUploading ? "Uploading..." : "Add Image"}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{
              flex: 1,
              padding: "10px",
              background: "transparent",
              border: "1px solid white",
              borderRadius: "5px",
              color: "white",
              cursor: "pointer",
              transition: "border 0.3s ease, color 0.3s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.border =
                "1px solid #FA3356";
              (e.currentTarget as HTMLButtonElement).style.color = "#FA3356";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.border =
                "1px solid white";
              (e.currentTarget as HTMLButtonElement).style.color = "white";
            }}
          >
            Cancel
          </button>
        </div>
      </ReactModal>
    </div>
  );
}









