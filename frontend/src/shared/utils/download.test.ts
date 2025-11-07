import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadViaAnchor } from './download';

// Mock document and URL
const mockCreateElement = vi.fn();
const mockClick = vi.fn();
const mockRemove = vi.fn();
const mockAppendChild = vi.fn();

const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();

const mockFetch = vi.fn();

beforeEach(() => {
  // Mock document
  Object.defineProperty(document, 'createElement', {
    writable: true,
    value: mockCreateElement,
  });
  Object.defineProperty(document.body, 'appendChild', {
    writable: true,
    value: mockAppendChild,
  });

  // Mock URL
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: mockCreateObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    value: mockRevokeObjectURL,
  });

  // Mock fetch
  global.fetch = mockFetch;

  // Mock setTimeout
  vi.useFakeTimers();

  // Reset mocks
  mockCreateElement.mockReset();
  mockClick.mockReset();
  mockRemove.mockReset();
  mockAppendChild.mockReset();
  mockCreateObjectURL.mockReset();
  mockRevokeObjectURL.mockReset();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('downloadViaAnchor', () => {
  it('should create anchor and trigger download for same-origin URLs', async () => {
    const mockAnchor = {
      href: '',
      download: '',
      rel: '',
      target: '',
      click: mockClick,
      remove: mockRemove,
    };
    mockCreateElement.mockReturnValue(mockAnchor);

    // Mock same origin
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://example.com' },
      writable: true,
    });

    await downloadViaAnchor('https://example.com/file.pdf', 'test.pdf');

    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockAnchor.href).toBe('https://example.com/file.pdf');
    expect(mockAnchor.download).toBe('test.pdf');
  expect(mockAnchor.rel).toBe('noopener');
  // target should not be set to '_blank' to avoid opening a new tab
  expect(mockAnchor.target).toBeFalsy();
    expect(mockAppendChild).toHaveBeenCalledWith(mockAnchor);
    expect(mockClick).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalled();
  });

  it('should fall back to blob download for cross-origin URLs', async () => {
    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
      remove: mockRemove,
    };

    mockCreateElement.mockReturnValue(mockAnchor);

    // Mock cross-origin
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://different.com' },
      writable: true,
    });

    const mockBlob = new Blob(['test']);
    const mockResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    };
    mockFetch.mockResolvedValue(mockResponse);
    mockCreateObjectURL.mockReturnValue('blob:test');

    await downloadViaAnchor('https://example.com/file.pdf', 'test.pdf');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/file.pdf', { credentials: 'omit', mode: 'cors' });
    expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(mockAnchor.href).toBe('blob:test');
    expect(mockAnchor.download).toBe('test.pdf');
    expect(mockClick).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalled();

    // Advance timers to check revoke
    vi.advanceTimersByTime(1000);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('should extract filename from URL if not provided', async () => {
    const mockAnchor = {
      href: '',
      download: '',
      rel: '',
      target: '',
      click: mockClick,
      remove: mockRemove,
    };
    mockCreateElement.mockReturnValue(mockAnchor);

    Object.defineProperty(window, 'location', {
      value: { origin: 'https://example.com' },
      writable: true,
    });

    await downloadViaAnchor('https://example.com/my%20file.pdf');

    expect(mockAnchor.download).toBe('my file.pdf');
  });

  it('should throw error on fetch failure', async () => {
    const mockAnchor = {
      href: '',
      download: '',
      rel: '',
      target: '',
      click: mockClick,
      remove: mockRemove,
    };
    mockCreateElement.mockReturnValue(mockAnchor);

    // Mock cross-origin to trigger fetch
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://different.com' },
      writable: true,
    });

    const mockResponse = {
      ok: false,
      status: 404,
    };
    mockFetch.mockResolvedValue(mockResponse);

    await expect(downloadViaAnchor('https://example.com/file.pdf')).rejects.toThrow('Failed to fetch file: 404');
  });

  it('should force blob download when opts.forceBlob is true', async () => {
    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
      remove: mockRemove,
    };
    mockCreateElement.mockReturnValue(mockAnchor);

    const mockBlob = new Blob(['test']);
    const mockResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    };
    mockFetch.mockResolvedValue(mockResponse);
    mockCreateObjectURL.mockReturnValue('blob:test');

    await downloadViaAnchor('https://example.com/file.pdf', 'test.pdf', { forceBlob: true });

  expect(mockFetch).toHaveBeenCalledWith('https://example.com/file.pdf', { credentials: 'omit', mode: 'cors' });
    expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
  });
});