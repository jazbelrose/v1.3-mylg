import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock SVG imports with ?react suffix
vi.mock('@/assets/svg/user.svg?react', () => ({
  default: () => React.createElement('div', { 'data-testid': 'user-icon' }, 'UserIcon'),
}));

// Mock other common SVG components  
vi.mock('@/assets/svg/project-marker.svg?react', () => ({
  default: () => React.createElement('div', { 'data-testid': 'project-marker-icon' }, 'ProjectMarkerIcon'),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Trash2: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'trash-icon' }, 'Trash'),
  Pencil: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'pencil-icon' }, 'Pencil'),
  Smile: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'smile-icon' }, 'Smile'),
  Plus: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'plus-icon' }, 'Plus'),
  X: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'x-icon' }, 'X'),
  Upload: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'upload-icon' }, 'Upload'),
  Download: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'download-icon' }, 'Download'),
  Search: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'search-icon' }, 'Search'),
  ArrowLeft: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'arrow-left-icon' }, 'ArrowLeft'),
  ArrowRight: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'arrow-right-icon' }, 'ArrowRight'),
  ChevronDown: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'chevron-down-icon' }, 'ChevronDown'),
  ChevronUp: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'chevron-up-icon' }, 'ChevronUp'),
  Edit: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'edit-icon' }, 'Edit'),
  Save: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'save-icon' }, 'Save'),
  Cancel: ({ ...props }) => React.createElement('button', { ...props, 'data-testid': 'cancel-icon' }, 'Cancel'),
}));

// Mock shared components
vi.mock('@/shared/ui/ReactionBar', () => ({
  default: ({ reactions }: any) => 
    React.createElement('div', { 'data-testid': 'reaction-bar' }, 
      `Reactions: ${JSON.stringify(reactions || {})}`),
}));

// Mock react-player
vi.mock('react-player', () => ({
  default: ({ url }: any) => React.createElement('div', { 'data-testid': 'react-player' }, `Player: ${url}`),
}));

// Global jest compatibility
globalThis.jest = {
  fn: vi.fn,
  mock: vi.mock,
  spyOn: vi.spyOn,
};

// Mock React Router DOM globally
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
    useLocation: vi.fn(() => ({
      pathname: '/',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    })),
    useParams: vi.fn(() => ({})),
    BrowserRouter: ({ children }: { children: any }) => children,
    Link: ({ children }: { children: any }) => children,
    NavLink: ({ children }: { children: any }) => children,
  };
});

// Note: OnlineStatusContext is mocked individually by its own test file
// vi.mock('@/app/contexts/OnlineStatusContext', async () => {
//   const actual = await vi.importActual('@/app/contexts/OnlineStatusContext');
//   return {
//     ...actual,
//     useOnlineStatus: vi.fn(() => ({ 
//       onlineUsers: ['user1', 'user2'], // Default fallback
//       isOnline: vi.fn((userId: string) => ['user1', 'user2'].includes(userId)),
//       isOffline: vi.fn((userId: string) => !['user1', 'user2'].includes(userId)),
//       updateOnlineUsers: vi.fn(),
//     })),
//     OnlineStatusProvider: ({ children }: { children: any }) => children,
//   };
// });

// Mock common providers
vi.mock('@/app/contexts/DataProvider', () => ({
  useData: vi.fn(() => ({
    user: { firstName: 'Test User', email: 'test@example.com' },
    userId: 'test-user-id',
    projects: [],
    activeProject: null,
    isAdmin: false,
    isBuilder: false,
    isDesigner: false,
    opacity: 1,
    setProjects: vi.fn(),
    setSelectedProjects: vi.fn(),
    fetchProjectDetails: vi.fn(),
    fetchProjects: vi.fn(() => Promise.resolve([])),
    updateTimelineEvents: vi.fn(),
    updateProjectFields: vi.fn(),
  })),
  DataProvider: ({ children }: { children: any }) => children,
}));

