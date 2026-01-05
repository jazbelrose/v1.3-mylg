import type { HqTransaction, HqTransactionType } from "@/hq/types";
import { suggestCategory } from "@/hq/lib/hqCategorization";

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeTransactionDescription(raw: string) {
  const upper = normalizeWhitespace(raw).toUpperCase();
  return upper.replace(/[^\w\s#/-]/g, "").replace(/\s+/g, " ").trim();
}

export function parseUsDateToIsoDate(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

function parseMonthDay(value: string): { month: number; day: number } | null {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

export function inferAuthorizedIsoDate(postedAtIso: string, monthDay: string): string | undefined {
  const md = parseMonthDay(monthDay);
  if (!md) return undefined;

  const [postedYearStr, postedMonthStr, postedDayStr] = postedAtIso.split("-");
  const postedYear = Number(postedYearStr);
  const postedMonth = Number(postedMonthStr);
  const postedDay = Number(postedDayStr);
  if (!postedYear || !postedMonth || !postedDay) return undefined;

  let year = postedYear;
  if (md.month > postedMonth || (md.month === postedMonth && md.day > postedDay)) {
    year -= 1;
  }

  const mm = String(md.month).padStart(2, "0");
  const dd = String(md.day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function extractReferenceId(normalized: string): string | undefined {
  const refMatch = /\bREF\s*#\s*([A-Z0-9-]+)/i.exec(normalized);
  if (refMatch?.[1]) return refMatch[1];
  const fedMatch = /\bFED#\s*([A-Z0-9-]+)/i.exec(normalized);
  if (fedMatch?.[1]) return fedMatch[1];
  return undefined;
}

function extractCardLast4(normalized: string): string | undefined {
  const match = /\bCARD\s+(\d{4})\b/i.exec(normalized);
  return match?.[1] || undefined;
}

function guessLocationFromTail(tokens: string[]): { city?: string; state?: string; vendorTokens: string[] } {
  if (tokens.length < 2) return { vendorTokens: tokens };

  const last = tokens[tokens.length - 1];
  const prev = tokens[tokens.length - 2];

  if (US_STATES.has(last) && /^[A-Z]{2}$/.test(last) && /^[A-Z][A-Z0-9&'.-]*$/.test(prev)) {
    return {
      city: prev,
      state: last,
      vendorTokens: tokens.slice(0, -2),
    };
  }

  return { vendorTokens: tokens };
}

function stripMerchantNoise(value: string) {
  return value
    .replace(/\bS\d{5,}\b/gi, "")
    .replace(/\b\d{3}-\d{3}-\d{4}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractCardPurchaseDetails(rawDescription: string, normalizedDescription: string, postedAt: string) {
  const upper = normalizeWhitespace(rawDescription).toUpperCase();
  const match = /(PURCHASE|RECURRING PAYMENT)\s+AUTHORIZED\s+ON\s+(\d{1,2}\/\d{1,2})\s+(.+)/i.exec(upper);
  if (!match) return null;

  const kind = match[1].toUpperCase() === "RECURRING PAYMENT" ? "recurring" : "card_purchase";
  const authorizedAt = inferAuthorizedIsoDate(postedAt, match[2]);

  let tail = match[3] || "";
  tail = stripMerchantNoise(tail);

  const cardLast4 = extractCardLast4(normalizedDescription);
  if (cardLast4) {
    tail = tail.replace(new RegExp(`\\bCARD\\s+${cardLast4}\\b`, "i"), "").trim();
  }

  const tokens = tail.split(/\s+/).filter(Boolean);
  const { city, state, vendorTokens } = guessLocationFromTail(tokens);

  const vendor = normalizeWhitespace(vendorTokens.join(" ")).slice(0, 80) || undefined;

  return { type: kind as HqTransactionType, authorizedAt, vendor, locationCity: city, locationState: state, cardLast4 };
}

function extractTransferDetails(normalizedDescription: string) {
  const match = /^ONLINE\s+TRANSFER\s+(TO|FROM)\s+(.+?)(?:\s+REF\s*#\s*[A-Z0-9-]+)?$/i.exec(normalizedDescription);
  if (!match) return null;
  const counterparty = normalizeWhitespace(match[2] || "").slice(0, 80) || undefined;
  return { type: "transfer" as const, counterparty };
}

function extractZelleDetails(normalizedDescription: string, postedAt: string) {
  const match = /^ZELLE\s+(TO|FROM)\s+(.+?)(?:\s+ON\s+(\d{1,2}\/\d{1,2}))?(?:\s+REF\s*#\s*[A-Z0-9-]+)?$/i.exec(normalizedDescription);
  if (!match) return null;
  const counterparty = normalizeWhitespace(match[2] || "").slice(0, 80) || undefined;
  const authorizedAt = match[3] ? inferAuthorizedIsoDate(postedAt, match[3]) : undefined;
  return { type: "zelle" as const, counterparty, authorizedAt };
}

function inferType(normalizedDescription: string): HqTransactionType {
  const upper = normalizedDescription.toUpperCase();
  if (upper.startsWith("BANKCARD FEE")) return "fee";
  if (upper.includes("RECURRING PAYMENT AUTHORIZED ON")) return "recurring";
  if (upper.includes("PURCHASE AUTHORIZED ON")) return "card_purchase";
  if (upper.startsWith("ONLINE TRANSFER")) return "transfer";
  if (upper.startsWith("ZELLE ")) return "zelle";
  if (upper.includes("WT FED#") || upper.startsWith("WIRE")) return "wire";
  if (upper.includes("MOBILE DEPOSIT") || upper.includes("EDEPOSIT")) return "deposit";
  return "unknown";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    // trim trailing empty columns
    while (row.length && row[row.length - 1] === "") row.pop();
    if (row.some((c) => c.trim().length)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      cell += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      pushCell();
      continue;
    }

    if (char === "\n") {
      pushCell();
      pushRow();
      continue;
    }

    if (char === "\r") {
      continue;
    }

    cell += char;
  }

  pushCell();
  pushRow();
  return rows;
}

export function detectWellsFargoNoHeader(rows: string[][]): boolean {
  const sample = rows.slice(0, 10).filter((r) => r.length >= 3);
  if (sample.length === 0) return false;

  let hits = 0;
  for (const row of sample) {
    const date = parseUsDateToIsoDate(row[0] || "");
    const amount = parseAmount(row[1] || "");
    const desc = (row[4] ?? row[row.length - 1] ?? "").trim();
    if (date && typeof amount === "number" && desc.length > 2) hits += 1;
  }
  return hits >= Math.max(2, Math.floor(sample.length * 0.7));
}

export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fallback (should be rare in modern browsers): stable but not cryptographic
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export async function computeTransactionDedupeHash(input: {
  accountId: string;
  postedAt: string;
  amount: number;
  rawDescription: string;
}): Promise<string> {
  const normalized = normalizeTransactionDescription(input.rawDescription).slice(0, 120);
  const payload = `${input.accountId}${input.postedAt}${input.amount.toFixed(2)}${normalized}`;
  return sha256Hex(payload);
}

export type WellsFargoNoHeaderRow = {
  postedAt: string;
  amount: number;
  rawDescription: string;
};

export function parseWellsFargoNoHeaderRows(csvText: string): WellsFargoNoHeaderRow[] {
  const rows = parseCsv(csvText);
  if (!detectWellsFargoNoHeader(rows)) {
    throw new Error("Unsupported CSV format. Expected Wells Fargo 5-column export (no header).");
  }

  const output: WellsFargoNoHeaderRow[] = [];

  for (const row of rows) {
    const postedAt = parseUsDateToIsoDate(row[0] || "");
    if (!postedAt) continue;
    const amount = parseAmount(row[1] || "");
    if (typeof amount !== "number") continue;

    const rawDescription = normalizeWhitespace(
      [row[4], ...row.slice(5)].filter(Boolean).join(",") || row[row.length - 1] || ""
    );
    if (!rawDescription) continue;

    output.push({ postedAt, amount, rawDescription });
  }

  return output;
}

export async function parseWellsFargoNoHeaderTransactions(input: {
  orgId: string;
  accountId: string;
  csvText: string;
}): Promise<HqTransaction[]> {
  const rows = parseWellsFargoNoHeaderRows(input.csvText);
  const createdAt = new Date().toISOString();

  const txns = await Promise.all(
    rows.map(async (row) => {
      const normalizedDescription = normalizeTransactionDescription(row.rawDescription);
      const type = inferType(normalizedDescription);

      const base: Omit<HqTransaction, "dedupeHash"> = {
        orgId: input.orgId,
        accountId: input.accountId,
        postedAt: row.postedAt,
        amount: row.amount,
        currency: "USD",
        rawDescription: row.rawDescription,
        normalizedDescription,
        type,
        direction: row.amount >= 0 ? "in" : "out",
        importRunId: "pending",
        createdAt,
      };

      const referenceId = extractReferenceId(normalizedDescription);
      const cardLast4 = extractCardLast4(normalizedDescription);

      let enriched: Partial<HqTransaction> = { referenceId, cardLast4 };

      const cardDetails = extractCardPurchaseDetails(row.rawDescription, normalizedDescription, row.postedAt);
      if (cardDetails) {
        enriched = { ...enriched, ...cardDetails };
      } else {
        const transfer = extractTransferDetails(normalizedDescription);
        if (transfer) enriched = { ...enriched, ...transfer };
        const zelle = extractZelleDetails(normalizedDescription, row.postedAt);
        if (zelle) enriched = { ...enriched, ...zelle };
      }

      const merged: HqTransaction = {
        ...base,
        ...enriched,
      } as HqTransaction;

      const guess = suggestCategory(merged);
      merged.categoryId = guess.categoryId;
      merged.categoryConfidence = guess.confidence;

      const dedupeHash = await computeTransactionDedupeHash({
        accountId: merged.accountId,
        postedAt: merged.postedAt,
        amount: merged.amount,
        rawDescription: merged.rawDescription,
      });

      return { ...merged, dedupeHash };
    })
  );

  return txns;
}

