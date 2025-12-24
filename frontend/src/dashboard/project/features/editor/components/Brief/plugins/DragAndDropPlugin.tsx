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
import { notify } from "@/shared/ui/ToastNotifications";
import { $createResizableImageNode } from "./nodes/ResizableImageNode";
import { $createSvgNode } from "./nodes/SvgNodeUtils";
import {
  DEFAULT_IMAGE_BORDER_RADIUS,
  type ImageBorderRadiusState,
} from "./nodes/imageBorderRadius";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "svg"] as const;
const DEFAULT_IMAGE_WIDTH = 400;
const DEFAULT_IMAGE_HEIGHT = 300;
const DEFAULT_IMAGE_RATIO = DEFAULT_IMAGE_WIDTH / DEFAULT_IMAGE_HEIGHT;
const DEFAULT_SVG_WIDTH = 300;
const DEFAULT_SVG_HEIGHT = 200;

type ResizableImagePayload = {
  src: string;
  altText?: string;
  width?: number;
  height?: number;
  originalAspectRatio: number;
  borderRadius?: ImageBorderRadiusState;
};

type ProjectLike = { projectId?: string | null } | null;

const isImageFileLike = (file: File): boolean => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return (file.type && file.type.startsWith("image/")) || (ext && IMAGE_EXTENSIONS.includes(ext as (typeof IMAGE_EXTENSIONS)[number]));
};

const isImageUrl = (url: string): boolean => {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  const cleanUrl = url.split("?")[0]?.split("#")[0] ?? "";
  const ext = cleanUrl.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.includes(ext as (typeof IMAGE_EXTENSIONS)[number]);
};

const parseNumericDimension = (value: string | null): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) return null;
  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseViewBoxDimensions = (value: string | null) => {
  if (!value) return null;
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number(token));
  if (tokens.length < 4) return null;
  const [ , , width, height ] = tokens;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
};

const resolveSvgDimensions = (svgText: string) => {
  let width = DEFAULT_SVG_WIDTH;
  let height = DEFAULT_SVG_HEIGHT;

  if (typeof DOMParser === "undefined") {
    return { width, height };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svgElement = doc.documentElement;
    if (!svgElement || svgElement.nodeName.toLowerCase() !== "svg") {
      return { width, height };
    }

    const widthAttr = parseNumericDimension(svgElement.getAttribute("width"));
    const heightAttr = parseNumericDimension(svgElement.getAttribute("height"));
    if (widthAttr && heightAttr) {
      width = widthAttr;
      height = heightAttr;
      return { width, height };
    }

    const viewBox = parseViewBoxDimensions(svgElement.getAttribute("viewBox"));
    if (viewBox) {
      width = viewBox.width;
      height = viewBox.height;
    }
  } catch (error) {
    console.warn("Failed to derive SVG extents", error);
  }

  return { width, height };
};

const SVG_EXTENSIONS = ["svg"] as const;

const isSvgFileLike = (file: File): boolean => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return (
    file.type === "image/svg+xml" ||
    (!!ext && SVG_EXTENSIONS.includes(ext as (typeof SVG_EXTENSIONS)[number]))
  );
};

const isSvgUrl = (url: string): boolean => {
  if (!url) return false;
  const cleanUrl = url.split("?")[0]?.split("#")[0] ?? "";
  const ext = cleanUrl.split(".").pop()?.toLowerCase();
  return !!ext && SVG_EXTENSIONS.includes(ext as (typeof SVG_EXTENSIONS)[number]);
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

type DragAndDropPluginProps = {
  slidesMode?: boolean;
};

export default function DragAndDropPlugin({ slidesMode = false }: DragAndDropPluginProps) {
  const [editor] = useLexicalComposerContext();
  const { activeProject } = useData() as { activeProject: ProjectLike };
  const [isLoading, setIsLoading] = useState(false);

  const insertSvgNode = useCallback(
    (svgMarkup: string) => {
      if (!editor.getRootElement()) {
        setIsLoading(false);
        return;
      }

      const { width, height } = resolveSvgDimensions(svgMarkup);
      editor.update(() => {
        const node = $createSvgNode({ svg: svgMarkup, width, height });
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertNodes([node]);
        } else {
          $insertNodes([node]);
        }
      });
      setIsLoading(false);
    },
    [editor]
  );

  const processFile = useCallback(
    async (file: File | null, directUrl?: string) => {
      if (!file && !directUrl) return;
      const isSvgDrop = !!file && isSvgFileLike(file);
      const isSvgDirectUrl = !!directUrl && isSvgUrl(directUrl);
      const isImageDrop =
        !!file && isImageFileLike(file) && !isSvgDrop
          ? true
          : !!directUrl && isImageUrl(directUrl) && !isSvgDirectUrl;
      const allowedForSlides = isImageDrop || isSvgDrop || isSvgDirectUrl;

      if (slidesMode && !allowedForSlides) {
        notify("error", "Only image files can be dropped on slides.");
        return;
      }

      setIsLoading(true);

      if (isSvgDrop && file) {
        let svgContent = "";
        try {
          svgContent = await file.text();
        } catch (err) {
          console.error("Failed to read SVG file:", err);
        }
        if (!svgContent.trim()) {
          notify("error", "SVG file could not be read.");
          setIsLoading(false);
          return;
        }
        insertSvgNode(svgContent.trim());
        return;
      }

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
        if (file) {
          notify("error", isImageDrop ? "Image upload failed." : "File upload failed.");
        }
        setIsLoading(false);
        return;
      }

      const insertLinkNode = () => {
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

      const insertImageNode = (payload: ResizableImagePayload) => {
        if (!editor.getRootElement()) {
          setIsLoading(false);
          return;
        }

        editor.update(() => {
        const node = $createResizableImageNode({
          ...payload,
          borderRadius: payload.borderRadius ?? DEFAULT_IMAGE_BORDER_RADIUS,
        });
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertNodes([node]);
          } else {
            $insertNodes([node]);
          }
        });
        setIsLoading(false);
      };

      if (isImageDrop) {
        // slight delay for S3/CDN eventual consistency
        setTimeout(() => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            const ratio =
              img.naturalWidth && img.naturalHeight
                ? img.naturalWidth / img.naturalHeight
                : DEFAULT_IMAGE_RATIO;
            insertImageNode({
              src,
              altText: file?.name || "Image",
              width: DEFAULT_IMAGE_WIDTH,
              height: DEFAULT_IMAGE_HEIGHT,
              originalAspectRatio: ratio,
            });
          };
          img.onerror = () => {
            console.error("Failed to load image:", src);
            notify("error", "Image failed to load. Inserted a placeholder.");
            insertImageNode({
              src,
              altText: file?.name || "Image",
              width: DEFAULT_IMAGE_WIDTH,
              height: DEFAULT_IMAGE_HEIGHT,
              originalAspectRatio: DEFAULT_IMAGE_RATIO,
            });
          };
        }, 500);
      } else if (!slidesMode) {
        insertLinkNode();
      } else {
        notify("error", "Only image files can be dropped on slides.");
        setIsLoading(false);
      }
    },
    [editor, activeProject, insertSvgNode, slidesMode]
  );

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();

      // Skip if editor DOM is not available (e.g., unmounted)
      if (!editor.getRootElement()) {
        return;
      }

      if (!slidesMode) {
        moveCaretToPoint(editor, e.clientX, e.clientY);
      }

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const f = files[0];
        await processFile(f);
      }
    },
    [editor, processFile, slidesMode]
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









