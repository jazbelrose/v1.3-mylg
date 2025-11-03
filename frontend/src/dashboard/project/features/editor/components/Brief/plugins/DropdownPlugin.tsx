import React, { useEffect, useState } from "react";
import ReactModal from "react-modal";
import { DownOutlined } from "@ant-design/icons";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
} from "lexical";
import { OPEN_DROPDOWN_COMMAND } from "../commands";

type Props = {
  showToolbarButton?: boolean;
};

// Bind modal to the app element for accessibility (avoid during SSR)
if (typeof document !== "undefined") {
  ReactModal.setAppElement("#root");
}

export default function DropdownPlugin({ showToolbarButton = true }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<string[]>(["Option 1", "Option 2", "Option 3"]);
  const [editor] = useLexicalComposerContext();

  // Allow other UI (palette/shortcut) to open the modal
  useEffect(() => {
    const unregister = editor.registerCommand(
      OPEN_DROPDOWN_COMMAND,
      () => {
        setIsOpen(true);
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
    return unregister;
  }, [editor]);

  const insertDropdown = () => {
    editor.update(() => {
      // For simplicity, insert a text node with the dropdown representation
      // In a real implementation, you'd create a custom node
      const text = `Dropdown: ${options.join(", ")}`;
      const node = $createTextNode(text);
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertNodes([node]);
      } else {
        $insertNodes([node]);
      }
    });
    setIsOpen(false);
  };

  const addOption = () => {
    setOptions([...options, `Option ${options.length + 1}`]);
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  return (
    <div>
      {showToolbarButton && (
        <button
          aria-label="Add Dropdown"
          type="button"
          style={{ background: "none", border: "none", cursor: "pointer", paddingRight: 18 }}
          onClick={() => setIsOpen(true)}
        >
          <DownOutlined style={{ fontSize: 18, color: "black" }} />
        </button>
      )}

      <ReactModal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(false)}
        style={{
          content: {
            top: "50%",
            left: "50%",
            right: "auto",
            bottom: "auto",
            marginRight: "-50%",
            transform: "translate(-50%, -50%)",
            width: "400px",
            padding: "20px",
          },
        }}
      >
        <h2 style={{ margin: 0, fontSize: "20px", color: "black" }}>Add Dropdown</h2>
        <div style={{ marginTop: "20px" }}>
          <label>Options:</label>
          {options.map((option, index) => (
            <div key={index} style={{ display: "flex", marginBottom: "10px" }}>
              <input
                type="text"
                value={option}
                onChange={(e) => updateOption(index, e.target.value)}
                style={{ flex: 1, marginRight: "10px" }}
              />
              <button onClick={() => removeOption(index)}>Remove</button>
            </div>
          ))}
          <button onClick={addOption} style={{ marginBottom: "20px" }}>Add Option</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => setIsOpen(false)}>Cancel</button>
          <button onClick={insertDropdown}>Insert</button>
        </div>
      </ReactModal>
    </div>
  );
}