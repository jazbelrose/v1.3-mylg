// index.ts - Export all slides feature components and hooks
export { default as SlidesPage } from "./SlidesPage";
export { default as SlideEditor } from "./components/SlideEditor";
export { default as SlidesSidebar } from "./components/SlidesSidebar";
export { default as SlideToolbar } from "./components/SlideToolbar";
export { useSlidePersistence } from "./hooks/useSlidePersistence";
export { useSlideProvider } from "./hooks/useSlideProvider";
export * from "./lib/yjs";
