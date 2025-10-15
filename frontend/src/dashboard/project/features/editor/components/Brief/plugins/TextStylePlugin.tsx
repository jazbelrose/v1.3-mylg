import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TextNode } from "lexical";

export default function TextStylePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Runs whenever a TextNode is created/updated/removed
    return editor.registerNodeTransform(TextNode, (textNode: TextNode) => {
      const key = textNode.getKey();
      const domElement = editor.getElementByKey(key);

      if (domElement instanceof HTMLElement) {
        const styleString = textNode.getStyle() ?? "";
        domElement.setAttribute("style", styleString);
      }
    });
  }, [editor]);

  return null;
}









