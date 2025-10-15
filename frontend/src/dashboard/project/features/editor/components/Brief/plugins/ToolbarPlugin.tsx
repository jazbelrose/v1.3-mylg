import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  ListNode,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $createCodeNode, $isCodeNode, getDefaultCodeLanguage, getCodeLanguages } from "@lexical/code";

import { useDropdown } from "../contexts/DropdownContext";
import ImagePlugin from "./ImagePlugin";
import VectorPlugin from "./VectorPlugin";
import FigmaPlugin from "./FigmaPlugin";
import ColorPlugin from "./ColorPlugin";
import FontPlugin from "./FontPlugin";
import { LayoutPlugin } from "./LayoutPlugin";
import SpeechToTextPlugin from "./SpeechToTextPlugin";

const LowPriority = 1 as const;

type BlockType = "paragraph" | "quote" | "code" | "h1" | "h2" | "ul" | "ol";

const supportedBlockTypes = new Set<BlockType>([
  "paragraph",
  "quote",
  "code",
  "h1",
  "h2",
  "ul",
  "ol",
]);

const blockTypeToBlockName: Record<BlockType | "h3" | "h4" | "h5", string> = {
  code: "Code Block",
  h1: "Large Heading",
  h2: "Small Heading",
  h3: "Heading",
  h4: "Heading",
  h5: "Heading",
  ol: "Numbered List",
  paragraph: "Normal",
  quote: "Quote",
  ul: "Bulleted List",
};

function Divider() {
  return <div className="divider" />;
}

