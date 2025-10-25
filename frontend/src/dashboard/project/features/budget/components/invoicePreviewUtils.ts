export const formatCurrency = (
  val: number | string | null | undefined
): string => {
  const num =
    typeof val === "number"
      ? val
      : parseFloat(String(val ?? "").replace(/[$,]/g, ""));
  if (Number.isNaN(num)) return (val as string) || "";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatPercent = (val: number | null | undefined): string => {
  if (!Number.isFinite(val ?? NaN)) return "0";
  const numeric = Number(val);
  return parseFloat(numeric.toFixed(2)).toString();
};
