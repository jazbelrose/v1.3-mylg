export interface Invite {
  inviteId: string;
  projectId: string;
  recipientUsername: string;
  [k: string]: unknown;
}

export interface InvitesValue {
  pendingInvites: Invite[];
  handleSendInvite: (projectId: string, recipientUsername: string) => Promise<void>;
  handleAcceptInvite: (inviteId: string) => Promise<void>;
  handleDeclineInvite: (inviteId: string) => Promise<void>;
  handleCancelInvite: (inviteId: string) => Promise<void>;
  addPendingInvite: (invite: Invite) => void;
}









