// components/SlideEditor.tsx - Editor for a single slide
import React, { useCallback, useEffect, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import SlideToolbar from "./SlideToolbar";
import { Slide } from "@/app/contexts/DataProvider";
import { useSlidePersistence } from "../hooks/useSlidePersistence";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  $createParagraphNode,
  type LexicalCommand,
} from "lexical";
import { $getNearestNodeOfType } from "@lexical/utils";
import { $isListNode, ListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from "@lexical/list";
import { $isHeadingNode, $createHeadingNode, $createQuoteNode, type HeadingTagType } from "@lexical/rich-text";
import { $isCodeNode, $createCodeNode, getDefaultCodeLanguage } from "@lexical/code";
import { $setBlocksType } from "@lexical/selection";
import {
  OPEN_IMAGE_COMMAND,
  OPEN_FIGMA_COMMAND,
  OPEN_VECTOR_COMMAND,
  SET_TEXT_COLOR_COMMAND,
  SET_BG_COLOR_COMMAND,
  SET_FONT_FAMILY_COMMAND,
  SET_FONT_SIZE_COMMAND,
} from "@/dashboard/project/features/editor/components/Brief/commands";
import { OPEN_LAYOUT_COMMAND } from "@/dashboard/project/features/editor/components/Brief/plugins/LayoutCommands";
import { DropdownProvider } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";

type BlockType = "paragraph" | "quote" | "code" | "h1" | "h2" | "ul" | "ol";
type FontFamily = "Helvetica Special" | "Helvetica Black" | "Helvetica Light" | "Helvetica Neue" | "Helvetica Medium" | "mylg-serif";
type FontSize = "12px" | "14px" | "16px" | "18px" | "24px" | "32px" | "48px";

// Editor wrapper component that has access to Lexical context
const EditorWithToolbar: React.FC<{
  projectId: string;
  slide: Slide;
  onContentChange?: (content: string) => void;
  onSaveSuccess?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onMicToggle?: () => void;
  onPreview?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  isMicActive?: boolean;
  slideSizePreset?: "1280x720" | "1920x1080";
  onChangeSlideSize?: (preset: "1280x720" | "1920x1080") => void;
}> = ({
  projectId,
  slide,
  onContentChange,
  onSaveSuccess,
  onDuplicate,
  onDelete,
  onExport,
  onMicToggle,
  onPreview,
  isSaving = false,
  isDirty = false,
  isMicActive = false,
}) => {
  const [editor] = useLexicalComposerContext();
  const [zoom, setZoom] = useState(100); // Default 100% zoom
  const { saveSlide, markDirty } = useSlidePersistence({
    projectId,
    slideId: slide.id,
    onSaveSuccess,
  });

  // Formatting state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>("paragraph");
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [fontFamily] = useState<FontFamily>("Helvetica Neue");
  const [fontSize] = useState<FontSize>("16px");
  const [textColor] = useState("#000000");
  const [bgColor] = useState("#ffffff");
  const [codeLanguage, setCodeLanguage] = useState("");

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();

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

      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));
    }
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      1
    );
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload: boolean) => {
        setCanUndo(payload);
        return false;
      },
      1
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload: boolean) => {
        setCanRedo(payload);
        return false;
      },
      1
    );
  }, [editor]);

  const handleChange = useCallback(
    (json: string) => {
      markDirty(json);
      onContentChange?.(json);
    },
    [markDirty, onContentChange]
  );

  const handleSave = useCallback(() => {
    if (slide.content) {
      saveSlide(slide.content, true);
    }
  }, [saveSlide, slide.content]);

  // Command dispatch functions
  const dispatchCommand = useCallback(<T,>(command: LexicalCommand<T>, payload?: T) => {
    editor.dispatchCommand(command, payload);
  }, [editor]);

  const handleFormatBlock = useCallback(
    (type: string) => {
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
    },
    [editor]
  );

  return (
    <div
      className="slide-editor-outer"
      style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: 16 }}
      data-slide-id={slide.id}
    >
      {/* Unified SlideToolbar */}
      <DropdownProvider>
        <SlideToolbar
        // Slide actions
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onExport={onExport}
        onMicToggle={onMicToggle}
        onSave={handleSave}
        onPreview={onPreview}
        isSaving={isSaving}
        isDirty={isDirty}
        isMicActive={isMicActive}

        // Zoom controls
        zoom={zoom}
        onZoomIn={() => setZoom(prev => Math.min(prev + 25, 200))}
        onZoomOut={() => setZoom(prev => Math.max(prev - 25, 25))}
        onResetZoom={() => setZoom(100)}

        // Text formatting commands
        onUndo={() => dispatchCommand(UNDO_COMMAND)}
        onRedo={() => dispatchCommand(REDO_COMMAND)}
        canUndo={canUndo}
        canRedo={canRedo}
        onFormatBold={() => dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        onFormatItalic={() => dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        onFormatUnderline={() => dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
        onFormatStrikethrough={() => dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")}
        onFormatCode={() => dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
        onAlignLeft={() => dispatchCommand(FORMAT_ELEMENT_COMMAND, "left")}
        onAlignCenter={() => dispatchCommand(FORMAT_ELEMENT_COMMAND, "center")}
        onAlignRight={() => dispatchCommand(FORMAT_ELEMENT_COMMAND, "right")}
        onAlignJustify={() => dispatchCommand(FORMAT_ELEMENT_COMMAND, "justify")}
        onSetBlockType={handleFormatBlock}
        onSetFontFamily={(font) => dispatchCommand(SET_FONT_FAMILY_COMMAND, font)}
        onSetFontSize={(size) => dispatchCommand(SET_FONT_SIZE_COMMAND, size)}
        onSetTextColor={(color) => dispatchCommand(SET_TEXT_COLOR_COMMAND, color)}
        onSetBgColor={(color) => dispatchCommand(SET_BG_COLOR_COMMAND, color)}
        onInsertImage={() => dispatchCommand(OPEN_IMAGE_COMMAND)}
        onInsertVector={() => dispatchCommand(OPEN_VECTOR_COMMAND)}
        onInsertFigma={() => dispatchCommand(OPEN_FIGMA_COMMAND)}
        onInsertLayout={() => dispatchCommand(OPEN_LAYOUT_COMMAND)}

        // Text formatting state
        isBold={isBold}
        isItalic={isItalic}
        isUnderline={isUnderline}
        isStrikethrough={isStrikethrough}
        isCode={isCode}
        blockType={blockType}
        fontFamily={fontFamily}
        fontSize={fontSize}
        textColor={textColor}
        bgColor={bgColor}
        codeLanguage={codeLanguage}
        onSetCodeLanguage={setCodeLanguage}
      />
      </DropdownProvider>

      {/* Lexical Editor without toolbar */}
      <div
        className="editor-stage"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1a1a", // Dark workspace background
          overflow: "hidden",
        }}
      >
        <div
          className="slide-board"
          style={{
            width: "1920px",
            height: "1080px",
            background: "white",
            borderRadius: "6px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            overflow: "hidden",
            transformOrigin: "center center",
            transform: `scale(${zoom / 100})`,
          }}
        >
          <LexicalEditor
            key={slide.id}
            docId={`${projectId}::slide::${slide.id}`}
            onChange={handleChange}
            showDefaultToolbar={false}
            initialContent={slide.content ?? null}
            onSave={handleSave}
          />
        </div>
      </div>
    </div>
  );
};

interface SlideEditorProps {
  projectId: string;
  slide: Slide;
  onContentChange?: (content: string) => void;
  onSaveSuccess?: () => void;
  width?: number;
  height?: number;
  // Toolbar props
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onMicToggle?: () => void;
  onPreview?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  isMicActive?: boolean;
}

const SlideEditor: React.FC<SlideEditorProps> = (props) => {
  // Lexical configuration
  const initialConfig = {
    namespace: "SlideEditor",
    theme: {
      // Add your theme here
    },
    onError: (error: Error) => {
      console.error(error);
    },
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorWithToolbar {...props} />
    </LexicalComposer>
  );
};

export default SlideEditor;
