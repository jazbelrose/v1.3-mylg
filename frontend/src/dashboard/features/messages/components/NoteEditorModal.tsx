import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Copy, Search, Undo2, Redo2, WrapText, TextCursorInput } from "lucide-react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { LinkNode } from "@lexical/link";
import { CodeNode } from "@lexical/code";
import { $convertFromMarkdownString, $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { Klass, LexicalNode, EditorState, LexicalEditor } from "lexical";
import { $getRoot, FORMAT_TEXT_COMMAND, REDO_COMMAND, SELECT_ALL_COMMAND, UNDO_COMMAND } from "lexical";

import Modal from "@/shared/ui/ModalWithStack";
import Spinner from "@/shared/ui/Spinner";
import { apiFetch, fileUrlsToKeys, projectFilePutUrl, projectFileViewUrl } from "@/shared/utils/api";
import { orgFileViewUrl, orgFilePutUrl } from "@/hq/lib/hqApi";

import styles from "./NoteEditorModal.module.css";

const VIEW_FULL_THRESHOLD_BYTES = 512 * 1024;
const CHUNK_BYTES = 256 * 1024;
const MAX_EDIT_BYTES = 2 * 1024 * 1024;

type Mode = "create" | "open" | "edit";

type OpenFile = {
  fileUrl: string;
  fileName: string;
  initialTitle?: string | null;
};

type EditContent = {
  title: string;
  initialContent: string;
};

type FileViewInfo = {
  downloadUrl: string;
  sizeBytes: number | null;
  contentType: string | null;
  etag: string | null;
  rangeSupported: boolean;
};

function defaultNoteTitle() {
  return `Note — ${new Date().toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function stripMdExtension(name: string) {
  return name.replace(/\.markdown$/i, "").replace(/\.md$/i, "");
}

function inferContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "md" || ext === "markdown") return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}

async function fetchRange(url: string, start: number, endInclusive: number): Promise<Response> {
  return fetch(url, { method: "GET", headers: { Range: `bytes=${start}-${endInclusive}` } });
}

function computeMatches(haystack: string, needle: string) {
  const q = needle.trim();
  if (!q) return [];
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = q.toLowerCase();
  const out: Array<{ start: number; end: number }> = [];
  let idx = 0;
  while (true) {
    const next = lowerHay.indexOf(lowerNeedle, idx);
    if (next === -1) break;
    out.push({ start: next, end: next + lowerNeedle.length });
    idx = next + lowerNeedle.length;
  }
  return out;
}

function selectDomTextRange(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.textContent?.length ?? 0;
    const nextPos = pos + len;

    if (!startNode && start >= pos && start <= nextPos) {
      startNode = node;
      startOffset = Math.max(0, start - pos);
    }
    if (startNode && end >= pos && end <= nextPos) {
      endNode = node;
      endOffset = Math.max(0, end - pos);
      break;
    }
    pos = nextPos;
  }

  if (!startNode || !endNode) return false;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);

  const anchorEl = startNode.parentElement || root;
  anchorEl.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

const Placeholder = ({ text }: { text: string }) => <div className={styles.placeholder}>{text}</div>;

const ExternalMarkdownPlugin: React.FC<{
  markdown: string;
  lastAppliedRef: React.MutableRefObject<string | null>;
  forceUpdate?: number; // trigger re-apply when this changes
}> = ({ markdown, lastAppliedRef, forceUpdate }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // If lastAppliedRef is null (just opened modal), always apply
    // Also apply if markdown differs from last applied
    if (lastAppliedRef.current !== null && markdown === lastAppliedRef.current) return;
    
    editor.update(() => {
      // Clear existing content first, then apply new markdown
      const root = $getRoot();
      root.clear();
      if (markdown) {
        $convertFromMarkdownString(markdown, TRANSFORMERS);
      }
    });
    lastAppliedRef.current = markdown;
  }, [editor, lastAppliedRef, markdown, forceUpdate]);

  return null;
};

const EditorBridgePlugin: React.FC<{ onReady: (editor: LexicalEditor) => void }> = ({ onReady }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => onReady(editor), [editor, onReady]);
  return null;
};

export type NoteEditorModalProps = {
  isOpen: boolean;
  mode: Mode;
  projectId: string;
  canEdit: boolean;
  /** Set to true for org-scoped files (uses HQ API instead of projects API) */
  isOrgFile?: boolean;
  openFile?: OpenFile;
  editContent?: EditContent;
  onRequestClose: () => void;
  onCreate?: (input: { title: string; markdown: string }) => Promise<void>;
  onSave?: (content: string) => void;
  onRename?: (newTitle: string) => Promise<void>;
};

export default function NoteEditorModal({
  isOpen,
  mode,
  projectId,
  canEdit,
  isOrgFile,
  openFile,
  editContent,
  onRequestClose,
  onCreate,
  onSave,
  onRename,
}: NoteEditorModalProps) {
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [pendingTitle, setPendingTitle] = useState("");
  const [markdown, setMarkdown] = useState(() => 
    mode === "edit" && editContent?.initialContent ? editContent.initialContent : ""
  );
  const [initialMarkdown, setInitialMarkdown] = useState(() =>
    mode === "edit" && editContent?.initialContent ? editContent.initialContent : ""
  );
  const [isLoaded, setIsLoaded] = useState(mode === "create");
  const [isLoading, setIsLoading] = useState(mode === "open");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewInfo, setViewInfo] = useState<FileViewInfo | null>(null);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [wrap, setWrap] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [editor, setEditor] = useState<LexicalEditor | null>(null);
  const lastAppliedRef = useRef<string | null>(null);
  const [editorKey, setEditorKey] = useState(0); // Forces re-mount of Lexical when changed

  const rootEl = useMemo(() => editor?.getRootElement() ?? null, [editor]);
  const haystack = useMemo(() => (rootEl?.textContent ?? ""), [rootEl, markdown]);

  const matches = useMemo(() => computeMatches(haystack, findQuery), [haystack, findQuery]);
  const matchMeta = matches.length ? `${Math.min(findIndex + 1, matches.length)} / ${matches.length}` : "0 / 0";

  const fileName = openFile?.fileName || "";
  const fileUrl = openFile?.fileUrl || "";

  const downloadableUrl = viewInfo?.downloadUrl || (fileUrl && !fileUrl.startsWith("blob:") ? fileUrl : "");

  // Whether title can be edited in this mode
  const canRenameTitle = mode === "open" && canEdit && !!onRename;

  const effectiveTitle = useMemo(() => {
    if (mode === "open") {
      const seeded = openFile?.initialTitle?.trim() || stripMdExtension(openFile?.fileName || "");
      return seeded || "Note";
    }
    if (mode === "edit") {
      return editContent?.title || "Edit Text";
    }
    return title.trim() || defaultNoteTitle();
  }, [mode, openFile?.fileName, openFile?.initialTitle, title, editContent?.title]);

  // Handler to start editing title
  const startEditingTitle = useCallback(() => {
    if (!canRenameTitle) return;
    setPendingTitle(effectiveTitle);
    setEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.select());
  }, [canRenameTitle, effectiveTitle]);

  // Handler to save title
  const saveTitle = useCallback(async () => {
    const trimmed = pendingTitle.trim();
    if (!trimmed || trimmed === effectiveTitle) {
      setEditingTitle(false);
      return;
    }
    if (onRename) {
      try {
        await onRename(trimmed);
      } catch (err) {
        console.error("Failed to rename note:", err);
      }
    }
    setEditingTitle(false);
  }, [effectiveTitle, onRename, pendingTitle]);

  // Cancel title editing
  const cancelEditingTitle = useCallback(() => {
    setEditingTitle(false);
    setPendingTitle("");
  }, []);

  const isReadOnly = useMemo(() => {
    const sizeBytes = viewInfo?.sizeBytes;
    return mode === "open" && (!canEdit || (typeof sizeBytes === "number" && sizeBytes > MAX_EDIT_BYTES));
  }, [canEdit, mode, viewInfo?.sizeBytes]);

  const isDirty = useMemo(() => {
    if (mode === "create") return markdown.trim() !== "" || title.trim() !== "";
    return markdown !== initialMarkdown;
  }, [initialMarkdown, markdown, mode, title]);

  const canSave = useMemo(() => {
    if (!isLoaded) return false;
    if (isSaving) return false;
    if (!isDirty) return false;
    if (mode === "create" || mode === "edit") return true;
    return !isReadOnly;
  }, [isDirty, isLoaded, isReadOnly, isSaving, mode]);

  const loadOpenFile = useCallback(async (isReload = false) => {
    if (mode !== "open" || !isOpen) return;
    if (!openFile?.fileUrl || !openFile?.fileName) return;

    const [keyFromUrl] = fileUrlsToKeys([openFile.fileUrl]);
    const key = keyFromUrl || openFile.fileUrl;

    setError(null);
    // Only show loading state on initial load, not on reload after save
    if (!isReload) {
      setIsLoading(true);
      setIsLoaded(false);
    }
    setLoadedBytes(0);
    setViewInfo(null);
    setFindOpen(false);
    setFindQuery("");
    setFindIndex(0);

    try {
      let info: FileViewInfo;
      try {
        // Use org-specific API for org files, project API otherwise
        const viewUrl = isOrgFile
          ? `${orgFileViewUrl(projectId)}&key=${encodeURIComponent(key)}`
          : `${projectFileViewUrl(projectId)}?key=${encodeURIComponent(key)}`;
        const data = await apiFetch<unknown>(viewUrl);
        if (!data || typeof data !== "object") {
          throw new Error("Invalid file view response");
        }
        const obj = data as Record<string, unknown>;
        const downloadUrl = typeof obj.downloadUrl === "string" ? obj.downloadUrl : null;
        if (!downloadUrl) {
          throw new Error("Invalid file view response (missing downloadUrl)");
        }

        info = {
          downloadUrl,
          sizeBytes: typeof obj.sizeBytes === "number" ? obj.sizeBytes : null,
          contentType: typeof obj.contentType === "string" ? obj.contentType : null,
          etag: typeof obj.etag === "string" ? obj.etag : null,
          rangeSupported: obj.rangeSupported !== false,
        };
      } catch {
        info = {
          downloadUrl: openFile.fileUrl,
          sizeBytes: null,
          contentType: inferContentType(openFile.fileName),
          etag: null,
          rangeSupported: true,
        };
      }
      setViewInfo(info);

      const ext = openFile.fileName.split(".").pop()?.toLowerCase() || "";
      const isMarkdownLike = ext === "md" || ext === "markdown" || ext === "txt";
      if (!isMarkdownLike) {
        setError("This file type isn't supported in the note editor.");
        return;
      }

      if (info.sizeBytes !== null && info.sizeBytes > MAX_EDIT_BYTES) {
        const res = await fetchRange(info.downloadUrl, 0, VIEW_FULL_THRESHOLD_BYTES - 1);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const buf = await res.arrayBuffer();
        const decoded = new TextDecoder("utf-8").decode(buf);
        setMarkdown(decoded);
        setInitialMarkdown(decoded);
        setLoadedBytes(buf.byteLength);
        setError("This note is large; showing a preview. Download to edit.");
        return;
      }

      const shouldFetchFull = info.sizeBytes !== null && info.sizeBytes <= VIEW_FULL_THRESHOLD_BYTES;
      if (shouldFetchFull) {
        const res = await fetch(info.downloadUrl);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const text = await res.text();
        setMarkdown(text);
        setInitialMarkdown(text);
        setLoadedBytes(text.length);
        return;
      }

      // Chunk load full content (bounded by MAX_EDIT_BYTES above).
      const decoder = new TextDecoder("utf-8");
      let acc = "";
      let start = 0;
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetchRange(info.downloadUrl, start, start + CHUNK_BYTES - 1);
        if (res.status === 416) break;
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);

        // eslint-disable-next-line no-await-in-loop
        const buf = await res.arrayBuffer();
        if (buf.byteLength === 0) break;
        acc += decoder.decode(buf, { stream: true });
        start += buf.byteLength;
        setLoadedBytes(start);

        if (info.sizeBytes !== null && start >= info.sizeBytes) break;
        if (buf.byteLength < CHUNK_BYTES) break;
      }
      setMarkdown(acc);
      setInitialMarkdown(acc);
    } catch (err) {
      console.error("Failed to load note", err);
      setError(err instanceof Error ? err.message : "Failed to load note.");
    } finally {
      setIsLoading(false);
      setIsLoaded(true);
      // Reset lastAppliedRef to force editor to re-apply content (important for reload after save)
      lastAppliedRef.current = null;
    }
  }, [isOpen, isOrgFile, mode, openFile?.fileName, openFile?.fileUrl, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === "create") {
      setTitle("");
      setMarkdown("");
      setInitialMarkdown("");
      setIsLoaded(true);
      setIsLoading(false);
      setError(null);
      setViewInfo(null);
      setLoadedBytes(0);
      setFindOpen(false);
      setFindQuery("");
      setFindIndex(0);
      lastAppliedRef.current = null; // Reset to ensure content loads
      setEditorKey(k => k + 1); // Force re-mount of Lexical editor
      return;
    }
    if (mode === "edit" && editContent) {
      setTitle(editContent.title);
      setMarkdown(editContent.initialContent);
      setInitialMarkdown(editContent.initialContent);
      setIsLoaded(true);
      setIsLoading(false);
      setError(null);
      setViewInfo(null);
      setLoadedBytes(editContent.initialContent.length);
      setFindOpen(false);
      setFindQuery("");
      setFindIndex(0);
      lastAppliedRef.current = null; // Reset to ensure content loads on every open
      setEditorKey(k => k + 1); // Force re-mount of Lexical editor with new content
      return;
    }
    void loadOpenFile();
  }, [isOpen, loadOpenFile, mode, editContent]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
      if (e.key === "Escape" && findOpen) {
        e.preventDefault();
        setFindOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [findOpen, isOpen]);

  useEffect(() => {
    if (!findOpen) return;
    setFindIndex(0);
    if (!matches.length || !rootEl) return;
    selectDomTextRange(rootEl, matches[0].start, matches[0].end);
  }, [findOpen, matches, rootEl]);

  const goToMatch = useCallback(
    (dir: -1 | 1) => {
      if (!rootEl) return;
      if (!matches.length) return;
      const next = (findIndex + dir + matches.length) % matches.length;
      setFindIndex(next);
      const m = matches[next];
      selectDomTextRange(rootEl, m.start, m.end);
    },
    [findIndex, matches, rootEl],
  );

  const copySelectionOrAll = useCallback(async () => {
    const selection = window.getSelection()?.toString() || "";
    const text = selection.trim() ? selection : markdown;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Copy failed", err);
    }
  }, [markdown]);

  const copyLink = useCallback(async () => {
    if (!fileUrl) return;
    try {
      await navigator.clipboard.writeText(fileUrl);
    } catch (err) {
      console.error("Copy link failed", err);
    }
  }, [fileUrl]);

  const download = useCallback(() => {
    if (downloadableUrl) {
      window.open(downloadableUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const blob = new Blob([markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${effectiveTitle}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  }, [downloadableUrl, effectiveTitle, markdown]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        if (!onCreate) throw new Error("Create handler not configured.");
        await onCreate({ title: effectiveTitle, markdown });
        onRequestClose();
        return;
      }

      if (mode === "edit") {
        // For inline edit mode, call the onSave callback with the markdown content
        // The markdown state is maintained by OnChangePlugin as the Lexical content is edited
        if (onSave) {
          onSave(markdown.trim());
        }
        onRequestClose();
        return;
      }

      if (!openFile?.fileUrl || !openFile?.fileName) throw new Error("Missing file info.");
      const [keyFromUrl] = fileUrlsToKeys([openFile.fileUrl]);
      const key = keyFromUrl || openFile.fileUrl;
      const contentType = viewInfo?.contentType || inferContentType(openFile.fileName);

      // Use org-specific API for org files, project API otherwise
      const putUrl = isOrgFile ? orgFilePutUrl(projectId) : projectFilePutUrl(projectId);
      const put = await apiFetch<{ uploadUrl: string }>(putUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          contentType,
          ifMatch: viewInfo?.etag || undefined,
        }),
      });

      const res = await fetch(put.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          ...(viewInfo?.etag ? { "If-Match": viewInfo.etag } : {}),
        },
        body: markdown,
      });
      if (!res.ok) {
        if (res.status === 412) throw new Error("File changed since you opened it. Reload and try again.");
        throw new Error(`Save failed (${res.status})`);
      }

      // Reload after save - pass true to indicate reload (avoids loading flash)
      await loadOpenFile(true);
    } catch (err) {
      console.error("Save failed", err);
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }, [canSave, editor, effectiveTitle, isOrgFile, loadOpenFile, markdown, mode, onCreate, onRequestClose, onSave, openFile?.fileName, openFile?.fileUrl, projectId, viewInfo?.contentType, viewInfo?.etag]);

  // For edit mode, derive initial content directly from props to avoid timing issues
  const effectiveInitialContent = useMemo(() => {
    if (mode === "edit" && editContent?.initialContent) {
      return editContent.initialContent;
    }
    return "";
  }, [mode, editContent?.initialContent]);

  const editorConfig = useMemo(
    () => ({
      namespace: "note-editor",
      onError: (err: Error) => console.error("Lexical error", err),
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode] as Klass<LexicalNode>[],
      // Initialize with content when the editor mounts - use effectiveInitialContent for immediate availability
      editorState: effectiveInitialContent
        ? () => {
            $convertFromMarkdownString(effectiveInitialContent, TRANSFORMERS);
          }
        : undefined,
    }),
    [effectiveInitialContent],
  );

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel={mode === "create" ? "Create note" : "Open note"}
      className={styles.content}
      overlayClassName={styles.overlay}
      portalClassName={styles.portal}
      shouldCloseOnOverlayClick={!isSaving}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              className={styles.titleInput}
              value={pendingTitle}
              onChange={(e) => setPendingTitle(e.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveTitle();
                } else if (e.key === "Escape") {
                  cancelEditingTitle();
                }
              }}
              autoFocus
            />
          ) : (
            <div
              className={`${styles.title} ${canRenameTitle ? styles.titleEditable : ""}`}
              onClick={canRenameTitle ? startEditingTitle : undefined}
              title={canRenameTitle ? "Click to rename" : undefined}
            >
              {effectiveTitle}
            </div>
          )}
          {isReadOnly && <div className={styles.pill}>Read-only</div>}
          {!isReadOnly && mode === "open" && <div className={styles.pill}>Editing</div>}
        </div>
        <div className={styles.headerActions}>
          {mode === "open" && (
            <button type="button" className={styles.iconBtn} onClick={() => void copyLink()} aria-label="Copy link" title="Copy link">
              <TextCursorInput size={16} />
            </button>
          )}
          <button type="button" className={styles.iconBtn} onClick={() => void copySelectionOrAll()} aria-label="Copy" title="Copy">
            <Copy size={16} />
          </button>
          <button type="button" className={styles.iconBtn} onClick={download} aria-label="Download" title="Download">
            <Download size={16} />
          </button>
          <button type="button" className={styles.iconBtn} onClick={onRequestClose} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolsLeft}>
          <button
            type="button"
            className={`${styles.toolBtn} ${findOpen ? styles.toolBtnActive : ""}`}
            onClick={() => {
              setFindOpen((v) => !v);
              requestAnimationFrame(() => findInputRef.current?.focus());
            }}
            aria-label="Find"
            title="Find (Ctrl/Cmd+F)"
          >
            <Search size={14} />
            Find
          </button>

          <button
            type="button"
            className={`${styles.toolBtn} ${wrap ? styles.toolBtnActive : ""}`}
            onClick={() => setWrap((v) => !v)}
            aria-label="Toggle wrap"
            title="Wrap"
          >
            <WrapText size={14} />
            Wrap
          </button>

          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => editor?.dispatchCommand(UNDO_COMMAND, undefined)}
            disabled={!editor}
            aria-label="Undo"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 size={14} />
          </button>

          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => editor?.dispatchCommand(REDO_COMMAND, undefined)}
            disabled={!editor}
            aria-label="Redo"
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <Redo2 size={14} />
          </button>

          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => editor?.dispatchCommand(SELECT_ALL_COMMAND, undefined)}
            disabled={!editor}
            aria-label="Select all"
            title="Select all (Ctrl/Cmd+A)"
          >
            Select all
          </button>

          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => editor?.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
            disabled={!editor || isReadOnly}
            aria-label="Bold"
            title="Bold"
          >
            B
          </button>

          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => editor?.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
            disabled={!editor || isReadOnly}
            aria-label="Italic"
            title="Italic"
          >
            I
          </button>
        </div>

        <div className={styles.toolsRight}>
          <div className={styles.stats}>
            {mode === "open" && typeof viewInfo?.sizeBytes === "number"
              ? `Loaded ${Math.min(loadedBytes, viewInfo.sizeBytes).toLocaleString()} / ${viewInfo.sizeBytes.toLocaleString()} bytes`
              : `${markdown.length.toLocaleString()} chars`}
          </div>
        </div>
      </div>

      {findOpen && (
        <div className={styles.findBar}>
          <input
            ref={findInputRef}
            className={styles.findInput}
            placeholder="Find…"
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              setFindIndex(0);
            }}
          />
          <div className={styles.findMeta}>{matchMeta}</div>
          <button type="button" className={styles.toolBtn} onClick={() => goToMatch(-1)} disabled={!matches.length} aria-label="Previous match">
            Prev
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => goToMatch(1)} disabled={!matches.length} aria-label="Next match">
            Next
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => setFindOpen(false)} aria-label="Close find">
            Close
          </button>
        </div>
      )}

      <div className={styles.body}>
        {error && <div className={styles.errorBanner}>{error}</div>}

        {mode === "create" && (
          <div className={styles.titleInputRow}>
            <div className={styles.label}>Title</div>
            <input
              className={styles.titleInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultNoteTitle()}
              disabled={isSaving}
            />
          </div>
        )}

        <div className={styles.editorShell}>
          {isLoading && !isLoaded ? (
            <div className={styles.loading}>
              <Spinner style={{ position: "static" }} />
              <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>Loading note…</div>
            </div>
          ) : (
            <div className={styles.editorInner}>
              <LexicalComposer key={`${editorKey}-${effectiveInitialContent.length}`} initialConfig={editorConfig}>
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable
                      className={`${styles.editorInput} ${wrap ? "" : styles.editorNoWrap}`}
                      aria-label="Note editor"
                      spellCheck
                      autoFocus
                      contentEditable={!isReadOnly}
                      suppressContentEditableWarning
                    />
                  }
                  placeholder={<Placeholder text={isReadOnly ? " " : "Write your note (Markdown)…"} />}
                  ErrorBoundary={LexicalErrorBoundary}
                />
                <HistoryPlugin />
                <ListPlugin />
                <LinkPlugin />
                <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                <EditorBridgePlugin onReady={setEditor} />
                <ExternalMarkdownPlugin markdown={markdown} lastAppliedRef={lastAppliedRef} forceUpdate={editorKey} />
                <OnChangePlugin
                  onChange={(editorState: EditorState) => {
                    editorState.read(() => {
                      const md = $convertToMarkdownString(TRANSFORMERS);
                      lastAppliedRef.current = md;
                      setMarkdown(md);
                    });
                  }}
                />
              </LexicalComposer>
            </div>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          {mode === "open" ? (fileName ? `File: ${fileName}` : "") : mode === "edit" ? (editContent?.title || "Edit text") : "Markdown note"}
        </div>
        <div className={styles.footerActions}>
          <button type="button" className="modal-button secondary" onClick={onRequestClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="modal-button primary" onClick={() => void handleSave()} disabled={!canSave}>
            {isSaving ? "Saving…" : mode === "create" ? "Save note" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

