/**
 * Formats task names according to MYLG core rules:
 * - Capitalize the first letter if missing
 * - Preserve user-provided casing and spacing everywhere else
 */
export function formatTaskName(name: string): string {
  if (typeof name !== "string") return "";
  if (!name) return "";

  const index = name.search(/[A-Za-z]/);
  if (index === -1) return name;

  const character = name.charAt(index);
  if (character === character.toUpperCase()) {
    return name;
  }

  return name.slice(0, index) + character.toUpperCase() + name.slice(index + 1);
}
