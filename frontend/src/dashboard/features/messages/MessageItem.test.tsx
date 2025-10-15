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

    await userEvent.click(screen.getByLabelText("Edit message"));
    expect(onEditRequest).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "m1" })
    );
  });

  it("hides author actions for other users", () => {
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

    expect(screen.queryByLabelText("Edit message")).toBeNull();
    expect(screen.queryByLabelText("Delete message")).toBeNull();
  });
});









