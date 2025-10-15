import { syncCursorPositions, type SyncCursorPositionsFn } from "@lexical/yjs";

/**
 * Extends the default Lexical Yjs cursor syncing to prepend avatar images
 * (when provided via awarenessData.avatar) to each remote collaborator's
 * cursor label.
 */
export const syncCursorPositionsWithAvatars: SyncCursorPositionsFn = (
  binding,
  provider,
  options
) => {
  // Run the default cursor sync behaviour
  syncCursorPositions(binding, provider, options);

  const localClientID = binding.clientID;
  const awarenessStates = Array.from(provider.awareness.getStates());

  for (const [clientID, awareness] of awarenessStates) {
    if (clientID === localClientID) continue;
    const cursor = binding.cursors.get(clientID);
    const avatarUrl = (
      (awareness?.awarenessData as { avatar?: string } | undefined)?.avatar
    );
    const name = (awareness as { name?: string })?.name || "";

    if (cursor?.selection) {
      const caret = cursor.selection.caret;
      const label = caret.firstChild as HTMLElement | null;
      if (label) {
        // Ensure label uses flex so image and text sit nicely
        label.style.display = "flex";
        label.style.alignItems = "center";

        // Clear current contents
        while (label.firstChild) {
          label.removeChild(label.firstChild);
        }

        if (avatarUrl) {
          const img = document.createElement("img");
          img.src = avatarUrl;
          img.alt = name || "avatar";
          img.style.cssText =
            "width:16px;height:16px;border-radius:50%;object-fit:cover;margin-right:4px;";
          label.appendChild(img);
        }

        label.appendChild(document.createTextNode(name));
      }
    }
      }
};

export default syncCursorPositionsWithAvatars;








