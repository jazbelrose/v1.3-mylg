// components/SlideEditor.tsx - Editor for a single slide
import React, { useCallback, useState, useEffect, useRef } from "react";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import SlideToolbar from "./SlideToolbar";
import { Slide } from "@/app/contexts/DataProvider";
import { useSlidePersistence } from "../hooks/useSlidePersistence";
import { ToolbarActions } from "@/dashboard/project/features/editor/components/Brief/plugins/ToolbarActionsPlugin";
import { DropdownProvider } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
import "./SlideEditor.css";

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
  // Zoom props
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
}

const SlideEditor: React.FC<SlideEditorProps> = ({
  projectId,
  slide,
  onContentChange,
  onSaveSuccess,
  width = 1920,
  height = 1080,
  onDuplicate,
  onDelete,
  onExport,
  isSaving = false,
  isDirty = false,
  zoom = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  const [toolbarActions, setToolbarActions] = useState<ToolbarActions | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const calculateFitScale = () => {
      const target = canvasRef.current;
      if (!target) {
        return;
      }

      const rect = target.getBoundingClientRect();
      const styles = window.getComputedStyle(target);
      const paddingX =
        parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0");
      const paddingY =
        parseFloat(styles.paddingTop || "0") + parseFloat(styles.paddingBottom || "0");

      const availableWidth = rect.width - paddingX;
      const availableHeight = rect.height - paddingY;

      if (availableWidth <= 0 || availableHeight <= 0) {
        setFitScale(1);
        return;
      }

      const rawScale = Math.min(availableWidth / width, availableHeight / height);
      const nextScale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
      setFitScale(Math.min(1, nextScale));
    };

    calculateFitScale();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            calculateFitScale();
          })
        : null;

    if (canvasRef.current && resizeObserver) {
      resizeObserver.observe(canvasRef.current);
    }

    window.addEventListener("resize", calculateFitScale);

    return () => {
      window.removeEventListener("resize", calculateFitScale);
      resizeObserver?.disconnect();
    };
  }, [width, height]);

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      if (isCtrlOrCmd) {
        switch (event.key) {
          case '=':
          case '+':
            event.preventDefault();
            onZoomIn?.();
            break;
          case '-':
            event.preventDefault();
            onZoomOut?.();
            break;
          case '0':
            event.preventDefault();
            onResetZoom?.();
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onZoomIn, onZoomOut, onResetZoom]);

  const customToolbar = toolbarActions ? (
    <SlideToolbar
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onExport={onExport}
      isSaving={isSaving}
      isDirty={isDirty}
      // Zoom controls
      zoom={zoom}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      onResetZoom={onResetZoom}
      // Map toolbar actions to individual props
      onUndo={toolbarActions.onUndo}
      onRedo={toolbarActions.onRedo}
      onFormatBold={toolbarActions.onBold}
      onFormatItalic={toolbarActions.onItalic}
      onFormatUnderline={toolbarActions.onUnderline}
      onFormatStrikethrough={toolbarActions.onStrikethrough}
      onFormatCode={toolbarActions.onCode}
      onSetBlockType={(type: BlockType) => {
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
      onSetFontFamily={(font: FontFamily) => toolbarActions.onFontChange(font)}
      onSetFontSize={(size: FontSize) => toolbarActions.onFontSizeChange(size)}
      onSetTextColor={toolbarActions.onFontColorChange}
      onSetBgColor={toolbarActions.onBgColorChange}
      onInsertImage={toolbarActions.onAddImage}
      onInsertFigma={toolbarActions.onFigma}
      onInsertLayout={() => toolbarActions.onInsertLayout("1fr 1fr")}
    />
  ) : null;

  const scale = zoom / 100;
  const appliedScale = Math.max(scale * fitScale, 0.01);
  const scaledWidth = width * appliedScale;
  const scaledHeight = height * appliedScale;

  return (
    <div
      className="slide-editor"
      data-slide-id={slide.id}
      data-canvas-width={width}
      data-canvas-height={height}
    >
      <DropdownProvider>{customToolbar}</DropdownProvider>

      <div className="slide-editor__canvas" ref={canvasRef}>
        <div
          className="slide-editor__canvas-scaler"
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
          }}
        >
          <div
            className="slide-editor__canvas-inner"
            style={{
              width: `${width}px`,
              height: `${height}px`,
              transform: `scale(${appliedScale})`,
              transformOrigin: "center center",
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
              customToolbar={null}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlideEditor;