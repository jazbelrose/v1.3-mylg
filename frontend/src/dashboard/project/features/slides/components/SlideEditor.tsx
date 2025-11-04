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
}

const SlideEditor: React.FC<SlideEditorProps> = ({
  projectId,
  slide,
  onContentChange,
  onSaveSuccess,
}) => {
  const { saveSlide, markDirty } = useSlidePersistence({
    projectId,
    slideId: slide.id,
    onSaveSuccess,
  });
  const slideDocId = `${projectId}::slide::${slide.id}`;

  const handleChange = useCallback(
    (json: string) => {
      markDirty();
      onContentChange?.(json);
      saveSlide(json, false); // Auto-save without toast
    },
    [markDirty, onContentChange, saveSlide]
  );

  const handleSave = useCallback(() => {
    // Manual save with toast
    if (slide.content) {
      saveSlide(slide.content, true);
    }
  }, [saveSlide, slide.content]);

  return (
    <div 
      className="slide-editor-container" 
      style={{ height: "100%", width: "100%" }}
      data-slide-id={slide.id}
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
  );
};

export default SlideEditor;
