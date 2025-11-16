import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickCreateTaskModal from './QuickCreateTaskModal';

// Ensure useUser is mocked for this test specifically
vi.mock('@/app/contexts/useUser', () => ({
  useUser: vi.fn(() => ({
    isAdmin: false,
    isBuilder: false,
    isDesigner: false,
    isVendor: false,
    isClient: false,
    userId: 'test-user-id',
    userData: {},
    allUsers: [],
  })),
}));

describe('QuickCreateTaskModal', () => {
  it('mounts without throwing and renders the title element', () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <QuickCreateTaskModal
        open={true}
        onClose={onClose}
        projects={[]}
        onCreated={onCreated}
      />
    );

    // The component renders a heading with id quick-task-title
    const titleElement = document.getElementById('quick-task-title');
    expect(titleElement).toBeTruthy();
  });

  it('opens and closes assignee popover without ReferenceError', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <QuickCreateTaskModal
        open={true}
        onClose={onClose}
        projects={[]}
        onCreated={onCreated}
      />
    );

    // Click the ghost 'Add assignee' button to open
    const addBtn = screen.getByRole('button', { name: /add assignee/i });
    await userEvent.click(addBtn);

    // Popover should appear
    const popover = await screen.findByRole('listbox');
    expect(popover).toBeTruthy();

    // Click outside (document body) to trigger closeAssigneePopover
    await userEvent.click(document.body);

    // Popover should no longer be in the document
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
