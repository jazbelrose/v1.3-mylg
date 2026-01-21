// components/SlideEditor.tsx - Editor for a single slide
import React, { useCallback, useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import LexicalEditor from "@/dashboard/project/features/editor/components/Brief/LexicalEditor";
import SlideToolbar from "./SlideToolbar";
import SlideContextMenu, { type ContextMenuPosition } from "./SlideContextMenu";
import LayoutGeneratorPanel from "./LayoutGeneratorPanel";
import MagicLayoutWorkspace from "./MagicLayoutWorkspace";
import { Slide } from "@/app/contexts/DataProvider";
import { useSlidePersistence } from "../hooks/useSlidePersistence";
import { useEditTracking } from "../hooks/useEditTracking";
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
import type { LayoutVariant, TasteModeId } from "../lib/magicLayoutTypes";
import { isLexicalContentEffectivelyEmpty } from "../lib/lexicalContent";
import "./SlideEditor.css";

interface SlideEditorProps {
  projectId: string;
  slide: Slide;
  deckName?: string;
  slideNumber?: number;
  onContentChange?: (content: string) => void;
  onSaveSuccess?: () => void;
  onSlideBackgroundColorChange?: (color: string) => void;
  onPreview?: () => void;
  // Toolbar props
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onExportAllPdf?: (preset?: "screen" | "high" | "print") => void;
  isExportingPdf?: boolean;
  pdfExportProgress?: { current: number; total: number } | null;
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
  /** Callback to create multiple slides with Magic Layout */
  onCreateSlidesWithLayout?: (
    variants: LayoutVariant[],
    slideImages: Array<Array<string | null>>,
    options: { mode: LayoutMode; seed: string; tasteMode: TasteModeId }
  ) => Promise<void>;
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
  deckName,
  slideNumber,
  onContentChange,
  onSaveSuccess,
  onSlideBackgroundColorChange,
  onPreview,
  onDuplicate,
  onDelete,
  onExport,
  onExportAllPdf,
  isExportingPdf = false,
  pdfExportProgress,
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
  onCreateSlidesWithLayout,
  toolbarPortalContainer,
  versionDropdown,
}) => {
  const [toolbarActions, setToolbarActions] = useState<ToolbarActions | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPosition | null>(null);
  const [layoutPanelOpen, setLayoutPanelOpen] = useState(false);
  const [magicPanelOpen, setMagicPanelOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const toolbarContainerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const scaleRef = useRef(1);

  const { saveSlide, markDirty } = useSlidePersistence({
    projectId,
    slideId: slide.id,
    onSaveSuccess,
  });

  const { trackChange, forceFlush } = useEditTracking(projectId, projectId, deckName);

  const handleChange = useCallback(
    (json: string) => {
      markDirty(json);
      onContentChange?.(json);
      trackChange('text', slide.id, slideNumber);
    },
    [markDirty, onContentChange, trackChange, slide.id, slideNumber]
  );

  const handleSave = useCallback(() => {
    if (slide.content) {
      saveSlide(slide.content, true);
    }
    forceFlush();
  }, [saveSlide, slide.content, forceFlush]);

  const handleRegisterToolbar = useCallback((actions: ToolbarActions) => {
    setToolbarActions(actions);
  }, []);

  const handleOpenLayoutPanel = useCallback(() => {
    setLayoutPanelOpen(true);
  }, []);

  const handleCloseLayoutPanel = useCallback(() => {
    setLayoutPanelOpen(false);
  }, []);

  const handleOpenMagicPanel = useCallback(() => {
    setMagicPanelOpen(true);
  }, []);

  const handleCloseMagicPanel = useCallback(() => {
    setMagicPanelOpen(false);
  }, []);

  // Close panels when slide changes to prevent stale state
  useEffect(() => {
    setMagicPanelOpen(false);
    setLayoutPanelOpen(false);
    setContextMenuPosition(null);
  }, [slide.id]);

  const handleApplyLayout = useCallback(
    (count: number, mode: LayoutMode, seed: string, images?: string[]) => {
      toolbarActions?.onApplyPictureFrameLayout(count, mode, seed, images);
    },
    [toolbarActions]
  );

  const handleApplyMagicLayout = useCallback(
    async (
      variants: LayoutVariant[],
      options: { 
        mode: LayoutMode; 
        seed: string; 
        tasteMode: TasteModeId;
        slideCount?: number;
        slideImages?: Array<Array<string | null>>;
        textStyle?: { fontStyle: string; dropCap: boolean; autoSize: boolean };
      }
    ) => {
      const slideCount = options.slideCount ?? 1;
      const slideImages = options.slideImages ?? [];
      const normalizedSlideCount = Math.max(1, slideCount);
      const normalizedSlideImages = Array.from({ length: normalizedSlideCount }, (_, i) => slideImages[i] ?? []);
      const normalizedVariants = Array.from({ length: normalizedSlideCount }, (_, i) => variants[i] ?? variants[0]).filter(Boolean);

      // Insert-mode: always create new slides when parent callback exists (including Insert Slides = 1)
      if (onCreateSlidesWithLayout) {
        await onCreateSlidesWithLayout(normalizedVariants, normalizedSlideImages, {
          mode: options.mode,
          seed: options.seed,
          tasteMode: options.tasteMode,
        });
        return;
      }

      // Single slide: apply to current editor
      const firstSlideImages = (normalizedSlideImages[0] ?? []).filter(
        (img): img is string => typeof img === "string" && img.length > 0
      );
      toolbarActions?.onApplyMagicLayout({
        variant: normalizedVariants[0],
        mode: options.mode,
        seed: options.seed,
        tasteMode: options.tasteMode,
        slideCount: 1,
        slideImages: firstSlideImages.length > 0 ? [firstSlideImages] : undefined,
        textStyle: options.textStyle,
      });
    },
    [toolbarActions, onCreateSlidesWithLayout]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const calculateFitScale = () => {
      // Use viewport (the fixed scrollable container) for fit calculation
      // not the sizer which changes size based on current zoom
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      
      // Account for sizer padding (40px left, 80px right, 40px top/bottom)
      const paddingX = 40 + 80; // left + right padding
      const paddingY = 40 + 40; // top + bottom padding

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

    if (viewportRef.current && resizeObserver) {
      resizeObserver.observe(viewportRef.current);
    }

    window.addEventListener("resize", calculateFitScale);

    return () => {
      window.removeEventListener("resize", calculateFitScale);
      resizeObserver?.disconnect();
    };
  }, []);

  // Track viewport size for centered positioning
  useEffect(() => {
    const updateViewportSize = () => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };

    updateViewportSize();

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateViewportSize)
      : null;

    if (viewportRef.current && resizeObserver) {
      resizeObserver.observe(viewportRef.current);
    }

    return () => resizeObserver?.disconnect();
  }, []);

  // Keep scale ref in sync for cursor-anchored zoom
  // Keep scale ref in sync for cursor-anchored zoom
  useEffect(() => {
    // For fit mode (zoom=0), use fitScale; otherwise use zoom percentage
    scaleRef.current = zoom === 0 ? fitScale : zoom / 100;
  }, [zoom, fitScale]);

  // Cursor-anchored zoom handler
  const handleWheelZoom = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      // Only handle Ctrl+wheel (zoom gesture)
      if (!event.ctrlKey && !event.metaKey) return;
      if (!onSetZoom) return;

      event.preventDefault();
      event.stopPropagation();

      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const oldScale = scaleRef.current;
      const delta = event.deltaY > 0 ? -10 : 10;
      // When in fit mode (zoom=0), start from the effective fit percentage
      const currentZoom = zoom === 0 ? Math.round(fitScale * 100) : zoom;
      const newZoom = Math.max(25, Math.min(300, currentZoom + delta));
      const newScale = newZoom / 100;
      const ratio = newScale / oldScale;

      // Adjust scroll to keep point under cursor stable
      const newScrollLeft = (viewport.scrollLeft + x) * ratio - x;
      const newScrollTop = (viewport.scrollTop + y) * ratio - y;

      onSetZoom(newZoom);

      // Apply scroll after state update
      requestAnimationFrame(() => {
        viewport.scrollLeft = Math.max(0, newScrollLeft);
        viewport.scrollTop = Math.max(0, newScrollTop);
      });
    },
    [zoom, fitScale, onSetZoom]
  );

  // Keyboard shortcuts (zoom + z-order)
  // Standard design app shortcuts:
  // Ctrl/⌘ + 0       = Fit to view
  // Ctrl/⌘ + 1       = 100% zoom
  // Ctrl/⌘ + 2       = 200% zoom
  // Ctrl/⌘ + +/=     = Zoom in
  // Ctrl/⌘ + -       = Zoom out
  // Ctrl/⌘ + ]       = Bring forward
  // Ctrl/⌘ + [       = Send backward
  // Ctrl/⌘ + Shift + ] = Bring to front
  // Ctrl/⌘ + Shift + [ = Send to back
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      if (isCtrlOrCmd) {
        // Z-order shortcuts (classic design-app style)
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
          // Zoom presets (Affinity/Adobe style)
          case '0':
            event.preventDefault();
            onResetZoom?.(); // Fit to view
            break;
          case '1':
            event.preventDefault();
            onSetZoom?.(100); // 100%
            break;
          case '2':
            event.preventDefault();
            onSetZoom?.(200); // 200%
            break;
          case '3':
            event.preventDefault();
            onSetZoom?.(50); // 50%
            break;
          case '4':
            event.preventDefault();
            onSetZoom?.(25); // 25%
            break;
          case '5':
            event.preventDefault();
            onSetZoom?.(300); // 300%
            break;
          // Zoom in/out
          case '=':
          case '+':
            event.preventDefault();
            onZoomIn?.();
            break;
          case '-':
            event.preventDefault();
            onZoomOut?.();
            break;
          // Grouping
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
          // Duplicate
          case 'd':
          case 'D':
            if (toolbarActions?.onDuplicateSelection) {
              event.preventDefault();
              event.stopPropagation();
              toolbarActions.onDuplicateSelection();
            }
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onZoomIn, onZoomOut, onResetZoom, onSetZoom, toolbarActions]);

  const customToolbar = toolbarActions ? (
    <SlideToolbar
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onExport={onExport}
      onExportAllPdf={onExportAllPdf}
      isExportingPdf={isExportingPdf}
      pdfExportProgress={pdfExportProgress}
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
      onInsertImageToPictureFrame={toolbarActions.onInsertImageToPictureFrame}
      onInsertSvg={toolbarActions.onInsertVector}
      onInsertTextBox={toolbarActions.onInsertTextBox}
      onInsertPictureFrame={toolbarActions.onInsertPictureFrame}
      onOpenLayoutPanel={handleOpenLayoutPanel}
      onOpenMagicPanel={handleOpenMagicPanel}
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

  // Compute scale: zoom=0 means "fit to view", otherwise use zoom percentage directly
  const scale = zoom === 0 ? fitScale : zoom / 100;
  const appliedScale = Math.max(scale, 0.01);
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
            <MagicLayoutWorkspace
              open={magicPanelOpen}
              onClose={handleCloseMagicPanel}
              onApply={handleApplyMagicLayout}
              insertOnly={Boolean(onCreateSlidesWithLayout)}
              hasExistingContent={!isLexicalContentEffectivelyEmpty(slide.content)}
            />
          </div>

          {/* Viewport container - handles scrolling */}
          <div 
            className="slide-editor__viewport" 
            ref={viewportRef}
            onContextMenu={handleContextMenu}
            onWheel={handleWheelZoom}
          >
            {/* Sizer - creates scrollable area based on scaled size */}
            <div
              className="slide-editor__sizer"
              ref={canvasRef}
              style={{
                // Add padding around the canvas (40px on each side, scaled)
                width: Math.max(STAGE_WIDTH * appliedScale + 80, viewportSize.width),
                height: Math.max(STAGE_HEIGHT * appliedScale + 80, viewportSize.height),
                // Center when content is smaller than viewport
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
                boxSizing: 'border-box',
              }}
            >
              {/* Scaled content wrapper */}
              <div
                className="slide-editor__canvas-scaler"
                style={{
                  width: STAGE_WIDTH,
                  height: STAGE_HEIGHT,
                  transform: `scale(${appliedScale})`,
                  transformOrigin: "center center",
                  flexShrink: 0,
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
              // Picture frame image insertion
              onInsertImageToPictureFrame={toolbarActions.onInsertImageToPictureFrame}
              onInsertImageFromProjectToPictureFrame={toolbarActions.onInsertImageFromProjectToPictureFrame}
            />
          )}
        </div>
      </ToolbarContextProvider>
    </DropdownProvider>
  );
};

export default SlideEditor;
