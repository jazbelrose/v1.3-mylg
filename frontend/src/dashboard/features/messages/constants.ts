// Constants for the messages feature
export const FOLDER_KEY = "chat_uploads";

// Default emojis for quick reactions
export const DEFAULT_EMOJIS = ["😀", "😂", "👍", "❤️", "✅", "💯"];

// File upload settings
export const MAX_RETRY_ATTEMPTS = 5;
export const FILE_UPLOAD_DELAY = 2000; // 2 seconds

// Cache keys
export const getCacheKey = (convId: string): string => `messages_${convId}`;

// Common CSS properties
export const COMMON_FILE_STYLE = {
  display: "flex" as const,
  flexDirection: "column" as const,
  alignItems: "center" as const,
};

export const LIST_ITEM_STYLE = {
  fontSize: "14px",
  padding: "10px",
  cursor: "pointer",
  borderRadius: "5px",
  marginBottom: "1px",
  transition: "0.2s ease-in-out",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
} as const;








