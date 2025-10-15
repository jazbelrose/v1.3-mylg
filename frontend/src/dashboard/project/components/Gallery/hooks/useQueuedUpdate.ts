import { useState } from "react";

import { enqueueProjectUpdate } from "@/shared/utils/requestQueue";

const useQueuedUpdate = (
  projectId?: string,
  updateProjectFields?: (id: string, payload: Record<string, unknown>) => Promise<void>
) => {
  const [saving, setSaving] = useState(false);

  const queueUpdate = async (payload: Record<string, unknown>) => {
    if (!projectId || !updateProjectFields) return;

    try {
      setSaving(true);
      await enqueueProjectUpdate(updateProjectFields, projectId, payload);
    } finally {
      setSaving(false);
    }
  };

  return { queueUpdate, saving };
};

export default useQueuedUpdate;
