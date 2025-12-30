import { describe, expect, it } from "vitest";
import { createEditor } from "lexical";
import { PictureFrameNode } from "./PictureFrameNode";

describe("PictureFrameNode", () => {
  it("serializes and deserializes with fields intact", () => {
    const editor = createEditor({
      namespace: "PictureFrameNodeTest",
      nodes: [PictureFrameNode],
      onError: () => {},
    });

    let json: any = null;
    editor.update(() => {
      const node = new PictureFrameNode(
        123,
        456,
        320,
        240,
        0,
        "public/projects/p1/lexical/demo.png",
        "cover",
        24,
        { x: 12, y: 88 },
        { enabled: true, width: 3, color: "#ff00ff" },
        "#eeeeee",
        undefined,
        false,
        "group_demo_1"
      );
      json = node.exportJSON();
    });

    let roundtripped: any = null;
    editor.update(() => {
      roundtripped = PictureFrameNode.importJSON(json).exportJSON();
    });

    expect(roundtripped).toEqual(json);
  });

  it("defaults missing image position fields on import", () => {
    const editor = createEditor({
      namespace: "PictureFrameNodeLegacyImportTest",
      nodes: [PictureFrameNode],
      onError: () => {},
    });

    let json: any = null;
    editor.update(() => {
      const node = new PictureFrameNode();
      json = node.exportJSON();
      delete json.positionX;
      delete json.positionY;
      json.version = 1;
    });

    let imported: any = null;
    editor.update(() => {
      imported = PictureFrameNode.importJSON(json).exportJSON();
    });

    expect(imported.positionX).toBe(50);
    expect(imported.positionY).toBe(50);
  });

  it("clamps radius to non-negative numbers", () => {
    const editor = createEditor({
      namespace: "PictureFrameNodeRadiusTest",
      nodes: [PictureFrameNode],
      onError: () => {},
    });

    let radius = -1;
    editor.update(() => {
      const node = new PictureFrameNode();
      node.setRadius(-10);
      radius = node.getRadius();
    });
    expect(radius).toBe(0);
  });
});
