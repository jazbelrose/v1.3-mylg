import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { createEditor, $getRoot, $createTextNode, $getNodeByKey } from "lexical";
import { $createTextBoxNode, TextBoxNode } from "./nodes/TextBoxNode";
import { duplicateSlideNodes } from "./slides/slideSelectionUtils";
import TextBoxTransformPlugin from "./TextBoxTransformPlugin";

const config = {
  theme: {},
  namespace: "test",
  onError: console.error,
};

describe("TextBox duplication", () => {
  it("preserves text content when duplicating slide nodes", () => {
    const editor = createEditor({
      namespace: "test",
      nodes: [TextBoxNode],
      onError: console.error,
      theme: {},
    });

    editor.update(() => {
      const textbox = $createTextBoxNode(100, 100, 200, 50, 0);
      textbox.append($createTextNode("Hello World"));
      $getRoot().append(textbox);

      const result = duplicateSlideNodes([textbox.getKey()], { offsetX: 0, offsetY: 0, selectClones: false });
      const cloneKey = result.cloneKeys[0];
      expect(cloneKey).toBeTruthy();
      const clone = cloneKey ? $getNodeByKey(cloneKey) : null;
      expect(clone?.getType()).toBe("text-box");
      expect((clone as TextBoxNode | null)?.getTextContent()).toBe("Hello World");
    });
  });
});

describe('TextBoxTransformPlugin', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <LexicalComposer initialConfig={config}>
        <TextBoxTransformPlugin />
      </LexicalComposer>
    );
    expect(container).toBeTruthy();
  });
});
