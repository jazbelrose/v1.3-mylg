import type { HQTxn } from "../types";

export interface BudgetLineItem {
  budgetItemId: string;
  budgetId: string;
  projectId: string;
  itemName?: string;
  vendorKeywords?: string[]; // Keywords for matching
  budgetedAmount?: number;
}

export interface SuggestionMatch {
  budgetItem: BudgetLineItem;
  projectName?: string;
  confidence: number; // 0-1
  reason: string;
}

/**
 * Find suggested budget line items for a transaction based on vendor/merchant matching
 */
export function suggestBudgetLines(
  transaction: HQTxn,
  budgetItems: BudgetLineItem[],
  projectNames?: Map<string, string>
): SuggestionMatch[] {
  const txnText = [
    transaction.name,
    transaction.merchant,
    ...(transaction.category || []),
    ...(transaction.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matches: SuggestionMatch[] = [];

  for (const item of budgetItems) {
    const itemKeywords = item.vendorKeywords || [];
    const itemName = item.itemName || "";
    
    // Check for keyword matches
    let matchCount = 0;
    let totalKeywords = itemKeywords.length;
    
    for (const keyword of itemKeywords) {
      if (txnText.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    // Also check item name for matches
    if (itemName && txnText.includes(itemName.toLowerCase())) {
      matchCount++;
      totalKeywords++;
    }

    if (matchCount > 0) {
      const confidence = totalKeywords > 0 ? matchCount / totalKeywords : 0;
      const projectName = projectNames?.get(item.projectId);
      
      matches.push({
        budgetItem: item,
        projectName,
        confidence,
        reason: `Matched ${matchCount} keyword${matchCount !== 1 ? "s" : ""}`,
      });
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  // Return top 3
  return matches.slice(0, 3);
}

/**
 * Extract potential vendor keywords from a transaction
 */
export function extractVendorKeywords(transaction: HQTxn): string[] {
  const keywords = new Set<string>();

  // Add merchant name if available
  if (transaction.merchant) {
    keywords.add(transaction.merchant.toLowerCase());
  }

  // Add significant words from transaction name (filter out common words)
  const commonWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "from", "by", "with", "payment", "purchase", "invoice"
  ]);

  const nameWords = transaction.name
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3 && !commonWords.has(word));

  for (const word of nameWords) {
    keywords.add(word);
  }

  // Add categories
  if (transaction.category) {
    for (const cat of transaction.category) {
      keywords.add(cat.toLowerCase());
    }
  }

  return Array.from(keywords);
}

/**
 * Create a matching rule from a transaction to a budget line
 */
export interface MatchingRule {
  id: string;
  vendorKeywords: string[];
  budgetItemId: string;
  projectId: string;
  autoApply: boolean;
  createdAt: string;
}

export function createMatchingRule(
  transaction: HQTxn,
  budgetItemId: string,
  projectId: string,
  autoApply: boolean = false
): MatchingRule {
  // Generate a more unique ID using timestamp and random component
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  
  return {
    id: `rule-${Date.now()}-${randomSuffix}`,
    vendorKeywords: extractVendorKeywords(transaction),
    budgetItemId,
    projectId,
    autoApply,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Apply matching rules to find suggested allocations
 */
export function applyMatchingRules(
  transaction: HQTxn,
  rules: MatchingRule[],
  budgetItems: BudgetLineItem[]
): SuggestionMatch[] {
  const txnKeywords = extractVendorKeywords(transaction);
  const matches: SuggestionMatch[] = [];

  for (const rule of rules) {
    // Check if any rule keywords match transaction keywords
    const matchingKeywords = rule.vendorKeywords.filter((rk) =>
      txnKeywords.some((tk) => tk.includes(rk) || rk.includes(tk))
    );

    if (matchingKeywords.length > 0) {
      const budgetItem = budgetItems.find(
        (item) => item.budgetItemId === rule.budgetItemId
      );

      if (budgetItem) {
        const confidence = matchingKeywords.length / rule.vendorKeywords.length;
        matches.push({
          budgetItem,
          confidence,
          reason: `Rule match: ${matchingKeywords.join(", ")}`,
        });
      }
    }
  }

  // Sort by confidence
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches.slice(0, 3);
}
