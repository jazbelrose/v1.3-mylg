import {
  $getRoot,
  $getSelection,
  $isNodeSelection,
  type LexicalNode,
} from "lexical";

type GroupableNodeLike = LexicalNode & {
  getGroupId?: () => string | null;
  setGroupId?: (groupId: string | null) => void;
};

export function getNodeGroupId(node: LexicalNode | null | undefined): string | null {
  if (!node) return null;
  const maybe = node as GroupableNodeLike;
  if (typeof maybe.getGroupId !== "function") return null;
  const value = maybe.getGroupId();
  return typeof value === "string" && value.trim() ? value : null;
}

export function setNodeGroupId(node: LexicalNode | null | undefined, groupId: string | null): void {
  if (!node) return;
  const maybe = node as GroupableNodeLike;
  if (typeof maybe.setGroupId !== "function") return;
  maybe.setGroupId(groupId);
}

function visitNodes(root: LexicalNode, visitor: (node: LexicalNode) => void): void {
  visitor(root);
  const maybeChildren = (root as unknown as { getChildren?: () => LexicalNode[] }).getChildren;
  if (typeof maybeChildren !== "function") return;
  for (const child of maybeChildren.call(root)) {
    visitNodes(child, visitor);
  }
}

export function collectGroupIndex(): {
  keyToGroupId: Map<string, string>;
  groupIdToKeys: Map<string, string[]>;
} {
  const keyToGroupId = new Map<string, string>();
  const groupIdToKeys = new Map<string, string[]>();

  visitNodes($getRoot(), (node) => {
    const groupId = getNodeGroupId(node);
    if (!groupId) return;
    const key = node.getKey();
    keyToGroupId.set(key, groupId);
    const list = groupIdToKeys.get(groupId);
    if (list) {
      list.push(key);
    } else {
      groupIdToKeys.set(groupId, [key]);
    }
  });

  return { keyToGroupId, groupIdToKeys };
}

export function expandKeysToGroups(
  keys: string[],
  index: ReturnType<typeof collectGroupIndex> = collectGroupIndex()
): string[] {
  const expanded = new Set<string>();
  for (const key of keys) {
    const groupId = index.keyToGroupId.get(key);
    if (groupId) {
      const members = index.groupIdToKeys.get(groupId);
      if (members) {
        members.forEach((k) => expanded.add(k));
        continue;
      }
    }
    expanded.add(key);
  }
  return Array.from(expanded);
}

export type GroupSelectionInfo = {
  groupId: string;
  memberKeys: string[];
};

export function getGroupSelectionInfo(): GroupSelectionInfo | null {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;

  const selectedKeys = selection.getNodes().map((n) => n.getKey());
  if (selectedKeys.length < 2) return null;

  const index = collectGroupIndex();
  const expandedSelected = expandKeysToGroups(selectedKeys, index);
  if (expandedSelected.length < 2) return null;

  const groupIds = new Set<string>();
  expandedSelected.forEach((key) => {
    const gid = index.keyToGroupId.get(key);
    if (gid) groupIds.add(gid);
  });
  if (groupIds.size !== 1) return null;

  const groupId = Array.from(groupIds)[0];
  const members = index.groupIdToKeys.get(groupId) ?? [];
  if (members.length < 2) return null;

  const selectedSet = new Set(expandedSelected);
  if (selectedSet.size !== members.length) return null;
  for (const key of members) {
    if (!selectedSet.has(key)) return null;
  }

  return { groupId, memberKeys: members };
}

export function createGroupId(): string {
  try {
    const cryptoObj = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
    const uuid = cryptoObj?.randomUUID?.();
    if (uuid) return uuid;
  } catch {
    // ignore
  }

  const rand = Math.random().toString(36).slice(2, 10);
  return `grp_${Date.now().toString(36)}_${rand}`;
}

