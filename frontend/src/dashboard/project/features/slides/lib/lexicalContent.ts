type LexicalNode = {
  type?: string;
  text?: string;
  children?: LexicalNode[];
  [key: string]: unknown;
};

function nodeHasMeaningfulContent(node: LexicalNode | null | undefined): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  const type = typeof node.type === 'string' ? node.type : '';
  if (type === 'text') {
    return typeof node.text === 'string' && node.text.trim().length > 0;
  }

  const children = Array.isArray(node.children) ? node.children : null;
  if (children && children.some(nodeHasMeaningfulContent)) {
    return true;
  }

  // Treat any non-trivial node type as meaningful (images, shapes, etc.)
  // while ignoring structural containers.
  if (type && type !== 'root' && type !== 'paragraph') {
    return true;
  }

  return false;
}

export function isLexicalContentEffectivelyEmpty(content?: string | null): boolean {
  if (typeof content !== 'string' || content.trim().length === 0) {
    return true;
  }

  try {
    const parsed = JSON.parse(content) as { root?: LexicalNode } | null;
    return !nodeHasMeaningfulContent(parsed?.root);
  } catch {
    // If we can't parse, don't assume it's empty (avoid skipping thumbnails incorrectly).
    return false;
  }
}

