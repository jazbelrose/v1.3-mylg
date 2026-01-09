export type FocusBlockWindowId = "balanced" | "late" | "sprint";

export type FocusBlockWindow = {
  id: FocusBlockWindowId;
  label: string;
  startLocalTime: string; // HH:MM
  endLocalTime: string; // HH:MM
};

export const FOCUS_BLOCK_WINDOWS: FocusBlockWindow[] = [
  {
    id: "balanced",
    label: "Balanced (9:00–5:00)",
    startLocalTime: "09:00",
    endLocalTime: "17:00",
  },
  {
    id: "late",
    label: "Late (1:00–8:00)",
    startLocalTime: "13:00",
    endLocalTime: "20:00",
  },
  {
    id: "sprint",
    label: "Sprint (10:00–1:00)",
    startLocalTime: "10:00",
    endLocalTime: "13:00",
  },
];

export function getFocusBlockWindow(id: FocusBlockWindowId | null | undefined): FocusBlockWindow {
  return FOCUS_BLOCK_WINDOWS.find((w) => w.id === id) ?? FOCUS_BLOCK_WINDOWS[0];
}

export function minutesFromHHMM(hhmm: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((hhmm ?? "").trim());
  if (!match) return 0;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  return hh * 60 + mm;
}

export function blockMinutesFromWindow(startLocalTime: string, endLocalTime: string): number {
  const start = minutesFromHHMM(startLocalTime);
  const end = minutesFromHHMM(endLocalTime);
  const diff = end - start;
  return diff > 0 ? diff : 0;
}
