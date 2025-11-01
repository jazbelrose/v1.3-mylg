import { handleDeckPatch, parseBody } from "./deckHandlers.mjs";

const SUPPORTED_ACTIONS = new Set(["deckPatch", "deckSave"]);

export const handler = async (event) => {
  const payload = parseBody(event.body);
  const action = payload?.action;

  if (!SUPPORTED_ACTIONS.has(action)) {
    console.warn("deckPatch handler received unsupported action", action);
    return { statusCode: 400, body: "Unsupported deck action" };
  }

  try {
    return await handleDeckPatch(event, payload);
  } catch (error) {
    console.error("Deck patch handler failed", error);
    return { statusCode: 500, body: "Deck patch handler error" };
  }
};
