import {
  DecoratorNode,
  $getNodeByKey,
  $createNodeSelection,
  $setSelection,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import React, { useRef, useState, useEffect } from "react";
import { useData } from "@/app/contexts/useData";
import { useImageLocks } from "@/dashboard/project/features/editor/components/Brief/plugins/ImageLockContext";
import { TextBoxNode } from "./TextBoxNode";
import {
  DEFAULT_IMAGE_BORDER_RADIUS,
  mergeBorderRadius,
  borderRadiusToCss,
} from "./imageBorderRadius";
import { getFileUrl } from "@/shared/utils/api";
import {
  applyModifierNodeSelection,
  duplicateSlideNodes,
  getSlideNodeSelectionKeys,
  isCopyGesture,
} from "../slides/slideSelectionUtils";

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
      node.__key,
      node.__x,
      node.__y,
      node.__rotation,
      node.__borderRadius
    );
  }

  constructor(
    src,
    altText,
    width,
    height,
    originalAspectRatio,
    key,
    x = 0,
    y = 0,
    rotation = 0,
    borderRadius
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = typeof width === "number" ? width : 300;
    this.__height = typeof height === "number" ? height : 200;
    this.__originalAspectRatio =
      originalAspectRatio || this.__width / this.__height;
    this.__x = x;
    this.__y = y;
    this.__rotation = rotation;
    this.__borderRadius = mergeBorderRadius(
      DEFAULT_IMAGE_BORDER_RADIUS,
      borderRadius
    );
  }

  getOriginalAspectRatio() {
    return this.__originalAspectRatio;
  }

  getSrc() {
    return this.__src;
  }

  getAltText() {
    return this.__altText;
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

  // Position getters/setters
  setX(newX) {
    const writable = this.getWritable();
    writable.__x = newX;
  }
  getX() {
    return this.__x;
  }

  setY(newY) {
    const writable = this.getWritable();
    writable.__y = newY;
  }
  getY() {
    return this.__y;
  }

  // Rotation getters/setters
  setRotation(newRotation) {
    const writable = this.getWritable();
    writable.__rotation = newRotation;
  }
  getRotation() {
    return this.__rotation;
  }

  getBorderRadius() {
    return { ...this.__borderRadius };
  }

  setBorderRadius(borderRadius) {
    const writable = this.getWritable();
    writable.__borderRadius = mergeBorderRadius(
      writable.__borderRadius,
      borderRadius
    );
  }

  createDOM() {
    const elem = document.createElement("span");
    Object.assign(elem.style, {
      position: "absolute",
      width: "0px",
      height: "0px",
      lineHeight: "0",
      pointerEvents: "none",
    });
    return elem;
  }

  isInline() {
    return true;
  }

  getTextContent() {
    return "";
  }

  updateDOM() {
    return false;
  }

  static importJSON(serializedNode) {
    const {
      src,
      altText,
      width,
      height,
      originalAspectRatio,
      x,
      y,
      rotation,
      borderRadius,
    } = serializedNode;
    return new ResizableImageNode(
      src,
      altText,
      width,
      height,
      originalAspectRatio,
      undefined,
      x,
      y,
      rotation,
      borderRadius
    );
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
      x: this.__x,
      y: this.__y,
      rotation: this.__rotation,
      borderRadius: this.__borderRadius,
    };
  }

  decorate() {
    return (
        <ResizableImageComponent
          src={getFileUrl(this.__src)}
          altText={this.__altText}
          width={this.__width}
          height={this.__height}
          x={this.__x}
          y={this.__y}
          rotation={this.__rotation}
          borderRadius={this.__borderRadius}
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
  x = 0,
  y = 0,
  rotation = 0,
  borderRadius,
}) {
  return new ResizableImageNode(
    src,
    altText,
    width,
    height,
    originalAspectRatio ?? width / height,
    undefined,
    x,
    y,
    rotation,
    borderRadius
  );
}

/**
 * The DecoratorNode's React component that handles display and resizing.
 * This version always locks the aspect ratio.
 */
