import { removeConnection, respond } from "./shared.mjs";

export const handler = async event => {
  try {
    const connectionId = event?.requestContext?.connectionId;
    if (connectionId) {
      await removeConnection(connectionId);
    }
    return respond(200, { message: "disconnected" });
  } catch (err) {
    console.error("Failed to handle $disconnect", err);
    return respond(500, { message: "Disconnect failed" });
  }
};
