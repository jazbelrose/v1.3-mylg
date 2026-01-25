import { useCallback, useEffect, useMemo, useState } from "react";

import type { BudgetItem, GroupDisplayMode, GroupField } from "./invoicePreviewTypes";

interface UseInvoiceGroupingOptions {
  items: BudgetItem[];
}

interface UseInvoiceGroupingResult {
  groupField: GroupField;
  setGroupField: React.Dispatch<React.SetStateAction<GroupField>>;
  groupValues: string[];
  setGroupValues: React.Dispatch<React.SetStateAction<string[]>>;
  groupOptions: string[];
  filteredItems: BudgetItem[];
  handleGroupFieldChange: (field: GroupField) => void;
  handleToggleGroupValue: (value: string) => void;
  handleToggleAllGroupValues: (checked: boolean) => void;
  groupDisplayModes: Record<string, GroupDisplayMode>;
  setGroupDisplayModes: React.Dispatch<React.SetStateAction<Record<string, GroupDisplayMode>>>;
  handleToggleGroupDisplayMode: (group: string) => void;
  groupLabels: Record<string, string>;
  setGroupLabels: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleGroupLabelChange: (group: string, label: string) => void;
  getGroupDisplayLabel: (group: string) => string;
}

export function useInvoiceGrouping({ items }: UseInvoiceGroupingOptions): UseInvoiceGroupingResult {
  const [groupField, setGroupField] = useState<GroupField>("invoiceGroup");
  const [groupValues, setGroupValues] = useState<string[]>([]);
  const [groupDisplayModes, setGroupDisplayModes] = useState<Record<string, GroupDisplayMode>>({});
  const [groupLabels, setGroupLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!items.length) return;
    if (!items.some((item) => item.invoiceGroup)) {
      setGroupField("category");
      setGroupValues([]);
    }
  }, [items]);

  useEffect(() => {
    const rawValues = Array.from(
      new Set(
        items.map((item) => String((item as BudgetItem)[groupField] || "").trim())
      )
    );
    // For category, keep empty strings to include UNCATEGORIZED items
    const values = groupField === "category" ? rawValues : rawValues.filter(Boolean);
    setGroupValues((prev) => {
      if (prev.length === 0) return values;
      const filteredVals = prev.filter((value) => values.includes(value));
      return filteredVals.length !== prev.length ? filteredVals : prev;
    });
  }, [items, groupField]);

  const groupOptions = useMemo(
    () => {
      const rawValues = Array.from(
        new Set(
          items.map((item) => String((item as BudgetItem)[groupField] || "").trim())
        )
      );
      // For category, keep empty strings to include UNCATEGORIZED items
      return groupField === "category" ? rawValues : rawValues.filter(Boolean);
    },
    [items, groupField]
  );

  const filteredItems = useMemo(() => {
    if (groupValues.length === 0) return items;
    return items.filter((item) =>
      groupValues.includes(String((item as BudgetItem)[groupField] || "").trim())
    );
  }, [groupField, groupValues, items]);

  const handleGroupFieldChange = useCallback((field: GroupField) => {
    setGroupField(field);
    setGroupValues([]);
  }, []);

  const handleToggleGroupValue = useCallback((value: string) => {
    setGroupValues((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]
    );
  }, []);

  const handleToggleAllGroupValues = useCallback(
    (checked: boolean) => {
      setGroupValues(checked ? groupOptions : []);
    },
    [groupOptions]
  );

  const handleToggleGroupDisplayMode = useCallback((group: string) => {
    setGroupDisplayModes((prev) => ({
      ...prev,
      [group]: prev[group] === "ROLLED_UP" ? "DETAILED" : "ROLLED_UP",
    }));
  }, []);

  const handleGroupLabelChange = useCallback((group: string, label: string) => {
    setGroupLabels((prev) => ({
      ...prev,
      [group]: label.trim(),
    }));
  }, []);

  const getGroupDisplayLabel = useCallback(
    (group: string) => {
      const customLabel = groupLabels[group];
      if (customLabel && customLabel.trim()) return customLabel.trim();
      return group || "UNCATEGORIZED";
    },
    [groupLabels]
  );

  return {
    groupField,
    setGroupField,
    groupValues,
    setGroupValues,
    groupOptions,
    filteredItems,
    handleGroupFieldChange,
    handleToggleGroupValue,
    handleToggleAllGroupValues,
    groupDisplayModes,
    setGroupDisplayModes,
    handleToggleGroupDisplayMode,
    groupLabels,
    setGroupLabels,
    handleGroupLabelChange,
    getGroupDisplayLabel,
  };
}

export type { UseInvoiceGroupingResult };
