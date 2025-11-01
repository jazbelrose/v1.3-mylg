import { handleJoinDeck, parseBody } from "./deckHandlers.mjs";

export const handler = async (event) => {
  const payload = parseBody(event.body);

  try {
    return await handleJoinDeck(event, payload);
  } catch (error) {
    console.error("Deck join handler failed", error);
    return { statusCode: 500, body: "Deck join handler error" };
  }
};
