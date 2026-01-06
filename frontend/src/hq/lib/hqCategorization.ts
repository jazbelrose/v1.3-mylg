import type { HqCategoryId, HqCategoryRule, HqTransaction } from "@/hq/types";

type CategoryGuess = {
  categoryId: HqCategoryId;
  confidence: number;
  reason: string;
};

const DEFAULT_VENDOR_RULES: Array<{ match: RegExp; categoryId: HqCategoryId; confidence: number }> = [
  { match: /\bADOBE\b/i, categoryId: "SOFTWARE", confidence: 0.9 },
  { match: /\bAMAZON WEB SERVICE\b|\bAWS\b/i, categoryId: "SOFTWARE", confidence: 0.85 },
  { match: /\bNOTION\b/i, categoryId: "SOFTWARE", confidence: 0.8 },
  { match: /\bGOOGLE\b|\bG SUITE\b|\bWORKSPACE\b/i, categoryId: "SOFTWARE", confidence: 0.7 },
  { match: /\bUBER\b|\bLYFT\b/i, categoryId: "TRAVEL", confidence: 0.75 },
  { match: /\bDELTA\b|\bUNITED\b|\bAMERICAN AIRLINES\b|\bJETBLUE\b/i, categoryId: "TRAVEL", confidence: 0.7 },
  { match: /\bWEWORK\b/i, categoryId: "RENT_STORAGE", confidence: 0.7 },
  { match: /\bSQUARE\b|\bSTRIPE\b/i, categoryId: "INCOME", confidence: 0.6 },
];

function normalizeForMatching(value?: string) {
  return (value || "").trim();
}

export function suggestCategoryFromUserRules(
  txn: Pick<HqTransaction, "vendor" | "normalizedDescription" | "accountId" | "cardLast4">,
  rules: HqCategoryRule[]
): CategoryGuess | null {
  const vendor = normalizeForMatching(txn.vendor);
  const description = normalizeForMatching(txn.normalizedDescription);

  const enabledRules = rules
    .filter((r) => r.enabled)
    .slice()
    .sort((a, b) => b.priority - a.priority);

  for (const rule of enabledRules) {
    const scope = (rule as { scope?: string }).scope || "org";
    const ruleAccountId = (rule as { accountId?: string }).accountId;
    const ruleCardLast4 = (rule as { cardLast4?: string }).cardLast4;

    if (scope === "account" && ruleAccountId && txn.accountId !== ruleAccountId) continue;
    if (scope === "card" && ruleCardLast4 && txn.cardLast4 !== ruleCardLast4) continue;

    if (rule.matchType === "vendor") {
      if (vendor && vendor.toLowerCase() === rule.pattern.trim().toLowerCase()) {
        return { categoryId: rule.categoryId, confidence: 0.99, reason: "user-vendor" };
      }
      continue;
    }

    try {
      const re = new RegExp(rule.pattern, "i");
      if (re.test(description)) {
        return { categoryId: rule.categoryId, confidence: 0.95, reason: "user-regex" };
      }
    } catch {
      // ignore invalid regex rules
    }
  }

  return null;
}

export function suggestCategory(txn: Pick<HqTransaction, "type" | "isInternalTransfer" | "vendor" | "normalizedDescription">): CategoryGuess {
  if (txn.isInternalTransfer) {
    return { categoryId: "TRANSFERS", confidence: 0.9, reason: "internal-transfer" };
  }

  if (txn.type === "fee") return { categoryId: "FEES", confidence: 0.9, reason: "type-fee" };
  if (txn.type === "deposit") return { categoryId: "INCOME", confidence: 0.85, reason: "type-deposit" };

  const vendor = normalizeForMatching(txn.vendor);
  const description = normalizeForMatching(txn.normalizedDescription);

  for (const rule of DEFAULT_VENDOR_RULES) {
    if (rule.match.test(vendor) || rule.match.test(description)) {
      return { categoryId: rule.categoryId, confidence: rule.confidence, reason: "default-vendor" };
    }
  }

  if (txn.type === "transfer" || txn.type === "zelle" || txn.type === "wire") {
    return { categoryId: "OTHER", confidence: 0.35, reason: "type-transfer" };
  }

  return { categoryId: "OTHER", confidence: 0.2, reason: "fallback" };
}