function ResizableImageComponent({
  src,
  altText,
  width,
  height,
  x,
  y,
  rotation,
  nodeKey,
  borderRadius,
}) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const containerRef = useRef(null);
  const skipClickClearRef = useRef(false);
  const { userName } = useData();
  const { provider, locks } = useImageLocks();
  const lockedBy = locks[nodeKey];
  const isLocked = lockedBy && lockedBy !== userName;
  const borderRadiusStyle = borderRadiusToCss(
    borderRadius || DEFAULT_IMAGE_BORDER_RADIUS
  );
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
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
  const initialPosXRef = useRef(x);
  const initialPosYRef = useRef(y);
  const initialRotationRef = useRef(rotation);
  const initialAngleRef = useRef(0);
  const selectionSnapshotRef = useRef(new Map());
  const dragMetaRef = useRef({
    copyGesture: false,
    didDuplicate: false,
    activeNodeKey: nodeKey,
    selectionBefore: [],
    wasSelectedBefore: false,
    cloneKeys: [],
  });

  // Read the original aspect ratio from the node.
  const originalAspectRatioRef = useRef(
    editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey);
      return node?.getOriginalAspectRatio() ?? width / height;
    })
  );

  const captureSelectionSnapshot = (keys, options = {}) => {
    const normalizedKeys = keys.length > 0 ? keys : [nodeKey];
    const run = () => {
      editor.getEditorState().read(() => {
        const snapshot = new Map();
        normalizedKeys.forEach((key) => {
          const targetNode = $getNodeByKey(key);
          if (targetNode instanceof ResizableImageNode) {
            snapshot.set(key, { x: targetNode.getX(), y: targetNode.getY() });
          } else if (targetNode instanceof TextBoxNode) {
            const { x: tx, y: ty } = targetNode.getPosition();
            snapshot.set(key, { x: tx, y: ty });
          }
        });
        selectionSnapshotRef.current = snapshot;
      });
    };

    if (options.defer) {
      queueMicrotask(run);
    } else {
      run();
    }
  };

  // When the image is clicked, select it.
  const onClickImage = (e) => {
    e.stopPropagation();
    editor.focus();
    editor.update(() => {
      applyModifierNodeSelection(nodeKey, e);
    });
  };

  const handleMouseDown = (e, handleType) => {
    e.preventDefault();
    e.stopPropagation();
    editor.focus();
    if (isLocked) return;
    const selectionBefore = editor.getEditorState().read(() =>
      getSlideNodeSelectionKeys()
    );
    dragMetaRef.current = {
      copyGesture: isCopyGesture(e),
      didDuplicate: false,
      activeNodeKey: nodeKey,
      selectionBefore,
      wasSelectedBefore: selectionBefore.includes(nodeKey),
      cloneKeys: [],
    };
    captureSelectionSnapshot(selectionBefore.length > 0 ? selectionBefore : [nodeKey]);
    skipClickClearRef.current = true;
    
    if (handleType === 'rotate') {
      // Capture initial mouse angle for rotation
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const centerX = containerRect.left + containerRect.width / 2;
        const centerY = containerRect.top + containerRect.height / 2;
        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        initialAngleRef.current = (angle * 180) / Math.PI;
      }
      setIsRotating(true);
    } else if (handleType === 'move') {
      setIsDragging(true);
    } else {
      setIsResizing(true);
    }
    
    startEdit();
    setCurrentHandle(handleType);
    initialXRef.current = e.clientX;
    initialYRef.current = e.clientY;
    initialWidthRef.current = width;
    initialHeightRef.current = height;
    initialPosXRef.current = x;
    initialPosYRef.current = y;
    initialRotationRef.current = rotation;
  };

  const refreshDragSnapshot = (targetKey) => {
    editor.getEditorState().read(() => {
      const node = $getNodeByKey(targetKey);
      if (!node) {
        return;
      }
      initialPosXRef.current = node.getX();
      initialPosYRef.current = node.getY();
      initialWidthRef.current = node.getWidth();
      initialHeightRef.current = node.getHeight();
      initialRotationRef.current = node.getRotation();
    });
  };

  useEffect(() => {
    const root = editor.getRootElement();
    const onFocus = () => setIsFocused(true);
    const onBlur = (event) => {
      const toolbar = document.querySelector(".slide-toolbar");
      const relatedTarget =
        event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (toolbar?.contains(relatedTarget)) {
        setIsFocused(true);
        return;
      }
      setIsFocused(false);
    };
    root.addEventListener("focusin", onFocus);
    root.addEventListener("focusout", onBlur);
    
    const handleWindowClick = (e) => {
      if (skipClickClearRef.current) {
        skipClickClearRef.current = false;
        return;
      }
      const target = e.target;
      if (!(target instanceof Node)) {
        return;
      }
      const toolbar = document.querySelector(".slide-toolbar");
      if (toolbar?.contains(target)) {
        setIsFocused(true);
        return;
      }
      if (containerRef.current && !containerRef.current.contains(target)) {
        clearSelection();
      }
    };

    const handleKeyDown = (e) => {
      if (!isSelected || isLocked) return;
      // Allow delete/backspace to remove the selected image node.
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if (!node) return;
          node.remove();
        });
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node) return;

        const step = e.shiftKey ? 10 : 1; // Larger steps with Shift
        const rotationStep = e.shiftKey ? 15 : 5; // Larger rotation with Shift

        switch (e.key) {
          case "ArrowLeft":
            node.setX(node.getX() - step);
            break;
          case "ArrowRight":
            node.setX(node.getX() + step);
            break;
          case "ArrowUp":
            node.setY(node.getY() - step);
            break;
          case "ArrowDown":
            node.setY(node.getY() + step);
            break;
          case "r":
          case "R":
            if (e.ctrlKey || e.metaKey) {
              // Ctrl+R or Cmd+R: rotate clockwise
              node.setRotation(node.getRotation() + rotationStep);
            }
            break;
          case "l":
          case "L":
            if (e.ctrlKey || e.metaKey) {
              // Ctrl+L or Cmd+L: rotate counter-clockwise
              node.setRotation(node.getRotation() - rotationStep);
            }
            break;
          case "0":
            if (e.ctrlKey || e.metaKey) {
              // Ctrl+0 or Cmd+0: reset rotation
              node.setRotation(0);
            }
            break;
        }
      });
    };
    
    window.addEventListener("click", handleWindowClick);
    // Register keydown on the editor root in the capture phase so we can
    // intercept arrow keys before Lexical's rich-text handlers run and
    // unselect the image. Fall back to window with capture if root is missing.
    if (root) {
      root.addEventListener("keydown", handleKeyDown, true);
    } else {
      window.addEventListener("keydown", handleKeyDown, true);
    }
    
    return () => {
      root.removeEventListener("focusin", onFocus);
      root.removeEventListener("focusout", onBlur);
      window.removeEventListener("click", handleWindowClick);
      if (root) {
        root.removeEventListener("keydown", handleKeyDown, true);
      } else {
        window.removeEventListener("keydown", handleKeyDown, true);
      }
    };
  }, [editor, isSelected, isLocked, nodeKey, clearSelection]);

  useEffect(() => {
    if (!isResizing && !isDragging && !isRotating) return;

    function onMouseMove(e) {
      editor.update(() => {
        if (
          isDragging &&
          currentHandle === "move" &&
          dragMetaRef.current.copyGesture &&
          !dragMetaRef.current.didDuplicate
        ) {
          const keysBefore = dragMetaRef.current.selectionBefore;
          const keysToClone =
            dragMetaRef.current.wasSelectedBefore && keysBefore.length > 0
              ? keysBefore
              : keysBefore.length > 0
              ? keysBefore
              : [nodeKey];
          const { clones, cloneKeys } = duplicateSlideNodes(keysToClone);
          dragMetaRef.current.cloneKeys = cloneKeys;
          dragMetaRef.current.didDuplicate = true;
          if (cloneKeys.length > 0) {
            const mapping = new Map(
              clones.map(({ originalKey, cloneKey }) => [originalKey, cloneKey])
            );
            const replacementKey =
              mapping.get(dragMetaRef.current.activeNodeKey) ??
              cloneKeys[cloneKeys.length - 1];
            dragMetaRef.current.activeNodeKey = replacementKey;
            refreshDragSnapshot(replacementKey);
            captureSelectionSnapshot(cloneKeys, { defer: true });
          }
        }

        const activeKey = dragMetaRef.current.activeNodeKey || nodeKey;
        const node = $getNodeByKey(activeKey);
        if (!node) return;

        const deltaX = e.clientX - initialXRef.current;
        const deltaY = e.clientY - initialYRef.current;

        if (isDragging) {
          const snapshots = selectionSnapshotRef.current;
          const entries =
            snapshots.size > 0
              ? Array.from(snapshots.entries())
              : [[activeKey, { x: initialPosXRef.current, y: initialPosYRef.current }]];
          entries.forEach(([key, origin]) => {
            if (!origin) {
              return;
            }
            const targetNode = $getNodeByKey(key);
            if (!targetNode) {
              return;
            }
            const nextX = origin.x + deltaX;
            const nextY = origin.y + deltaY;
            if (targetNode instanceof ResizableImageNode) {
              targetNode.setX(nextX);
              targetNode.setY(nextY);
            } else if (targetNode instanceof TextBoxNode) {
              targetNode.setPosition(nextX, nextY);
            }
          });
        } else if (isRotating) {
          // Handle rotation
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            const centerX = containerRect.left + containerRect.width / 2;
            const centerY = containerRect.top + containerRect.height / 2;
            const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
            const currentDegrees = (currentAngle * 180) / Math.PI;
            
            // Calculate delta from initial angle
            const deltaRotation = currentDegrees - initialAngleRef.current;
            const newRotation = initialRotationRef.current + deltaRotation;
            
            node.setRotation(newRotation);
          }
        } else if (isResizing) {
          // Handle resizing (existing logic)
          const ratio = node.getOriginalAspectRatio();
          let newWidth, newHeight;

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
        }
      });
    }

    function onMouseUp() {
      setIsResizing(false);
      setIsDragging(false);
      setIsRotating(false);
      setCurrentHandle(null);

      const { didDuplicate, cloneKeys } = dragMetaRef.current;

      endEdit();

      if (didDuplicate && cloneKeys.length > 0) {
        editor.update(() => {
          const nodeSelection = $createNodeSelection();
          cloneKeys.forEach((key) => nodeSelection.add(key));
          $setSelection(nodeSelection);
        });
      } else {
        setSelected(true);
      }

      dragMetaRef.current.copyGesture = false;
      dragMetaRef.current.didDuplicate = false;
      dragMetaRef.current.cloneKeys = [];
      dragMetaRef.current.activeNodeKey = nodeKey;
      dragMetaRef.current.selectionBefore = [];
      dragMetaRef.current.wasSelectedBefore = false;
      selectionSnapshotRef.current = new Map();
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, isDragging, isRotating, editor, nodeKey, currentHandle]);

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

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        zIndex: isSelected ? 1000 : 1,
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {lockedBy && lockedBy !== userName && (
          <div className="locked-overlay" style={{ position: "absolute", top: 0, left: 0 }}>{lockedBy}</div>
        )}
        <img
          src={src}
          alt={altText}
          draggable={false}
          onClick={onClickImage}
          onLoad={onImageLoad}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            borderRadius: borderRadiusStyle,
            objectFit: "contain",
            cursor: isSelected && !isLocked ? "move" : "pointer",
            pointerEvents: isLocked ? "none" : "auto",
          }}
          onMouseDown={(e) => isSelected && !isLocked && handleMouseDown(e, "move")}
        />
        {isSelected && isFocused && !isLocked && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: isResizing || isDragging || isRotating ? "2px solid blue" : "1px solid blue",
              boxSizing: "border-box",
              borderRadius: borderRadiusStyle,
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
            
            {/* Rotation handle */}
            <div 
              style={{
                position: "absolute",
                top: "-36px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "14px",
                height: "14px",
                backgroundColor: "#fff",
                border: "2px solid #000",
                borderRadius: "50%",
                cursor: "grab",
                pointerEvents: "all",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                color: "#000",
                fontWeight: "bold",
              }}
              onMouseDown={(e) => handleMouseDown(e, "rotate")}
              title="Rotate"
            >
              ↻
            </div>
          
          </div>
        )}
      </div>
    </div>
  );
}

