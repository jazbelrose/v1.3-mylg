import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { vi, describe, it, expect } from "vitest";

// Mock SVG imports to prevent data URL parsing errors
vi.mock("@/assets/svg/user.svg?react", () => ({
  default: () => React.createElement('svg', { 'data-testid': 'user-icon' })
}));

// Import component under test
import MessageItem from "./MessageItem";
import { OnlineStatusProvider } from "../../../app/contexts/OnlineStatusContext";

// Mock the useSocket hook
vi.mock("../../../app/contexts/useSocket", () => ({
  useSocket: () => ({
    ws: null,
    isConnected: false,
  }),
}));

describe("MessageItem edit", () => {
  it("shows author controls and triggers edit callback", async () => {
    const onEditRequest = vi.fn();

    render(
      <OnlineStatusProvider>
        <MessageItem
          msg={{
            senderId: "u1",
            messageId: "m1",
            text: "hello",
            timestamp: "t1",
          }}
          prevMsg={null}
          userData={{ userId: "u1" }}
          allUsers={[]}
          openPreviewModal={() => {}}
          folderKey=""
          renderFilePreview={() => null}
          getFileNameFromUrl={() => ""}
          onEditRequest={onEditRequest}
        />
      </OnlineStatusProvider>
    );

    await userEvent.click(screen.getByLabelText("Message actions"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onEditRequest).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "m1" })
    );
  });

  it("hides author actions for other users", async () => {
    render(
      <OnlineStatusProvider>
        <MessageItem
          msg={{
            senderId: "u1",
            messageId: "m2",
            text: "hello",
            timestamp: "t2",
          }}
          prevMsg={null}
          userData={{ userId: "u2" }}
          allUsers={[]}
          openPreviewModal={() => {}}
          folderKey=""
          renderFilePreview={() => null}
          getFileNameFromUrl={() => ""}
        />
      </OnlineStatusProvider>
    );

    await userEvent.click(screen.getByLabelText("Message actions"));
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  });

  it("treats long text as a collapsible long message", async () => {
    const longText = Array.from({ length: 120 }).map(() => "This is a line of text.").join("\n");

    render(
      <OnlineStatusProvider>
        <MessageItem
          msg={{
            senderId: "u1",
            messageId: "m_long",
            text: longText,
            timestamp: "t_long",
          }}
          prevMsg={null}
          userData={{ userId: "u2" }}
          allUsers={[]}
          openPreviewModal={() => {}}
          folderKey=""
          renderFilePreview={() => null}
          getFileNameFromUrl={() => ""}
        />
      </OnlineStatusProvider>
    );

    const readMore = screen.getByRole("button", { name: "Read more" });
    expect(readMore).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(readMore);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows a dedicated reader for massive messages", async () => {
    const massiveText = "a".repeat(5000);

    render(
      <OnlineStatusProvider>
        <MessageItem
          msg={{
            senderId: "u1",
            messageId: "m_massive",
            text: massiveText,
            timestamp: "t_massive",
          }}
          prevMsg={null}
          userData={{ userId: "u2" }}
          allUsers={[]}
          openPreviewModal={() => {}}
          folderKey=""
          renderFilePreview={() => null}
          getFileNameFromUrl={() => ""}
        />
      </OnlineStatusProvider>
    );

    await userEvent.click(screen.getByLabelText("Open in reader"));
    expect(screen.getByRole("button", { name: "Copy all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jump to message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});









