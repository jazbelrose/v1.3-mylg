import React, { useEffect, useState, useRef, useCallback } from "react";

export interface ScrollToTopButtonProps {
  scrollableDivRef?: React.RefObject<HTMLElement> | null;
}

const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({
  scrollableDivRef = null,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const prevScrollPos = useRef(0);

  const handleScroll = useCallback(() => {
    const scrollTop = scrollableDivRef?.current
      ? scrollableDivRef.current.scrollTop
      : window.scrollY || document.documentElement.scrollTop;
    const isScrollingUp = scrollTop < prevScrollPos.current;
    setIsVisible(scrollTop > 200 && isScrollingUp);
    prevScrollPos.current = scrollTop;
  }, [scrollableDivRef]);

  const handleScrollToTop = () => {
    if (scrollableDivRef?.current) {
      scrollableDivRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
    setTimeout(() => {
      setIsVisible(false);
    }, 500);
  };

  useEffect(() => {
    const scrollContainer: HTMLElement | Window =
      scrollableDivRef?.current || window;
    const debouncedHandleScroll = () => {
      requestAnimationFrame(handleScroll);
    };
    scrollContainer.addEventListener("scroll", debouncedHandleScroll);
    return () => {
      scrollContainer.removeEventListener("scroll", debouncedHandleScroll);
    };
  }, [scrollableDivRef, handleScroll]);

  return (
    <button
      onClick={handleScrollToTop}
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "48px",
        height: "48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        color: "#fff",
        border: "2px solid #fff",
        borderRadius: "50%",
        cursor: "pointer",
        zIndex: 1001,
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? "auto" : "none",
        transition: "opacity 0.5s ease, transform 0.3s ease",
        transform: isVisible ? "translateY(0)" : "translateY(20px)",
        willChange: "transform, opacity",
      }}
      aria-label="Scroll to top"
    >
      ↑
    </button>
  );
};

export default ScrollToTopButton;









