import React, { useState, useEffect, useCallback } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $insertNodes,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
} from "lexical";
import { $createLinkNode } from "@lexical/link";
import { uploadData } from "aws-amplify/storage";
import { useData } from "@/app/contexts/useData";
import SpinnerOverlay from "@/shared/ui/SpinnerOverlay";
import { S3_PUBLIC_BASE } from "@/shared/utils/api";
import { $createResizableImageNode } from "./nodes/ResizableImageNode";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "svg"] as const;

type ResizableImagePayload = {
  src: string;
  altText?: string;
  width?: number;
  height?: number;
  originalAspectRatio: number;
};

type ProjectLike = { projectId?: string | null } | null;

const isImageFileLike = (file: File): boolean => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return (file.type && file.type.startsWith("image/")) || (ext && IMAGE_EXTENSIONS.includes(ext as (typeof IMAGE_EXTENSIONS)[number]));
};

const encodeS3Key = (key: string = "") =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\+/g, "%20"))
    .join("/");

async function uploadFileToS3(
  file: File,
  projectId: string
): Promise<string | null> {
  const key = `projects/${projectId}/lexical/${file.name}`;
  try {
    await uploadData({
      key,
      data: file,
      options: { accessLevel: "public" },
    });
    const publicKey = key.startsWith("public/") ? key : `public/${key}`;
    return `${S3_PUBLIC_BASE}${encodeS3Key(publicKey)}`;
  } catch (err) {
    console.error("Error uploading file:", err);
    return null;
  }
}

function moveCaretToPoint(editor: LexicalEditor, x: number, y: number) {
  const d = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };

  // Standard-ish (Chrome legacy)
  const range: Range | null =
    typeof d.caretRangeFromPoint === "function"
      ? d.caretRangeFromPoint(x, y)
      : null;

  // Firefox fallback
  const rangeFF: Range | null =
    !range && typeof d.caretPositionFromPoint === "function"
      ? (() => {
          const pos = d.caretPositionFromPoint(x, y);
          if (!pos) return null;
          const r = document.createRange();
          r.setStart(pos.offsetNode, pos.offset);
          return r;
        })()
      : null;

  const finalRange = range ?? rangeFF;
  if (finalRange) {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(finalRange);
    editor.focus();
  }
}

export default function DragAndDropPlugin() {
  const [editor] = useLexicalComposerContext();
  const { activeProject } = useData() as { activeProject: ProjectLike };
  const [isLoading, setIsLoading] = useState(false);

  const processFile = useCallback(
    async (file: File | null, directUrl?: string) => {
      if (!file && !directUrl) return;
      setIsLoading(true);

      let src = directUrl ?? "";

      if (!src && file) {
        const pid = activeProject?.projectId ?? undefined;
        if (!pid) {
          console.warn("No active project ID; inserting as plain link.");
        } else {
          src = (await uploadFileToS3(file, pid)) ?? "";
        }
      }

      if (!src) {
        setIsLoading(false);
        return;
      }

      const insertAsLink = () => {
        // Avoid scheduling updates if the editor is unmounted
        if (!editor.getRootElement()) {
          setIsLoading(false);
          return;
        }

        editor.update(() => {
          const link = $createLinkNode(src);
          if (file) link.append($createTextNode(file.name));
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertNodes([link]);
          } else {
            $insertNodes([link]);
          }
        });
        setIsLoading(false);
      };

      if (file && isImageFileLike(file)) {
        // slight delay for S3/CDN eventual consistency
        setTimeout(() => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            if (!editor.getRootElement()) {
              setIsLoading(false);
              return;
            }

            editor.update(() => {
              const payload: ResizableImagePayload = {
                src,
                altText: file?.name || "Image",
                width: 400,
                height: 300,
                originalAspectRatio: img.naturalWidth / img.naturalHeight,
              };
              const node = $createResizableImageNode(payload);
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.insertNodes([node]);
              } else {
                $insertNodes([node]);
              }
            });
            setIsLoading(false);
          };
          img.onerror = () => {
            console.error("Failed to load image:", src);
            insertAsLink();
          };
        }, 500);
      } else {
        insertAsLink();
      }
    },
    [editor, activeProject]
  );

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();

      // Skip if editor DOM is not available (e.g., unmounted)
      if (!editor.getRootElement()) {
        return;
      }

      moveCaretToPoint(editor, e.clientX, e.clientY);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const f = files[0];
        await processFile(f);
      }
    },
    [editor, processFile]
  );

  useEffect(() => {
    const container = editor.getRootElement();
    if (!container) return;

    const handleDragOver = (e: DragEvent) => e.preventDefault();

    container.addEventListener("drop", onDrop as EventListener);
    container.addEventListener("dragover", handleDragOver as EventListener);

    return () => {
      container.removeEventListener("drop", onDrop as EventListener);
      container.removeEventListener("dragover", handleDragOver as EventListener);
    };
  }, [editor, onDrop]);

  return <>{isLoading && <SpinnerOverlay />}</>;
}









