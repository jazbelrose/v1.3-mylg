import React, { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  type LexicalCommand,
} from "lexical";
import {
  $patchStyleText,
  $getSelectionStyleValueForProperty,
} from "@lexical/selection";
import { SET_TEXT_COLOR_COMMAND, SET_BG_COLOR_COMMAND } from "../commands";
import ColorPicker from "@/shared/ui/ColorPicker";
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
  const [currentBgColor, setCurrentBgColor] = useState<string>("#ffffff");

  const updateColorState = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const textColor = $getSelectionStyleValueForProperty(
          selection,
          "color",
          "#000000"
        );
        const bgColor = $getSelectionStyleValueForProperty(
          selection,
          "background-color",
          "#ffffff"
        );
        setCurrentTextColor(textColor);
        setCurrentBgColor(bgColor);
      }
    });
  }, [editor]);

  useEffect(() => {
    const unregisterUpdate = editor.registerUpdateListener(
      ({ editorState }) => {
        editorState.read(() => {
          updateColorState();
        });
      }
    );
    return unregisterUpdate;
  }, [editor, updateColorState]);

  // DropdownProvider is supplied by the surrounding LexicalEditor
  const { closeDropdown } =
    useDropdown() as unknown as DropdownCtx;

  // --- Apply color to selection via commands (also used by external callers) ---
  const handleTextColorChange = (e: { target: { value: string } }) => {
    const newColor = e.target.value;
    editor.dispatchCommand(
      SET_TEXT_COLOR_COMMAND as LexicalCommand<ColorValue>,
      newColor
    );
    closeDropdown();
  };

  const handleBgColorChange = (e: { target: { value: string } }) => {
    const newColor = e.target.value;
    editor.dispatchCommand(
      SET_BG_COLOR_COMMAND as LexicalCommand<ColorValue>,
      newColor
    );
    closeDropdown();
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
    <div
      className="toolbar"
      role="toolbar"
      aria-label="Text and background color"
    >
      <ColorPicker
        color={currentTextColor || "#000000"}
        onChange={handleTextColorChange}
        title="Text color"
      />

      {/* Background Color */}

      <ColorPicker
        color={currentBgColor || "#ffffff"}
        onChange={handleBgColorChange}
        title="Background color"
      />
    </div>
  );
}











