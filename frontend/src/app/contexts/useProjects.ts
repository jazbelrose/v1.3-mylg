import { useContext } from "react";
import { ProjectsContext } from "./ProjectsContext";
import type { ProjectsValue } from "./ProjectsContextValue";

export const useProjects = (): ProjectsValue => {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within DataProvider");
  return ctx;
};









