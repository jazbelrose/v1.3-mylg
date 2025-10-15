import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock ReactModal
vi.mock('react-modal', () => {
  const Modal = ({ children }: { children?: React.ReactNode }) => 
    React.createElement('div', { 'data-testid': 'react-modal' }, children);
  Modal.setAppElement = vi.fn();
  return { default: Modal };
});

import ReactModal from 'react-modal';

// Ensure a root element exists for ReactModal
const root = document.createElement('div');
root.id = 'root';
document.body.appendChild(root);
ReactModal.setAppElement(root);

// Mock the hooks that useData depends on
vi.mock('../../../../app/contexts/useUser', () => ({
  useUser: vi.fn(() => ({
    user: { id: 'test-user', name: 'Test User' },
    isLoading: false,
  })),
}));

vi.mock('../../../../app/contexts/useProjects', () => ({
  useProjects: vi.fn(() => ({
    projects: [],
    setProjects: vi.fn(),
    setUserProjects: vi.fn(),
    isLoading: false,
    setIsLoading: vi.fn(),
    loadingProfile: false,
    activeProject: null,
    setActiveProject: vi.fn(),
    selectedProjects: [],
    setSelectedProjects: vi.fn(),
    fetchProjectDetails: vi.fn(),
    fetchProjects: vi.fn(),
    fetchUserProfile: vi.fn(),
    fetchRecentActivity: vi.fn(),
    opacity: 1,
    setOpacity: vi.fn(),
    settingsUpdated: false,
    toggleSettingsUpdated: vi.fn(),
    dmReadStatus: {},
    setDmReadStatus: vi.fn(),
    projectsError: false,
    updateTimelineEvents: vi.fn(),
    updateProjectFields: vi.fn(),
    isAdmin: false,
    isBuilder: false,
    isDesigner: false,
  })),
}));

vi.mock('../../../../app/contexts/useMessages', () => ({
  useMessages: vi.fn(() => ({
    messages: [],
    setMessages: vi.fn(),
    unreadCount: 0,
    setUnreadCount: vi.fn(),
    activeConversation: null,
    setActiveConversation: vi.fn(),
    conversations: [],
    setConversations: vi.fn(),
    isLoading: false,
    setIsLoading: vi.fn(),
    messagesError: null,
    setMessagesError: vi.fn(),
  })),
}));

// Mock pdfjs to avoid requiring optional native modules
vi.mock(
  'pdfjs-dist/legacy/build/pdf',
  () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0 }) })),
  })
);

vi.mock('react-router-dom', () => ({
  useParams: vi.fn(),
  useNavigate: vi.fn(),
}));

vi.mock('../../../../shared/utils/api', () => ({
  fetchGalleries: vi.fn(),
  getFileUrl: vi.fn((key) => `https://example.com/${key}`),
  fileUrlsToKeys: vi.fn((urls) => urls && Array.isArray(urls) ? urls.map(url => url && typeof url === 'string' ? url.replace('https://example.com/', '') : '') : []),
}));

let GalleryPage;
import styles from './gallery-page.module.css';

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      text: () => Promise.resolve('<svg></svg>'),
      ok: true,
      status: 200,
      headers: new Headers(),
    } as Response)
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

import { useParams, useNavigate } from 'react-router-dom';
import { fetchGalleries } from '@/shared/utils/api';

// Mock CSS modules
vi.mock('./gallery-page.module.css', () => ({
  default: {
    passwordInput: 'passwordInput',
    galleryContainer: 'galleryContainer',
  },
}));

// Helper to type vi.fn() from mocks
const fetchGalleriesMock = vi.mocked(fetchGalleries);
const useParamsMock = vi.mocked(useParams);
const useNavigateMock = vi.mocked(useNavigate);

