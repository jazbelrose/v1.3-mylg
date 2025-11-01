export const extractFabricPlainText = (value?: string | null): string => {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as { objects?: Array<{ type?: string; text?: string }> };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.objects)) {
      return "";
    }
    return parsed.objects
      .filter((item) => item?.type === "i-text" && typeof item.text === "string")
      .map((item) => (item.text ?? "").trim())
      .filter(Boolean)
      .join("\n");
  } catch (err) {
    console.error("Failed to parse fabric plain text", err);
    return "";
  }
};

export default extractFabricPlainText;
