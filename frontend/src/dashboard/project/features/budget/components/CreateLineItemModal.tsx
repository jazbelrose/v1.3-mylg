import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import Modal from "@/shared/ui/ModalWithStack";
import ConfirmModal from "@/shared/ui/ConfirmModal";
import styles from "./create-line-item-modal.module.css";
import { parseBudget, formatUSD } from "@/shared/utils/budgetUtils";
import { useData } from "@/app/contexts/useData";
import { generateSequentialPalette } from "@/shared/utils/colorUtils";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

/* eslint-disable */

/* ----------------------------- Types & Consts ----------------------------- */

type MoneyLike = string | number;

type FieldType = "text" | "textarea" | "number" | "date" | "currency" | "percent" | "select";

interface FieldDef {
  name: keyof ItemForm;
  label: string;
  type?: FieldType;
  options?: readonly string[];
}

export interface ItemForm extends Record<string, unknown> {
  category: string;
  elementKey: string;
  elementId: string;
  description: string;
  quantity: number | string;
  unit: string;

  itemBudgetedCost: MoneyLike;
  itemActualCost: MoneyLike;
  itemReconciledCost: MoneyLike;
  itemMarkUp: MoneyLike; // stored as "12%" in UI, converted to 0.12 on submit
  itemFinalCost: MoneyLike;

  paymentType: string;
  paymentTerms: string;
  paymentStatus: string;

  startDate: string; // ISO yyyy-mm-dd (input type="date")
  endDate: string;

  areaGroup: string;
  invoiceGroup: string;

  poNumber: string;
  vendor: string;
  vendorInvoiceNumber: string;

  client: string;

  amountPaid: MoneyLike;
  balanceDue: MoneyLike;

  notes: string;

  // server-provided id (optional)
  budgetItemId?: string;
  // revision will be added at submit
  revision?: number;
}

export interface CreateLineItemModalProps {
  isOpen: boolean;
  onRequestClose: () => void;
  onSubmit?: (data: ItemForm, isAutoSave?: boolean) => Promise<{ budgetItemId?: string } | void | null>;
  defaultElementKey?: string;
  budgetItems?: Array<Partial<ItemForm>>;
  areaGroupOptions?: string[];
  invoiceGroupOptions?: string[];
  clientOptions?: string[];
  defaultStartDate?: string;
  defaultEndDate?: string;
  initialData?: Partial<ItemForm> | null;
  title?: string;
  submitLabel?: string;
  revision?: number;
}

const CATEGORY_OPTIONS = [
  "AUDIO-VISUAL",
  "CLIENT-SERVICES-VIP",
  "CONTINGENCY-MISC",
  "DECOR",
  "DESIGN",
  "FABRICATION",
  "FOOD-BEVERAGE",
  "GRAPHICS",
  "INSTALLATION-MATERIALS",
  "LABOR",
  "LIGHTING",
  "MERCH-SWAG",
  "PARKING-FUEL-TOLLS",
  "PERMITS-INSURANCE",
  "PRODUCTION-MGMT",
  "RENTALS",
  "STORAGE",
  "TECH-INTERACTIVES",
  "TRAVEL",
  "TRUCKING",
  "VENUE-LOCATION-FEES",
  "WAREHOUSE",
] as const;

const PAYMENT_TYPE_OPTIONS = ["CREDIT CARD", "CHECK", "WIRE", "ACH", "CASH"] as const;
const PAYMENT_TERMS_OPTIONS = ["NET 15", "NET 30", "NET 60", "DUE ON RECEIPT"] as const;
const PAYMENT_STATUS_OPTIONS = ["PAID", "PARTIAL", "UNPAID"] as const;

const UNIT_OPTIONS = ["Each", "Hrs", "Days", "EA", "PCS", "Box", "LF", "SQFT", "KG"] as const;

const TOOLTIP_TEXT: Partial<Record<keyof ItemForm, string>> = {
  itemBudgetedCost:
    "Budgeted Cost will be disabled if Actual or Reconciled Cost is entered.",
  itemActualCost:
    "Overrides Budgeted Cost. This will be disabled if Reconciled Cost is entered.",
  itemReconciledCost:
    "Overrides both Budgeted and Actual Costs when entered.",
  itemMarkUp:
    "Markup will auto-adjust to keep Final Cost unchanged when you override costs. You can then modify Markup as needed.",
};

