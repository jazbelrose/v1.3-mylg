const resolveScheme = (): "ws" | "wss" => {
  if (typeof window === "undefined") return "wss";
  return window.location.protocol === "https:" ? "wss" : "ws";
};

export const FABRIC_API_BASE_URL =
  (import.meta.env.VITE_FABRIC_API_URL as string | undefined)?.trim() ||
  (typeof window !== "undefined"
    ? `${window.location.origin}/api/fabric`
    : "https://api.mylg.studio/fabric");

export const FABRIC_WS_URL = (() => {
  const explicit = (import.meta.env.VITE_FABRIC_WS_URL as string | undefined)?.trim();
  if (explicit) return explicit;
  if (typeof window === "undefined") {
    return "wss://fabric.mylg.studio/dev";
  }
  const scheme = resolveScheme();
  if (import.meta.env.DEV) {
    return `${scheme}://${window.location.host}/fabric-ws`;
  }
  return `${scheme}://${window.location.host.replace(/:\d+$/, ":443")}/fabric-ws`;
})();

export const FABRIC_EXPORT_TIMEOUT = 45_000;