function handleStyle(vertical, horizontal) {
  const isEdgeHandle =
    (vertical === "middle" && (horizontal === "left" || horizontal === "right")) ||
    (horizontal === "center" && (vertical === "top" || vertical === "bottom"));

  // Match Moveable (ImageNode) handle sizing.
  const size = isEdgeHandle ? 10 : 14;  // Smaller size for edge handles, larger for corners
  const borderWidth = isEdgeHandle ? 1.5 : 2;
  const offset = -size / 2;
  const style = {
    position: "absolute",
    width: `${size}px`,
    height: `${size}px`,
    backgroundColor: "#fff",
    border: `${borderWidth}px solid #000`,
    borderRadius: "999px",
    boxSizing: "border-box",
    pointerEvents: "all",
    cursor: getResizeCursor(vertical, horizontal),
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

function getResizeCursor(vertical, horizontal) {
  if (vertical === "top" && horizontal === "left") return "nw-resize";
  if (vertical === "top" && horizontal === "center") return "n-resize";
  if (vertical === "top" && horizontal === "right") return "ne-resize";
  if (vertical === "middle" && horizontal === "left") return "w-resize";
  if (vertical === "middle" && horizontal === "right") return "e-resize";
  if (vertical === "bottom" && horizontal === "left") return "sw-resize";
  if (vertical === "bottom" && horizontal === "center") return "s-resize";
  if (vertical === "bottom" && horizontal === "right") return "se-resize";
  return "pointer";
}



