export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function rangePct(start: Date, end: Date, weekStart: Date, weekEnd: Date): { left: number; width: number } {
  const S = Math.max(new Date(start).getTime(), weekStart.getTime());
  const E = Math.min(new Date(end).getTime(), weekEnd.getTime());
  const total = weekEnd.getTime() - weekStart.getTime();
  const left = clamp(((S - weekStart.getTime()) / total) * 100, 0, 100);
  const width = clamp(((E - S) / total) * 100, 0, 100);
  return { left, width };
}









