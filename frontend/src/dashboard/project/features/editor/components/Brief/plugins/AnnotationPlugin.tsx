import React, { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import {
  $getSelection,
  $isRangeSelection,
  $getRoot,
  $isTextNode,
  TextNode,
} from "lexical";

type ButtonPos = { top: number; left: number } | null;

type AnnotationPayload = {
  text: string;
  selectionText: string;
};

type Props = {
  onAddAnnotation?: (payload: AnnotationPayload) => void;
};

type AnnotationClickDetail = {
  selectionText: string;
};

const AnnotationPlugin: React.FC<Props> = ({ onAddAnnotation }) => {
  const [editor] = useLexicalComposerContext();
  const [buttonPos, setButtonPos] = useState<ButtonPos>(null);
  const [selectionText, setSelectionText] = useState<string>("");

  useEffect(() => {
    const updateButton = () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection) && selection.getTextContent().trim()) {
        const domSel = window.getSelection();
        if (domSel && domSel.rangeCount > 0) {
          const rect = domSel.getRangeAt(0).getBoundingClientRect();
          setButtonPos({
            top: window.scrollY + rect.bottom + 5,
            left: window.scrollX + rect.right + 5,
          });
          setSelectionText(selection.getTextContent());
          return;
        }
      }
      setButtonPos(null);
    };

    const handleSelectionChange = () => {
      editor.getEditorState().read(updateButton);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editor]);

  useEffect(() => {
    const handleAnnotationClick = (e: Event) => {
      const ce = e as CustomEvent<AnnotationClickDetail>;
      const selected = ce?.detail?.selectionText;
      if (!selected) return;

     editor.update(() => {
        const textNodes = $getRoot().getAllTextNodes();
        for (const textNode of textNodes) {
          const content = textNode.getTextContent();
          const idx = content.indexOf(selected);
          if (idx !== -1) {
            const [, highlightNode] = textNode.splitText(
              idx,
              idx + selected.length,
            );
            highlightNode.setStyle("background: yellow");

            window.setTimeout(() => {
              editor.update(() => {
                highlightNode.setStyle("");
                const prev = highlightNode.getPreviousSibling();
                const next = highlightNode.getNextSibling();
                let node: TextNode = highlightNode;
                if ($isTextNode(prev) && prev.getStyle() === "") {
                  node = prev.mergeWithSibling(node);
                }
                if ($isTextNode(next) && next.getStyle() === "") {
                  node.mergeWithSibling(next);
                }
              });
            }, 2000);
            break;
          }
        }

      });
    };

    window.addEventListener("annotation-click", handleAnnotationClick as EventListener);
    return () => {
      window.removeEventListener("annotation-click", handleAnnotationClick as EventListener);
    };
  }, [editor]);

  const handleClick = () => {
    const comment = window.prompt("Add comment");
    if (!comment) return;
    onAddAnnotation?.({ text: comment, selectionText });
    setButtonPos(null);
  };

  if (!buttonPos) return null;

  const style: React.CSSProperties = {
    position: "absolute",
    top: buttonPos.top,
    left: buttonPos.left,
    zIndex: 50,
  };

  return (
    <button
      style={style}
      onMouseDown={(e) => e.preventDefault()} // keep selection intact
      onClick={handleClick}
    >
      Add Comment
    </button>
  );
};

export default AnnotationPlugin;









