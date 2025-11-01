const isBrowser = typeof window !== "undefined";

const defaultHttpBase = (() => {
  const envOverride = import.meta.env.VITE_FABRIC_API_URL?.trim();
  if (envOverride) return envOverride;
  if (!isBrowser) {
    return "https://api.mylg.studio/fabric";
  }
  const origin = window.location.origin.replace(/\/$/, "");
  return `${origin}/api/fabric`;
})();

const defaultWsBase = (() => {
  const envOverride = import.meta.env.VITE_FABRIC_WS_URL?.trim();
  if (envOverride) return envOverride;
  if (!isBrowser) {
    return "wss://api.mylg.studio/realtime";
  }
  const useSecure = window.location.protocol === "https:";
  const scheme = useSecure ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws/fabric`;
})();

export const FABRIC_API_BASE = defaultHttpBase;
export const FABRIC_WS_URL = defaultWsBase;
