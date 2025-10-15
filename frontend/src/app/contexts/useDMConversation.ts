import { useContext } from "react";
import { DMConversationContext } from "./DMConversationContextValue";

export const useDMConversation = () => {
  const context = useContext(DMConversationContext);
  if (!context) {
    throw new Error('useDMConversation must be used within DMConversationProvider');
  }
  return context;
};









