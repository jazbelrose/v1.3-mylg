import cfg from "./amplifyconfiguration.json";

// Pass through the generated Amplify configuration as-is. The JSON already
// contains the modern Amplify v6 shape under Auth/Storage and any legacy keys
// are safely ignored by Amplify.
export default cfg as unknown as Record<string, unknown>;









