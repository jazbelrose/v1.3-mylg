interface Message {
  messageId?: string;
  optimisticId?: string;
  senderId?: string;
  text?: string;
  timestamp?: string;
  conversationId?: string;
  read?: boolean | string | number;
  reactions?: unknown;
  [key: string]: unknown;
}

export interface BaseMessage {
  messageId?: string;
  optimisticId?: string;
  senderId?: string;
  text?: string;
  timestamp?: string | number | Date;
  conversationId?: string;
  read?: boolean;
  reactions?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface DMMessage extends BaseMessage {
  conversationId: string;
  text: string;
  edited?: boolean;
  editedAt?: string;
  file?: DMFile;
  optimistic?: boolean;
  attachments?: Attachment[];
}

export interface Attachment {
  id?: string;
  fileName?: string;
  url?: string;
  key?: string;
  name?: string;
  type?: string;
  size?: number;
}

export interface ChatMessage extends BaseMessage {
  senderId: string;
  timestamp: string | number | Date;
  file?: ChatFile | null;
}

export interface ChatFile {
  fileName?: string;
  url: string;
  [key: string]: unknown;
}

export interface DMFile {
  fileName: string;
  url: string;
  finalUrl?: string | null;
  key: string;
  [key: string]: unknown;
}

export function isMessageUnread(msg: Message): boolean {
  const val = msg && Object.prototype.hasOwnProperty.call(msg, 'read') ? msg.read : undefined;
  return val === false || val === 'false' || val === undefined || val === 0 || val === '0';
}

// Determine if a message is unread based on last read timestamps for conversations
export function isMessageUnreadByStatus(
  msg: Message,
  readStatus: Record<string, string> = {}
): boolean {
  if (!msg || !msg.conversationId || !msg.timestamp) return false;
  const lastRead = readStatus[msg.conversationId];
  return !lastRead || new Date(msg.timestamp) > new Date(lastRead);
}

// Deduplicate an array of messages using a Map keyed by `messageId` when
// available, otherwise `optimisticId`. This is a simpler approach that avoids
// the nested searches and timestamp heuristics previously used.
export function dedupeById<T extends BaseMessage>(arr: T[] = []): T[] {
  if (!Array.isArray(arr)) return [];

  const map = new Map<string, T>();
  const unkeyed: T[] = [];

  for (const msg of arr) {
    const key = msg.messageId || msg.optimisticId;
    if (!key) {
      // message has no stable identifier; keep as-is
      unkeyed.push(msg);
      continue;
    }

    const existing = map.get(key);
    // Replace optimistic entry when a server version arrives
    if (!existing || (!existing.messageId && msg.messageId)) {
      map.set(key, msg);
    }
    
    // Special case: If this message has both messageId and optimisticId,
    // also check if there's an optimistic-only version to replace
    if (msg.messageId && msg.optimisticId) {
      const optimisticKey = msg.optimisticId;
      const optimisticExisting = map.get(optimisticKey);
      if (optimisticExisting && !optimisticExisting.messageId) {
        // Remove the optimistic version and use the server version
        map.delete(optimisticKey);
        map.set(key, msg);
      }
    }
  }

  // Preserve insertion order of keyed items and append unkeyed ones
  return Array.from(map.values()).concat(unkeyed);
}

// Merge previous and incoming messages, removing optimistic duplicates if the
// server copy is present. Dedupe by messageId and optimisticId.
export function mergeAndDedupeMessages<T extends BaseMessage>(prevMsgs: T[] = [], incomingMsgs: T[] = []): T[] {
  const combined = Array.isArray(prevMsgs) ? [...prevMsgs] : [];
  const adds = Array.isArray(incomingMsgs) ? incomingMsgs : [];

  for (const msg of adds) {
    combined.push(msg);
  }

  return dedupeById(combined);
}