type SelectProps = {
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
  options: string[];
  value: string;
};
function Select({ onChange, className, options, value }: SelectProps) {
  return (
    <select className={className} onChange={onChange} value={value}>
      <option hidden value="" />
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export default function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const blockButtonRef = useRef<HTMLButtonElement | null>(null);

  const { activeDropdown, openDropdown, closeDropdown, dropdownRef } = useDropdown();
  const blockDropdownId = "block-dropdown";

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>("paragraph");
  const [selectedElementKey, setSelectedElementKey] = useState<string | null>(null);

  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState<string>("");

  const formatBlock = useCallback(
    (type: BlockType) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        if (["paragraph", "h1", "h2", "quote", "code"].includes(type)) {
          editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        }

        switch (type) {
          case "paragraph":
            $setBlocksType(selection, () => $createParagraphNode());
            break;
          case "h1":
            $setBlocksType(selection, () => $createHeadingNode("h1" as HeadingTagType));
            break;
          case "h2":
            $setBlocksType(selection, () => $createHeadingNode("h2" as HeadingTagType));
            break;
          case "quote":
            $setBlocksType(selection, () => $createQuoteNode());
            break;
          case "code":
            $setBlocksType(selection, () => $createCodeNode());
            break;
          case "ul":
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
            break;
          case "ol":
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
            break;
        }
      });
      closeDropdown();
    },
    [editor, closeDropdown]
  );

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();
      const elementKey = element.getKey();
      const elementDOM = editor.getElementByKey(elementKey);

      if (elementDOM !== null) {
        setSelectedElementKey(elementKey);
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType(anchorNode, ListNode);
          const type = parentList ? (parentList.getTag() as BlockType) : ((element as ListNode).getTag() as BlockType);
          setBlockType(type);
        } else {
          const type = $isHeadingNode(element)
            ? ((element.getTag() as unknown) as BlockType)
            : ((element.getType() as unknown) as BlockType);
          setBlockType(type);
          if ($isCodeNode(element)) {
            setCodeLanguage(element.getLanguage() || getDefaultCodeLanguage());
          }
        }
      }

      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));
    }
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar();
          return false;
        },
        LowPriority
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload: boolean) => {
          setCanUndo(payload);
          return false;
        },
        LowPriority
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload: boolean) => {
          setCanRedo(payload);
          return false;
        },
        LowPriority
      )
    );
  }, [editor, updateToolbar]);

  const codeLanguages = useMemo(() => getCodeLanguages(), []);
  const onCodeLanguageSelect = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const lang = e.target.value;
      editor.update(() => {
        if (selectedElementKey !== null) {
          editor._editorState.read(() =>
            editor.getEditorState().read(() => null)
          ); // noop to satisfy TS when not reading nodes directly
        }
        // safer: just try to set on selected top-level node
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const top = selection.anchor.getNode().getTopLevelElementOrThrow();
          if ($isCodeNode(top)) {
            top.setLanguage(lang);
          }
        }
      });
    },
    [editor, selectedElementKey]
  );

  const handleDropdownToggle = () => {
    if (activeDropdown === blockDropdownId) {
      closeDropdown();
    } else {
      openDropdown(blockDropdownId, blockButtonRef.current);
    }
  };

  const handleDropdownItemClick = (type: BlockType) => {
    formatBlock(type);
    closeDropdown();
  };

  return (
    <>
      <div className="toolbar" ref={toolbarRef} style={{ position: "relative" }}>
        <button
          type="button"
          disabled={!canUndo}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          className="toolbar-item spaced"
          aria-label="Undo"
        >
          <i className="format undo" />
        </button>

        <button
          type="button"
          disabled={!canRedo}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          className="toolbar-item"
          aria-label="Redo"
        >
          <i className="format redo" />
        </button>

        <Divider />

        {supportedBlockTypes.has(blockType) && (
          <>
            <button
              type="button"
              className="toolbar-item block-controls"
              onClick={handleDropdownToggle}
              ref={blockButtonRef}
              aria-label="Formatting Options"
            >
              <span className={"icon block-type " + blockType} />
              <span className="text">{blockTypeToBlockName[blockType]}</span>
              <i className="chevron-down" />
            </button>

            {activeDropdown === blockDropdownId && (
              <div className="dropdown" ref={dropdownRef as React.RefObject<HTMLDivElement>}>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("paragraph")}
                >
                  <span className="icon">¶</span>
                  <span className="text">Body</span>
                  {blockType === "paragraph" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("h1")}
                >
                  <span className="icon">H1</span>
                  <span className="text">Heading</span>
                  {blockType === "h1" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("h2")}
                >
                  <span className="icon">H2</span>
                  <span className="text">Subheading</span>
                  {blockType === "h2" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("quote")}
                >
                  <span className="icon">❝</span>
                  <span className="text">Quote</span>
                  {blockType === "quote" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("ul")}
                >
                  <span className="icon">•</span>
                  <span className="text">Bulleted</span>
                  {blockType === "ul" && <span className="active">✓</span>}
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleDropdownItemClick("ol")}
                >
                  <span className="icon">1.</span>
                  <span className="text">Numbered</span>
                  {blockType === "ol" && <span className="active">✓</span>}
                </button>
              </div>
            )}
            <Divider />
          </>
        )}

        {blockType !== "code" && (
          <>
            <button
              type="button"
              onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
              className={"toolbar-item spaced " + (isBold ? "active" : "")}
              aria-label="Format Bold"
            >
              <i className="format bold" />
            </button>
            <button
              type="button"
              onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
              className={"toolbar-item spaced " + (isItalic ? "active" : "")}
              aria-label="Format Italics"
            >
              <i className="format italic" />
            </button>
            <button
              type="button"
              onClick={() =>
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
              }
              className={"toolbar-item spaced " + (isUnderline ? "active" : "")}
              aria-label="Format Underline"
            >
              <i className="format underline" />
            </button>
            <button
              type="button"
              onClick={() =>
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
              }
              className={"toolbar-item spaced " + (isStrikethrough ? "active" : "")}
              aria-label="Format Strikethrough"
            >
              <i className="format strikethrough" />
            </button>
            <button
              type="button"
              onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
              className={"toolbar-item spaced " + (isCode ? "active" : "")}
              aria-label="Insert Code"
            >
              <i className="format code" />
            </button>

            <Divider />

            <button
              type="button"
              onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left")}
              className="toolbar-item spaced"
              aria-label="Left Align"
            >
              <i className="format left-align" />
            </button>
            <button
              type="button"
              onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center")}
              className="toolbar-item spaced"
              aria-label="Center Align"
            >
              <i className="format center-align" />
            </button>
            <button
              type="button"
              onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right")}
              className="toolbar-item spaced"
              aria-label="Right Align"
            >
              <i className="format right-align" />
            </button>
            <button
              type="button"
              onClick={() =>
                editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "justify")
              }
              className="toolbar-item"
              aria-label="Justify Align"
            >
              <i className="format justify-align" />
            </button>

            <Divider />
            <FontPlugin />
            <Divider />
            <ColorPlugin />
            <Divider />
            <ImagePlugin />
            <VectorPlugin />
            <FigmaPlugin />
            <LayoutPlugin />
            <SpeechToTextPlugin />
          </>
        )}

        {blockType === "code" && (
          <>
            <Select
              className="toolbar-item code-language"
              onChange={onCodeLanguageSelect}
              options={codeLanguages}
              value={codeLanguage}
            />
            <i className="chevron-down inside" />
          </>
        )}
      </div>
    </>
  );
}









