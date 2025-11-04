// components/SlideEditor.tsx - Editor for a single slide
import React, { useCallback } from "react";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import { Slide } from "@/app/contexts/DataProvider";
import { useSlidePersistence } from "../hooks/useSlidePersistence";

interface SlideEditorProps {
  projectId: string;
  slide: Slide;
  onContentChange?: (content: string) => void;
  onSaveSuccess?: () => void;
  // Optional canvas dimensions (pixels) for editor canvas. When provided,
  // the editor will constrain the visible editing area to this size (centered).
  width?: number;
  height?: number;
}

const SlideEditor: React.FC<SlideEditorProps> = ({
  projectId,
  slide,
  onContentChange,
  onSaveSuccess,
  width,
  height,
}) => {
  const { saveSlide, markDirty } = useSlidePersistence({
    projectId,
    slideId: slide.id,
    onSaveSuccess,
  });
  const slideDocId = `${projectId}::slide::${slide.id}`;

  const handleChange = useCallback(
    (json: string) => {
      // Pass latest content to persistence so the debounced saver persists
      // the most recent edits instead of triggering immediate saves.
      markDirty(json);
      onContentChange?.(json);
      // Intentionally do NOT call saveSlide here to avoid saving on every
      // keystroke. useSlidePersistence will auto-save after a short debounce
      // using the content supplied to markDirty.
    },
    [markDirty, onContentChange]
  );

  const handleSave = useCallback(() => {
    // Manual save with toast
    if (slide.content) {
      saveSlide(slide.content, true);
    }
  }, [saveSlide, slide.content]);

  return (
    <div
      className="slide-editor-outer"
      style={{ height: "100%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      data-slide-id={slide.id}
    >
      {/* If width/height provided, constrain the visible canvas to those dimensions */}
      <div
        className="slide-canvas"
        style={{
          width: width ? `${width}px` : "100%",
          height: height ? `${height}px` : "calc(100% - 32px)",
          maxWidth: "100%",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          borderRadius: 6,
          overflow: "hidden",
          background: "white",
        }}
      >
        <LexicalEditor
          key={slide.id}
          docId={slideDocId}
          onChange={handleChange}
          // Pass the serialized JSON string (or null) to Lexical's collaboration plugin.
          // The plugin expects either a JSON string it can parse, or an EditorState instance —
          // passing a plain parsed object caused `editorState.isEmpty is not a function`.
          initialContent={slide.content ?? null}
          onSave={handleSave}
        />
      </div>
    </div>
  );
};

export default SlideEditor;
