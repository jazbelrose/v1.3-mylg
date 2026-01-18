import React, { useEffect, useState, useRef, useCallback, useContext } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createNodeSelection,
  $setSelection,
  $getRoot,
  $createParagraphNode,
  $getSelection,
  $isNodeSelection,
  $getNodeByKey,
  type LexicalNode,
  COMMAND_PRIORITY_EDITOR,
} from "lexical";
import { uploadData } from "aws-amplify/storage";

import { INSERT_PICTURE_FRAME_COMMAND, INSERT_PICTURE_FRAME_LAYOUT_COMMAND, INSERT_IMAGE_TO_PICTURE_FRAME_COMMAND, INSERT_IMAGE_FROM_PROJECT_TO_PICTURE_FRAME_COMMAND, type InsertPictureFrameLayoutPayload } from "../commands";
import { $createPictureFrameNode, PictureFrameNode } from "./nodes/PictureFrameNode";
import { generatePictureFrameLayout } from "@/dashboard/project/features/slides/lib/pictureFrameLayoutGenerator";
import { ProjectsContext } from "@/app/contexts/ProjectsContext";
import { FileManagerV2, type FileItem } from "@/dashboard/project/components/FileManager";
import { S3_PUBLIC_BASE } from "@/shared/utils/api";
import { notify } from "@/shared/ui/ToastNotifications";

function clampPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

const encodeS3Key = (key: string = "") =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\+/g, "%20"))
    .join("/");

