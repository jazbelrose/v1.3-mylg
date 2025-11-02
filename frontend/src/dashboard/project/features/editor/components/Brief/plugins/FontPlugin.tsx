import React, { useEffect, useState, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
} from "lexical";
import { $patchStyleText } from "@lexical/selection";
import { SET_FONT_FAMILY_COMMAND, SET_FONT_SIZE_COMMAND } from "../commands";
import { useDropdown } from "../contexts/DropdownContext";

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

  const { activeDropdown, openDropdown, closeDropdown, dropdownRef } = useDropdown();
  const fontFamilyDropdownId = "font-family-dropdown";
  const fontSizeDropdownId = "font-size-dropdown";
  const fontFamilyButtonRef = useRef<HTMLButtonElement | null>(null);
  const fontSizeButtonRef = useRef<HTMLButtonElement | null>(null);

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

  const handleFontFamilyDropdownToggle = () => {
    if (activeDropdown === fontFamilyDropdownId) {
      closeDropdown();
    } else {
      openDropdown(fontFamilyDropdownId, fontFamilyButtonRef.current);
    }
  };

  const handleFontSizeDropdownToggle = () => {
    if (activeDropdown === fontSizeDropdownId) {
      closeDropdown();
    } else {
      openDropdown(fontSizeDropdownId, fontSizeButtonRef.current);
    }
  };

  const handleFontFamilyItemClick = (family: FontFamily) => {
    setFontFamily(family);
    editor.dispatchCommand(SET_FONT_FAMILY_COMMAND as LexicalCommand<FontFamily>, family);
    closeDropdown();
  };

  const handleFontSizeItemClick = (size: FontSize) => {
    setFontSize(size);
    editor.dispatchCommand(SET_FONT_SIZE_COMMAND as LexicalCommand<FontSize>, size);
    closeDropdown();
  };

  if (!showToolbar) return null;

  return (
    <>
      <button
        type="button"
        className="toolbar-item font-family-controls"
        onClick={handleFontFamilyDropdownToggle}
        ref={fontFamilyButtonRef}
        aria-label="Font Family"
      >
        <span className="text">{fontFamily}</span>
        <i className="chevron-down" />
      </button>

      {activeDropdown === fontFamilyDropdownId && (
        <div className="dropdown" ref={dropdownRef as React.RefObject<HTMLDivElement>}>
          {FONT_FAMILIES.map((family) => (
            <button
              key={family}
              type="button"
              className="item"
              onClick={() => handleFontFamilyItemClick(family)}
            >
              <span className="text">{family}</span>
              {fontFamily === family && <span className="active">✓</span>}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="toolbar-item font-size-controls"
        onClick={handleFontSizeDropdownToggle}
        ref={fontSizeButtonRef}
        aria-label="Font Size"
      >
        <span className="text">{fontSize}</span>
        <i className="chevron-down" />
      </button>

      {activeDropdown === fontSizeDropdownId && (
        <div className="dropdown" ref={dropdownRef as React.RefObject<HTMLDivElement>}>
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className="item"
              onClick={() => handleFontSizeItemClick(size)}
            >
              <span className="text">{size}</span>
              {fontSize === size && <span className="active">✓</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}









