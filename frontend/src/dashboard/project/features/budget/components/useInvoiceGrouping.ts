import { useCallback, useEffect, useMemo, useState } from "react";

import type { BudgetItem, GroupField } from "./invoicePreviewTypes";

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
}

export function useInvoiceGrouping({ items }: UseInvoiceGroupingOptions): UseInvoiceGroupingResult {
  const [groupField, setGroupField] = useState<GroupField>("invoiceGroup");
  const [groupValues, setGroupValues] = useState<string[]>([]);

  useEffect(() => {
    if (!items.length) return;
    if (!items.some((item) => item.invoiceGroup)) {
      setGroupField("category");
      setGroupValues([]);
    }
  }, [items]);

  useEffect(() => {
    const values = Array.from(
      new Set(
        items
          .map((item) => String((item as BudgetItem)[groupField] || "").trim())
          .filter(Boolean)
      )
    );
    setGroupValues((prev) => {
      if (prev.length === 0) return values;
      const filteredVals = prev.filter((value) => values.includes(value));
      return filteredVals.length !== prev.length ? filteredVals : prev;
    });
  }, [items, groupField]);

  const groupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((item) => String((item as BudgetItem)[groupField] || "").trim())
            .filter(Boolean)
        )
      ),
    [items, groupField]
  );

  const filteredItems = useMemo(() => {
    if (groupValues.length === 0) return items;
    return items.filter((item) =>
      groupValues.includes(String((item as BudgetItem)[groupField]).trim())
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
  };
}

export type { UseInvoiceGroupingResult };
