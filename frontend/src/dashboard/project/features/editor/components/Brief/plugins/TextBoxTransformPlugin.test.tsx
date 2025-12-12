import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { createEditor, $getRoot, $createTextNode } from "lexical";
import { $createTextBoxNode, TextBoxNode } from "./nodes/TextBoxNode";
import { cloneNodeFromExportJSON } from "./TextBoxTransformPlugin";
import TextBoxTransformPlugin from "./TextBoxTransformPlugin";

const config = {
  theme: {},
  namespace: "test",
  onError: console.error,
};

describe("TextBox duplication", () => {
  it("preserves text content when cloning from exportJSON", () => {
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

      const clone = cloneNodeFromExportJSON(editor, textbox.exportJSON());
      expect(clone instanceof TextBoxNode).toBe(true);
      expect((clone as TextBoxNode).getTextContent()).toBe("Hello World");
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