import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import { OnlineStatusProvider, useOnlineStatus } from "./OnlineStatusContext";

vi.mock("./useSocket", () => ({
  useSocket: vi.fn(),
}));

import { useSocket } from "./SocketContext";

// Minimal global WebSocket so that WebSocket.OPEN exists
// Note: Global WebSocket is already mocked in setup.ts

class MockWebSocket {
  listeners: Record<string, (e: Event) => void> = {};
  readyState = 1;
  send = vi.fn();

  addEventListener(event: string, cb: (e: Event) => void) {
    this.listeners[event] = cb;
  }

  removeEventListener(event: string) {
    delete this.listeners[event];
  }

  fireMessage(data: unknown) {
    this.listeners["message"]?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe("OnlineStatusContext", () => {
  let ws: MockWebSocket;
  let socketState: { isConnected: boolean };

  beforeEach(() => {
    ws = new MockWebSocket();
    socketState = { isConnected: true };
    (useSocket as ReturnType<typeof vi.fn>).mockImplementation(() => ({ ws, ...socketState }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("tracks online users from websocket messages", () => {
    const TestComponent = () => {
      const { onlineUsers, isOnline } = useOnlineStatus();
      return (
        <>
          <div data-testid="users">{onlineUsers.join(",")}</div>
          <div data-testid="u1">{String(isOnline("user1"))}</div>
          <div data-testid="u3">{String(isOnline("user3"))}</div>
        </>
      );
    };

    render(
      <OnlineStatusProvider>
        <TestComponent />
      </OnlineStatusProvider>
    );

    act(() => {
      ws.fireMessage({ action: "presenceSnapshot", userIds: ["user1", "user2"] });
    });

    expect(screen.getByTestId("users")).toHaveTextContent("user1,user2");
    expect(screen.getByTestId("u1")).toHaveTextContent("true");
    expect(screen.getByTestId("u3")).toHaveTextContent("false");

    act(() => {
      ws.fireMessage({ action: "presenceChanged", userId: "user1", online: false });
    });

    expect(screen.getByTestId("users")).toHaveTextContent("user2");
  });

  it("clears online users when disconnected", () => {
    const TestComponent = () => {
      const { onlineUsers } = useOnlineStatus();
      return <div data-testid="users">{onlineUsers.join(",")}</div>;
    };

    const { rerender } = render(
      <OnlineStatusProvider>
        <TestComponent />
      </OnlineStatusProvider>
    );

    act(() => {
      ws.fireMessage({ action: "presenceSnapshot", userIds: ["a"] });
    });

    expect(screen.getByTestId("users")).toHaveTextContent("a");

    socketState.isConnected = false;
    rerender(
      <OnlineStatusProvider>
        <TestComponent />
      </OnlineStatusProvider>
    );

    expect(screen.getByTestId("users")).toHaveTextContent("");
  });

  it("handles numeric user IDs", () => {
    const TestComponent = () => {
      const { isOnline } = useOnlineStatus();
      return (
        <>
          <div data-testid="0">{String(isOnline(0))}</div>
          <div data-testid="123">{String(isOnline(123))}</div>
        </>
      );
    };

    render(
      <OnlineStatusProvider>
        <TestComponent />
      </OnlineStatusProvider>
    );

    act(() => {
      ws.fireMessage({ action: "presenceSnapshot", userIds: [0, 123] });
    });

    expect(screen.getByTestId("0")).toHaveTextContent("true");
    expect(screen.getByTestId("123")).toHaveTextContent("true");
  });

  it("ignores malformed or unrelated WebSocket messages", () => {
    const TestComponent = () => {
      const { onlineUsers } = useOnlineStatus();
      return <div data-testid="users">{onlineUsers.join(",")}</div>;
    };

    render(
      <OnlineStatusProvider>
        <TestComponent />
      </OnlineStatusProvider>
    );

    act(() => {
      ws.fireMessage({ action: "presenceSnapshot", userIds: ["user1"] });
    });

    expect(screen.getByTestId("users")).toHaveTextContent("user1");

    // Malformed message - invalid JSON
    act(() => {
      ws.listeners["message"]?.({ data: "invalid json" } as MessageEvent);
    });

    expect(screen.getByTestId("users")).toHaveTextContent("user1");

    // Unrelated message
    act(() => {
      ws.fireMessage({ action: "unrelated", someField: "value" });
    });

    expect(screen.getByTestId("users")).toHaveTextContent("user1");
  });
});










