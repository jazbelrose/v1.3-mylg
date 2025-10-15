const scheme = typeof window !== "undefined" && window.location.protocol === "https:"
  ? "wss"
  : "ws";

// Default = EC2. Env can override if you ever need to.
const baseUrl =
  (import.meta.env.VITE_YJS_WS_URL?.trim()) ||
  `${scheme}://35.165.113.63:1234`;

// If VITE_YJS_USE_PROXY=true, use the proxy path in dev
export const YJS_WS_URL =
  import.meta.env.VITE_YJS_USE_PROXY === "true" && import.meta.env.DEV
    ? `${scheme}://${window.location.host}/yjs`
    : baseUrl;









