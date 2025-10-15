import { useUser } from "./useUser";
import { useProjects } from "./useProjects";
import { useMessages } from "./useMessages";
import type { UserContextValue } from "./UserContextValue";
import type { ProjectsValue } from "./ProjectsContextValue";
import type { MessagesValue } from "./MessagesContextValue";

type DataValue = UserContextValue & ProjectsValue & MessagesValue;

export const useData = (): DataValue => ({
  ...useUser(),
  ...useProjects(),
  ...useMessages(),
});









