export function parseBudget(input: string | number | undefined | null): number {
  if (input === undefined || input === null) return 0;
  if (typeof input === 'number') return input;
  
  let str = String(input).trim().toLowerCase();
  if (!str) return 0;
  
  // remove dollar signs and commas
  str = str.replace(/\$/g, '').replace(/,/g, '');
  
  let multiplier = 1;
  if (str.endsWith('k')) {
    multiplier = 1000;
    str = str.slice(0, -1);
  } else if (str.endsWith('m')) {
    multiplier = 1000000;
    str = str.slice(0, -1);
  }
  
  const value = parseFloat(str);
  if (isNaN(value)) return 0;
  return value * multiplier;
}

export function formatUSD(value: string | number): string {
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/[$,]/g, ""));
  if (isNaN(num)) return String(value);
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatCompactUSD(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not available";
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 10_000) {
    return `$${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Generate a default revision name from project name, date, and unique hex
 * Format: "ABC-20260120-a1b2" (3 letters + date + 4 hex chars)
 * @param projectName - The project title/name
 * @returns A formatted revision name string
 */
export function generateDefaultRevisionName(projectName?: string | null): string {
  // Get first 3 letters of project name (uppercase, alphanumeric only)
  const cleanName = (projectName || "REV")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const prefix = cleanName.slice(0, 3).padEnd(3, "X");

  // Date in YYYYMMDD format
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  // Short hex unique ID (4 chars from random hex)
  const hexId = Math.random().toString(16).slice(2, 6).toLowerCase();

  return `${prefix}-${dateStr}-${hexId}`;
}








