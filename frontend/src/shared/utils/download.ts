/**
 * Force a browser download. Falls back to fetching the file as a Blob for
 * Safari / cross-origin cases where <a download> is ignored.
 *
 * Note: For very large files, it's better to serve with `Content-Disposition: attachment`
 * to avoid loading the whole file into memory.
 */
export async function downloadViaAnchor(
  url: string,
  filename?: string,
  opts: { forceBlob?: boolean } = {}
) {
  const suggestedName =
    filename ||
    (() => {
      try {
        const u = new URL(url, window.location.href);
        return decodeURIComponent(u.pathname.split("/").pop() || "");
      } catch {
        return "";
      }
    })() ||
    "download";

  const isCrossOrigin = (() => {
    try {
      return new URL(url, location.href).origin !== location.origin;
    } catch {
      return true;
    }
  })();

  // If cross-origin or explicitly requested, use blob path (most reliable).
  if (opts.forceBlob || isCrossOrigin) {
    const res = await fetch(url, { credentials: "omit", mode: "cors" });
    if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a2 = document.createElement("a");
    a2.href = objectUrl;
    a2.download = suggestedName;
    document.body.appendChild(a2);
    a2.click();
    a2.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return;
  }

  // Lightweight same-origin path
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.rel = "noopener"; // keep, but DO NOT set target
  document.body.appendChild(a);
  a.click();
  a.remove();
}