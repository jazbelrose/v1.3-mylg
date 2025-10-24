// src/app/contexts/DataProvider.tsx
import React, { PropsWithChildren } from "react";
import { UserProvider } from "./UserProvider";
import { ProjectsProvider } from "./ProjectsProvider";
import { MessagesProvider } from "./MessagesProvider";

// Export the types and data models from here for backward compatibility
export type Role = "admin" | "designer" | "builder" | "vendor" | "client" | string;

export interface UserLite {
  userId: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: Role;
  occupation?: string;
  messages?: Message[];
  pending?: boolean;
  thumbnail?: string;
  thumbnailUrl?: string;
  phoneNumber?: string;
  company?: string;
  organizationAddress?: string;
  collaborators?: string[];
  projects?: string[];
  [key: string]: unknown; // Add index signature for flexibility
}

export interface TeamMember {
  userId: string;
  role?: Role;
  [k: string]: unknown;
}

export interface TimelineEvent {
  id?: string;
  title?: string;
  date?: string;        // ISO string
  timestamp?: string;   // ISO string
  [k: string]: unknown;
}

export interface QuickLink {
  id?: string;
  title?: string;
  url?: string;
  [k: string]: unknown;
}

export interface Project {
  projectId: string;
  title?: string;
  status?: string;
  team?: TeamMember[];
  timelineEvents?: TimelineEvent[];
  thumbnails?: string[];
  description?: string;
  color?: string;
  finishline?: string;
  productionStart?: string;
  dateCreated?: string;
  invoiceBrandName?: string;
  invoiceBrandAddress?: string;
  invoiceBrandPhone?: string;
  clientName?: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  previewUrl?: string;
  quickLinks?: QuickLink[];
  [k: string]: unknown;
}

export interface Message {
  messageId?: string;
  optimisticId?: string;
  text?: string;
  body?: string;
  content?: string;
  timestamp?: string;      // ISO
  reactions?: Record<string, string[]>; // emoji -> userIds
  [k: string]: unknown;
}

export interface Thread {
  conversationId: string;
  otherUserId: string;
  lastMsgTs: string; // ISO string
  snippet?: string;
  read?: boolean;
}

// ---------- Provider ----------
export const DataProvider: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <UserProvider>
      <ProjectsProvider>
        <MessagesProvider>
          {children}
        </MessagesProvider>
      </ProjectsProvider>
    </UserProvider>
  );
};

export default DataProvider;









