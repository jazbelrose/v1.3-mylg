// components/SlideEditor.tsx - Editor for a single slide
import React, { useCallback, useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import SlideToolbar from "./SlideToolbar";
import SlideContextMenu, { type ContextMenuPosition } from "./SlideContextMenu";
import LayoutGeneratorPanel from "./LayoutGeneratorPanel";
import { Slide } from "@/app/contexts/DataProvider";
import { useSlidePersistence } from "../hooks/useSlidePersistence";
import { ToolbarActions } from "@/dashboard/project/features/editor/components/Brief/plugins/ToolbarActionsPlugin";
import { DropdownProvider } from "@/dashboard/project/features/editor/components/Brief/contexts/DropdownContext";
import { ToolbarContextProvider } from "@/dashboard/project/features/editor/components/Brief/plugins/ToolbarContextBridge";
import { getFileUrl } from "@/shared/utils/api";
import {
  type FontFamily,
  type FontSize,
  type TextBlockType,
  type LineHeight,
  type LetterSpacing,
} from "@/dashboard/project/features/editor/components/Brief/plugins/toolbarShared";
import type { LayoutMode } from "../lib/pictureFrameLayoutGenerator";
import "./SlideEditor.css";

interface SlideEditorProps {
  projectId: string;
  slide: Slide;
  onContentChange?: (content: string) => void;
  onSaveSuccess?: () => void;
  onSlideBackgroundColorChange?: (color: string) => void;
  onPreview?: () => void;
  // Toolbar props
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onImportPdf?: () => void;
  isImportingPdf?: boolean;
  pdfImportStatus?: "idle" | "uploading" | "processing";
  importProgress?: number;
  importCurrentPage?: number;
  importTotalPages?: number;
  isSaving?: boolean;
  isDirty?: boolean;
  // Zoom props
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onSetZoom?: (level: number) => void;
  onNewSlide?: () => void;
  toolbarPortalContainer?: HTMLElement | null;
  // Deck version props
  versionDropdown?: React.ReactNode;
}

// Fixed stage dimensions (16:9 aspect ratio) - never changes
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const SLIDE_PADDING = "96px 120px";

const SlideEditor: React.FC<SlideEditorProps> = ({
  projectId,
  slide,
  onContentChange,
  onSaveSuccess,
  onSlideBackgroundColorChange,
  onPreview,
  onDuplicate,
  onDelete,
  onExport,
  onImportPdf,
  isImportingPdf = false,
  pdfImportStatus,
  importProgress,
  importCurrentPage,
  importTotalPages,
  isSaving = false,
  isDirty = false,
  zoom = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSetZoom,
  onNewSlide,
  toolbarPortalContainer,
  versionDropdown,
}) => {
  const [toolbarActions, setToolbarActions] = useState<ToolbarActions | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPosition | null>(null);
  const [layoutPanelOpen, setLayoutPanelOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const toolbarContainerRef = useRef<HTMLDivElement | null>(null);
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

  const handleOpenLayoutPanel = useCallback(() => {
    setLayoutPanelOpen(true);
  }, []);

  const handleCloseLayoutPanel = useCallback(() => {
    setLayoutPanelOpen(false);
  }, []);

  const handleApplyLayout = useCallback(
    (count: number, mode: LayoutMode, seed: string) => {
      toolbarActions?.onApplyPictureFrameLayout(count, mode, seed);
    },
    [toolbarActions]
  );

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

      const rawScale = Math.min(availableWidth / STAGE_WIDTH, availableHeight / STAGE_HEIGHT);
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
  }, []);

  // Keyboard shortcuts (zoom + z-order)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      if (isCtrlOrCmd) {
        // Z-order shortcuts (classic design-app style)
        // Ctrl/⌘]        = bring forward
        // Ctrl/⌘[        = send backward
        // Ctrl/⌘Shift]   = bring to front
        // Ctrl/⌘Shift[   = send to back
        if (!event.altKey) {
          const isBracketRight = event.key === "]" || event.code === "BracketRight";
          const isBracketLeft = event.key === "[" || event.code === "BracketLeft";
          if ((isBracketRight || isBracketLeft) && toolbarActions) {
            event.preventDefault();
            event.stopPropagation();

            if (event.shiftKey) {
              if (isBracketRight) {
                toolbarActions.onBringToFront();
              } else {
                toolbarActions.onSendToBack();
              }
              return;
            }

            if (isBracketRight) {
              toolbarActions.onBringForward();
            } else {
              toolbarActions.onSendBackward();
            }
            return;
          }
        }

         switch (event.key) {
          case 'g':
          case 'G':
            if (toolbarActions?.onGroupSelection) {
              event.preventDefault();
              event.stopPropagation();
              toolbarActions.onGroupSelection();
            }
            break;
          case 'u':
          case 'U':
            if (toolbarActions?.onUngroupSelection) {
              event.preventDefault();
              event.stopPropagation();
              toolbarActions.onUngroupSelection();
            }
            break;
          case 'd':
          case 'D':
            if (toolbarActions?.onDuplicateSelection) {
              event.preventDefault();
              event.stopPropagation();
              toolbarActions.onDuplicateSelection();
            }
            break;
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

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onZoomIn, onZoomOut, onResetZoom, toolbarActions]);

  const customToolbar = toolbarActions ? (
    <SlideToolbar
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onExport={onExport}
      onPreview={onPreview}
      onImportPdf={onImportPdf}
      isImportingPdf={isImportingPdf}
      pdfImportStatus={pdfImportStatus}
      importProgress={importProgress}
      importCurrentPage={importCurrentPage}
      importTotalPages={importTotalPages}
      isSaving={isSaving}
      isDirty={isDirty}
      // Zoom controls
      zoom={zoom}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      onResetZoom={onResetZoom}
      onSetZoom={onSetZoom}
      // Map toolbar actions to individual props
      onUndo={toolbarActions.onUndo}
      onRedo={toolbarActions.onRedo}
      onFormatBold={toolbarActions.onBold}
      onFormatItalic={toolbarActions.onItalic}
      onFormatUnderline={toolbarActions.onUnderline}
      onFormatStrikethrough={toolbarActions.onStrikethrough}
      onFormatCode={toolbarActions.onCode}
      onSetBlockType={(type: TextBlockType) => {
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
      onSetLineHeight={(lineHeight: LineHeight) => toolbarActions.onLineHeightChange(lineHeight)}
      onSetLetterSpacing={(letterSpacing: LetterSpacing) => toolbarActions.onLetterSpacingChange(letterSpacing)}
      onSetTextColor={toolbarActions.onFontColorChange}
      onSetBgColor={toolbarActions.onBgColorChange}
      onSetSlideBackgroundColor={onSlideBackgroundColorChange}
      slideBackgroundColor={slide.backgroundColor || '#101112'}
      onInsertImage={toolbarActions.onAddImage}
      onInsertSvg={toolbarActions.onInsertVector}
      onInsertTextBox={toolbarActions.onInsertTextBox}
      onInsertPictureFrame={toolbarActions.onInsertPictureFrame}
      onOpenLayoutPanel={handleOpenLayoutPanel}
      onInsertFigma={toolbarActions.onFigma}
      onInsertLayout={(template: string) => toolbarActions.onInsertLayout(template)}
      // Property update handlers (keep in toolbar)
      onUpdateImageBorderRadius={toolbarActions.onUpdateImageBorderRadius}
      onUpdateImageBorder={toolbarActions.onUpdateImageBorder}
      onUpdatePictureFrameRadius={toolbarActions.onUpdatePictureFrameRadius}
      onUpdatePictureFrameFit={toolbarActions.onUpdatePictureFrameFit}
      onUpdatePictureFrameBorder={toolbarActions.onUpdatePictureFrameBorder}
      onUpdateTextBoxBorder={toolbarActions.onUpdateTextBoxBorder}
      onUpdateTextBoxBorderRadius={toolbarActions.onUpdateTextBoxBorderRadius}
      onNewSlide={onNewSlide}
      versionDropdown={versionDropdown}
    />
  ) : null;

  // Context menu handler for right-click
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const toolbarOutput =
    customToolbar && toolbarPortalContainer
      ? ReactDOM.createPortal(customToolbar, toolbarPortalContainer)
      : customToolbar;

  const scale = zoom / 100;
  const appliedScale = Math.max(scale * fitScale, 0.01);
  const backgroundImageUrl = slide.backgroundImage ? getFileUrl(slide.backgroundImage) : null;

  return (
    <DropdownProvider>
      <ToolbarContextProvider>
        <div
          className="slide-editor"
          data-slide-id={slide.id}
          data-canvas-width={STAGE_WIDTH}
          data-canvas-height={STAGE_HEIGHT}
        >
          <div className="slide-editor__toolbar-container" ref={toolbarContainerRef}>
            {toolbarOutput}
            <LayoutGeneratorPanel
              open={layoutPanelOpen}
              onClose={handleCloseLayoutPanel}
              onApply={handleApplyLayout}
            />
          </div>

          {zoom !== 100 && (
            <div className="slide-editor__zoom-warning">
              Zoom active: Positions may not match thumbnails. Reset to 100% for accuracy.
            </div>
          )}

          <div 
            className="slide-editor__canvas" 
            ref={canvasRef}
            onContextMenu={handleContextMenu}
          >
            <div
              className="slide-editor__canvas-scaler"
              style={{
                transform: `scale(${appliedScale})`,
                transformOrigin: "center center",
              }}
            >
              <div
                className="slide-editor__canvas-inner"
                style={{
                  width: `${STAGE_WIDTH}px`,
                  height: `${STAGE_HEIGHT}px`,
                  backgroundColor: slide.backgroundColor || '#101112',
                  ...(backgroundImageUrl
                    ? {
                        backgroundImage: `url("${backgroundImageUrl}")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                        backgroundSize: "contain",
                      }
                    : null),
                }}
              >
                <div className="slide-editor__slide-frame">
                  <LexicalEditor
                    key={slide.id}
                    docId={`${projectId}::slide::${slide.id}`}
                    onChange={handleChange}
                    showDefaultToolbar={false}
                    initialContent={slide.content ?? null}
                    onSave={handleSave}
                    registerToolbar={handleRegisterToolbar}
                    customToolbar={null}
                    disableDropdownProvider
                    contentOverflowBehavior="hidden"
                    contentPadding={SLIDE_PADDING}
                    contentMaxHeight="100%"
                    slidesMode={true}
                    scale={appliedScale}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right-click Context Menu */}
          {toolbarActions && (
            <SlideContextMenu
              position={contextMenuPosition}
              onClose={handleCloseContextMenu}
              // Clipboard (TODO: implement cut/copy/paste in ToolbarActions)
              onPaste={undefined}
              onCut={undefined}
              onCopy={undefined}
              // Arrange (z-order)
              onBringToFront={toolbarActions.onBringToFront}
              onBringForward={toolbarActions.onBringForward}
              onSendBackward={toolbarActions.onSendBackward}
              onSendToBack={toolbarActions.onSendToBack}
              // Object Alignment
              onAlignSelectionLeft={toolbarActions.onAlignSelectionLeft}
              onAlignSelectionRight={toolbarActions.onAlignSelectionRight}
              onAlignSelectionTop={toolbarActions.onAlignSelectionTop}
              onAlignSelectionBottom={toolbarActions.onAlignSelectionBottom}
              onDistributeSelectionHorizontal={toolbarActions.onDistributeSelectionHorizontal}
              onDistributeSelectionVertical={toolbarActions.onDistributeSelectionVertical}
              // Group
              onGroupSelection={toolbarActions.onGroupSelection}
              onUngroupSelection={toolbarActions.onUngroupSelection}
              // Lock & Delete
              onLockSelection={toolbarActions.onToggleLockSelection}
              onDeleteSelection={toolbarActions.onDeleteSelection}
              // Insert (for canvas context)
              onInsertTextBox={toolbarActions.onInsertTextBox}
              onInsertPictureFrame={toolbarActions.onInsertPictureFrame}
              onInsertPictureFrameLayout={toolbarActions.onInsertPictureFrameLayout}
              onInsertImage={toolbarActions.onAddImage}
              onInsertSvg={toolbarActions.onInsertVector}
              // Replace picture frame with text box
              onReplacePictureFrameWithTextBox={toolbarActions.onReplacePictureFrameWithTextBox}
            />
          )}
        </div>
      </ToolbarContextProvider>
    </DropdownProvider>
  );
};

export default SlideEditor;
