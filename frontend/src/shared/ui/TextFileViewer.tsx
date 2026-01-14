import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { Klass, LexicalNode, EditorState } from "lexical";

import { apiFetch, fileUrlsToKeys, projectFilePutUrl, projectFileViewUrl } from "@/shared/utils/api";

import styles from "./text-file-viewer.module.css";

const VIEW_FULL_THRESHOLD_BYTES = 512 * 1024;
const CHUNK_BYTES = 256 * 1024;
const MAX_INLINE_EDIT_BYTES = 2 * 1024 * 1024;

const TEXT_LIKE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "log",
  "csv",
  "ts",
  "tsx",
  "js",
  "jsx",
  "css",
  "html",
  "yml",
  "yaml",
]);

function isTextLikeFileName(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return TEXT_LIKE_EXTENSIONS.has(ext);
}

function inferContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "md" || ext === "markdown") return "text/markdown; charset=utf-8";
  if (ext === "json") return "application/json; charset=utf-8";
  if (ext === "csv") return "text/csv; charset=utf-8";
  return "text/plain; charset=utf-8";
}

type FileViewInfo = {
  downloadUrl: string;
  sizeBytes: number | null;
  contentType: string | null;
  etag: string | null;
  rangeSupported: boolean;
  isTextLike: boolean;
};

async function fetchRange(url: string, start: number, endInclusive: number): Promise<Response> {
  return fetch(url, {
    method: "GET",
    headers: {
      Range: `bytes=${start}-${endInclusive}`,
    },
  });
}

const Placeholder = ({ text }: { text: string }) => <div className={styles.placeholder}>{text}</div>;

const MarkdownExternalStatePlugin: React.FC<{
  markdown: string;
  lastAppliedRef: React.MutableRefObject<string | null>;
}> = ({ markdown, lastAppliedRef }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (markdown === lastAppliedRef.current) return;
    editor.update(() => {
      $convertFromMarkdownString(markdown || "", TRANSFORMERS);
    });
    lastAppliedRef.current = markdown;
  }, [editor, markdown, lastAppliedRef]);

  return null;
};

export type TextFileViewerProps = {
  projectId: string;
  fileUrl: string;
  fileName: string;
  canEdit?: boolean;
  showTitle?: boolean;
  showDownloadLink?: boolean;
};

