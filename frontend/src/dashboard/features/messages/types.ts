import { DMMessage, DMFile } from "@/shared/utils/messageUtils";

// Shared types for messages feature
export type ID = string;

export interface AppUser {
  userId: ID;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  thumbnail?: string;
  profilePicture?: string;
  photoUrl?: string;
  avatar?: string;
  avatarUrl?: string;
  image?: string;
  profileImage?: string;
  picture?: string;
  role?: string;
  collaborators?: ID[];
  messages?: DMMessage[];
  [key: string]: unknown;
}

export interface MessagesProps {
  initialUserSlug?: string | null;
}

export interface ConversationSidebarProps {
  dmConversations: {
    id: string;
    userId: string;
    title: string;
    profilePicture: string | null;
    lastMsgTs?: string;
  }[];
  selectedConversation: string | null;
  threadMap: Record<string, boolean>;
  userData: AppUser;
  isMobile: boolean;
  showConversation: boolean;
  onConversationOpen: (conversationId: string) => void;
}

export interface ChatWindowProps {
  selectedConversation: string | null;
  displayMessages: DMMessage[];
  chatTitle: string;
  chatIcon: React.ReactNode;
  newMessage: string;
  showEmojiPicker: boolean;
  isLoading: boolean;
  errorMessage: string;
  isDragging: boolean;
  isMobile: boolean;
  showConversation: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  userData: AppUser;
  allUsers: AppUser[];
  folderKey: string;
  onMessageChange: (message: string) => void;
  onSendMessage: () => void;
  onToggleEmojiPicker: () => void;
  onEmojiSelect: (emoji: string) => void;
  onMarkRead: (conversationId: string | null) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onBack: () => void;
  setIsDragging: (isDragging: boolean) => void;
}

export interface FilePreviewProps {
  file: DMFile;
  folderKey?: string;
}

export interface MessageInputProps {
  newMessage: string;
  showEmojiPicker: boolean;
  selectedConversation: string | null;
  onMessageChange: (message: string) => void;
  onSendMessage: () => void;
  onToggleEmojiPicker: () => void;
  onEmojiSelect: (emoji: string) => void;
  onMarkRead: (conversationId: string | null) => void;
}

export interface FileUploadProps {
  isDragging: boolean;
  selectedConversation: string | null;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  setIsDragging: (isDragging: boolean) => void;
  children: React.ReactNode;
}








