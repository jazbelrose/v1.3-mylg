import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickCreateTaskModal from './QuickCreateTaskModal';

// Mock NoteEditorModal to simplify testing
vi.mock('@/dashboard/features/messages/components/NoteEditorModal', () => ({
  default: function NoteEditorModalMock({ isOpen, onSave, editContent, onRequestClose }: any) {
    const [content, setContent] = React.useState(editContent?.initialContent || '');
    
    if (!isOpen) return null;
    
    return (
      <div data-testid="note-editor-modal">
        <h2>Edit Assignment</h2>
        <textarea
          data-testid="note-editor-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          onClick={() => {
            if (onSave) {
              onSave(content);
            }
            if (onRequestClose) {
              onRequestClose();
            }
          }}
        >
          Save
        </button>
        <button onClick={onRequestClose}>Cancel</button>
      </div>
    );
  },
}));

// Mock FileManagerV2 to avoid complex dependency
vi.mock('@/dashboard/project/components/FileManager', () => ({
  FileManagerV2: vi.fn(() => null),
}));

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

// Mock useData context
vi.mock('@/app/contexts/useData', () => ({
  useData: vi.fn(() => ({
    activeProject: null,
    projects: [],
    fetchProjectDetails: vi.fn(() => Promise.resolve({})),
  })),
}));

// Mock API calls
vi.mock('@/shared/utils/api', () => ({
  createTask: vi.fn(() => Promise.resolve({})),
  updateTask: vi.fn(() => Promise.resolve({})),
  deleteTask: vi.fn(() => Promise.resolve({})),
  uploadFile: vi.fn(() => Promise.resolve({})),
  getFileUrl: vi.fn(() => ''),
  apiFetch: vi.fn(() => Promise.resolve({})),
  PROJECTS_SERVICE_URL: 'http://test',
  fetchBudgetHeader: vi.fn(() => Promise.resolve(null)),
  fetchBudgetItems: vi.fn(() => Promise.resolve([])),
  createBudgetItem: vi.fn(() => Promise.resolve({})),
  requestTaskReview: vi.fn(() => Promise.resolve({})),
  fetchTask: vi.fn(() => Promise.resolve({})),
  approveTask: vi.fn(() => Promise.resolve({})),
  approveTaskReview: vi.fn(() => Promise.resolve({})),
  requestTaskChanges: vi.fn(() => Promise.resolve({})),
}));

// Mock location utilities
vi.mock('@/shared/utils/location', () => ({
  fetchLocationSuggestions: vi.fn(() => Promise.resolve([])),
  fetchGlobalLocationSuggestions: vi.fn(() => Promise.resolve([])),
}));

describe('QuickCreateTaskModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('saves note from Lexical editor and updates modal state', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <QuickCreateTaskModal
        open={true}
        onClose={onClose}
        projects={[{ id: 'proj-1', name: 'Test Project' }]}
        onCreated={onCreated}
        activeProjectId="proj-1"
      />
    );

    // Find and click the expand editor button
    const expandButton = screen.getByTitle('Expand editor');
    await userEvent.click(expandButton);

    // Wait for the note editor modal to appear
    await waitFor(() => {
      expect(screen.getByTestId('note-editor-modal')).toBeTruthy();
    });

    // Type into the note editor (use paste for speed in tests)
    const editorTextarea = screen.getByTestId('note-editor-textarea') as HTMLTextAreaElement;
    await userEvent.clear(editorTextarea);
    await userEvent.click(editorTextarea);
    await userEvent.paste('This is a test note from Lexical editor');

    // Click save in the note editor
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    // Wait for the modal to close and content to be saved
    await waitFor(() => {
      expect(screen.queryByTestId('note-editor-modal')).toBeNull();
    }, { timeout: 3000 });

    // Wait a bit more for state to propagate
    await new Promise(resolve => setTimeout(resolve, 100));

    // The assignment textarea should now contain the saved note
    const assignmentTextarea = screen.getByLabelText('Assignment') as HTMLTextAreaElement;
    expect(assignmentTextarea.value).toBe('This is a test note from Lexical editor');
  });

  it('displays note preview after saving from Lexical editor', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <QuickCreateTaskModal
        open={true}
        onClose={onClose}
        projects={[{ id: 'proj-1', name: 'Test Project' }]}
        onCreated={onCreated}
        activeProjectId="proj-1"
      />
    );

    // Open the note editor
    const expandButton = screen.getByTitle('Expand editor');
    await userEvent.click(expandButton);

    // Type a note (use paste for speed in tests)
    const editorTextarea = screen.getByTestId('note-editor-textarea') as HTMLTextAreaElement;
    await userEvent.clear(editorTextarea);
    await userEvent.click(editorTextarea);
    await userEvent.paste('Preview test note');

    // Save
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    // Verify the preview appears in the assignment field
    await waitFor(() => {
      const assignmentTextarea = screen.getByLabelText('Assignment') as HTMLTextAreaElement;
      expect(assignmentTextarea.value).toBe('Preview test note');
    }, { timeout: 3000 });
  });

  it('includes note in create-task payload', async () => {
    const { createTask } = await import('@/shared/utils/api');
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <QuickCreateTaskModal
        open={true}
        onClose={onClose}
        projects={[{ id: 'proj-1', name: 'Test Project' }]}
        onCreated={onCreated}
        activeProjectId="proj-1"
      />
    );

    // Fill in the task title
    const titleInput = screen.getByLabelText(/task name/i) as HTMLInputElement;
    await userEvent.type(titleInput, 'Test Task');

    // Open note editor and add a note
    const expandButton = screen.getByTitle('Expand editor');
    await userEvent.click(expandButton);

    const editorTextarea = screen.getByTestId('note-editor-textarea') as HTMLTextAreaElement;
    await userEvent.click(editorTextarea);
    await userEvent.paste('Note for the payload test');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    // Wait for editor to close
    await waitFor(() => {
      expect(screen.queryByTestId('note-editor-modal')).toBeNull();
    }, { timeout: 3000 });

    // Wait for state to propagate
    await new Promise(resolve => setTimeout(resolve, 100));

    // Submit the form - button is labeled "Save task", not "Create task"
    const submitButton = screen.getByRole('button', { name: /save task/i });
    await userEvent.click(submitButton);

    // Verify createTask was called with the note in the payload
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled();
      const callArgs = (createTask as any).mock.calls[0];
      expect(callArgs[0]).toMatchObject({
        title: 'Test Task',
        description: 'Note for the payload test',
      });
    }, { timeout: 3000 });
  });

  it('displays legacy plain text notes correctly', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <QuickCreateTaskModal
        open={true}
        onClose={onClose}
        projects={[{ id: 'proj-1', name: 'Test Project' }]}
        onCreated={onCreated}
        task={{
          projectId: 'proj-1',
          title: 'Legacy Task',
          description: 'This is a legacy plain text note',
        }}
      />
    );

    // The assignment textarea should display the legacy note
    const assignmentTextarea = screen.getByLabelText('Assignment') as HTMLTextAreaElement;
    expect(assignmentTextarea.value).toBe('This is a legacy plain text note');
  });
});
