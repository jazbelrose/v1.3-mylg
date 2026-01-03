/**
 * MagicLayoutPlugin - Handles Magic Layout generation and application
 * 
 * This plugin processes INSERT_MAGIC_LAYOUT_COMMAND and creates:
 * - PictureFrameNode for image frames
 * - TextBoxNode for text frames (styled copy blocks)
 * 
 * Phase 1.5 Polish:
 * - Taste-based padding for text frames
 * - Optional subtle tile background
 * - Title line-balance (CSS text-wrap: balance)
 * - Drop-cap presets
 */

import React, { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $createParagraphNode,
  $createNodeSelection,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  type LexicalNode,
} from "lexical";
import { $createTextNode, TextNode } from "lexical";

import {
  INSERT_MAGIC_LAYOUT_COMMAND,
  type InsertMagicLayoutPayload,
} from "../commands";
import { $createPictureFrameNode, PictureFrameNode } from "./nodes/PictureFrameNode";
import { $createTextBoxNode, TextBoxNode } from "./nodes/TextBoxNode";
import { getTasteMode } from "@/dashboard/project/features/slides/lib/tasteModes";
import { 
  getTextFrameStyle, 
  balanceText,
  type TextFrameStyle,
} from "@/dashboard/project/features/slides/lib/textFrameStyles";
import type { GeneratedFrame, TasteModeId, TypePack, TextIntent } from "@/dashboard/project/features/slides/lib/magicLayoutTypes";

/**
 * Calculate font size based on frame dimensions and text intent
 */
function calculateFontSize(
  frame: GeneratedFrame,
  typePack: TypePack
): number {
  const intent = frame.textConfig?.intent ?? "body";
  const baseSize = typePack.baseFontSize;
  const scale = typePack.typeScale;

  // Scale based on intent
  switch (intent) {
    case "headline":
      return Math.round(baseSize * Math.pow(scale, 3));
    case "subheadline":
      return Math.round(baseSize * Math.pow(scale, 2));
    case "quote":
      return Math.round(baseSize * Math.pow(scale, 1.5));
    case "label":
    case "caption":
      return Math.round(baseSize * 0.85);
    case "body":
    default:
      return baseSize;
  }
}

/**
 * Get font family based on text intent
 */
function getFontFamily(intent: string, typePack: TypePack): string {
  switch (intent) {
    case "headline":
    case "subheadline":
      return typePack.headlineFont;
    case "caption":
    case "label":
      return typePack.captionFont;
    case "body":
    case "quote":
    default:
      return typePack.bodyFont;
  }
}

/**
 * Get font weight based on text intent
 */
function getFontWeight(intent: string, typePack: TypePack): number {
  switch (intent) {
    case "headline":
      return typePack.headlineWeight;
    case "caption":
    case "label":
      return typePack.captionWeight;
    case "body":
    case "quote":
    default:
      return typePack.bodyWeight;
  }
}

/**
 * Create a styled TextBoxNode from a text frame
 * Phase 1.5: Includes editorial styling (padding, backgrounds, line-balance, drop-caps)
 */
