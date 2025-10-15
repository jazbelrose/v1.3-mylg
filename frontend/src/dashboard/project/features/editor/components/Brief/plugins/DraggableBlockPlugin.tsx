import React, { useRef, useMemo } from "react";
import { DraggableBlockPlugin_EXPERIMENTAL as LexicalDraggableBlockPlugin } from "@lexical/react/LexicalDraggableBlockPlugin";
import "../lexical-editor.css";

const DRAGGABLE_BLOCK_MENU_CLASSNAME = "draggable-block-menu";

type Props = {
  /** Anchor element for positioning the draggable UI (usually the editor container). */
  anchorElem?: HTMLElement | null;
};

/** Returns true if `element` is inside the draggable menu. */
function isOnMenu(element: HTMLElement | null): boolean {
  return !!element?.closest(`.${DRAGGABLE_BLOCK_MENU_CLASSNAME}`);
}

export default function DraggableBlockPlugin({ anchorElem }: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const targetLineRef = useRef<HTMLDivElement | null>(null);

  // Prefer a descendant with `.editor-container` if it exists; otherwise use provided anchor.
  const resolvedAnchorElem = useMemo<HTMLElement | null>(() => {
    if (!anchorElem) return null;
    const container = anchorElem.querySelector?.(".editor-container") as HTMLElement | null;
    return container ?? anchorElem;
  }, [anchorElem]);

  return (
    <LexicalDraggableBlockPlugin
      anchorElem={resolvedAnchorElem ?? undefined}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      menuComponent={
        <div ref={menuRef} className={`icon ${DRAGGABLE_BLOCK_MENU_CLASSNAME}`}>
          <div className="icon" />
        </div>
      }
      targetLineComponent={<div ref={targetLineRef} className="draggable-block-target-line" />}
      isOnMenu={isOnMenu}
    />
  );
}









