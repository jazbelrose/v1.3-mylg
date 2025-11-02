// src/dashboard/projects/index.ts

// Pages
export { default as SingleProjectPage } from "./project";

// Components - using barrel exports from subdirectories
export * from "./components";

// Features
export { default as PreviewDrawer } from "./features/editor/components/PreviewDrawer";
export { default as MessageItem } from "../features/messages/MessageItem";
export { default as ProjectMessagesThread } from "../features/messages/ProjectMessagesThread";