export default function PictureFramePlugin(): React.ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const projectsCtx = useContext(ProjectsContext);
  const activeProject = projectsCtx?.activeProject ?? null;
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [isFileInputOpen, setIsFileInputOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPictureFrameKeyRef = useRef<string | null>(null);

  const getSelectedPictureFrame = useCallback((): PictureFrameNode | null => {
    let result: PictureFrameNode | null = null;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return;
      const nodes = selection.getNodes();
      const pictureFrame = nodes.find((node): node is PictureFrameNode => node instanceof PictureFrameNode);
      result = pictureFrame || null;
    });
    return result;
  }, [editor]);

  const handleFileUpload = useCallback(async (file: File): Promise<string | null> => {
    const projectId = activeProject?.projectId;
    if (!projectId) return null;

    try {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).slice(2, 8);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const key = `projects/${projectId}/lexical/${timestamp}_${randomId}_${safeName}`;
      
      await uploadData({
        key,
        data: file,
        options: { accessLevel: "public" },
      });
      
      const publicKey = key.startsWith("public/") ? key : `public/${key}`;
      return publicKey;
    } catch (error) {
      console.error("PictureFrame: upload failed", error);
      notify("error", "Failed to upload image");
      return null;
    }
  }, [activeProject?.projectId]);

  const setImageToPictureFrame = useCallback((imageSrc: string) => {
    const frameKey = pendingPictureFrameKeyRef.current;
    if (!frameKey) {
      notify("warning", "No picture frame selected");
      return;
    }

    editor.update(() => {
      const node = $getNodeByKey(frameKey);

      if (node && node instanceof PictureFrameNode) {
        node.setImageSrc(imageSrc);
        notify("success", "Image added to picture frame");
      }
    });

    pendingPictureFrameKeyRef.current = null;
  }, [editor]);

  const handleFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate it's an image
    if (!file.type.startsWith("image/")) {
      notify("error", "Please select an image file");
      return;
    }

    const uploadedKey = await handleFileUpload(file);
    if (uploadedKey) {
      setImageToPictureFrame(uploadedKey);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setIsFileInputOpen(false);
  }, [handleFileUpload, setImageToPictureFrame]);

  const handleProjectFileSelect = useCallback((files: FileItem[]) => {
    const imageFile = files.find((f) => {
      const name = f.fileName || "";
      return /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
    });
    if (!imageFile) {
      notify("warning", "Please select an image file");
      return;
    }

    // The file item should have a url
    const imageUrl = imageFile.url;
    if (imageUrl) {
      setImageToPictureFrame(imageUrl);
    }
    setIsFileManagerOpen(false);
  }, [setImageToPictureFrame]);

  useEffect(() => {
    if (!editor.hasNodes([PictureFrameNode])) {
      throw new Error("PictureFramePlugin: PictureFrameNode not registered on editor");
    }

    return editor.registerCommand(
      INSERT_PICTURE_FRAME_COMMAND,
      () => {
        editor.update(() => {
          const defaultWidth = 320;
          const defaultHeight = 240;
          const countExistingFrames = (node: LexicalNode): number => {
            let count = node instanceof PictureFrameNode ? 1 : 0;
            const maybeChildren = (node as unknown as { getChildren?: () => LexicalNode[] }).getChildren;
            if (typeof maybeChildren === "function") {
              maybeChildren.call(node).forEach((child) => {
                count += countExistingFrames(child);
              });
            }
            return count;
          };

          const existingFrames = countExistingFrames($getRoot());
          const cascade = 28;
          const offset = existingFrames * cascade;

          const defaultX = Math.min((1920 - defaultWidth) / 2 + offset, 1920 - defaultWidth - 24);
          const defaultY = Math.min((1080 - defaultHeight) / 2 + offset, 1080 - defaultHeight - 24);
          const node = $createPictureFrameNode({
            x: defaultX,
            y: defaultY,
            width: defaultWidth,
            height: defaultHeight,
            fit: "cover",
            radius: 16,
            imageSrc: null,
            background: "#2a2c2f",
            border: { enabled: false, width: 2, color: "#ffffff" },
          });

          // Keep picture frames in a paragraph so they serialize/normalize consistently (same as ResizableImageNode).
          const root = $getRoot();
          const last = root.getLastChild();
          if (last && last.getType() === "paragraph") {
            (last as unknown as { append: (...nodes: LexicalNode[]) => void }).append(node);
          } else {
            const paragraph = $createParagraphNode();
            root.append(paragraph);
            paragraph.append(node);
          }

          const nodeSelection = $createNodeSelection();
          nodeSelection.add(node.getKey());
          $setSelection(nodeSelection);
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  useEffect(() => {
    if (!editor.hasNodes([PictureFrameNode])) {
      throw new Error("PictureFramePlugin: PictureFrameNode not registered on editor");
    }

    return editor.registerCommand(
      INSERT_PICTURE_FRAME_LAYOUT_COMMAND,
      (payload: InsertPictureFrameLayoutPayload) => {
        const count = clampPositiveInt(payload?.count, 6);
        const mode = payload?.mode === "masonry" ? "masonry" : "grid";
        const seed = payload?.seed ?? "0";
        const images = payload?.images ?? [];

        editor.update(() => {
          const layout = generatePictureFrameLayout(count, {
            mode,
            seed,
            canvasWidth: 1920,
            canvasHeight: 1080,
            margin: { top: 96, right: 120, bottom: 96, left: 120 },
            gutter: 24,
            minFrameWidth: 220,
            minFrameHeight: 160,
          });

          const nodes = layout.frames.map((frame, index) => {
            // Assign images in a cyclic fashion if images are provided
            const imageSrc = images.length > 0 ? images[index % images.length] : null;
            
            return $createPictureFrameNode({
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
              fit: "cover",
              radius: 16,
              imageSrc,
              background: imageSrc ? "transparent" : "#2a2c2f",
              border: { enabled: false, width: 2, color: "#ffffff" },
            });
          });

          // Keep picture frames in a paragraph so they serialize/normalize consistently.
          const root = $getRoot();
          const last = root.getLastChild();
          if (last && last.getType() === "paragraph") {
            (last as unknown as { append: (...nodes: LexicalNode[]) => void }).append(...nodes);
          } else {
            const paragraph = $createParagraphNode();
            root.append(paragraph);
            paragraph.append(...nodes);
          }

          const selection = $createNodeSelection();
          nodes.forEach((node) => selection.add(node.getKey()));
          $setSelection(selection);
        });

        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  // Command handler for inserting image from computer
  useEffect(() => {
    return editor.registerCommand(
      INSERT_IMAGE_TO_PICTURE_FRAME_COMMAND,
      () => {
        const pictureFrame = getSelectedPictureFrame();
        if (!pictureFrame) {
          notify("warning", "Please select a picture frame first");
          return true;
        }
        pendingPictureFrameKeyRef.current = pictureFrame.getKey();
        fileInputRef.current?.click();
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor, getSelectedPictureFrame]);

  // Command handler for inserting image from project files
  useEffect(() => {
    return editor.registerCommand(
      INSERT_IMAGE_FROM_PROJECT_TO_PICTURE_FRAME_COMMAND,
      () => {
        const pictureFrame = getSelectedPictureFrame();
        if (!pictureFrame) {
          notify("warning", "Please select a picture frame first");
          return true;
        }
        pendingPictureFrameKeyRef.current = pictureFrame.getKey();
        setIsFileManagerOpen(true);
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor, getSelectedPictureFrame]);

  useEffect(() => {
    // Migration/normalization: older docs may have picture frames attached directly to the root.
    // Move them into a paragraph so they persist and thumbnail rendering can find them reliably.
    return editor.registerNodeTransform(PictureFrameNode, (node) => {
      const parent = node.getParent();
      if (!parent) return;
      if (parent.getType() !== "root") return;

      const paragraph = $createParagraphNode();
      node.insertBefore(paragraph);
      paragraph.append(node);
    });
  }, [editor]);

  return (
    <>
      {/* Hidden file input for computer file selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />

      {/* File manager modal for project file selection */}
      {isFileManagerOpen && (
        <FileManagerV2
          isOpen={isFileManagerOpen}
          onRequestClose={() => {
            setIsFileManagerOpen(false);
            pendingPictureFrameKeyRef.current = null;
          }}
          onFileSelect={handleProjectFileSelect}
          folder="uploads"
          selectionMode="single"
          fileTypeFilter="images"
        />
      )}
    </>
  );
}
