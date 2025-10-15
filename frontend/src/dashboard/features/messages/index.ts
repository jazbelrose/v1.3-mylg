// Export all components and utilities from the messages feature
export { default as Messages } from "./Messages";
export { default as ProjectMessagesThread } from "./ProjectMessagesThread";
export { default as MessageItem } from "./MessageItem";
export { default as ConversationSidebar } from './components/ConversationSidebar';
export { default as ChatWindow } from './components/ChatWindow';
export { default as MessageInput } from './components/MessageInput';
export { default as FileUpload } from './components/FileUpload';

// Export types
export type {
  MessagesProps,
  AppUser,
  ConversationSidebarProps,
  ChatWindowProps,
  MessageInputProps,
  FileUploadProps,
} from './types';

// Export utilities
export { renderFilePreview, getThumbnailUrl } from './utils/filePreview';
export { getUserDisplayName, getUserThumbnail } from './utils/userHelpers';

// Export constants
export {
  FOLDER_KEY,
  DEFAULT_EMOJIS,
  MAX_RETRY_ATTEMPTS,
  FILE_UPLOAD_DELAY,
  getCacheKey,
  COMMON_FILE_STYLE,
  LIST_ITEM_STYLE,
} from './constants';

// Add a default export
export { default } from "./Messages";









