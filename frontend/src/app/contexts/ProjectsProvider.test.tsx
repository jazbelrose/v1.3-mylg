// src/app/contexts/ProjectsProvider.test.tsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProjectsProvider } from './ProjectsProvider';
import { useProjects } from './useProjects';

// Mock the API functions
const apiMocks = vi.hoisted(() => ({
  fetchProjectsFromApi: vi.fn(),
  fetchEvents: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock('../../shared/utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/utils/api')>();
  return {
    ...actual,
    fetchProjectsFromApi: apiMocks.fetchProjectsFromApi,
    fetchEvents: apiMocks.fetchEvents,
    apiFetch: apiMocks.apiFetch,
  };
});

// Mock pLimit
vi.mock('../../shared/utils/pLimit', () => ({
  default: () => (fn: () => unknown) => fn(),
}));

// Mock storage
vi.mock('../../shared/utils/storageWithTTL', () => ({
  getWithTTL: () => null,
  setWithTTL: () => {},
  DEFAULT_TTL: 0,
}));

// Mock useAuth
vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}));
import { useAuth } from './useAuth';
import type { AuthContextValue } from './AuthContextValue';

const ErrProbe: React.FC = () => {
  const { projectsError } = useProjects();
  return <span data-testid="projects-err">{String(!!projectsError)}</span>;
};

const Kickoff: React.FC = () => {
  const { fetchProjects } = useProjects();
  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);
  return null;
};

beforeEach(() => {
  vi.clearAllMocks();
  
  // Mock auth context
  (useAuth as ReturnType<typeof vi.fn<() => Partial<AuthContextValue>>>).mockReturnValue({
    userId: 'u1',
    role: 'admin',
    isAuthenticated: true,
  });

  // Set up default mock responses
  apiMocks.fetchEvents.mockResolvedValue([]);
});

describe('ProjectsProvider', () => {
  it('sets projectsError when project fetch fails', async () => {
    // Force the failure
    apiMocks.fetchProjectsFromApi.mockRejectedValueOnce(new Error('fetch failed'));

    render(
      <ProjectsProvider>
        <Kickoff />
        <ErrProbe />
      </ProjectsProvider>
    );

    // Wait for the error to be set
    await waitFor(() => {
      expect(screen.getByTestId('projects-err')).toHaveTextContent('true');
    }, { timeout: 3000 });
  });
});








