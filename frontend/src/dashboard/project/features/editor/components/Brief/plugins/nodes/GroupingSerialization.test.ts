import { describe, expect, it } from "vitest";
import { createEditor } from "lexical";
import { TextBoxNode } from "./TextBoxNode";
import { ResizableImageNode } from "./ResizableImageNode";
import { SvgNode } from "./SvgNode";

describe("Grouping serialization", () => {
  it("roundtrips groupId for TextBoxNode", () => {
    const editor = createEditor({
      namespace: "TextBoxGroupIdTest",
      nodes: [TextBoxNode],
      onError: () => {},
    });

    let json: any = null;
    editor.update(() => {
      const node = new TextBoxNode(
        10,
        20,
        300,
        200,
        15,
        { topLeft: 3, topRight: 4, bottomRight: 5, bottomLeft: 6 },
        { enabled: true, width: 2, color: "#ff00ff" },
        undefined,
        false,
        "grp_text_1"
      );
      json = node.exportJSON();
    });

    let roundtripped: any = null;
    editor.update(() => {
      roundtripped = TextBoxNode.importJSON(json).exportJSON();
    });

    expect(roundtripped).toEqual(json);
  });

  it("roundtrips groupId for ResizableImageNode", () => {
    const editor = createEditor({
      namespace: "ResizableImageGroupIdTest",
      nodes: [ResizableImageNode],
      onError: () => {},
    });

    let json: any = null;
    editor.update(() => {
      const node = new ResizableImageNode(
        "public/projects/p1/lexical/demo.png",
        "demo",
        100,
        50,
        2,
        undefined,
        7,
        9,
        0,
        { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 },
        { enabled: true, width: 1, color: "#123456" },
        false,
        "grp_img_1"
      );
      json = node.exportJSON();
    });

    let roundtripped: any = null;
    editor.update(() => {
      roundtripped = ResizableImageNode.importJSON(json).exportJSON();
    });

    expect(roundtripped).toEqual(json);
  });

  it("roundtrips groupId for SvgNode", () => {
    const editor = createEditor({
      namespace: "SvgGroupIdTest",
      nodes: [SvgNode],
      onError: () => {},
    });

    let json: any = null;
    editor.update(() => {
      const node = new SvgNode("<svg></svg>", 1, 2, 300, 200, 0, undefined, false, "grp_svg_1");
      json = node.exportJSON();
    });

    let roundtripped: any = null;
    editor.update(() => {
      roundtripped = SvgNode.importJSON(json).exportJSON();
    });

    expect(roundtripped).toEqual(json);
  });
});

