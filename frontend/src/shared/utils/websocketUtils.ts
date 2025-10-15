interface MessageObject {
  action?: string;
  [key: string]: unknown;
}

export function normalizeMessage(
  message: Record<string, unknown> | null = {},
  defaultAction = 'unknown'
): MessageObject {
  if (!message || typeof message !== 'object') {
    return { action: defaultAction };
  }
  if (!Object.prototype.hasOwnProperty.call(message, 'action')) {
    return { ...message, action: defaultAction } as MessageObject;
  }
  return message as MessageObject;
}

/**
 * Normalizes a DM conversation ID by sorting the user IDs
 * @param conversationId - The conversation ID to normalize (e.g., "dm#user2___user1")
 * @returns The normalized conversation ID (e.g., "dm#user1___user2")
 */
export function normalizeDMConversationId(conversationId: string): string {
  if (!conversationId.startsWith('dm#')) {
    return conversationId;
  }
  
  const userIds = conversationId.replace('dm#', '').split('___');
  if (userIds.length !== 2) {
    return conversationId;
  }
  
  const sortedIds = userIds.sort();
  return `dm#${sortedIds.join('___')}`;
}








