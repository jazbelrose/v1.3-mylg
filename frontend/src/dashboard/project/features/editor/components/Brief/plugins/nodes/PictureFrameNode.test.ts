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
        { enabled: true, width: 3, color: "#ff00ff" },
        "#eeeeee",
        undefined,
        false
      );
      json = node.exportJSON();
    });

    let roundtripped: any = null;
    editor.update(() => {
      roundtripped = PictureFrameNode.importJSON(json).exportJSON();
    });

    expect(roundtripped).toEqual(json);
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
