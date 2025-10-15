import React, { useCallback, useMemo } from "react";
import styles from "../moodboard.module.css";
import type { Sticker } from "../types";

type StickerCardProps = {
  sticker: Sticker;
  isSelected: boolean;
  isActiveDrag: boolean;
  offset: { x: number; y: number } | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, id: string) => void;
  onFocus: (id: string) => void;
  onRemove: (id: string) => void;
};

const formatTimestamp = (iso: string) => {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
};

const StickerCard: React.FC<StickerCardProps> = ({
  sticker,
  isSelected,
  isActiveDrag,
  offset,
  onPointerDown,
  onFocus,
  onRemove,
}) => {
  const { id } = sticker;

  const transform = useMemo(() => {
    const dx = offset?.x ?? 0;
    const dy = offset?.y ?? 0;
    return `translate3d(${sticker.x + dx}px, ${sticker.y + dy}px, 0) rotate(${sticker.rotation}deg)`;
  }, [offset?.x, offset?.y, sticker.rotation, sticker.x, sticker.y]);

  const stickerStyle = useMemo(() => {
    const base: React.CSSProperties = {
      transform,
      zIndex: sticker.z,
      touchAction: "none",
      MozUserSelect: "none",
    };

    if (sticker.type === "note" && sticker.content.color) {
      (base as React.CSSProperties & { [key: string]: string })["--note-color"] =
        sticker.content.color;
    }

    return base;
  }, [sticker.content, sticker.type, sticker.z, transform]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      onPointerDown(event, id);
    },
    [id, onPointerDown]
  );

  const handleClick = useCallback(() => {
    onFocus(id);
  }, [id, onFocus]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onRemove(id);
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onFocus(id);
      }
    },
    [id, onFocus, onRemove]
  );

  const className = [
    styles.sticker,
    isSelected ? styles.stickerSelected : "",
    isActiveDrag ? styles.stickerDragging : "",
    sticker.type === "note"
      ? styles.noteSticker
      : sticker.type === "photo"
        ? styles.photoSticker
        : styles.linkSticker,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={className}
      style={stickerStyle}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onFocus={() => onFocus(id)}
      onKeyDown={handleKeyDown}
    >
      {sticker.type === "note" && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}>
          <strong>Note</strong>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{sticker.content.text}</p>
          <span className={styles.stickerMeta}>{formatTimestamp(sticker.createdAt)}</span>
        </div>
      )}

      {sticker.type === "photo" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <img src={sticker.content.url} alt={sticker.content.alt || "Moodboard sticker"} />
          {sticker.content.alt && (
            <span className={styles.stickerMeta}>{sticker.content.alt}</span>
          )}
        </div>
      )}

      {sticker.type === "link" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <span className={styles.stickerMeta}>Link</span>
          <a href={sticker.content.url} target="_blank" rel="noopener noreferrer">
            {sticker.content.label || sticker.content.url}
          </a>
        </div>
      )}
    </div>
  );
};

export default StickerCard;









