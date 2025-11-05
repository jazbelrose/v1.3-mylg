// components/SlideEditor.tsx - Editor for a single slide
import React, { useCallback, useState } from "react";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import SlideToolbar from "./SlideToolbar";
import { Slide } from "@/app/contexts/DataProvider";
import { useSlidePersistence } from "../hooks/useSlidePersistence";
import { ToolbarActions } from "@/dashboard/project/features/editor/components/Brief/plugins/ToolbarActionsPlugin";

type BlockType = "paragraph" | "quote" | "code" | "h1" | "h2" | "ul" | "ol";
type FontFamily = "Helvetica Special" | "Helvetica Black" | "Helvetica Light" | "Helvetica Neue" | "Helvetica Medium" | "mylg-serif";
type FontSize = "12px" | "14px" | "16px" | "18px" | "24px" | "32px" | "48px";

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
  isSaving?: boolean;
  isDirty?: boolean;
}

const SlideEditor: React.FC<SlideEditorProps> = ({
  projectId,
  slide,
  onContentChange,
  onSaveSuccess,
  onDuplicate,
  onDelete,
  onExport,
  isSaving = false,
  isDirty = false,
}) => {
  const [toolbarActions, setToolbarActions] = useState<ToolbarActions | null>(null);

  const { saveSlide, markDirty } = useSlidePersistence({
    projectId,
    slideId: slide.id,
    onSaveSuccess,
  });

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

  const handleRegisterToolbar = useCallback((actions: ToolbarActions) => {
    setToolbarActions(actions);
  }, []);

  const customToolbar = toolbarActions ? (
    <SlideToolbar
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onExport={onExport}
      isSaving={isSaving}
      isDirty={isDirty}
      // Map toolbar actions to individual props
      onUndo={toolbarActions.onUndo}
      onRedo={toolbarActions.onRedo}
      onFormatBold={toolbarActions.onBold}
      onFormatItalic={toolbarActions.onItalic}
      onFormatUnderline={toolbarActions.onUnderline}
      onFormatStrikethrough={toolbarActions.onStrikethrough}
      onFormatCode={toolbarActions.onCode}
      onSetBlockType={(type) => {
        switch (type) {
          case "h1": toolbarActions.onHeading1(); break;
          case "h2": toolbarActions.onHeading2(); break;
          case "quote": toolbarActions.onQuote(); break;
          case "ul": toolbarActions.onUnorderedList(); break;
          case "ol": toolbarActions.onOrderedList(); break;
          default: toolbarActions.onParagraph(); break;
        }
      }}
      onAlignLeft={toolbarActions.onAlignLeft}
      onAlignCenter={toolbarActions.onAlignCenter}
      onAlignRight={toolbarActions.onAlignRight}
      onAlignJustify={toolbarActions.onAlignJustify}
      onSetFontFamily={toolbarActions.onFontChange}
      onSetFontSize={toolbarActions.onFontSizeChange}
      onSetTextColor={toolbarActions.onFontColorChange}
      onSetBgColor={toolbarActions.onBgColorChange}
      onInsertImage={toolbarActions.onAddImage}
      onInsertFigma={toolbarActions.onFigma}
      onInsertLayout={() => toolbarActions.onInsertLayout("1fr 1fr")}
    />
  ) : null;

  return (
    <div
      className="slide-editor-container"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#1a1a1a",
        overflow: "hidden",
      }}
    >
      <LexicalEditor
        key={slide.id}
        docId={`${projectId}::slide::${slide.id}`}
        onChange={handleChange}
        showDefaultToolbar={false}
        initialContent={slide.content ?? null}
        onSave={handleSave}
        registerToolbar={handleRegisterToolbar}
        customToolbar={customToolbar}
      />
    </div>
  );
};

export default SlideEditor;