import React from "react";
import { render, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ---- Mock contexts BEFORE imports ----
vi.mock("./useAuth", () => ({
  useAuth: vi.fn(),
}));
vi.mock("./useData", () => ({
  useData: vi.fn(),
}));
vi.mock("./useDMConversation", () => ({
  useDMConversation: vi.fn(),
}));

// ---- Types ----
interface MockWebSocket {
  onmessage?: ((event: { data: string }) => void) | null;
  onopen?: (() => void) | null;
  onclose?: (() => void) | null;
  onerror?: ((error: Event) => void) | null;
  readyState: number;
  send(): void;
  close(): void;
}

declare global {
  var mockWebSocket: MockWebSocket;
}

// Mock the WebSocket connection creation BEFORE imports
vi.mock("@/shared/utils/secureWebSocketAuth", () => {
  // Create the mock WebSocket inside the mock factory
  const mockWebSocket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
  };

  return {
    createSecureWebSocketConnection: vi.fn().mockResolvedValue(mockWebSocket),
  };
});

// ---- NOW import the mocked modules ----
import { SocketProvider } from "./SocketContext";
import "@testing-library/jest-dom";
import { useAuth } from "./useAuth";
import { useData } from "./useData";
import { useDMConversation } from "./useDMConversation";
import { createSecureWebSocketConnection } from "@/shared/utils/secureWebSocketAuth";

describe("SocketContext collaborator updates", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    console.log('globalThis.mockWebSocket exists:', !!globalThis.mockWebSocket);

    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      getAuthTokens: vi.fn().mockResolvedValue({ idToken: "token" }),
    });

    (useDMConversation as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDmConversationId: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  it.skip("debounces refreshUsers and fetchUserProfile calls", async () => {
    const refreshUsers = vi.fn();
    const fetchUserProfile = vi.fn();

    (useData as ReturnType<typeof vi.fn>).mockReturnValue({
      setUserData: vi.fn(),
      setInbox: vi.fn(),
      userId: "u1",
      setProjects: vi.fn(),
      setUserProjects: vi.fn(),
      setActiveProject: vi.fn(),
      updateProjectFields: vi.fn(),
      setProjectMessages: vi.fn(),
      deletedMessageIds: new Set<string>(),
      markMessageDeleted: vi.fn(),
      activeProject: null,
      fetchProjects: vi.fn(),
      fetchUserProfile,
      refreshUsers,
    });

    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      getAuthTokens: vi.fn().mockResolvedValue({ idToken: "token" }),
    });

    render(
      <SocketProvider>
        <div />
      </SocketProvider>
    );

    // Wait for component to mount
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Get the mock WebSocket from the mocked function
    const mockWebSocket = (createSecureWebSocketConnection as ReturnType<typeof vi.fn>).mock.results[0]?.value;

    // Simulate WebSocket connection established
    act(() => {
      mockWebSocket.readyState = 1; // OPEN
      if (mockWebSocket.onopen) mockWebSocket.onopen();
    });

    // Wait for connection setup
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Send first collaborator update message
    act(() => {
      mockWebSocket.onmessage?.({ data: JSON.stringify({ type: "collaborators-updated" }) });
    });

    // Send second message immediately (should be debounced)
    act(() => {
      mockWebSocket.onmessage?.({ data: JSON.stringify({ type: "collaborators-updated" }) });
    });

    // Advance timers by 1000ms to trigger the debounced call
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Wait for the debounced function to execute
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(refreshUsers).toHaveBeenCalledTimes(1);
    expect(fetchUserProfile).toHaveBeenCalledTimes(1);

    // Send another message after the debounce period
    act(() => {
      mockWebSocket.onmessage?.({ data: JSON.stringify({ type: "collaborators-updated" }) });
    });

    // Advance timers again
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Wait for the second debounced function to execute
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(refreshUsers).toHaveBeenCalledTimes(2);
    expect(fetchUserProfile).toHaveBeenCalledTimes(2);
  }, 10000);
});









