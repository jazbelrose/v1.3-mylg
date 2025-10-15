import { useContext } from "react";
import { SocketContext } from "./SocketProvider";
import type { SocketContextType } from "./SocketContextValue";

export const useSocket = (): SocketContextType => useContext(SocketContext);