describe('GalleryPage', () => {
  beforeEach(async () => {
    if (!GalleryPage) {
      const { default: GalleryPageImport } = await import('./GalleryPage');
      GalleryPage = GalleryPageImport;
    }
    fetchGalleriesMock.mockResolvedValue([
      { projectId: '1', name: 'client 001', slug: 'client-001', updatedSvgUrl: '/test.svg', imageUrls: ['img1.png'] },
    ]);
    useParamsMock.mockReturnValue({ projectId: 'project-1', gallerySlug: 'client-001' });
    useNavigateMock.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders svg container', async () => {
    render(<GalleryPage projectId="1" />);
    expect(await screen.findByTestId('svg-container')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/test.svg');
  });

  it('toggles to masonry layout', async () => {
    render(<GalleryPage projectId="1" />);
    const toggle = await screen.findByText('Masonry Layout');
    expect(screen.getByTestId('svg-container')).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText('Grid Layout')).toBeInTheDocument();
  });

  it('navigates back to dashboard when clicking back button', async () => {
    const navigateMock = vi.fn();
    useNavigateMock.mockReturnValue(navigateMock);
    render(<GalleryPage projectId="1" />);
    const backButton = await screen.findByRole('button', { name: /back to dashboard/i });
    await userEvent.click(backButton);
    expect(navigateMock).toHaveBeenCalledWith('/dashboard/projects/1');
  });

  it('renders gallery page with link navigation', async () => {
    const navigateMock = vi.fn();
    useNavigateMock.mockReturnValue(navigateMock);
    fetchGalleriesMock.mockResolvedValue([
      { projectId: 'project-1', name: 'link-gallery', slug: 'link', link: '/other' },
    ]);
    useParamsMock.mockReturnValue({ projectId: 'project-2', gallerySlug: 'link' });
    render(<GalleryPage projectId="1" />);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/other'));
  });

  it('prompts for password when enabled', async () => {
    // Mock localStorage to ensure user is not unlocked
    const localStorageMock = {
      getItem: vi.fn(() => null), // Return null to indicate user is not unlocked
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    fetchGalleriesMock.mockResolvedValue([
      { projectId: 'project-1', name: 'secret', slug: 'secret', passwordHash: 'abc', passwordEnabled: true },
    ]);
    useParamsMock.mockReturnValue({ projectId: 'project-3', gallerySlug: 'secret' });
    render(<GalleryPage projectId="1" />);
    const input = await screen.findByTestId('password-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass(styles.passwordInput);
  });

  it.skip('applies border radius from clipRadius', async () => {
    vi.resetModules();
    // Use the mocked pdfjs
    const pdfjs = { GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0 }) })) };
    pdfjs.getDocument.mockImplementation(() => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () => Promise.resolve({
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({ promise: Promise.resolve() }),
          getAnnotations: () => Promise.resolve([
            { url: 'img1.png', rect: [0, 0, 1, 1], clipRadius: 15 },
          ]),
        }),
      }),
    }));

    fetchGalleriesMock.mockResolvedValue([
      { projectId: 'project-1', slug: 'pdf', updatedPdfUrl: '/dummy.pdf', imageUrls: ['img1.png'] },
    ]);
    useParamsMock.mockReturnValue({ projectId: 'project-4', gallerySlug: 'pdf' });
    const { default: GalleryPagePdf } = await import('./GalleryPage');
    render(<GalleryPagePdf />);
    expect(pdfjs.getDocument).toHaveBeenCalled();
  });

  it.skip('uses pdfContainer class for pdf galleries', async () => {
    vi.resetModules();
    // Use the mocked pdfjs
    const pdfjs2 = { GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0 }) })) };
    pdfjs2.getDocument.mockImplementation(() => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () => Promise.resolve({
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({ promise: Promise.resolve() }),
          getAnnotations: () => Promise.resolve([]),
        }),
      }),
    }));

    fetchGalleriesMock.mockResolvedValue([
      { projectId: 'project-1', slug: 'pdf', updatedPdfUrl: '/dummy.pdf' },
    ]);
    useParamsMock.mockReturnValue({ projectId: 'project-5', gallerySlug: 'pdf' });
    const { default: GalleryPagePdf } = await import('./GalleryPage');
    render(<GalleryPagePdf />);
    const container = await screen.findByTestId('svg-container');
    expect(container).toHaveClass(styles.pdfContainer);
  });
});








