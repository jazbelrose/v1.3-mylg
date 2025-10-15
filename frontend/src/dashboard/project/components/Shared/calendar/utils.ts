import { parseBudget, formatUSD } from "@/shared/utils/budgetUtils";
import { addDays, endOfWeek, startOfWeek } from "@/dashboard/home/utils/dateUtils";
import type { TimelineEvent } from "./types";

export function safeParse(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map((p) => parseInt(p, 10));
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

export function getDateKey(date?: Date | null): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function isElementWithin(node: Node | null, container?: HTMLElement | null): boolean {
  if (!node || !container) return false;
  return container === node || container.contains(node as Node);
}

export function formatHours(hours?: number | string | null): string | null {
  if (hours === undefined || hours === null || hours === "") return null;
  const hoursNumber = Number(hours);
  if (Number.isNaN(hoursNumber)) return `${hours}`;
  const suffix = hoursNumber === 1 ? "hr" : "hrs";
  return `${hoursNumber} ${suffix}`;
}

export function computeEventTotalHours(events: TimelineEvent[]): number {
  return events.reduce((sum, ev) => sum + Number(ev.hours || 0), 0);
}

export function computeFinalCost(
  qty: number | string,
  budget: number | string,
  mark: number | string
): string {
  const budgetNum = parseBudget(budget);
  const markNum = parseFloat(String(mark).replace(/%/g, ""));
  const markupNum = Number.isNaN(markNum) ? 0 : markNum / 100;
  const qtyNum = parseFloat(String(qty)) || 0;
  const final = budgetNum * (1 + markupNum) * (qtyNum || 1);
  return budgetNum ? formatUSD(final) : "";
}

export function buildWeekMatrix(monthStart: Date) {
  const first = startOfWeek(monthStart);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const last = endOfWeek(monthEnd);
  const totalDays = Math.round((last.getTime() - first.getTime()) / 86400000) + 1;
  const weeks: Array<Array<{ date: Date; key: string; inMonth: boolean }>> = [];
  for (let i = 0; i < totalDays; i += 1) {
    const day = addDays(first, i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const entry = { date: day, key, inMonth: day.getMonth() === monthStart.getMonth() };
    if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) {
      weeks.push([]);
    }
    weeks[weeks.length - 1].push(entry);
  }
  while (weeks.length && weeks[weeks.length - 1].every((d) => !d.inMonth)) {
    weeks.pop();
  }
  return weeks;
}
