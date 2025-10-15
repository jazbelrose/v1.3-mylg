import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, StickyNote, Image as ImageIcon, Link2 } from "lucide-react";
import styles from "../moodboard.module.css";
import type {
  LinkStickerContent,
  NoteStickerContent,
  PhotoStickerContent,
  StickerDraft,
  StickerType,
} from "../types";

type QuickInsertPaletteProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: StickerDraft) => void;
};

type DraftState = {
  note: NoteStickerContent;
  photo: PhotoStickerContent;
  link: LinkStickerContent;
};

const createEmptyDraftState = (): DraftState => ({
  note: { text: "", color: "" },
  photo: { url: "", alt: "" },
  link: { label: "", url: "" },
});

const typeMeta: Record<StickerType, { icon: React.ReactNode; title: string; description: string }> = {
  note: {
    icon: <StickyNote size={18} />,
    title: "Note",
    description: "Add a sticky note with quick copy or highlights.",
  },
  photo: {
    icon: <ImageIcon size={18} />,
    title: "Photo",
    description: "Drop in an inspiration shot, render, or reference.",
  },
  link: {
    icon: <Link2 size={18} />,
    title: "Link",
    description: "Pin a URL for vendors, shoppable picks, or docs.",
  },
};

const QuickInsertPalette: React.FC<QuickInsertPaletteProps> = ({ open, onClose, onSubmit }) => {
  const [activeType, setActiveType] = useState<StickerType>("note");
  const [draftState, setDraftState] = useState<DraftState>(() => createEmptyDraftState());
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, activeType]);

  useEffect(() => {
    if (!open) {
      setDraftState(createEmptyDraftState());
      setActiveType("note");
    }
  }, [open]);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [onClose, open]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const handleChange = useCallback(
    (type: StickerType, field: string, value: string) => {
      setDraftState((prev) => {
        switch (type) {
          case "note":
            return {
              ...prev,
              note: {
                ...prev.note,
                [field as keyof NoteStickerContent]: value,
              },
            };
          case "photo":
            return {
              ...prev,
              photo: {
                ...prev.photo,
                [field as keyof PhotoStickerContent]: value,
              },
            };
          case "link":
          default:
            return {
              ...prev,
              link: {
                ...prev.link,
                [field as keyof LinkStickerContent]: value,
              },
            };
        }
      });
    },
    []
  );

  const isReady = useMemo(() => {
    switch (activeType) {
      case "note":
        return draftState.note.text.trim().length > 0;
      case "photo":
        return draftState.photo.url.trim().length > 0;
      case "link":
        return draftState.link.url.trim().length > 0;
      default:
        return false;
    }
  }, [activeType, draftState]);

  const submit = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!isReady) return;
      const data = draftState[activeType];
      onSubmit({ type: activeType, content: data } as StickerDraft);
      onClose();
      setDraftState(createEmptyDraftState());
    },
    [activeType, draftState, isReady, onClose, onSubmit]
  );

  if (!open) return null;

  const meta = typeMeta[activeType];

  return (
    <div className={styles.paletteOverlay} role="dialog" aria-modal>
      <form className={styles.palette} onSubmit={submit}>
        <div className={styles.paletteHeader}>
          <h2>
            {meta.icon} Quick insert
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick insert"
            className={styles.iconButton}
          >
            <X size={18} />
          </button>
        </div>

        <p className={styles.paletteDescription}>{meta.description}</p>

        <div className={styles.paletteBody}>
          <div className={styles.typeToggleRow} role="radiogroup" aria-label="Sticker type">
            {(Object.keys(typeMeta) as StickerType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                className={styles.typeButton}
                aria-pressed={type === activeType}
              >
                {typeMeta[type].icon}
                <span>{typeMeta[type].title}</span>
              </button>
            ))}
          </div>

          {activeType === "note" && (
            <div className={styles.fieldGroup}>
              <label htmlFor="note-text">Note text</label>
              <textarea
                id="note-text"
                ref={(node) => {
                  if (node) inputRef.current = node;
                }}
                placeholder="What's the vibe?"
                value={draftState.note.text}
                onChange={(event) => handleChange("note", "text", event.target.value)}
              />
            </div>
          )}

          {activeType === "photo" && (
            <>
              <div className={styles.fieldGroup}>
                <label htmlFor="photo-url">Image URL</label>
                <input
                  id="photo-url"
                  type="url"
                  ref={(node) => {
                    if (node) inputRef.current = node;
                  }}
                  placeholder="https://..."
                  value={draftState.photo.url}
                  onChange={(event) => handleChange("photo", "url", event.target.value)}
                  required
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="photo-alt">Caption</label>
                <input
                  id="photo-alt"
                  type="text"
                  placeholder="Optional context"
                  value={draftState.photo.alt || ""}
                  onChange={(event) => handleChange("photo", "alt", event.target.value)}
                />
              </div>
            </>
          )}

          {activeType === "link" && (
            <>
              <div className={styles.fieldGroup}>
                <label htmlFor="link-label">Label</label>
                <input
                  id="link-label"
                  type="text"
                  ref={(node) => {
                    if (node) inputRef.current = node;
                  }}
                  placeholder="Vendor, SKU, article..."
                  value={draftState.link.label}
                  onChange={(event) => handleChange("link", "label", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="link-url">URL</label>
                <input
                  id="link-url"
                  type="url"
                  placeholder="https://..."
                  value={draftState.link.url}
                  onChange={(event) => handleChange("link", "url", event.target.value)}
                  required
                />
              </div>
            </>
          )}
        </div>

        <div className={styles.paletteFooter}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryButton} disabled={!isReady}>
            Drop sticker
          </button>
        </div>

        <div className={styles.quickInsertHint}>
          <span>Pro tip</span>
          <span>Hit Enter to drop fast</span>
        </div>
      </form>
    </div>
  );
};

export default QuickInsertPalette;









