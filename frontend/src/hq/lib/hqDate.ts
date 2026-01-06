export const HQ_DEFAULT_TIME_ZONE = "America/Los_Angeles";

export function isoDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const yyyy = parts.find((p) => p.type === "year")?.value;
  const mm = parts.find((p) => p.type === "month")?.value;
  const dd = parts.find((p) => p.type === "day")?.value;

  if (!yyyy || !mm || !dd) {
    const fallback = new Date(date.getTime());
    const y = fallback.getFullYear();
    const m = String(fallback.getMonth() + 1).padStart(2, "0");
    const d = String(fallback.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return `${yyyy}-${mm}-${dd}`;
}

export function todayIsoDateInTimeZone(timeZone: string): string {
  return isoDateInTimeZone(new Date(), timeZone);
}

export function todayPacificIsoDate(): string {
  return todayIsoDateInTimeZone(HQ_DEFAULT_TIME_ZONE);
}
