import { DecoratorNode } from "lexical";
import { $getNodeByKey } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import React, { useRef, useState, useEffect } from "react";
import { useData } from "@/app/contexts/useData";
import { useImageLocks } from "@/dashboard/project/features/editor/components/Brief/plugins/ImageLockContext";
import { getFileUrl } from "@/shared/utils/api";

export class ResizableImageNode extends DecoratorNode {
  static getType() {
    return "resizable-image";
  }

  static clone(node) {
    return new ResizableImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__originalAspectRatio,
      node.__key
    );
  }

  constructor(src, altText, width, height, originalAspectRatio, key) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = typeof width === "number" ? width : 300;
    this.__height = typeof height === "number" ? height : 200;
    this.__originalAspectRatio =
      originalAspectRatio || this.__width / this.__height;
  }

  getOriginalAspectRatio() {
    return this.__originalAspectRatio;
  }

  setOriginalAspectRatio(aspectRatio) {
    const writable = this.getWritable();
    writable.__originalAspectRatio = aspectRatio;
  }

  // Standard getters/setters for width/height
  setWidth(newWidth) {
    const writable = this.getWritable();
    writable.__width = newWidth;
  }
  getWidth() {
    return this.__width;
  }

  setHeight(newHeight) {
    const writable = this.getWritable();
    writable.__height = newHeight;
  }
  getHeight() {
    return this.__height;
  }

  createDOM() {
    return document.createElement("div");
  }

  updateDOM() {
    return false;
  }

  static importJSON(serializedNode) {
    const { src, altText, width, height, originalAspectRatio } = serializedNode;
    return new ResizableImageNode(src, altText, width, height, originalAspectRatio);
  }

  exportJSON() {
    return {
      type: "resizable-image",
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
      originalAspectRatio: this.__originalAspectRatio,
    };
  }

  decorate() {
    return (
      <ResizableImageComponent
        src={getFileUrl(this.__src)}
        altText={this.__altText}
        width={this.__width}
        height={this.__height}
        nodeKey={this.__key}
      />
    );
  }
}

/**
 * Synchronous factory function to create the node.
 * (No async/await logic in here!)
 */
export function $createResizableImageNode({
  src,
  altText = "",
  width = 300,
  height = 200,
  originalAspectRatio,
}) {
  return new ResizableImageNode(
    src,
    altText,
    width,
    height,
    originalAspectRatio ?? width / height
  );
}

/**
 * The DecoratorNode's React component that handles display and resizing.
 * This version always locks the aspect ratio.
 */
