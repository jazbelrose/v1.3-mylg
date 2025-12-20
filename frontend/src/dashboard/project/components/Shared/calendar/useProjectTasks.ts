import { useEffect, useState } from "react";
import { fetchTasks, type Task } from "@/shared/utils/api";

export function useProjectTasks(projectId?: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      return;
    }

    let cancelled = false;

    void fetchTasks(projectId)
      .then((result) => {
        if (cancelled) return;
        setTasks(Array.isArray(result) ? result : []);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load project tasks", error);
        setTasks([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return tasks;
}
