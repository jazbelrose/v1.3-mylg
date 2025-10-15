import React, { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
} from "lexical";
import { $patchStyleText } from "@lexical/selection";
import { SET_FONT_FAMILY_COMMAND, SET_FONT_SIZE_COMMAND } from "../commands";

const FONT_FAMILIES = [
  "Helvetica Special",
  "Helvetica Black",
  "Helvetica Light",
  "Helvetica Neue",
  "Helvetica Medium",
  "mylg-serif",
] as const;

const FONT_SIZES = ["12px", "14px", "16px", "18px", "24px", "32px", "48px"] as const;

type FontFamily = (typeof FONT_FAMILIES)[number];
type FontSize = (typeof FONT_SIZES)[number];

type Props = {
  /** Show the toolbar UI (plugin still registers commands even if hidden). */
  showToolbar?: boolean;
};

export default function FontPlugin({ showToolbar = true }: Props) {
  const [editor] = useLexicalComposerContext();
  const [fontFamily, setFontFamily] = useState<FontFamily>(FONT_FAMILIES[0]);
  const [fontSize, setFontSize] = useState<FontSize>("16px");

  // Register commands once
  useEffect(() => {
    const unregisterFontFamily = editor.registerCommand<FontFamily>(
      SET_FONT_FAMILY_COMMAND as LexicalCommand<FontFamily>,
      (family) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $patchStyleText(selection, { "font-family": family });
          }
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );

    const unregisterFontSize = editor.registerCommand<FontSize>(
      SET_FONT_SIZE_COMMAND as LexicalCommand<FontSize>,
      (size) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $patchStyleText(selection, { "font-size": size });
          }
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );

    return () => {
      unregisterFontFamily();
      unregisterFontSize();
    };
  }, [editor]);

  const onFontFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as FontFamily;
    setFontFamily(value);
    editor.dispatchCommand(SET_FONT_FAMILY_COMMAND as LexicalCommand<FontFamily>, value);
  };

  const onFontSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as FontSize;
    setFontSize(value);
    editor.dispatchCommand(SET_FONT_SIZE_COMMAND as LexicalCommand<FontSize>, value);
  };

  if (!showToolbar) return null;

  return (
    <div className="toolbar">
      <select
        className="toolbar-item font-family"
        value={fontFamily}
        onChange={onFontFamilyChange}
        aria-label="Font Family"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      <select
        className="toolbar-item font-size"
        value={fontSize}
        onChange={onFontSizeChange}
        aria-label="Font Size"
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}