vi.mock('@/app/contexts/useUser', () => ({
  useUser: vi.fn(() => ({
    isAdmin: false,
    isBuilder: false,
    isDesigner: false,
    isVendor: false,
    isClient: false,
    userId: 'test-user-id',
  })),
}));

vi.mock('@/app/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { firstName: 'Test User', email: 'test@example.com' },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
  })),
  AuthProvider: ({ children }: { children: any }) => children,
}));

// Note: SocketContext is mocked individually by its own test file
// vi.mock('@/app/contexts/SocketContext', () => ({
//   useSocket: vi.fn(() => {
//     const mockWs = {
//       readyState: 1, // WebSocket.OPEN
//       send: vi.fn(),
//       close: vi.fn(),
//       onmessage: null,
//       onopen: null,
//       onclose: null,
//       onerror: null,
//     };
//     return { 
//       ws: mockWs, 
//       isConnected: true,
//       connect: vi.fn(),
//       disconnect: vi.fn(),
//     };
//   }),
//   useSocketEvents: vi.fn(),
//   SocketProvider: ({ children }: { children: any }) => children,
// }));

// Note: API utilities are mocked individually by specific test files when needed
// vi.mock('@/shared/utils/api', async () => {
//   const actual = await vi.importActual('@/shared/utils/api') as any;
//   return {
//     ...actual,
//     THREADS_URL: 'threads',
//     WEBSOCKET_URL: 'wss://mock-websocket.com',
//     S3_PUBLIC_BASE: 'https://mock-s3-bucket.com/',
//     fetchAllUsers: vi.fn(() => Promise.resolve([])),
//     fetchUserProfile: vi.fn(() => Promise.resolve({})),
//     fetchProjectsFromApi: vi.fn(() => Promise.resolve([])), // Default, can be overridden
//     fetchProjects: vi.fn(() => Promise.resolve([])),
//     fetchEvents: vi.fn(() => Promise.resolve([])),
//     fetchBudgetHeader: vi.fn(() => Promise.resolve({})),
//     fetchBudgetItems: vi.fn(() => Promise.resolve([])),
//     updateTimelineEvents: vi.fn(() => Promise.resolve()),
//     updateProjectFields: vi.fn(() => Promise.resolve()),
//     updateBudgetItem: vi.fn(() => Promise.resolve()),
//     fetchPendingInvites: vi.fn(() => Promise.resolve([])),
//     sendProjectInvite: vi.fn(() => Promise.resolve()),
//     acceptProjectInvite: vi.fn(() => Promise.resolve()),
//     declineProjectInvite: vi.fn(() => Promise.resolve()),
//     cancelProjectInvite: vi.fn(() => Promise.resolve()),
//     apiFetch: vi.fn().mockResolvedValue({
//       json: vi.fn().mockResolvedValue([]),
//     }),
//   };
// });

// Mock Lucide React icons
vi.mock('lucide-react', () => {
  const Icon = () => null;
  return new Proxy({}, {
    get: () => Icon,
  });
});

// Mock common shared components
vi.mock('@/shared/components/ModalWithStack', () => ({
  __esModule: true,
  default: ({ children, isOpen }: { children: any; isOpen: boolean }) => 
    isOpen ? children : null,
}));

vi.mock('@/shared/components/ToastNotifications', () => ({
  __esModule: true,
  default: () => null,
}));

// Mock AWS Amplify
vi.mock('aws-amplify/auth', () => ({
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
  resendSignUpCode: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn(),
}));

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  ToastContainer: () => null,
}));

// Mock Modal components
vi.mock('react-modal', () => ({
  __esModule: true,
  default: ({ children, isOpen }: { children: any; isOpen: boolean }) => 
    isOpen ? children : null,
  setAppElement: vi.fn(),
}));

// Mock Ant Design components
vi.mock('antd', () => ({
  Button: ({ children }: { children: any }) => children,
  Input: ({ value }: any) => value,
  Select: ({ children }: any) => children,
  DatePicker: ({ value }: any) => value,
  Form: ({ children }: { children: any }) => children,
  message: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));
