// src/app/contexts/DataProvider.tsx
import React, { PropsWithChildren } from "react";
import { UserProvider } from "./UserProvider";
import { OrgProvider } from "./OrgProvider";
import { ProjectsProvider } from "./ProjectsProvider";
import { MessagesProvider } from "./MessagesProvider";
import type { SavedLocation } from "../../shared/utils/location";

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
  collaborators?: string[];
  projects?: string[];
  defaultTaskLocation?: SavedLocation | null;
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

export type DeckVersionStatus = 'draft' | 'approved' | 'archived';

export interface DeckVersion {
  versionId: string;
  projectId: string;
  name: string;
  status: DeckVersionStatus;
  isDefault: boolean;
  isClientDefault: boolean;
  allowedRoles: Role[];
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  slides: Slide[];
  [k: string]: unknown;
}

export interface Slide {
  id: string;
  title?: string;
  thumbnail?: string;
  revision?: number;
  thumbRevision?: number;
  order?: number;
  content?: string; // Lexical JSON
  notes?: string; // Speaker notes (plain text or Lexical JSON)
  backgroundColor?: string; // Slide background color
  backgroundImage?: string; // S3 key or URL for slide background image
  [k: string]: unknown;
}

export interface Project {
  projectId: string;
  title?: string;
  status?: string;
  pinned?: boolean;
  team?: TeamMember[];
  timelineEvents?: TimelineEvent[];
  thumbnails?: string[];
  description?: string;
  color?: string;
  finishline?: string;
  productionStart?: string;
  dateCreated?: string;
  /** Project address (human-readable location string) */
  address?: string;
  /** Project geographic location */
  location?: { lat: number; lng: number };
  invoiceBrandName?: string;
  invoiceBrandAddress?: string;
  invoiceBrandPhone?: string;
  clientName?: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  previewUrl?: string;
  quickLinks?: QuickLink[];
  slides?: Slide[];
  // Deck versions support
  activeDeckVersionId?: string;
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
      <OrgProvider>
        <ProjectsProvider>
          <MessagesProvider>
            {children}
          </MessagesProvider>
        </ProjectsProvider>
      </OrgProvider>
    </UserProvider>
  );
};

export default DataProvider;









