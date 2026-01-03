/**
 * Magic Layout to Lexical JSON Serializer
 * 
 * Converts a LayoutVariant and image array into Lexical JSON content
 * that can be set directly on a Slide's content field.
 * 
 * This allows creating new slides with pre-populated magic layout content
 * without needing an active Lexical editor.
 */

import type { LayoutVariant, TasteModeId, GeneratedFrame, TypePack } from "./magicLayoutTypes";
import { getTasteMode } from "./tasteModes";
import { getTextFrameStyle, balanceText } from "./textFrameStyles";

// Type definitions for serialized node structures
interface SerializedTextNode {
  detail: number;
  format: number;
  mode: string;
  style: string;
  text: string;
  type: string;
  version: number;
}

interface SerializedParagraphNode {
  children: SerializedTextNode[];
  direction: null;
  format: string;
  indent: number;
  type: string;
  version: number;
  textFormat?: number;
  textStyle?: string;
}

interface SerializedPictureFrameNode {
  type: "picture-frame";
  version: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  groupId: string | null;
  imageSrc: string | null;
  fit: string;
  radius: number;
  positionX: number;
  positionY: number;
  border: {
    enabled: boolean;
    width: number;
    color: string;
  };
  background: string;
  locked: boolean;
}

interface SerializedTextBoxNode {
  type: "text-box";
  version: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  groupId: string | null;
  borderRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  border: {
    enabled: boolean;
    width: number;
    color: string;
  };
  locked: boolean;
  children: SerializedParagraphNode[];
  direction: null;
  format: string;
  indent: number;
}

interface LexicalRootContent {
  root: {
    children: Array<{
      children: Array<SerializedPictureFrameNode | SerializedTextBoxNode>;
      direction: null;
      format: string;
      indent: number;
      type: string;
      version: number;
      textFormat?: number;
      textStyle?: string;
    }>;
    direction: null;
    format: string;
    indent: number;
    type: string;
    version: number;
  };
}

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

/** Helper to convert hex to RGB string */
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }
  return "255, 255, 255";
}

/**
 * Serialize a TextBox frame to Lexical JSON format
 */
function serializeTextBoxFrame(
  frame: GeneratedFrame,
  tasteMode: TasteModeId
): SerializedTextBoxNode {
  const taste = getTasteMode(tasteMode);
  const typePack = taste.tokens.typePack;
  const radius = taste.tokens.radiusBase;
  const intent = frame.textConfig?.intent ?? "body";

  // Get editorial text frame styling
  const textStyle = getTextFrameStyle(
    frame.width,
    frame.height,
    tasteMode,
    intent
  );

  let content = frame.textConfig?.content ?? "";

  // Apply line-balance for headlines
  if ((intent === "headline" || intent === "subheadline") && content) {
    content = balanceText(content, 40);
  }

  // Build text style string
  const fontSize = calculateFontSize(frame, typePack);
  const fontFamily = getFontFamily(intent, typePack);
  const fontWeight = getFontWeight(intent, typePack);
  const lineHeight = typePack.bodyLineHeight;
  const letterSpacing = intent === "headline" ? typePack.headlineTracking : 0;

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
    `padding: ${textStyle.padding.top}px ${textStyle.padding.right}px ${textStyle.padding.bottom}px ${textStyle.padding.left}px`,
    `background-color: ${bgColor}`,
    `border-radius: ${textStyle.background.borderRadius}px`,
    ...(intent === "headline" || intent === "subheadline" 
      ? ["text-wrap: balance", "word-break: normal"]
      : []
    ),
  ].join("; ");

  // Create text node if content exists
  const textChildren: SerializedTextNode[] = content ? [{
    detail: 0,
    format: 0,
    mode: "normal",
    style: styleString,
    text: content,
    type: "text",
    version: 1,
  }] : [];

  return {
    type: "text-box",
    version: 3,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    rotation: frame.rotation,
    groupId: null,
    borderRadius: {
      topLeft: radius,
      topRight: radius,
      bottomRight: radius,
      bottomLeft: radius,
    },
    border: {
      enabled: false,
      width: 2,
      color: "#ffffff",
    },
    locked: frame.locks.lockPosition,
    children: [{
      children: textChildren,
      direction: null,
      format: "",
      indent: 0,
      type: "paragraph",
      version: 1,
    }],
    direction: null,
    format: "",
    indent: 0,
  };
}

/**
 * Serialize a PictureFrame to Lexical JSON format
 */
function serializePictureFrame(
  frame: GeneratedFrame,
  imageSrc: string | null,
  tasteMode: TasteModeId
): SerializedPictureFrameNode {
  const taste = getTasteMode(tasteMode);
  const tokens = taste.tokens;

  return {
    type: "picture-frame",
    version: 3,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    rotation: frame.rotation,
    groupId: null,
    imageSrc: imageSrc,
    fit: "cover",
    radius: frame.radius,
    positionX: 50,
    positionY: 50,
    border: tokens.strokeWidth > 0
      ? { enabled: true, width: tokens.strokeWidth, color: tokens.strokeColor }
      : { enabled: false, width: 2, color: "#ffffff" },
    background: imageSrc ? "transparent" : "#2a2c2f",
    locked: frame.locks.lockPosition,
  };
}

/**
 * Generate Lexical JSON content for a magic layout
 * 
 * @param variant - The layout variant to serialize
 * @param images - Array of image URLs to assign to image frames
 * @param tasteMode - The taste mode for styling
 * @returns JSON string of Lexical content
 */
export function generateMagicLayoutContent(
  variant: LayoutVariant,
  images: Array<string | null | undefined>,
  tasteMode: TasteModeId
): string {
  const nodes: Array<SerializedPictureFrameNode | SerializedTextBoxNode> = [];
  let imageFrameIndex = 0;

  variant.frames.forEach((frame) => {
    if (frame.contentType === "text") {
      nodes.push(serializeTextBoxFrame(frame, tasteMode));
    } else {
      // Use provided images in order; if we run out, keep the remaining frames empty.
      const imageSrc = images[imageFrameIndex] ?? null;
      imageFrameIndex++;
      nodes.push(serializePictureFrame(frame, imageSrc, tasteMode));
    }
  });

  const content: LexicalRootContent = {
    root: {
      children: [
        {
          children: nodes,
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
          textFormat: 0,
          textStyle: "",
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };

  return JSON.stringify(content);
}
