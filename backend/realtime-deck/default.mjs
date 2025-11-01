import { parseBody } from "./deckHandlers.mjs";

export const handler = async (event) => {
  const payload = parseBody(event.body);
  const action = payload?.action;

  console.warn("Unknown deck action", action);
  return { statusCode: 400, body: "Unknown action" };
};
