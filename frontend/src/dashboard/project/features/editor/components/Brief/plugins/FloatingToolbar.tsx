// FloatingToolbar.tsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $setSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type RangeSelection,
} from "lexical";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { mergeRegister } from "@lexical/utils";

import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  LinkOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";

import { useDropdown } from "../contexts/DropdownContext";


type Props = {
  /** Ref to the editor container element to observe visibility and position */
  editorRef: React.RefObject<HTMLElement>;
};

type Position = { top: number; left: number } | null;

const LowPriority = 1;

const FloatingToolbar: React.FC<Props> = ({ editorRef }) => {
  const [editor] = useLexicalComposerContext();

  const [position, setPosition] = useState<Position>(null);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isLinkEditMode, setIsLinkEditMode] = useState(false);
  const [tempLinkUrl, setTempLinkUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const [isInputFocused, setIsInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  // from DropdownContext: keep toolbar open/hidden logic while dropdowns are active
  const { isDropdownOpen } = useDropdown();

  const updateToolbarState = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const range = selection as RangeSelection;

      setIsBold(range.hasFormat("bold"));
      setIsItalic(range.hasFormat("italic"));
      setIsUnderline(range.hasFormat("underline"));
      setIsStrikethrough(range.hasFormat("strikethrough"));

      const node = range.anchor.getNode();
      const parent = node.getParent();
      if (parent && $isLinkNode(parent)) {
        setIsEditMode(true);
        const url = parent.getURL() || "";
        setLinkUrl(url);

        // if not actively editing, mirror into temp input value
        if (!isLinkEditMode) {
          setTempLinkUrl(url);
        }
      } else {
        setIsEditMode(false);
        setLinkUrl("");
        if (!isLinkEditMode) setTempLinkUrl("");
      }
    } else {
      setIsBold(false);
      setIsItalic(false);
      setIsUnderline(false);
      setIsStrikethrough(false);
      setTempLinkUrl("");
    }
  }, [isLinkEditMode]);

  useEffect(() => {
    const updateToolbarPosition = () => {
      const selection = $getSelection();

      // Keep position unchanged while input focused or dropdown open
      if (isInputFocused || isDropdownOpen) return;

      if (!$isRangeSelection(selection)) {
        setPosition(null);
        return;
      }

      const selectedText = selection?.getTextContent() || "";
      if (selectedText.trim().length === 0) {
        setPosition(null);
        return;
      }

      const nativeSelection = window.getSelection();
      if (!nativeSelection || nativeSelection.rangeCount === 0) {
        setPosition(null);
        return;
      }

      const range = nativeSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setPosition(null);
        return;
      }

      setPosition({
        top: window.scrollY + rect.bottom + 5,
        left: window.scrollX + rect.left + rect.width / 2 - 80,
      });
    };

    const handleSelectionChange = () => {
      editor.getEditorState().read(() => {
        updateToolbarPosition();
        updateToolbarState();
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editor, isEditMode, isLinkEditMode, isInputFocused, isDropdownOpen, updateToolbarState]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbarState();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbarState();
          return false;
        },
        LowPriority
      )
    );
  }, [editor, updateToolbarState]);

  const handleSubmitLink = (url: string) => {
    const value = url.trim();
    if (value) {
      editor.dispatchCommand(
        TOGGLE_LINK_COMMAND,
        value.startsWith("http") ? value : `https://${value}`
      );
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
    setIsLinkEditMode(false);
    setIsInputFocused(false);
    setIsEditMode(false);
    setLinkUrl("");
  };

  const handleRemoveLink = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setIsLinkEditMode(false);
    setIsInputFocused(false);
    setIsEditMode(false);
    setLinkUrl("");
  };

  const handleCancelEdit = () => {
    setIsLinkEditMode(false);
    setIsInputFocused(false);
    setIsEditMode(false);
    // tempLinkUrl is reverted to current linkUrl by caller if needed
  };

  // Hide toolbar entirely when nothing to show, or when a dropdown is open
  const shouldHide =
    (!position && !isEditMode && !isLinkEditMode && !isInputFocused) ||
    isDropdownOpen;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          // Editor scrolled out of view
          setPosition(null);
          setIsEditMode(false);
          setIsLinkEditMode(false);
          setIsInputFocused(false);

          editor.update(() => {
            const selection = $getSelection();
            if (selection) {
              $setSelection(null);
            }
          });
        }
      },
      { threshold: 0.1 }
    );

    const el = editorRef.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [editor, editorRef]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setIsLinkEditMode(false);
        handleCancelEdit();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (shouldHide) return null;

  return ReactDOM.createPortal(
    <div
      ref={toolbarRef}
      className="floating-toolbar"
      style={{
        position: "absolute",
        top: `${position ? position.top : 0}px`,
        left: `${position ? position.left : 0}px`,
        zIndex: 1000,

      }}
    >
      {/* Bold */}
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        aria-label="Format Bold"
        style={formatButtonStyle(isBold)}
      >
        <BoldOutlined style={iconStyle(isBold)} />
      </button>

      {/* Italic */}
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        aria-label="Format Italic"
        style={formatButtonStyle(isItalic)}
      >
        <ItalicOutlined style={iconStyle(isItalic)} />
      </button>

      {/* Underline */}
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
        aria-label="Format Underline"
        style={formatButtonStyle(isUnderline)}
      >
        <UnderlineOutlined style={iconStyle(isUnderline)} />
      </button>

      {/* Strikethrough */}
      <button
        type="button"
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
        }
        aria-label="Format Strikethrough"
        style={formatButtonStyle(isStrikethrough)}
      >
        <StrikethroughOutlined style={iconStyle(isStrikethrough)} />
      </button>

      {/* Link UI */}
      {isLinkEditMode ? (
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <input
            ref={inputRef}
            type="text"
            value={tempLinkUrl}
            onChange={(e) => setTempLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmitLink(tempLinkUrl);
              } else if (e.key === "Escape") {
                e.preventDefault();
                // Revert to last known linkUrl
                setTempLinkUrl(linkUrl);
                handleCancelEdit();
              }
            }}
            placeholder="Enter a URL"
            style={inputStyle}
            onFocus={() => setIsInputFocused(true)}
            onBlur={(e) => {
              // allow time for button click within toolbar
              setTimeout(() => {
                const related = e.relatedTarget as Node | null;
                if (
                  toolbarRef.current &&
                  related &&
                  toolbarRef.current.contains(related)
                ) {
                  return;
                }
                setIsInputFocused(false);
              }, 100);
            }}
          />
          <button
            type="button"
            onClick={() => handleSubmitLink(tempLinkUrl)}
            aria-label="Submit Link"
            style={smallButtonStyle}
            disabled={!tempLinkUrl.trim()}
          >
            <CheckOutlined style={iconStyle(!!tempLinkUrl.trim())} />
          </button>
          <button
            type="button"
            onClick={() => {
              setTempLinkUrl(linkUrl);
              handleCancelEdit();
            }}
            aria-label="Cancel Link Editing"
            style={smallButtonStyle}
          >
            <CloseOutlined style={iconStyle(true)} />
          </button>
        </div>
      ) : linkUrl ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "4px 8px",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
        >
          <a
            href={linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "underline", color: "#007bff" }}
          >
            {linkUrl}
          </a>
          <button
            type="button"
            onClick={() => {
              setIsLinkEditMode(true);
              setTempLinkUrl(linkUrl);
            }}
            aria-label="Edit Link"
            style={smallButtonStyle}
          >
            <EditOutlined style={iconStyle(true)} />
          </button>
          <button
            type="button"
            onClick={handleRemoveLink}
            aria-label="Remove Link"
            style={smallButtonStyle}
          >
            <DeleteOutlined style={iconStyle(true)} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // keep selection
          onClick={() => {
            setIsLinkEditMode(true);
            setTempLinkUrl("");
          }}
          aria-label="Insert Link"
          style={buttonStyle(!!linkUrl)}
        >
          <LinkOutlined style={iconStyle(!!linkUrl)} />
        </button>
      )}
    </div>,
    document.body
  );
};

/* ---------- styles & helpers ---------- */

const formatButtonStyle = (active: boolean): React.CSSProperties => ({
  all: "unset",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "4px",
  padding: "8px",
  backgroundColor: active ? "rgba(223, 232, 250, 0.3)" : "transparent",
  transition: "background-color 0.2s ease",
  
});

const buttonStyle = (active: boolean): React.CSSProperties => ({
  all: "unset",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "4px",
  padding: "8px",
  backgroundColor: active ? "rgba(223, 232, 250, 0.3)" : "transparent",
  
});

const smallButtonStyle: React.CSSProperties = {
  all: "unset",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "4px",
  padding: "4px",
  backgroundColor: "transparent",
  transition: "background-color 0.2s ease",
  
};

const iconStyle = (active: boolean): React.CSSProperties => ({
  fontSize: "18px",
  opacity: active ? 1 : 0.5,
  transition: "opacity 0.2s ease",
});

const inputStyle: React.CSSProperties = {
  padding: "6px",
  border: "1px solid #ccc",
  borderRadius: "4px",
  width: "150px",
  
  backgroundColor: "#fff",
};

export default FloatingToolbar;









