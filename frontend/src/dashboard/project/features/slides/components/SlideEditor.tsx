// SlideEditor component - wraps Lexical editor for a single slide
import React, { useCallback } from "react";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import type { Slide } from "@/shared/utils/api";

interface SlideEditorProps {
  slide: Slide;
  projectId: string;
  onSlideChange: (slideId: string, content: string) => void;
}

/**
 * Wrapper component for Lexical editor bound to a specific slide
 */
export const SlideEditor: React.FC<SlideEditorProps> = ({
  slide,
  projectId,
  onSlideChange,
}) => {
  const handleChange = useCallback(
    (json: string) => {
      onSlideChange(slide.id, json);
    },
    [slide.id, onSlideChange]
  );

  const initialContent = React.useMemo(() => {
    if (!slide.content) return null;
    try {
      return JSON.parse(slide.content);
    } catch (e) {
      console.error("Failed to parse slide content:", e);
      return null;
    }
  }, [slide.content]);

  return (
    <div className="slide-editor-container" data-slide-id={slide.id}>
      <LexicalEditor
        onChange={handleChange}
        initialContent={initialContent}
      />
    </div>
  );
};
