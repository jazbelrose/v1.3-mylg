import React, { useState, useEffect, useMemo } from "react";
import Modal from "@/shared/ui/ModalWithStack";
import SuggestionsPanel from "./SuggestionsPanel";
import type { HQTxn } from "../types";
import { createAllocation } from "../services/allocationsApi";
import { fetchProjectsFromApi } from "@/shared/utils/api";
import type { Project } from "@/shared/utils/api";
import {
  suggestBudgetLines,
  type BudgetLineItem,
  type SuggestionMatch,
} from "../services/suggestionEngine";
import styles from "./AttachTransactionModal.module.css";

interface AttachTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: HQTxn | null;
  onSuccess?: () => void;
}

const AttachTransactionModal: React.FC<AttachTransactionModalProps> = ({
  isOpen,
  onClose,
  transaction,
  onSuccess,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [budgetItems, setBudgetItems] = useState<BudgetLineItem[]>([]);
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // Get userId from current user context (you may need to adjust this)
        const userId = "current-user-id"; // TODO: Get from auth context
        const projectsData = await fetchProjectsFromApi(userId);
        setProjects(projectsData);
      } catch (err) {
        console.error("Failed to load projects:", err);
        setError("Failed to load projects");
      }
    };

    if (isOpen) {
      loadProjects();
    }
  }, [isOpen]);

  // Load budget items when project is selected
  useEffect(() => {
    const loadBudgetItems = async () => {
      if (!selectedProjectId) {
        setBudgetItems([]);
        return;
      }

      try {
        // Fetch budget items for the selected project
        const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
        const response = await fetch(
          `${API_BASE}/projects/${selectedProjectId}/budget`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("idToken")}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch budget items");
        }

        const data = await response.json();
        // Filter for line items only (not headers)
        const lineItems = data.filter(
          (item: any) => item.budgetItemId?.startsWith("LINE-")
        );
        setBudgetItems(lineItems);
      } catch (err) {
        console.error("Failed to load budget items:", err);
        setError("Failed to load budget items");
      }
    };

    loadBudgetItems();
  }, [selectedProjectId]);

  // Set default amount to transaction amount
  useEffect(() => {
    if (transaction && isOpen) {
      setAmount(transaction.amount);
    }
  }, [transaction, isOpen]);

  // Generate suggestions based on all available budget items
  const suggestions = useMemo(() => {
    if (!transaction || budgetItems.length === 0) {
      return [];
    }

    // Create a map of project IDs to names
    const projectNamesMap = new Map(
      projects.map((p) => [p.projectId, p.name || p.projectId])
    );

    // Convert budgetItems to the format expected by suggestionEngine
    const allBudgetItems = budgetItems.map((item) => ({
      ...item,
      projectId: selectedProjectId || "",
      vendorKeywords: [], // In production, load from item metadata
    }));

    return suggestBudgetLines(transaction, allBudgetItems, projectNamesMap);
  }, [transaction, budgetItems, projects, selectedProjectId]);

  const handleSelectSuggestion = (match: SuggestionMatch) => {
    const item = match.budgetItem;
    // Auto-fill the form with the suggested values
    if (item.projectId) {
      setSelectedProjectId(item.projectId);
    }
    setSelectedBudgetItemId(item.budgetItemId);
    // Amount is already set to transaction amount
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!transaction) {
      setError("No transaction selected");
      return;
    }

    if (!selectedProjectId || !selectedBudgetItemId) {
      setError("Please select a project and budget line item");
      return;
    }

    if (amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    setIsLoading(true);

    try {
      const selectedBudgetItem = budgetItems.find(
        (item) => item.budgetItemId === selectedBudgetItemId
      );

      await createAllocation({
        transactionId: transaction.id,
        projectId: selectedProjectId,
        budgetId: selectedBudgetItem?.budgetId,
        budgetItemId: selectedBudgetItemId,
        allocatedAmount: amount,
        notes: notes || undefined,
      });

      // Reset form
      setSelectedProjectId("");
      setSelectedBudgetItemId("");
      setAmount(0);
      setNotes("");

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Failed to create allocation:", err);
      setError("Failed to attach transaction to budget line");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setError("");
    setSelectedProjectId("");
    setSelectedBudgetItemId("");
    setAmount(0);
    setNotes("");
    onClose();
  };

  if (!transaction) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      contentLabel="Attach Transaction to Project"
      className={{
        base: styles.modalContent,
        afterOpen: styles.modalContentAfterOpen,
        beforeClose: styles.modalContentBeforeClose,
      }}
      overlayClassName={styles.modalOverlay}
    >
      <h2 className={styles.modalTitle}>Attach Transaction to Project</h2>

      <div className={styles.transactionInfo}>
        <p>
          <strong>{transaction.name}</strong>
        </p>
        <p>
          Amount: ${transaction.amount.toFixed(2)} ({transaction.isDebit ? "Debit" : "Credit"})
        </p>
        <p>Date: {new Date(transaction.date).toLocaleDateString()}</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Smart Suggestions */}
      {suggestions.length > 0 && (
        <SuggestionsPanel
          suggestions={suggestions}
          onSelectSuggestion={handleSelectSuggestion}
        />
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="project">Project</label>
          <select
            id="project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            required
            className={styles.select}
          >
            <option value="">Select a project...</option>
            {projects.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.name || project.projectId}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="budgetItem">Budget Line Item</label>
          <select
            id="budgetItem"
            value={selectedBudgetItemId}
            onChange={(e) => setSelectedBudgetItemId(e.target.value)}
            required
            disabled={!selectedProjectId}
            className={styles.select}
          >
            <option value="">Select a budget line...</option>
            {budgetItems.map((item) => (
              <option key={item.budgetItemId} value={item.budgetItemId}>
                {item.itemName || item.budgetItemId}
                {item.budgetedAmount !== undefined &&
                  ` ($${item.budgetedAmount.toFixed(2)})`}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            required
            className={styles.input}
          />
          <small className={styles.hint}>
            Full transaction: ${transaction.amount.toFixed(2)}. Enter a partial amount for
            splits.
          </small>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="notes">Notes (optional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={styles.textarea}
            placeholder="Add any notes about this allocation..."
          />
        </div>

        <div className={styles.buttons}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading}
          >
            {isLoading ? "Attaching..." : "Attach"}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className={styles.cancelButton}
            disabled={isLoading}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AttachTransactionModal;
