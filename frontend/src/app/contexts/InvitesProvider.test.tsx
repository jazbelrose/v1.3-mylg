import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./useProjects', () => ({
  useProjects: vi.fn(),
}));

vi.mock('@/shared/utils/api', () => ({
  fetchPendingInvites: vi.fn(() => Promise.resolve([])),
  sendProjectInvite: vi.fn(),
  acceptProjectInvite: vi.fn(),
  declineProjectInvite: vi.fn(),
  cancelProjectInvite: vi.fn(),
}));

import { useAuth } from './useAuth';
import { useProjects } from './useProjects';
import * as api from '@/shared/utils/api';
import { InvitesProvider } from './InvitesProvider';
import { useInvites } from './useInvites';

const TestComponent: React.FC = () => {
  const { pendingInvites } = useInvites();
  return <span data-testid="count">{pendingInvites.length}</span>;
};

describe('InvitesProvider', () => {
  beforeEach(() => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ userId: 'u1' });
    (useProjects as ReturnType<typeof vi.fn>).mockReturnValue({ fetchProjects: vi.fn() });
    api.fetchPendingInvites.mockResolvedValue([
      { inviteId: '1', projectId: 'p1', recipientUsername: 'r' },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches pending invites on mount', async () => {
    render(
      <InvitesProvider>
        <TestComponent />
      </InvitesProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('count')).toHaveTextContent('1');
    });
    expect(api.fetchPendingInvites).toHaveBeenCalledWith('u1');
  });
});








