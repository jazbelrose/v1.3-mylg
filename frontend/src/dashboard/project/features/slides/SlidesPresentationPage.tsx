import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Maximize2, Minimize2, X } from "lucide-react";

import { useData } from "@/app/contexts/useData";
import type { Slide } from "@/app/contexts/DataProvider";
import { getProjectDashboardPath } from "@/shared/utils/projectUrl";
import { getFileUrl, apiFetch, deckVersionUrl } from "@/shared/utils/api";
import AppHeaderCard from "@/shared/ui/AppHeaderCard";

import SlideReadOnlyRenderer from "./components/SlideReadOnlyRenderer";
import "./presentation.css";

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const SLIDE_PADDING = "96px 120px";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const SlidesPresentationPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProject, fetchProjectDetails } = useData();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [versionSlides, setVersionSlides] = useState<Slide[] | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);

  const versionIdFromUrl = searchParams.get("versionId");

  // Fetch version-specific slides if versionId is provided
  useEffect(() => {
    if (!projectId || !versionIdFromUrl) {
      setVersionSlides(null);
      return;
    }

    let cancelled = false;
    setVersionLoading(true);

    (async () => {
      try {
        const response = await apiFetch(deckVersionUrl(projectId, versionIdFromUrl)) as { slides?: Slide[] } | null;
        if (cancelled) return;
        if (response?.slides && Array.isArray(response.slides)) {
          setVersionSlides(response.slides);
        } else {
          setVersionSlides(null);
        }
      } catch (error) {
        console.warn("[Presentation] Failed to load version slides:", error);
        if (!cancelled) {
          setVersionSlides(null);
        }
      } finally {
        if (!cancelled) {
          setVersionLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, versionIdFromUrl]);

  // Use version slides if loaded, otherwise fall back to project slides
  const slides = useMemo<Slide[]>(() => {
    const sourceSlides = versionSlides ?? activeProject?.slides;
    if (!Array.isArray(sourceSlides)) {
      return [];
    }
    return [...sourceSlides].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [versionSlides, activeProject?.slides]);

  const slideIdFromUrl = searchParams.get("slideId");

  // Only fetch project details if we don't have a version specified (fallback mode)
  useEffect(() => {
    if (!projectId) return;
    if (versionIdFromUrl) return; // Skip if we're loading version-specific slides
    if (!activeProject || activeProject.projectId !== projectId || !activeProject.slides) {
      fetchProjectDetails(projectId);
    }
  }, [projectId, activeProject, fetchProjectDetails, versionIdFromUrl]);

  useEffect(() => {
    if (slides.length === 0) {
      setSlideIndex(0);
      return;
    }

    if (slideIdFromUrl) {
      const idx = slides.findIndex((s) => s.id === slideIdFromUrl);
      if (idx >= 0) {
        setSlideIndex(idx);
        return;
      }
    }

    setSlideIndex((current) => clamp(current, 0, slides.length - 1));
  }, [slides, slideIdFromUrl]);

  const activeSlide = slides[slideIndex] ?? null;

  useEffect(() => {
    if (!activeSlide) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("slideId", activeSlide.id);
      return next;
    }, { replace: true });
  }, [activeSlide, setSearchParams]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const calculateFitScale = () => {
      const root = containerRef.current;
      if (!root) return;

      const rect = root.getBoundingClientRect();
      const availableWidth = rect.width;
      const availableHeight = rect.height;
      if (availableWidth <= 0 || availableHeight <= 0) {
        setScale(1);
        return;
      }
      const rawScale = Math.min(availableWidth / STAGE_WIDTH, availableHeight / STAGE_HEIGHT);
      setScale(Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1);
    };

    calculateFitScale();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => calculateFitScale())
        : null;

    if (containerRef.current && observer) {
      observer.observe(containerRef.current);
    }
    window.addEventListener("resize", calculateFitScale);
    return () => {
      window.removeEventListener("resize", calculateFitScale);
      observer?.disconnect();
    };
  }, []);

  const exitPresentation = useCallback(() => {
    const doNavigate = () => {
      if (!projectId) {
        navigate("/dashboard", { replace: true });
        return;
      }
      const title = activeProject?.title ?? "";
      navigate(getProjectDashboardPath(projectId, title, "/slides"), {
        replace: true,
        state: { activeSlideId: activeSlide?.id },
      });
    };

    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      document.exitFullscreen().catch(() => {}).finally(doNavigate);
      return;
    }
    doNavigate();
  }, [activeProject?.title, activeSlide?.id, navigate, projectId]);

  const goToSlide = useCallback(
    (nextIndex: number) => {
      if (slides.length === 0) return;
      setSlideIndex(clamp(nextIndex, 0, slides.length - 1));
    },
    [slides.length]
  );

  const goNext = useCallback(() => goToSlide(slideIndex + 1), [goToSlide, slideIndex]);
  const goPrev = useCallback(() => goToSlide(slideIndex - 1), [goToSlide, slideIndex]);

  const toggleFullscreen = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;

    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      document.exitFullscreen().catch(() => {});
      return;
    }

    const request = root.requestFullscreen;
    if (typeof request === "function") {
      request.call(root).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? "";
      if (tag === "input" || tag === "textarea" || (target?.isContentEditable ?? false)) {
        return;
      }

      switch (event.key) {
        case "Escape":
          event.preventDefault();
          exitPresentation();
          return;
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
          event.preventDefault();
          goNext();
          return;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          event.preventDefault();
          goPrev();
          return;
        case "Home":
          event.preventDefault();
          goToSlide(0);
          return;
        case "End":
          event.preventDefault();
          goToSlide(slides.length - 1);
          return;
        case "f":
        case "F":
          event.preventDefault();
          toggleFullscreen();
          return;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [exitPresentation, goNext, goPrev, goToSlide, slides.length, toggleFullscreen]);

  const handleStageClick = useCallback(
    (event: React.MouseEvent) => {
      const stage = stageRef.current;
      if (!stage) return;

      const rawTarget = event.target as Element | null;
      if (rawTarget?.closest("button,a,[data-prevent-slide-advance]")) {
        return;
      }

      const rect = stage.getBoundingClientRect();
      const x = event.clientX - rect.left;
      if (x >= rect.width / 2) {
        goNext();
      } else {
        goPrev();
      }
    },
    [goNext, goPrev]
  );

  if (!projectId) {
    return <div className="slides-presentation">No project ID provided</div>;
  }

  const backgroundImageUrl = activeSlide?.backgroundImage
    ? getFileUrl(activeSlide.backgroundImage)
    : null;
  const backgroundColor = activeSlide?.backgroundColor || "#101112";

  return (
    <div className="slides-presentation" ref={containerRef}>
      {!isFullscreen ? (
        <AppHeaderCard
          leftMode="back"
          onLeftAction={exitPresentation}
          centerMode="search"
          title="Presentation"
        />
      ) : null}
      <div className="slides-presentation__controls" data-prevent-slide-advance>
        <button
          type="button"
          className="slides-presentation__icon-button"
          onClick={exitPresentation}
          title="Exit (Esc)"
        >
          <X size={18} />
        </button>

        <div className="slides-presentation__status">
          {slides.length > 0 ? `${slideIndex + 1} / ${slides.length}` : "—"}
        </div>

        <button
          type="button"
          className="slides-presentation__icon-button"
          onClick={toggleFullscreen}
          title="Fullscreen (F)"
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <div className="slides-presentation__stage-wrap" onClick={handleStageClick} ref={stageRef}>
        <div
          className="slides-presentation__stage-scaler"
          style={{
            transform: `scale(${scale})`,
          }}
        >
          <div
            className="slides-presentation__stage"
            style={{
              width: `${STAGE_WIDTH}px`,
              height: `${STAGE_HEIGHT}px`,
              backgroundColor,
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
            <SlideReadOnlyRenderer content={activeSlide?.content ?? null} contentPadding={SLIDE_PADDING} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlidesPresentationPage;
