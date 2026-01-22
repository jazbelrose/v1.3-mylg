// index.ts - Export all slides feature components and hooks
export { default as SlidesPage } from "./SlidesPage";
export { default as SlideEditor } from "./components/SlideEditor";
export { default as SlidesSidebar } from "./components/SlidesSidebar";
export { default as SlideToolbar } from "./components/SlideToolbar";
export { default as DeckVersionDropdown } from "./components/DeckVersionDropdown";
export { default as DeckVersionsModal } from "./components/DeckVersionsModal";
export { useSlidePersistence } from "./hooks/useSlidePersistence";
export { useSlideProvider } from "./hooks/useSlideProvider";
export { useDeckVersions } from "./hooks/useDeckVersions";
export { useThumbnailQueue } from "./hooks/useThumbnailQueue";
export * from "./lib/yjs";
export * from "./lib/slideExport";
export * from "./lib/thumbnailJobQueue";