function ResizableImageComponent({ src, altText, width, height, nodeKey }) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const containerRef = useRef(null);
  const skipClickClearRef = useRef(false);
  const { userName } = useData();
  const { provider, locks } = useImageLocks();
  const lockedBy = locks[nodeKey];
  const isLocked = lockedBy && lockedBy !== userName;
  const [isResizing, setIsResizing] = useState(false);
  const [currentHandle, setCurrentHandle] = useState(null);
  const startEdit = () => {
    if (provider) {
      provider.awareness.setLocalStateField("imageLock", { nodeId: nodeKey, userName });
    }
  };

  const endEdit = () => {
    if (provider) {
      provider.awareness.setLocalStateField("imageLock", null);
    }
  };
  const [isFocused, setIsFocused] = useState(true);

  // Track the initial pointer and size when resizing starts.
  const initialXRef = useRef(0);
  const initialYRef = useRef(0);
  const initialWidthRef = useRef(width);
  const initialHeightRef = useRef(height);

  // Read the original aspect ratio from the node.
  const originalAspectRatioRef = useRef(
    editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey);
      return node?.getOriginalAspectRatio() ?? width / height;
    })
  );

  // When the image is clicked, select it.
  const onClickImage = (e) => {
    e.stopPropagation();
    editor.focus();
    if (e.shiftKey) {
      setSelected(!isSelected);
    } else {
      
      setSelected(true);
    }
  };

  const handleMouseDown = (e, handleType) => {
    e.preventDefault();
    e.stopPropagation();
    editor.focus();
    if (isLocked) return;
    skipClickClearRef.current = true;
    setIsResizing(true);
    startEdit();
    setCurrentHandle(handleType);
    initialXRef.current = e.clientX;
    initialYRef.current = e.clientY;
    initialWidthRef.current = width;
    initialHeightRef.current = height;
  };

  useEffect(() => {
    const root = editor.getRootElement();
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    root.addEventListener("focusin", onFocus);
    root.addEventListener("focusout", onBlur);
    const handleWindowClick = (e) => {
      if (skipClickClearRef.current) {
        skipClickClearRef.current = false;
        return;
      }
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        
      }
    };
    window.addEventListener("click", handleWindowClick);
    return () => {
      root.removeEventListener("focusin", onFocus);
      root.removeEventListener("focusout", onBlur);
      window.removeEventListener("click", handleWindowClick);
    };
  }, [editor]);

  useEffect(() => {
    if (!isResizing) return;

    function onMouseMove(e) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node) return;

        const ratio = node.getOriginalAspectRatio();
        let newWidth, newHeight;
        const deltaX = e.clientX - initialXRef.current;
        const deltaY = e.clientY - initialYRef.current;

        // For vertical edge handles, adjust based on deltaY;
        // for horizontal and corner handles, adjust based on deltaX.
        if (currentHandle === "top" || currentHandle === "bottom") {
          const factor = currentHandle === "bottom" ? 1 : -1;
          newHeight = initialHeightRef.current + factor * deltaY;
          newWidth = newHeight * ratio;
        } else {
          // For handles "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"
          const factor =
            currentHandle === "left" ||
            currentHandle === "top-left" ||
            currentHandle === "bottom-left"
              ? -1
              : 1;
          newWidth = initialWidthRef.current + factor * deltaX;
          newHeight = newWidth / ratio;
        }

        // Clamp to a minimum size.
        newWidth = Math.max(50, newWidth);
        newHeight = Math.max(50, newHeight);

        node.setWidth(newWidth);
        node.setHeight(newHeight);
      });
    }

    function onMouseUp() {
      setIsResizing(false);
      setCurrentHandle(null);
      endEdit();
      // keep the image selected after resizing ends
      setSelected(true);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, editor, nodeKey, currentHandle]);

  const onImageLoad = (e) => {
    const naturalW = e.target.naturalWidth;
    const naturalH = e.target.naturalHeight;
    const realAspect = naturalW / naturalH;
    if (realAspect) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node) return;
        node.setOriginalAspectRatio(realAspect);
        originalAspectRatioRef.current = realAspect;
        const currentWidth = node.getWidth();
        node.setHeight(Math.round(currentWidth / realAspect));
      });
    }
  };

  // Always use the "locked aspect ratio" container using the padding-top trick.
  const paddingPercentage = width ? (height / width) * 100 : 50;
  return (
    <div
      style={{
        display: "inline-block",
        position: "relative",
        width: width, // desired pixel width
        maxWidth: "100%", // allow container to shrink on small screens
      }}
    >
      <div style={{ position: "relative", width: "100%", paddingTop: `${paddingPercentage}%` }}>
        {lockedBy && lockedBy !== userName && (
          <div className="locked-overlay" style={{ position: "absolute", top: 0, left: 0 }}>{lockedBy}</div>
        )}
        <img
          src={src}
          alt={altText}
          draggable
          onDragStart={(e) => {
            const isCopy = e.ctrlKey || e.metaKey;
            e.dataTransfer.setData("lexical-image-drag", nodeKey);
            e.dataTransfer.setData("lexical-image-copy", isCopy ? "1" : "0");
            e.dataTransfer.effectAllowed = isCopy ? "copy" : "move";
          }}
          onClick={onClickImage}
          onLoad={onImageLoad}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            cursor: "pointer",
            pointerEvents: isLocked ? "none" : "auto",
          }}
        />
        {isSelected && isFocused && !isLocked && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: isResizing ? "2px solid blue" : "none",
              boxSizing: "border-box",
              pointerEvents: "none",
            }}
          >
            {/* Resize handles */}
            <div style={handleStyle("top", "left")} onMouseDown={(e) => handleMouseDown(e, "top-left")} />
            <div style={handleStyle("top", "center")} onMouseDown={(e) => handleMouseDown(e, "top")} />
            <div style={handleStyle("top", "right")} onMouseDown={(e) => handleMouseDown(e, "top-right")} />
            <div style={handleStyle("middle", "right")} onMouseDown={(e) => handleMouseDown(e, "right")} />
            <div style={handleStyle("bottom", "right")} onMouseDown={(e) => handleMouseDown(e, "bottom-right")} />
            <div style={handleStyle("bottom", "center")} onMouseDown={(e) => handleMouseDown(e, "bottom")} />
            <div style={handleStyle("bottom", "left")} onMouseDown={(e) => handleMouseDown(e, "bottom-left")} />
            <div style={handleStyle("middle", "left")} onMouseDown={(e) => handleMouseDown(e, "left")} />
          </div>
        )}
      </div>
    </div>
  );
}

function handleStyle(vertical, horizontal) {
  const size = 8;
  const offset = -size / 2;
  const style = {
    position: "absolute",
    width: `${size}px`,
    height: `${size}px`,
    backgroundColor: "white",
    border: "1px solid blue",
    boxSizing: "border-box",
    pointerEvents: "all",
    cursor: "pointer",
  };

  // Set vertical position.
  if (vertical === "top") {
    style.top = `${offset}px`;
  } else if (vertical === "middle") {
    style.top = "50%";
    style.transform = style.transform ? style.transform + " translateY(-50%)" : "translateY(-50%)";
  } else {
    style.bottom = `${offset}px`;
  }

  // Set horizontal position.
  if (horizontal === "left") {
    style.left = `${offset}px`;
  } else if (horizontal === "center") {
    style.left = "50%";
    style.transform = style.transform ? style.transform + " translateX(-50%)" : "translateX(-50%)";
  } else {
    style.right = `${offset}px`;
  }

  return style;
}











