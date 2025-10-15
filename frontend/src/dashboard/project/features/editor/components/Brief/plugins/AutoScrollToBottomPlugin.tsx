import { useEffect, useRef } from "react";

type ScrollContainer = HTMLElement | null;

type Props = {
  /** A ref to the scrollable container that wraps the Lexical content */
  contentRef: React.RefObject<HTMLElement>;
};

/**
 * Scrolls the content container to the bottom once,
 * after actual DOM nodes are present (e.g., initial render/hydration).
 */
export default function AutoScrollToBottomPlugin({ contentRef }: Props) {
  const hasScrolled = useRef(false);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    const container: ScrollContainer = contentRef.current;
    if (!container || hasScrolled.current) return;

    const tryScroll = () => {
      if (
        container.scrollHeight > container.clientHeight + 10 && // content is overflowing
        !hasScrolled.current
      ) {
        container.scrollTop = container.scrollHeight;
        hasScrolled.current = true;
        observerRef.current?.disconnect();
      }
    };

    // Observe for DOM changes inside the content container
    observerRef.current = new MutationObserver(() => {
      tryScroll();
    });

    observerRef.current.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // In case DOM is already present (e.g., fast local state), try once
    tryScroll();

    return () => {
      observerRef.current?.disconnect();
    };
  }, [contentRef]);

  return null;
}