export default function TextFileViewer({
  projectId,
  fileUrl,
  fileName,
  canEdit = false,
  showTitle = true,
  showDownloadLink = true,
}: TextFileViewerProps) {
  const [viewInfo, setViewInfo] = useState<FileViewInfo | null>(null);
  const [text, setText] = useState("");
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const decoderRef = useRef<TextDecoder | null>(null);
  const loadedBytesRef = useRef(0);
  const textRef = useRef("");
  const markdownRef = useRef<string>("");
  const lastAppliedMarkdownRef = useRef<string | null>(null);

  const key = useMemo(() => {
    const [derived] = fileUrlsToKeys([fileUrl]);
    return derived || fileUrl;
  }, [fileUrl]);

  const extension = useMemo(() => fileName.split(".").pop()?.toLowerCase() || "", [fileName]);
  const isTextLike = useMemo(() => isTextLikeFileName(fileName), [fileName]);
  const isEditable = useMemo(() => extension === "md" || extension === "markdown" || extension === "txt", [extension]);

  const loadViewInfo = useCallback(async () => {
    const url = `${projectFileViewUrl(projectId)}?key=${encodeURIComponent(key)}`;
    const data = await apiFetch<unknown>(url);
    if (!data || typeof data !== "object") {
      throw new Error("Invalid file view response");
    }
    const obj = data as Record<string, unknown>;

    const downloadUrl = typeof obj.downloadUrl === "string" ? obj.downloadUrl : null;
    if (!downloadUrl) {
      throw new Error("Invalid file view response (missing downloadUrl)");
    }

    return {
      downloadUrl,
      sizeBytes: typeof obj.sizeBytes === "number" ? obj.sizeBytes : null,
      contentType: typeof obj.contentType === "string" ? obj.contentType : null,
      etag: typeof obj.etag === "string" ? obj.etag : null,
      rangeSupported: obj.rangeSupported !== false,
      isTextLike: obj.isTextLike !== false,
    } satisfies FileViewInfo;
  }, [key, projectId]);

  const loadFirstChunk = useCallback(async (info: FileViewInfo) => {
    setError(null);
    setSaveError(null);
    setIsLoading(true);
    setText("");
    setLoadedBytes(0);
    loadedBytesRef.current = 0;
    textRef.current = "";
    decoderRef.current = new TextDecoder("utf-8");

    try {
      const shouldFetchFull = info.sizeBytes !== null && info.sizeBytes <= VIEW_FULL_THRESHOLD_BYTES;
      if (shouldFetchFull) {
        const res = await fetch(info.downloadUrl);
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        const buf = await res.arrayBuffer();
        const decoded = decoderRef.current.decode(buf);
        setText(decoded);
        setLoadedBytes(buf.byteLength);
        textRef.current = decoded;
        loadedBytesRef.current = buf.byteLength;
        return;
      }

      const res = await fetchRange(info.downloadUrl, 0, CHUNK_BYTES - 1);
      if (res.status === 416) {
        setText("");
        setLoadedBytes(0);
        textRef.current = "";
        loadedBytesRef.current = 0;
        return;
      }
      if (!res.ok) throw new Error(`Failed to load file (${res.status})`);

      const buf = await res.arrayBuffer();
      // Some origins ignore Range and return 200 with full content.
      const decoded = decoderRef.current.decode(buf, { stream: true });
      setText(decoded);
      setLoadedBytes(buf.byteLength);
      textRef.current = decoded;
      loadedBytesRef.current = buf.byteLength;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId || !key) return;
    setError(null);
    try {
      let info: FileViewInfo;
      try {
        info = await loadViewInfo();
      } catch {
        info = {
          downloadUrl: fileUrl,
          sizeBytes: null,
          contentType: null,
          etag: null,
          rangeSupported: true,
          isTextLike,
        };
      }

      setViewInfo(info);
      if (!info.isTextLike && !isTextLike) {
        setError("This file type isn't supported for text preview.");
        return;
      }

      await loadFirstChunk(info);
    } catch (err) {
      console.error("Failed to load text file view", err);
      setError("Failed to load file preview.");
    }
  }, [fileUrl, isTextLike, key, loadFirstChunk, loadViewInfo, projectId]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, key]);

  const canLoadMore = useMemo(() => {
    if (!viewInfo) return false;
    if (isLoading) return false;
    if (viewInfo.sizeBytes === null) return true;
    return loadedBytes < viewInfo.sizeBytes;
  }, [isLoading, loadedBytes, viewInfo]);

  const loadMore = useCallback(async () => {
    if (!viewInfo) return;
    if (!viewInfo.rangeSupported) return;
    if (isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const start = loadedBytesRef.current;
      const end = start + CHUNK_BYTES - 1;
      const res = await fetchRange(viewInfo.downloadUrl, start, end);
      if (res.status === 416) return;
      if (!res.ok) throw new Error(`Failed to load more (${res.status})`);
      const buf = await res.arrayBuffer();
      const decoded = (decoderRef.current || new TextDecoder("utf-8")).decode(buf, { stream: true });
      const nextText = textRef.current + decoded;
      const nextBytes = loadedBytesRef.current + buf.byteLength;
      textRef.current = nextText;
      loadedBytesRef.current = nextBytes;
      setText(nextText);
      setLoadedBytes(nextBytes);
    } catch (err) {
      console.error("Failed to load more file content", err);
      setError("Failed to load more.");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, viewInfo]);

  const ensureFullyLoadedForEdit = useCallback(async () => {
    if (!viewInfo) return false;
    if (viewInfo.sizeBytes !== null && viewInfo.sizeBytes > MAX_INLINE_EDIT_BYTES) {
      setSaveError("This file is too large to edit inline. Download it instead.");
      return false;
    }

    const targetBytes = viewInfo.sizeBytes ?? MAX_INLINE_EDIT_BYTES;
    while (loadedBytesRef.current < targetBytes) {
      await loadMore();
      // If we didn't make progress, bail.
      if (loadedBytesRef.current >= targetBytes) break;
      await new Promise((r) => setTimeout(r, 0));
      if (viewInfo.sizeBytes === null && loadedBytesRef.current >= MAX_INLINE_EDIT_BYTES) break;
    }
    return true;
  }, [loadMore, viewInfo]);

  const startEditing = useCallback(async () => {
    setSaveError(null);
    const ok = await ensureFullyLoadedForEdit();
    if (!ok) return;
    markdownRef.current = textRef.current;
    lastAppliedMarkdownRef.current = null;
    setIsEditing(true);
  }, [ensureFullyLoadedForEdit]);

  const save = useCallback(async () => {
    if (!viewInfo) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const contentType = viewInfo.contentType || inferContentType(fileName);

      const put = await apiFetch<{ uploadUrl: string }>(projectFilePutUrl(projectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          contentType,
          ifMatch: viewInfo.etag || undefined,
        }),
      });

      const res = await fetch(put.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          ...(viewInfo.etag ? { "If-Match": viewInfo.etag } : {}),
        },
        body: markdownRef.current,
      });

      if (!res.ok) {
        if (res.status === 412) {
          throw new Error("File changed since you opened it.");
        }
        throw new Error(`Save failed (${res.status})`);
      }

      setIsEditing(false);
      await refresh();
    } catch (err) {
      console.error("Failed to save file", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  }, [fileName, key, projectId, refresh, viewInfo]);

  const theme = useMemo(
    () => ({
      paragraph: styles.editorParagraph,
      text: {
        bold: styles.editorBold,
        italic: styles.editorItalic,
        underline: styles.editorUnderline,
      },
      link: styles.editorLink,
      list: {
        listitem: styles.editorListItem,
        ul: styles.editorUl,
        ol: styles.editorOl,
      },
    }),
    [],
  );

  const editorConfig = useMemo(
    () => ({
      namespace: `text-file-${projectId}`,
      theme,
      onError: (err: Error) => console.error("Lexical error", err),
      // Required for MarkdownShortcutPlugin(TRANSFORMERS), e.g. code block transformer needs CodeNode.
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode] as Klass<LexicalNode>[],
    }),
    [projectId, theme],
  );

  const showMeta = viewInfo && (viewInfo.sizeBytes !== null || viewInfo.contentType);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        {showTitle && (
          <div className={styles.title} title={fileName}>{fileName}</div>
        )}
        <div className={styles.actions}>
          {!isEditing && canEdit && isEditable && (
            <button type="button" className={styles.button} onClick={() => void startEditing()} disabled={isLoading}>
              Edit
            </button>
          )}
          {isEditing && (
            <>
              <button type="button" className={styles.button} onClick={() => setIsEditing(false)} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className={styles.buttonPrimary} onClick={() => void save()} disabled={isSaving}>
                {isSaving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {showMeta && (
        <div className={styles.meta}>
          {typeof viewInfo?.sizeBytes === "number" && (
            <span>
              Loaded {Math.min(loadedBytes, viewInfo.sizeBytes).toLocaleString()} of {viewInfo.sizeBytes.toLocaleString()} bytes
            </span>
          )}
          {viewInfo?.contentType && <span>{viewInfo.contentType}</span>}
          {viewInfo?.etag && <span>ETag {viewInfo.etag.slice(0, 12)}…</span>}
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {saveError && <div className={styles.error}>{saveError}</div>}

      {!isEditing ? (
        <div className={styles.viewer}>
          {isLoading && !text ? (
            <div className={styles.loading}>Loading…</div>
          ) : (
            <pre className={styles.pre}>{text}</pre>
          )}
          <div className={styles.footer}>
            {canLoadMore && (
              <button type="button" className={styles.button} onClick={() => void loadMore()} disabled={isLoading}>
                {isLoading ? "Loading…" : "Load more"}
              </button>
            )}
            {showDownloadLink && viewInfo?.downloadUrl && (
              <a className={styles.link} href={viewInfo.downloadUrl} target="_blank" rel="noreferrer">
                Download
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.editorWrap}>
          <LexicalComposer initialConfig={editorConfig}>
            <div className={styles.editorInner}>
              <RichTextPlugin
                contentEditable={<ContentEditable className={styles.editorInput} aria-label="Edit file" />}
                placeholder={<Placeholder text="Write…" />}
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <ListPlugin />
              <LinkPlugin />
              <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
              <MarkdownExternalStatePlugin markdown={text} lastAppliedRef={lastAppliedMarkdownRef} />
              <OnChangePlugin
                onChange={(editorState: EditorState) => {
                  editorState.read(() => {
                    markdownRef.current = $convertToMarkdownString(TRANSFORMERS);
                  });
                }}
              />
            </div>
          </LexicalComposer>
        </div>
      )}
    </div>
  );
}
