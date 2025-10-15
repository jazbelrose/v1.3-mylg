import React, {
  createContext,
  useState,
  useEffect,
  PropsWithChildren,
} from "react";
import { useAuth } from "./useAuth";
import { useProjects } from "./useProjects";
import {
  fetchPendingInvites,
  sendProjectInvite,
  acceptProjectInvite,
  declineProjectInvite,
  cancelProjectInvite,
} from "../../shared/utils/api";
import type { Invite, InvitesValue } from "./InvitesContextValue";

const InvitesContext = createContext<InvitesValue | undefined>(undefined);

export { InvitesContext };

export const InvitesProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { userId } = useAuth();
  const { fetchProjects } = useProjects();
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);

  useEffect(() => {
    if (!userId) {
      setPendingInvites([]);
      return;
    }
    const loadInvites = async () => {
      try {
        const items = await fetchPendingInvites(userId);
        setPendingInvites(Array.isArray(items) ? (items as Invite[]) : []);
      } catch (err) {
        console.error("Failed to fetch invites", err);
      }
    };
    loadInvites();
  }, [userId]);

  const handleSendInvite = async (projectId: string, recipientUsername: string) => {
    try {
      await sendProjectInvite(projectId, recipientUsername);
      if (userId) {
        const items = await fetchPendingInvites(userId);
        setPendingInvites(Array.isArray(items) ? (items as Invite[]) : []);
      }
    } catch (err) {
      console.error("Failed to send invite", err);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      await acceptProjectInvite(inviteId);
      setPendingInvites((prev) => prev.filter((inv) => inv.inviteId !== inviteId));
      await fetchProjects();
    } catch (err) {
      console.error("Failed to accept invite", err);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await declineProjectInvite(inviteId);
      setPendingInvites((prev) => prev.filter((inv) => inv.inviteId !== inviteId));
    } catch (err) {
      console.error("Failed to decline invite", err);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      await cancelProjectInvite(inviteId);
      setPendingInvites((prev) => prev.filter((inv) => inv.inviteId !== inviteId));
    } catch (err) {
      console.error("Failed to cancel invite", err);
    }
  };

  return (
    <InvitesContext.Provider
      value={{
        pendingInvites,
        handleSendInvite,
        handleAcceptInvite,
        handleDeclineInvite,
        handleCancelInvite,
        addPendingInvite: (invite: Invite) => {
          setPendingInvites((prev) =>
            prev.some((i) => i.inviteId === invite.inviteId) ? prev : [...prev, invite]
          );
        },
      }}
    >
      {children}
    </InvitesContext.Provider>
  );
};

export default InvitesProvider;









