import React, { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
} from "lexical";
import { $patchStyleText } from "@lexical/selection";
import { SET_TEXT_COLOR_COMMAND, SET_BG_COLOR_COMMAND } from "../commands";
import ColorPicker from "@/dashboard/project/features/editor/components/Brief/plugins/colorpicker/LexicalColorPicker";
import { useDropdown } from "../contexts/DropdownContext";

type Props = {
  /** Show the toolbar UI (buttons & popovers). If false, plugin still registers commands. */
  showToolbar?: boolean;
};

type ColorValue = string | null;

type DropdownCtx = {
  activeDropdown: string | null;
  openDropdown: (id: string, anchorRef?: React.RefObject<HTMLElement>) => void;
  closeDropdown: () => void;
  dropdownRef: React.RefObject<HTMLDivElement>;
};

export default function ColorPlugin({ showToolbar = true }: Props) {
  return <ColorPluginContent showToolbar={showToolbar} />;
}

function ColorPluginContent({ showToolbar }: { showToolbar: boolean }) {
  const [editor] = useLexicalComposerContext();

  const [currentTextColor, setCurrentTextColor] = useState<string>("#000000");
  const [currentBgColor, setCurrentBgColor] = useState<string>("#FFFFFF");

  // DropdownProvider is supplied by the surrounding LexicalEditor
  const { activeDropdown, openDropdown, closeDropdown, dropdownRef } =
    useDropdown() as unknown as DropdownCtx;

  const textColorDropdownId = "text-color-dropdown";
  const bgColorDropdownId = "bg-color-dropdown";

  // --- Toggle handlers ---
  const toggleTextColorPicker = () => {
    if (activeDropdown === textColorDropdownId) {
      closeDropdown();
    } else {
      openDropdown(textColorDropdownId, dropdownRef);
    }
  };

  const toggleBgColorPicker = () => {
    if (activeDropdown === bgColorDropdownId) {
      closeDropdown();
    } else {
      openDropdown(bgColorDropdownId, dropdownRef);
    }
  };

  // --- Apply color to selection via commands (also used by external callers) ---
  const handleTextColorChange = (newColor: string) => {
    setCurrentTextColor(newColor);
    editor.dispatchCommand(SET_TEXT_COLOR_COMMAND as LexicalCommand<ColorValue>, newColor);
  };

  const handleBgColorChange = (newColor: string) => {
    setCurrentBgColor(newColor);
    editor.dispatchCommand(SET_BG_COLOR_COMMAND as LexicalCommand<ColorValue>, newColor);
  };

  // --- Register command handlers once ---
  useEffect(() => {
    // Text color
    const unregisterTextColor = editor.registerCommand<ColorValue>(
      SET_TEXT_COLOR_COMMAND as LexicalCommand<ColorValue>,
      (payload) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            if (payload === null) {
              // remove inline color
              $patchStyleText(selection, { color: null });
            } else {
              $patchStyleText(selection, { color: payload });
            }
          }
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );

    // Background color
    const unregisterBgColor = editor.registerCommand<ColorValue>(
      SET_BG_COLOR_COMMAND as LexicalCommand<ColorValue>,
      (payload) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            if (payload === null) {
              $patchStyleText(selection, { "background-color": null });
            } else {
              $patchStyleText(selection, { "background-color": payload });
            }
          }
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );

    return () => {
      unregisterTextColor();
      unregisterBgColor();
    };
  }, [editor]);

  // If plugin is headless (no toolbar UI), stop here.
  if (!showToolbar) return null;

  return (
    <div className="toolbar" role="toolbar" aria-label="Text and background color">
      {/* Text Color */}
      <button
        type="button"
        onClick={toggleTextColorPicker}
        aria-haspopup="true"
        aria-expanded={activeDropdown === textColorDropdownId}
        aria-controls={textColorDropdownId}
        aria-label="Set Text Color"
        className="toolbar-item"
      >
        <i className="format font-color" style={{ opacity: 1 }} />
      </button>
      {activeDropdown === textColorDropdownId && (
        <div
          id={textColorDropdownId}
          className="color-dropdown"
          ref={dropdownRef}
          onMouseDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Text color picker"
        >
          <ColorPicker
            color={currentTextColor || "#000000"}
            defaultColor="#000000"
            onChange={handleTextColorChange}
          />
        </div>
      )}

      {/* Background Color */}
      <button
        type="button"
        onClick={toggleBgColorPicker}
        aria-haspopup="true"
        aria-expanded={activeDropdown === bgColorDropdownId}
        aria-controls={bgColorDropdownId}
        aria-label="Set Background Color"
        className="toolbar-item"
      >
        <i className="format bg-color" style={{ opacity: 1 }} />
      </button>
      {activeDropdown === bgColorDropdownId && (
        <div
          id={bgColorDropdownId}
          className="color-dropdown"
          ref={dropdownRef}
          onMouseDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Background color picker"
        >
          <ColorPicker
            color={currentBgColor || "#FFFFFF"}
            defaultColor="#FFFFFF"
            onChange={handleBgColorChange}
          />
        </div>
      )}
    </div>
  );
}











