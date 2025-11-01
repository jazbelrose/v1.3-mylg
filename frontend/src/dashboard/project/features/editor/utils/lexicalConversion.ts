/*
 * Helpers for converting between Lexical editor states and plain text values.
 */

export const createLexicalParagraphState = (text: string): string => {
  const trimmed = text.replace(/\r\n|\r/g, "\n");
  const segments = trimmed.split("\n");
  const children = segments.map((segment) => ({
    type: "paragraph",
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children:
      segment.length > 0
        ? [
            {
              type: "text",
              version: 1,
              style: "",
              mode: "normal",
              format: 0,
              detail: 0,
              text: segment,
            },
          ]
        : [],
  }));

  return JSON.stringify({
    root: {
      type: "root",
      version: 1,
      format: "",
      indent: 0,
      direction: "ltr",
      children,
    },
  });
};

type LexicalJSON = Record<string, unknown>;

const collect = (node: unknown, acc: string[]): void => {
  if (!node || typeof node !== "object") return;

  const candidate = node as Record<string, unknown>;
  if (typeof candidate.text === "string") {
    acc.push(candidate.text);
    return;
  }

  const possibleChildren = [
    candidate.children,
    candidate.rows,
    candidate.cells,
    candidate.root,
  ];

  for (const child of possibleChildren) {
    if (Array.isArray(child)) {
      child.forEach((entry) => collect(entry, acc));
    } else if (child && typeof child === "object") {
      collect(child, acc);
    }
  }
};

export const lexicalStateToPlainText = (input: string | LexicalJSON | null | undefined): string => {
  if (!input) return "";

  let parsed: LexicalJSON | null = null;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input) as LexicalJSON;
    } catch {
      return input;
    }
  } else if (typeof input === "object") {
    parsed = input;
  }

  if (!parsed) return "";

  const pieces: string[] = [];
  collect(parsed.root ?? parsed, pieces);
  return pieces.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
};
