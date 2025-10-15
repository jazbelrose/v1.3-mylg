import React, { useState, ReactNode } from 'react';
import { DMConversationContext } from './DMConversationContextValue';

interface ProviderProps {
  children: ReactNode;
}

export const DMConversationProvider: React.FC<ProviderProps> = ({ children }) => {
  const [activeDmConversationId, setActiveDmConversationId] = useState<string | null>(null);

  return (
    <DMConversationContext.Provider value={{ activeDmConversationId, setActiveDmConversationId }}>
      {children}
    </DMConversationContext.Provider>
  );
};









