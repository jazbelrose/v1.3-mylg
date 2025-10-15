// -------------- Tame react-modal so portals/props don't spam warnings --------------
import * as React from 'react';
vi.mock('react-modal', () => {
  const Modal = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'modal' }, children);
  Modal.setAppElement = vi.fn();
  return { default: Modal };
});

// -------------- Mock ModalWithStack --------------
vi.mock('../shared/ui/ModalWithStack', () => {
  const MockModal = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'modal-with-stack' }, children);
  MockModal.setAppElement = vi.fn();
  return { default: MockModal };
});

// -------------- Mock SVG imports to prevent data URL parsing errors --------------
vi.mock('*.svg?react', () => ({
  default: () => React.createElement('svg', { 'data-testid': 'svg-icon' })
}));

vi.mock('*.svg', () => ({
  default: 'mocked-svg-url'
}));

// -------------- Clean up between tests --------------rs (fixes toBeInTheDocument etc.) --------------
import '@testing-library/jest-dom/vitest';

// -------------- Kill real WebSocket dials --------------
import { vi, afterEach } from 'vitest';

class MockWebSocket {
  static OPEN = 1; static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen?: (e?: Event) => void;
  onclose?: (e?: Event) => void;
  onmessage?: (e?: MessageEvent) => void;
  onerror?: (e?: Event) => void;
  constructor() { queueMicrotask(() => this.onopen?.(new Event('open'))); }
  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() { this.readyState = MockWebSocket.CLOSED; this.onclose?.(new Event('close')); }
}

// Create a global mockWebSocket instance for tests to access
const mockWebSocket = new MockWebSocket();
(globalThis as typeof globalThis & { mockWebSocket: MockWebSocket }).mockWebSocket = mockWebSocket;

vi.stubGlobal('WebSocket', MockWebSocket);

// -------------- Default: no real fetch unless a test mocks it --------------
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.reject(new Error('Network call not mocked (use vi.spyOn(global, "fetch")...)'))
) as unknown as typeof fetch);

// -------------- Tame react-modal so portals/props don't spam warnings --------------
vi.mock('react-modal', () => {
  const Modal = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'modal' }, children);
  return { default: Modal };
});

// -------------- Mock SVG imports to prevent data URL parsing errors --------------
vi.mock('*.svg?react', () => ({
  default: () => React.createElement('svg', { 'data-testid': 'svg-icon' })
}));

vi.mock('*.svg', () => ({
  default: 'mocked-svg-url'
}));

// -------------- Clean up between tests --------------

// -------------- Clean up between tests --------------
afterEach(() => {
  vi.clearAllTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  // Reset WebSocket mock state
  mockWebSocket.onmessage = undefined;
  mockWebSocket.onopen = undefined;
  mockWebSocket.onclose = undefined;
  mockWebSocket.onerror = undefined;
  mockWebSocket.readyState = MockWebSocket.OPEN;
});









