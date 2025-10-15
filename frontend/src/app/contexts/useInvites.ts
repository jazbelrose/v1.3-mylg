import { useContext } from "react";
import { InvitesContext } from "./InvitesProvider";
import type { InvitesValue } from "./InvitesContextValue";

export const useInvites = (): InvitesValue => {
  const ctx = useContext(InvitesContext);
  if (!ctx) throw new Error("useInvites must be used within InvitesProvider");
  return ctx;
};









