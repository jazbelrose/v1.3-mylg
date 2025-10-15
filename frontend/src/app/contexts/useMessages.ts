import { useContext } from "react";
import { MessagesContext } from "./MessagesContext";
import type { MessagesValue } from "./MessagesContextValue";

export const useMessages = (): MessagesValue => {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error("useMessages must be used within DataProvider");
  return ctx;
};









