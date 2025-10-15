import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $insertNodes,
  COPY_COMMAND,
  PASTE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type LexicalCommand,
  type NodeSelection,
} from "lexical";
import {
  ImageNode,
  $createImageNode,
} from "./nodes/ImageNode";
import {
  ResizableImageNode,
  $createResizableImageNode,
} from "./nodes/ResizableImageNode";

type ImageLikeNode = ImageNode | ResizableImageNode;

// Type definitions for node properties
type ImageNodeProperties = {
  __src: string;
  __altText: string;
  __x: number;
  __y: number;
  __width: number;
  __height: number;
  __clipPath: string;
};

type ResizableImageNodeProperties = {
  __src: string;
  __altText: string;
  __width: number;
  __height: number;
  __originalAspectRatio: number;
};

// Fallback serialized shapes if your nodes don't export types:
type SerializedImageNode = {
  type: "image";
  version: 1;
  src: string;
  altText?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clipPath: string;
};

type SerializedResizableImageNode = {
  type: "resizable-image";
  version: 1;
  src: string;
  altText?: string;
  width: number;
  height: number;
  originalAspectRatio: number;
};

type FallbackSerializedImage = {
  src: string;
  altText?: string;
  width?: number;
  height?: number;
  originalAspectRatio?: number;
};

type ClipboardImageItem =
  | { type: "image"; data: SerializedImageNode | FallbackSerializedImage }
  | {
      type: "resizable-image";
      data: SerializedResizableImageNode | FallbackSerializedImage;
    };

const CLIPBOARD_MIME = "application/x-lexical-images";

function isImageLikeNode(n: unknown): n is ImageLikeNode {
  return n instanceof ImageNode || n instanceof ResizableImageNode;
}

export default function ImageCopyPastePlugin(): null {
  const [editor] = useLexicalComposerContext();
  const clipboardRef = useRef<string | null>(null);

  useEffect(() => {
    // Guard: only register if editor knows our nodes
    if (!editor.hasNodes([ImageNode, ResizableImageNode])) {
      return;
    }

    const unregisterCopy = editor.registerCommand<ClipboardEvent>(
      COPY_COMMAND as LexicalCommand<ClipboardEvent>,
      (event) => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          const nodes = (selection as NodeSelection).getNodes();
          const images: ClipboardImageItem[] = [];

          for (const n of nodes) {
            if (isImageLikeNode(n)) {
              // Prefer custom exportJSON if provided by your node
              const data =
                typeof (n as ImageLikeNode & { exportJSON?: () => unknown }).exportJSON === "function"
                  ? (n as ImageLikeNode & { exportJSON?: () => unknown }).exportJSON()
                  : ({
                      src: (n as ImageLikeNode & ImageNodeProperties & ResizableImageNodeProperties).__src,
                      altText: (n as ImageLikeNode & ImageNodeProperties & ResizableImageNodeProperties).__altText,
                      width: (n as ImageLikeNode & ImageNodeProperties & ResizableImageNodeProperties).__width,
                      height: (n as ImageLikeNode & ImageNodeProperties & ResizableImageNodeProperties).__height,
                      originalAspectRatio: (n as ImageLikeNode & ResizableImageNodeProperties).__originalAspectRatio,
                    } as FallbackSerializedImage);

              images.push({
                type: n instanceof ResizableImageNode ? "resizable-image" : "image",
                data,
              });
            }
          }

          if (images.length > 0) {
            const json = JSON.stringify(images);
            if (event?.clipboardData) {
              event.preventDefault();
              event.clipboardData.setData(CLIPBOARD_MIME, json);
            }
            clipboardRef.current = json; // fallback for environments that block custom MIME
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    const unregisterPaste = editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND as LexicalCommand<ClipboardEvent>,
      (event) => {
        const jsonFromEvent =
          event?.clipboardData?.getData(CLIPBOARD_MIME) ?? null;
        const json = jsonFromEvent ?? clipboardRef.current;

        if (!json) return false;

        try {
          const items = JSON.parse(json) as ClipboardImageItem[];

          editor.update(() => {
            const created = items
              .map((item) => {
                if (item.type === "image") {
                  const data = item.data;
                  return $createImageNode({
                    src: data.src,
                    altText: data.altText || "",
                    x: (data as SerializedImageNode).x ?? 0,
                    y: (data as SerializedImageNode).y ?? 0,
                    width: data.width ?? 300,
                    height: data.height ?? 200,
                    clipPath: (data as SerializedImageNode).clipPath ?? "none",
                  });
                }
                if (item.type === "resizable-image") {
                  const data = item.data;
                  return $createResizableImageNode({
                    src: data.src,
                    altText: data.altText || "",
                    width: data.width ?? 300,
                    height: data.height ?? 200,
                    originalAspectRatio: data.originalAspectRatio ?? ((data.width ?? 300) / (data.height ?? 200)),
                  });
                }
                return null;
              })
              .filter(Boolean);

            if (created.length > 0) {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.insertNodes(created);
              } else {
                $insertNodes(created);
              }
            }
          });

          event?.preventDefault?.();
          return true;
        } catch (e) {
          // If parsing fails, let other paste handlers try
           
          console.error("Failed to paste images:", e);
          return false;
        }
      },
      COMMAND_PRIORITY_LOW
    );

    return mergeRegister(unregisterCopy, unregisterPaste);
  }, [editor]);

  return null;
}









