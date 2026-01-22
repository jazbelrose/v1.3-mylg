import React from "react";
import type { SuggestionMatch } from "../services/suggestionEngine";
import styles from "./SuggestionsPanel.module.css";

interface SuggestionsPanelProps {
  suggestions: SuggestionMatch[];
  onSelectSuggestion: (match: SuggestionMatch) => void;
  isLoading?: boolean;
}

const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({
  suggestions,
  onSelectSuggestion,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className={styles.panel}>
        <h4 className={styles.title}>Smart Suggestions</h4>
        <div className={styles.loading}>Finding matches...</div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className={styles.panel}>
        <h4 className={styles.title}>Smart Suggestions</h4>
        <div className={styles.empty}>
          No suggestions found. Try creating a matching rule for similar transactions.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h4 className={styles.title}>
        Smart Suggestions
        <span className={styles.badge}>{suggestions.length}</span>
      </h4>
      <p className={styles.subtitle}>
        Based on vendor name and categories
      </p>

      <div className={styles.suggestions}>
        {suggestions.map((match, index) => (
          <button
            key={match.budgetItem.budgetItemId}
            className={styles.suggestionCard}
            onClick={() => onSelectSuggestion(match)}
            type="button"
          >
            <div className={styles.suggestionHeader}>
              <div className={styles.rank}>#{index + 1}</div>
              <div className={styles.confidence}>
                <div
                  className={styles.confidenceBar}
                  style={{ width: `${match.confidence * 100}%` }}
                />
                <span className={styles.confidenceText}>
                  {Math.round(match.confidence * 100)}% match
                </span>
              </div>
            </div>

            <div className={styles.suggestionBody}>
              <div className={styles.itemName}>
                {match.budgetItem.itemName || match.budgetItem.budgetItemId}
              </div>
              {match.projectName && (
                <div className={styles.projectName}>
                  Project: {match.projectName}
                </div>
              )}
              {match.budgetItem.budgetedAmount !== undefined && (
                <div className={styles.budgetAmount}>
                  Budget: ${match.budgetItem.budgetedAmount.toFixed(2)}
                </div>
              )}
            </div>

            <div className={styles.suggestionFooter}>
              <span className={styles.reason}>{match.reason}</span>
              <span className={styles.actionHint}>Click to use →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestionsPanel;
