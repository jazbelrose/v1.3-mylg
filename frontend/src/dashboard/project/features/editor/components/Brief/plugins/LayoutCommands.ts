import { createCommand, type LexicalCommand } from "lexical";

/* --------------------------------- Commands -------------------------------- */

export const INSERT_LAYOUT_COMMAND: LexicalCommand<string> = createCommand<string>();
export const UPDATE_LAYOUT_COMMAND: LexicalCommand<{
  template: string;
  nodeKey: string;
}> = createCommand();

/* --------------------------------- Helpers --------------------------------- */

export function getItemsCountFromTemplate(template: string): number {
  return template.trim().split(/\s+/).length;
}









