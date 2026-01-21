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








