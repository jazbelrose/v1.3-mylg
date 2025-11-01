import { respond } from "./shared.mjs";

export const handler = async () =>
  respond(200, {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
