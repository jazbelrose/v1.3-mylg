import { useCallback } from "react";
import { EDIT_PROJECT_URL, apiFetch } from "../../../../../shared/utils/api";
import { normalizeMessage } from "../../../../../shared/utils/websocketUtils";
import type { Message } from "../../../../../app/contexts/DataProvider";
import type { Project } from "../../FileManager/FileManagerTypes";

interface UseFileMessengerParams {
  activeProject: Project;
  localActiveProject: Project;
  setLocalActiveProject: React.Dispatch<React.SetStateAction<Project>>;
  setProjectMessages: (updater: (prev: Record<string, Message[]>) => Record<string, Message[]>) => void;
  user: { userId?: string };
  ws?: WebSocket;
}

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const useFileMessenger = ({
  activeProject,
  localActiveProject,
  setLocalActiveProject,
  setProjectMessages,
  user,
  ws,
}: UseFileMessengerParams) => {
  const removeReferences = useCallback(
    async (urls: string[], messagesList: Message[]) => {
      let description: string = (localActiveProject.description as string) || "";
      let descChanged = false;

      for (const url of urls) {
        const regex = new RegExp(`<img[^>]*src=["']${escapeRegExp(url)}["'][^>]*>`, "g");
        if (regex.test(description)) {
          description = description.replace(regex, "");
          descChanged = true;
        }

        const referencing = messagesList.filter(
          (m) => (m.text && m.text.includes(url)) || ((m.file as { url?: string })?.url && (m.file as { url?: string }).url.includes(url))
        );

        for (const msg of referencing) {
          if (msg.messageId) {
            try {
              if (ws && ws.readyState === WebSocket.OPEN) {
                const editPayload = {
                  action: "editMessage",
                  conversationType: "project",
                  conversationId: `project#${activeProject.projectId}`,
                  projectId: activeProject.projectId,
                  messageId: msg.messageId,
                  text: "File deleted.",
                  timestamp: msg.timestamp,
                  editedAt: new Date().toISOString(),
                  editedBy: user.userId,
                };
                ws.send(JSON.stringify(normalizeMessage(editPayload, "editMessage")));
              }

              msg.text = "File deleted.";
              delete msg.file;

              setProjectMessages((prev: Record<string, Message[]>) => {
                const projectId = activeProject.projectId as string;
                const msgs = Array.isArray(prev[projectId]) ? prev[projectId] : [];
                return {
                  ...prev,
                  [projectId]: msgs.map((m) =>
                    m.messageId === msg.messageId ? { ...m, text: "File deleted.", file: undefined } : m
                  ),
                };
              });
            } catch (err) {
              console.error("Failed to strip file from message", err);
            }
          }
        }
      }

      if (descChanged) {
        try {
          await apiFetch(`${EDIT_PROJECT_URL}/${activeProject.projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description }),
          });
          setLocalActiveProject((prev: Project) => ({ ...prev, description }));
        } catch (err) {
          console.error("Failed to update description", err);
        }
      }
    },
    [activeProject, localActiveProject.description, setLocalActiveProject, setProjectMessages, user.userId, ws]
  );

  return { removeReferences };
};

export type UseFileMessengerReturn = ReturnType<typeof useFileMessenger>;









