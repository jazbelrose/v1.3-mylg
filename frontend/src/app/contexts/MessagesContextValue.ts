import type { Thread, Message } from "./DataProvider";

export type ProjectMessagesMap = Record<string, Message[]>;

export interface MessagesValue {
  inbox: Thread[];
  setInbox: React.Dispatch<React.SetStateAction<Thread[]>>;
  projectMessages: ProjectMessagesMap;
  setProjectMessages: React.Dispatch<React.SetStateAction<ProjectMessagesMap>>;
  deletedMessageIds: Set<string>;
  markMessageDeleted: (id?: string) => void;
  clearDeletedMessageId: (id?: string) => void;
  toggleReaction: (
    msgId: string,
    emoji: string,
    reactorId: string,
    conversationId: string,
    conversationType: "dm" | "project",
    ws?: WebSocket
  ) => void;
}









