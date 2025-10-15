import { createContext, Dispatch, SetStateAction } from 'react';

export interface DMConversationContextValue {
  activeDmConversationId: string | null;
  setActiveDmConversationId: Dispatch<SetStateAction<string | null>>;
}

export const DMConversationContext = createContext<DMConversationContextValue | undefined>(undefined);