function createTextBoxFromFrame(
  frame: GeneratedFrame,
  tasteMode: TasteModeId
): TextBoxNode {
  const taste = getTasteMode(tasteMode);
  const typePack = taste.tokens.typePack;
  const radius = taste.tokens.radiusBase;
  const intent = frame.textConfig?.intent ?? "body";

  // Get editorial text frame styling (Phase 1.5)
  const textStyle = getTextFrameStyle(
    frame.width,
    frame.height,
    tasteMode,
    intent
  );

  // Create text box with frame dimensions
  const textBox = $createTextBoxNode(
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    frame.rotation,
    frame.locks.lockPosition, // locked
    undefined, // border (use default)
    { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius }, // borderRadius
    undefined // groupId
  );

  // Add paragraph with styled text content
  const paragraph = $createParagraphNode();
  let content = frame.textConfig?.content ?? "";

  // Apply line-balance for headlines (Phase 1.5)
  if ((intent === "headline" || intent === "subheadline") && content) {
    content = balanceText(content, 40);
  }

  if (content) {
    const textNode = $createTextNode(content);
    
    // Apply styling via TextNode styles
    const fontSize = calculateFontSize(frame, typePack);
    const fontFamily = getFontFamily(intent, typePack);
    const fontWeight = getFontWeight(intent, typePack);
    const lineHeight = typePack.bodyLineHeight;
    const letterSpacing = intent === "headline" ? typePack.headlineTracking : 0;

    // Build CSS style string with editorial padding (Phase 1.5)
    const bg = textStyle.background;
    const bgColor = bg.enabled 
      ? `rgba(${hexToRgb(bg.color)}, ${bg.opacity})`
      : "transparent";

    const styleString = [
      `font-family: ${fontFamily}`,
      `font-size: ${fontSize}px`,
      `font-weight: ${fontWeight}`,
      `line-height: ${lineHeight}`,
      `letter-spacing: ${letterSpacing}em`,
      "color: rgba(255, 255, 255, 0.95)",
      // Editorial padding (applied to text box container)
      `padding: ${textStyle.padding.top}px ${textStyle.padding.right}px ${textStyle.padding.bottom}px ${textStyle.padding.left}px`,
      `background-color: ${bgColor}`,
      `border-radius: ${textStyle.background.borderRadius}px`,
      // Line balance for headlines
      ...(intent === "headline" || intent === "subheadline" 
        ? ["text-wrap: balance", "word-break: normal"]
        : []
      ),
    ].join("; ");

    textNode.setStyle(styleString);
    paragraph.append(textNode);
  }

  textBox.append(paragraph);
  return textBox;
}

// Helper to convert hex to RGB string
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }
  return "255, 255, 255";
}

/**
 * Create a PictureFrameNode from an image frame
 */
function createPictureFrameFromFrame(
  frame: GeneratedFrame,
  tasteMode: TasteModeId
): PictureFrameNode {
  const taste = getTasteMode(tasteMode);
  const tokens = taste.tokens;

  return $createPictureFrameNode({
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    fit: "cover",
    radius: frame.radius,
    imageSrc: frame.imageSrc,
    background: frame.imageSrc ? "transparent" : "#2a2c2f",
    border: tokens.strokeWidth > 0
      ? { enabled: true, width: tokens.strokeWidth, color: tokens.strokeColor }
      : { enabled: false, width: 2, color: "#ffffff" },
  });
}

export default function MagicLayoutPlugin(): React.ReactElement | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Ensure required nodes are registered
    if (!editor.hasNodes([PictureFrameNode])) {
      console.error("MagicLayoutPlugin: PictureFrameNode not registered");
      return;
    }
    if (!editor.hasNodes([TextBoxNode])) {
      console.error("MagicLayoutPlugin: TextBoxNode not registered");
      return;
    }

    return editor.registerCommand(
      INSERT_MAGIC_LAYOUT_COMMAND,
      (payload: InsertMagicLayoutPayload) => {
        const { variant, tasteMode, slideImages } = payload;

        if (!variant || !variant.frames || variant.frames.length === 0) {
          console.warn("MagicLayoutPlugin: No frames in variant");
          return true;
        }

        // Get the image set for this slide (first one, since each slide gets its own command)
        const currentSlideImages = slideImages?.[0] ?? [];

        editor.update(() => {
          const nodes: LexicalNode[] = [];
          let imageFrameIndex = 0;

          variant.frames.forEach((frame) => {
            if (frame.contentType === "text") {
              // Create TextBox for text frames
              const textBox = createTextBoxFromFrame(frame, tasteMode);
              nodes.push(textBox);
            } else {
              // Get image from slideImages if available, otherwise use frame's imageSrc
              const imageSrc = currentSlideImages[imageFrameIndex] ?? frame.imageSrc;
              imageFrameIndex++;

              // Create PictureFrame with the assigned image
              const frameWithImage = { ...frame, imageSrc };
              const pictureFrame = createPictureFrameFromFrame(frameWithImage, tasteMode);
              nodes.push(pictureFrame);
            }
          });

          // Append all nodes to root in a paragraph
          const root = $getRoot();
          const last = root.getLastChild();

          if (last && last.getType() === "paragraph") {
            (last as unknown as { append: (...nodes: LexicalNode[]) => void }).append(
              ...nodes
            );
          } else {
            const paragraph = $createParagraphNode();
            root.append(paragraph);
            paragraph.append(...nodes);
          }

          // Select all created nodes
          const selection = $createNodeSelection();
          nodes.forEach((node) => selection.add(node.getKey()));
          $setSelection(selection);
        });

        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  return null;
}
