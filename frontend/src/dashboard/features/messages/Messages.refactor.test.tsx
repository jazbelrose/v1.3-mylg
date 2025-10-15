import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi, describe, it, expect } from "vitest";

// Mock SVG imports to prevent data URL parsing errors
vi.mock("@/assets/svg/user.svg?react", () => ({
  default: () => React.createElement('svg', { 'data-testid': 'user-icon' })
}));

// Import the new components
import ConversationSidebar from "./components/ConversationSidebar";
import MessageInput from "./components/MessageInput";

// Mock dependencies
vi.mock("@/app/contexts/OnlineStatusContext", () => ({
  useOnlineStatus: () => ({
    onlineUsers: ["user2"],
    isOnline: (userId: string) => userId === "user2",
  }),
}));

describe("Refactored Messages Components", () => {
  it("ConversationSidebar renders correctly", () => {
    const mockProps = {
      dmConversations: [
        {
          id: "dm#user1___user2",
          userId: "user2",
          title: "Test User",
          profilePicture: null,
          lastMsgTs: "2023-01-01T00:00:00Z",
        },
      ],
      selectedConversation: null,
      threadMap: {},
      userData: { userId: "user1", firstName: "Current", lastName: "User" },
      isMobile: false,
      showConversation: false,
      onConversationOpen: vi.fn(),
    };

    render(<ConversationSidebar {...mockProps} />);
    expect(screen.getByText("# Direct Messages")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("MessageInput renders correctly", () => {
    const mockProps = {
      newMessage: "",
      showEmojiPicker: false,
      selectedConversation: "dm#user1___user2",
      onMessageChange: vi.fn(),
      onSendMessage: vi.fn(),
      onToggleEmojiPicker: vi.fn(),
      onEmojiSelect: vi.fn(),
      onMarkRead: vi.fn(),
    };

    render(<MessageInput {...mockProps} />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    expect(screen.getByText("Send it")).toBeInTheDocument();
  });
});








