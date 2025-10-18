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