const IMMUTABLE_FORM_FIELD_NAMES = new Set(["projectid", "budgetid"]);
const IMMUTABLE_FORM_FIELD_ALIASES = new Set(["pk", "sk"]);
const FORM_GSI_KEY_PATTERN = /^gsi\d*(pk|sk)$/i;

const shouldStripImmutableField = (key: string): boolean => {
  const normalizedKey = key.toLowerCase();
  if (normalizedKey === "budgetitemid") return false;
  if (IMMUTABLE_FORM_FIELD_NAMES.has(normalizedKey)) return true;
  if (IMMUTABLE_FORM_FIELD_ALIASES.has(normalizedKey)) return true;
  return FORM_GSI_KEY_PATTERN.test(normalizedKey);
};

const sanitizeFormPayload = (payload: ItemForm): ItemForm => {
  const sanitized = Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (!shouldStripImmutableField(key)) {
      acc[key] = value;
    }
    return acc;
  }, {});

  return sanitized as ItemForm;
};

const fields: FieldDef[] = [
  { name: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
  { name: "elementKey", label: "Element Key" },
  { name: "elementId", label: "Element ID" },
  { name: "areaGroup", label: "Area Group" },
  { name: "invoiceGroup", label: "Invoice Group" },
  { name: "description", label: "Description", type: "textarea" },
  { name: "quantity", label: "Quantity", type: "number" },
  { name: "unit", label: "Unit", type: "select", options: UNIT_OPTIONS },
  { name: "itemBudgetedCost", label: "Budgeted Cost", type: "currency" },
  { name: "itemActualCost", label: "Actual Cost", type: "currency" },
  { name: "itemReconciledCost", label: "Reconciled Cost", type: "currency" },
  { name: "itemMarkUp", label: "Markup", type: "percent" },
  { name: "itemFinalCost", label: "Final Cost", type: "currency" },
  { name: "paymentType", label: "Payment Type", type: "select", options: PAYMENT_TYPE_OPTIONS },
  { name: "paymentTerms", label: "Payment Terms", type: "select", options: PAYMENT_TERMS_OPTIONS },
  { name: "paymentStatus", label: "Payment Status", type: "select", options: PAYMENT_STATUS_OPTIONS },
  { name: "startDate", label: "Start Date", type: "date" },
  { name: "endDate", label: "End Date", type: "date" },
  { name: "poNumber", label: "PO Number" },
  { name: "vendor", label: "Vendor" },
  { name: "vendorInvoiceNumber", label: "Vendor Invoice #" },
  { name: "client", label: "Client" },
  { name: "amountPaid", label: "Amount Paid", type: "currency" },
  { name: "balanceDue", label: "Balance Due", type: "currency" },
  { name: "notes", label: "Notes", type: "textarea" },
];

const initialState: ItemForm = fields.reduce<ItemForm>(
  (acc, f) => {
    if (f.name === "quantity") {
      acc[f.name] = 1;
    } else if (f.name === "unit") {
      acc[f.name] = "Each";
    } else {
      acc[f.name] = "";
    }
    return acc;
  },
  {} as ItemForm
);

const FULL_WIDTH_FIELDS = new Set<keyof ItemForm>(["description", "notes"]);

const SECTION_DEFINITIONS: Array<{
  id: string;
  title: string;
  description?: string;
  fields: readonly (keyof ItemForm)[];
}> = [
  {
    id: "details",
    title: "Details",
    description: "Define the core information about this line item.",
    fields: ["category", "elementKey", "elementId", "areaGroup", "invoiceGroup", "description"],
  },
  {
    id: "quantities",
    title: "Quantities",
    fields: ["quantity", "unit"],
  },
  {
    id: "financials",
    title: "Financials",
    description: "Track estimated and actual costs with markup adjustments.",
    fields: [
      "itemBudgetedCost",
      "itemActualCost",
      "itemReconciledCost",
      "itemMarkUp",
      "itemFinalCost",
    ],
  },
  {
    id: "payment",
    title: "Payment",
    fields: ["paymentType", "paymentTerms", "paymentStatus"],
  },
  {
    id: "schedule",
    title: "Schedule",
    fields: ["startDate", "endDate"],
  },
  {
    id: "vendor",
    title: "Vendor & Client",
    fields: ["poNumber", "vendor", "vendorInvoiceNumber", "client"],
  },
  {
    id: "accounting",
    title: "Accounting",
    fields: ["amountPaid", "balanceDue"],
  },
  {
    id: "notes",
    title: "Notes",
    fields: ["notes"],
  },
];

/* ------------------------------ Component ------------------------------ */

const CreateLineItemModal: React.FC<CreateLineItemModalProps> = ({
  isOpen,
  onRequestClose,
  onSubmit,
  defaultElementKey = "",
  budgetItems = [],
  areaGroupOptions = [],
  invoiceGroupOptions = [],
  clientOptions = [],
  defaultStartDate = "",
  defaultEndDate = "",
  initialData = null,
  title = "Create Line Item",
  submitLabel,
  revision = 1,
}) => {
  const { activeProject } = useData();
  const [item, setItem] = useState<ItemForm>({
    ...initialState,
    elementKey: defaultElementKey,
  });

  const [initialItemString, setInitialItemString] = useState<string>("");
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState<boolean>(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastOffsetRef = useRef(0);

  const accentColor = useMemo(() => {
    if (typeof activeProject?.color === "string" && activeProject.color.trim() !== "") {
      const normalized = normalizeHexColor(activeProject.color);
      if (normalized) {
        return normalized;
      }
    }
    return DEFAULT_ACCENT_COLOR;
  }, [activeProject?.color]);

  const accentRgbString = useMemo(() => {
    const rgb = hexToRgb(accentColor);
    if (!rgb) return DEFAULT_ACCENT_RGB;
    return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
  }, [accentColor]);

  const [gradientStart, gradientEnd] = useMemo(() => {
    const palette = generateSequentialPalette(accentColor, 3);
    const start = palette[0] ?? accentColor;
    const end = palette[palette.length - 1] ?? accentColor;
    return [start, end] as const;
  }, [accentColor]);

  const shadowRgbString = useMemo(() => {
    const rgb = hexToRgb(gradientEnd) ?? hexToRgb(accentColor);
    if (!rgb) return DEFAULT_SHADOW_RGB;
    return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
  }, [gradientEnd, accentColor]);

  const accentStyles = useMemo<Record<string, string>>(
    () => ({
      "--line-item-accent": accentColor,
      "--line-item-accent-rgb": accentRgbString,
      "--line-item-accent-gradient-start": gradientStart,
      "--line-item-accent-gradient-end": gradientEnd,
      "--line-item-accent-shadow-rgb": shadowRgbString,
    }),
    [accentColor, accentRgbString, gradientStart, gradientEnd, shadowRgbString]
  );

  const fieldMap = useMemo(() => {
    const map = new Map<keyof ItemForm, FieldDef>();
    fields.forEach((field) => {
      map.set(field.name, field);
    });
    return map;
  }, []);

  const captureOptions = useMemo<AddEventListenerOptions>(() => ({ capture: true }), []);

  /* --------------------------- Lifecycle & Setup --------------------------- */

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      const formatted: ItemForm = { ...initialState, ...initialData } as ItemForm;

      // normalize markup -> always show as percent string
      const markRaw = (formatted.itemMarkUp ?? "") as MoneyLike;
      if (String(markRaw) !== "" || Number(markRaw) === 0) {
        const num = parseFloat(String(markRaw));
        if (!Number.isNaN(num)) {
          const percent = num < 1 ? num * 100 : num;
          formatted.itemMarkUp = `${parseFloat(String(percent))}%`;
        }
      }

      setItem(formatted);
      setInitialItemString(JSON.stringify(formatted));
    } else {
      const defaultItem: ItemForm = {
        ...initialState,
        elementKey: defaultElementKey,
        startDate: defaultStartDate || "",
        endDate: defaultEndDate || "",
      };
      setItem(defaultItem);
      setInitialItemString(JSON.stringify(defaultItem));
    }
  }, [isOpen, initialData, defaultElementKey, defaultStartDate, defaultEndDate]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined") return;

    requestAnimationFrame(() => {
      const element = modalRef.current?.querySelector<HTMLElement>(
        "input:not([type=hidden]), select, textarea",
      );
      element?.focus({ preventScroll: true });
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;

    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";

    return () => {
      style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return;

    setSwipeOffset(0);
    setIsDragging(false);
    isDraggingRef.current = false;
    touchStartYRef.current = null;
    lastOffsetRef.current = 0;
  }, [isOpen]);

  /* ------------------------------- Helpers -------------------------------- */

  const getNextElementId = (category: string) => {
    let max = 0;
    budgetItems.forEach((it) => {
      const cat = it?.category;
      const elementId = it?.elementId as string | undefined;
      if (cat === category && typeof elementId === "string") {
        const match = elementId.match(/-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > max) max = num;
        }
      }
    });
    return `${category}-${String(max + 1).padStart(4, "0")}`;
  };

  const computeFinalCost = (data: ItemForm): string => {
    const budgeted = parseBudget(data.itemBudgetedCost);
    const actual = parseBudget(data.itemActualCost);
    const reconciled = parseBudget(data.itemReconciledCost);
    const mark = parseFloat(String(data.itemMarkUp).replace(/%/g, ""));
    const markupNum = Number.isNaN(mark) ? 0 : mark / 100;
    const baseCost = reconciled || actual || budgeted;
    const qty = parseFloat(String(data.quantity)) || 0;
    const final = baseCost * (1 + markupNum) * (qty || 1);
    return baseCost ? formatUSD(final) : "";
  };

  /* ------------------------------- Handlers -------------------------------- */

  type InputChange =
    | React.ChangeEvent<HTMLInputElement>
    | React.ChangeEvent<HTMLTextAreaElement>
    | React.ChangeEvent<HTMLSelectElement>;

  const handleChange = (e: InputChange) => {
    const { name, value } = e.target as HTMLInputElement;
    const field = name as keyof ItemForm;

    setItem((prev) => {
      const updated: ItemForm = { ...prev, [field]: value } as ItemForm;

      // Auto elementId when category chosen
      if (field === "category" && value) {
        updated.elementId = getNextElementId(value);
      }

      // Recompute final cost and keep markup consistent when overriding costs
      if (
        [
          "itemBudgetedCost",
          "itemActualCost",
          "itemReconciledCost",
          "itemMarkUp",
        ].includes(field as string)
      ) {
        const prevFinal = parseBudget(prev.itemFinalCost);
        let budgeted = parseBudget(updated.itemBudgetedCost);
        let actual = parseBudget(updated.itemActualCost);
        let reconciled = parseBudget(updated.itemReconciledCost);

        if (field === "itemBudgetedCost") budgeted = parseBudget(value);
        if (field === "itemActualCost") actual = parseBudget(value);
        if (field === "itemReconciledCost") reconciled = parseBudget(value);

        if ((field === "itemActualCost" || field === "itemReconciledCost") && prevFinal) {
          const base = reconciled || actual || budgeted;
          if (base) {
            const qty = parseFloat(String(prev.quantity)) || 1;
            const newMarkup = ((prevFinal / (base * qty) - 1) * 100).toFixed(2);
            updated.itemMarkUp = `${parseFloat(newMarkup)}%`;
          }
        }
        updated.itemFinalCost = computeFinalCost(updated);
      }

      if (field === "quantity") {
        updated.itemFinalCost = computeFinalCost(updated);
      }

      return updated;
    });
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const field = name as keyof ItemForm;

    if (
      [
        "itemBudgetedCost",
        "itemFinalCost",
        "itemActualCost",
        "itemReconciledCost",
        "amountPaid",
        "balanceDue",
      ].includes(field as string)
    ) {
      setItem((prev) => {
        const updated: ItemForm = {
          ...prev,
          [field]: value ? formatUSD(parseBudget(value)) : "",
        };

        if (
          [
            "itemBudgetedCost",
            "itemActualCost",
            "itemReconciledCost",
            "itemFinalCost",
          ].includes(field as string)
        ) {
          const prevFinal = parseBudget(prev.itemFinalCost);
          const budgeted = parseBudget(updated.itemBudgetedCost);
          const actual = parseBudget(updated.itemActualCost);
          const reconciled = parseBudget(updated.itemReconciledCost);

          if ((field === "itemActualCost" || field === "itemReconciledCost") && prevFinal) {
            const base = reconciled || actual || budgeted;
            if (base) {
              const qty = parseFloat(String(prev.quantity)) || 1;
              const newMarkup = ((prevFinal / (base * qty) - 1) * 100).toFixed(2);
              updated.itemMarkUp = `${parseFloat(newMarkup)}%`;
            }
          }
          updated.itemFinalCost = computeFinalCost(updated);
        }

        return updated;
      });
    } else if (field === "itemMarkUp") {
      if (value === "") {
        setItem((prev) => ({ ...prev, [field]: "" }));
      } else {
        const num = parseFloat(String(value).replace(/%/g, ""));
        if (!Number.isNaN(num)) {
          setItem((prev) => {
            const updated: ItemForm = { ...prev, [field]: `${num}%` } as ItemForm;
            const budgeted = parseBudget(updated.itemBudgetedCost);
            const actual = parseBudget(updated.itemActualCost);
            const reconciled = parseBudget(updated.itemReconciledCost);
            const markupNum = num / 100;
            const baseCost = reconciled || actual || budgeted;
            const qty = parseFloat(String(updated.quantity)) || 0;
            const final = baseCost * (1 + markupNum) * (qty || 1);
            updated.itemFinalCost = baseCost ? formatUSD(final) : "";
            return updated;
          });
        }
      }
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;

    touchStartYRef.current = event.touches[0].clientY;
    isDraggingRef.current = true;
    lastOffsetRef.current = 0;
    setIsDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || touchStartYRef.current === null) return;

    const currentY = event.touches[0].clientY;
    const delta = currentY - touchStartYRef.current;
    const offset = delta > 0 ? delta : 0;
    lastOffsetRef.current = offset;
    setSwipeOffset(offset);

    if (offset > 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;

    const threshold = 140;
    const shouldClose = lastOffsetRef.current > threshold;

    if (shouldClose) {
      setSwipeOffset(0);
      setIsDragging(false);
      isDraggingRef.current = false;
      touchStartYRef.current = null;
      lastOffsetRef.current = 0;
      handleClose();
      return;
    }

    setSwipeOffset(0);
    setIsDragging(false);
    isDraggingRef.current = false;
    touchStartYRef.current = null;
    lastOffsetRef.current = 0;
  };

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };

  const handleFormBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (typeof document === "undefined") return;
    const target = event.target as HTMLElement;
    if (!target.closest("input, textarea, select, button")) {
      const activeElement = document.activeElement as HTMLElement | null;
      activeElement?.blur?.();
    }
  };

  const submitItem = async (isAutoSave = false) => {
    const data: ItemForm = { ...item };

    ([
      "itemBudgetedCost",
      "itemFinalCost",
      "itemActualCost",
      "itemReconciledCost",
      "amountPaid",
      "balanceDue",
    ] as const).forEach((f) => {
      data[f] = data[f] ? parseBudget(data[f]) : 0;
    });

    data.quantity = data.quantity ? parseFloat(String(data.quantity)) : 0;

    if (data.areaGroup) data.areaGroup = data.areaGroup.trim().toUpperCase();
    if (data.invoiceGroup) data.invoiceGroup = data.invoiceGroup.trim().toUpperCase();

    if (data.itemMarkUp !== "") {
      const num = parseFloat(String(data.itemMarkUp).replace(/%/g, ""));
      // store as decimal for backend
      data.itemMarkUp = Number.isNaN(num) ? 0 : num / 100;
    } else {
      data.itemMarkUp = 0;
    }

    data.revision = revision;

    if (onSubmit) {
      const payload = sanitizeFormPayload(data);
      return await onSubmit(payload, isAutoSave);
    }
    return null;
  };

  const persistItem = async (isAutoSave = false) => {
    const result = await submitItem(isAutoSave);
    const savedItem =
      result && result.budgetItemId
        ? { ...item, budgetItemId: result.budgetItemId }
        : item;

    if (result && result.budgetItemId && !item.budgetItemId) {
      setItem(savedItem);
    }
    
    const newInitialString = JSON.stringify(savedItem);
    setInitialItemString(newInitialString);
    return result;
  };

  const handleClose = () => {
    setSwipeOffset(0);
    setIsDragging(false);
    isDraggingRef.current = false;
    touchStartYRef.current = null;
    lastOffsetRef.current = 0;
    const currentItemString = JSON.stringify(item);
    const hasChanges = currentItemString !== initialItemString;

    if (hasChanges) {
      setShowUnsavedConfirm(true);
    } else {
      onRequestClose();
    }
  };

  const confirmSave = async () => {
    await persistItem(false); // explicit save, not autosave
    setShowUnsavedConfirm(false);
    onRequestClose();
  };

  const discardChanges = () => {
    setShowUnsavedConfirm(false);
    onRequestClose();
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await persistItem(false); // explicit form submit, not autosave
  };

  /* ------------------------------- Shortcuts ------------------------------- */

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Esc" || event.code === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSwipeOffset(0);
        setIsDragging(false);
        isDraggingRef.current = false;
        touchStartYRef.current = null;
        lastOffsetRef.current = 0;

        const currentItemString = JSON.stringify(item);
        const hasChanges = currentItemString !== initialItemString;
        if (hasChanges) {
          setShowUnsavedConfirm(true);
        } else {
          onRequestClose();
        }
        return;
      }

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void persistItem(false); // keyboard shortcut save, not autosave
      }
    };

    if (typeof window === "undefined") return;

    window.addEventListener("keydown", handleKeyDown, captureOptions);

    if (typeof document !== "undefined") {
      document.addEventListener("keydown", handleKeyDown, captureOptions);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown, captureOptions);

      if (typeof document !== "undefined") {
        document.removeEventListener("keydown", handleKeyDown, captureOptions);
      }
    };
  }, [isOpen, item, initialItemString, onRequestClose, persistItem, captureOptions]);

  /* --------------------------------- Render -------------------------------- */

  const renderField = (fieldName: keyof ItemForm) => {
    const fieldDef = fieldMap.get(fieldName);
    if (!fieldDef) return null;

    const tooltip = TOOLTIP_TEXT[fieldName];
    const disabled =
      fieldName === "elementKey" ||
      fieldName === "elementId" ||
      (fieldName === "itemBudgetedCost" && (item.itemActualCost || item.itemReconciledCost)) ||
      (fieldName === "itemActualCost" && !!item.itemReconciledCost);

    const baseProps = {
      name: fieldName as string,
      value: item[fieldName] as string | number,
      onChange: handleChange,
      disabled: disabled as boolean,
    };

    const labelClasses = [styles.field];
    if (tooltip) labelClasses.push(styles.tooltipLabel);
    if (FULL_WIDTH_FIELDS.has(fieldName)) labelClasses.push(styles.fieldFullWidth);

    const datalistId =
      fieldName === "areaGroup"
        ? "area-group-options"
        : fieldName === "invoiceGroup"
        ? "invoice-group-options"
        : fieldName === "client"
        ? "client-options"
        : undefined;

    let control: React.ReactNode;

    if (fieldDef.type === "select") {
      const selectElement = (
        <select {...baseProps}>
          <option hidden value="" />
          {(fieldDef.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );

      if (fieldName === "paymentStatus") {
        const statusValue = String(item[fieldName] ?? "").trim().toUpperCase();
        const statusClass =
          statusValue === "PAID"
            ? styles.paid
            : statusValue === "PARTIAL"
            ? styles.partial
            : statusValue === "UNPAID"
            ? styles.unpaid
            : undefined;

        control = (
          <div className={styles.paymentStatusContainer}>
            {selectElement}
            {statusClass ? <span className={`${styles.statusDot} ${statusClass}`} aria-hidden="true" /> : null}
          </div>
        );
      } else {
        control = selectElement;
      }
    } else if (fieldDef.type === "number" || fieldDef.type === "date") {
      control = (
        <input
          type={fieldDef.type}
          {...baseProps}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
            }
          }}
        />
      );
    } else if (fieldDef.type === "textarea") {
      control = (
        <textarea
          {...baseProps}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
            }
          }}
        />
      );
    } else {
      const placeholder =
        fieldDef.type === "currency"
          ? "$0.00"
          : fieldDef.type === "percent"
          ? "0%"
          : "";

      const blurHandler =
        fieldDef.type && ["currency", "percent"].includes(fieldDef.type)
          ? handleBlur
          : undefined;

      control = (
        <input
          type="text"
          {...baseProps}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
            }
          }}
          onBlur={blurHandler}
          placeholder={placeholder}
          list={datalistId}
        />
      );
    }

    return (
      <label key={fieldName} className={labelClasses.join(" ")} title={tooltip || undefined}>
        <span className={styles.fieldLabel}>{fieldDef.label}</span>
        {control}
      </label>
    );
  };

  const modalStyle = swipeOffset
    ? { ...accentStyles, transform: `translateY(${swipeOffset}px)` }
    : accentStyles;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onRequestClose={handleClose}
        contentLabel={title}
        closeTimeoutMS={300}
        shouldCloseOnEsc={false}
        className={{
          base: "",
          afterOpen: "",
          beforeClose: "",
        }}
        overlayClassName={{
          base: styles.sheetOverlay,
          afterOpen: styles.sheetOverlay,
          beforeClose: styles.sheetOverlay,
        }}
      >
        <div
          ref={modalRef}
          className={`${styles.sheetModal} ${isDragging ? styles.sheetModalDragging : ""}`}
          style={modalStyle}
        >
          <div
            className={styles.grabZone}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div className={styles.grabHandle} />
          </div>
          <form className={styles.sheetForm} onSubmit={handleSubmit}>
            <header className={styles.modalHeader}>
              <div className={styles.headerText}>
                <h2 className={styles.modalTitle}>{title}</h2>
                <p className={styles.modalSubtitle}>
                  Capture every detail about your budget line item with structured sections and live totals.
                </p>
              </div>
              <div className={styles.headerActions}>
                <span className={styles.revisionPill}>Rev. {revision}</span>
                <button type="button" className={styles.closeButton} onClick={handleClose} aria-label="Close">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </header>
            <div className={styles.modalBody} onClick={handleFormBodyClick}>
              {SECTION_DEFINITIONS.map((section) => (
                <section key={section.id} className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>{section.title}</h3>
                    {section.description ? (
                      <p className={styles.sectionDescription}>{section.description}</p>
                    ) : null}
                  </div>
                  <div className={styles.fieldGrid}>
                    {section.fields.map((fieldName) => renderField(fieldName))}
                  </div>
                </section>
              ))}
            </div>

            <datalist id="area-group-options">
              {areaGroupOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id="invoice-group-options">
              {invoiceGroupOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id="client-options">
              {clientOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <footer className={styles.modalFooter}>
              <div className={styles.shortcutHint}>Press ⌘+Enter / Ctrl+Enter to save.</div>
              <div className={styles.footerActions}>
                <button type="button" className={styles.secondaryButton} onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryButton}>
                  {submitLabel || (title === "Edit Item" ? "Save" : "Create")}
                </button>
              </div>
            </footer>
          </form>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showUnsavedConfirm}
        onRequestClose={discardChanges}
        onConfirm={confirmSave}
        message="You have unsaved changes, do you want to save this line item?"
        confirmLabel="Yes"
        cancelLabel="No"
        className={{
          base: styles.modalContent,
          afterOpen: styles.modalContentAfterOpen,
          beforeClose: styles.modalContentBeforeClose,
        }}
        overlayClassName={{
          base: styles.modalOverlay,
          afterOpen: styles.modalOverlayAfterOpen,
          beforeClose: styles.modalOverlayBeforeClose,
        }}
      />
    </>
  );
};

export default CreateLineItemModal;









const DEFAULT_ACCENT_COLOR = "#6E7BFF";
const DEFAULT_ACCENT_RGB = "110, 123, 255";
const DEFAULT_SHADOW_RGB = "31, 45, 124";

const normalizeHexColor = (value: string): string | null => {
  const trimmed = value.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    return null;
  }

  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return trimmed.toUpperCase();
};

const hexToRgb = (value: string): [number, number, number] | null => {
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  if (normalized.length !== 6) return null;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some((component) => Number.isNaN(component))) {
    return null;
  }

  return [r, g, b];
};
