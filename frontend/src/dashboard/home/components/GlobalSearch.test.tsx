import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GlobalSearch from './GlobalSearch';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import '@testing-library/jest-dom';

// Mock the required hooks and modules
vi.mock('@/app/contexts/useData', () => ({
  useData: () => mockUseData
}));

vi.mock('@/shared/utils/slug', () => ({
  slugify: vi.fn((title) => title.toLowerCase().replace(/\s+/g, '-'))
}));

vi.mock('@/shared/utils/api', () => ({
  apiFetch: vi.fn(),
  GET_PROJECT_MESSAGES_URL: 'http://test.com/messages',
  getFileUrl: vi.fn((value: string) => value)
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

// Mock data
const mockProjects = [
  {
    projectId: 'project-1',
    title: 'Test Project One',
    description: 'A test project for searching',
    status: 'in-progress',
    finishline: '2024-01-10',
    thumbnails: ['https://example.com/thumb-1.jpg']
  },
  {
    projectId: 'project-2',
    title: 'Demo Application',
    description: 'Another project to test search functionality',
    status: 'completed',
    finishline: '2024-03-15'
  }
];

const mockProjectMessages = {
  'project-1': [
    {
      messageId: 'msg-1',
      text: 'This is a test message about the project',
      timestamp: '2024-01-01T10:00:00Z'
    },
    {
      messageId: 'msg-2',
      text: 'Another message discussing features',
      timestamp: '2024-01-02T10:00:00Z'
    }
  ],
  'project-2': [
    {
      messageId: 'msg-3',
      text: 'Demo message for testing search',
      timestamp: '2024-01-03T10:00:00Z'
    }
  ]
};

const mockUsers = [
  {
    userId: 'current-user',
    firstName: 'Current',
    lastName: 'User',
    email: 'current@example.com',
    role: 'designer'
  },
  {
    userId: 'user-2',
    firstName: 'Jane',
    lastName: 'Collaborator',
    email: 'jane@example.com',
    role: 'builder'
  },
  {
    userId: 'user-3',
    firstName: 'Alex',
    lastName: 'Admin',
    email: 'alex@example.com',
    role: 'admin'
  }
] as const;

const mockUseData = {
  projects: mockProjects,
  projectMessages: mockProjectMessages,
  fetchProjectDetails: vi.fn(),
  allUsers: [] as unknown[],
  userData: {
    userId: 'current-user',
    firstName: 'Current',
    lastName: 'User',
    collaborators: ['user-2'],
    role: 'designer'
  },
  isAdmin: false
};

const PLACEHOLDER_TEXT = 'Find anything...';

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseData.projects = mockProjects.map(project => ({ ...project }));
    mockUseData.projectMessages = JSON.parse(JSON.stringify(mockProjectMessages));
    mockUseData.userData = {
      userId: 'current-user',
      firstName: 'Current',
      lastName: 'User',
      collaborators: ['user-2'],
      role: 'designer'
    };
    mockUseData.allUsers = mockUsers.map(user => ({ ...user }));
    mockUseData.isAdmin = false;
    mockNavigate.mockReset();
  });

  const renderGlobalSearch = (initialEntries: string[] = ['/']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <GlobalSearch />
      </MemoryRouter>
    );
  };

  it('renders search input', () => {
    renderGlobalSearch();
    expect(screen.getByPlaceholderText(PLACEHOLDER_TEXT)).toBeInTheDocument();
  });

  it('shows search results when typing', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);
    
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      // Use a more flexible matcher for text that might be split across elements
      const testProjectElements = screen.getAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Test Project One');
      });
      expect(testProjectElements.length).toBeGreaterThan(0);
    });
  });

  it('searches projects by title', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);
    
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'demo' } });

    await waitFor(() => {
      // Use a more flexible matcher for text that might be split across elements
      const demoElements = screen.getAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Demo Application');
      });
      expect(demoElements.length).toBeGreaterThan(0);
    });
  });

  it('searches projects by description', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);
    
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'functionality' } });

    await waitFor(() => {
      expect(screen.getByText('Demo Application')).toBeInTheDocument();
    });
  });

  it('searches messages content', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'features' } });

    await waitFor(() => {
      // Use a more flexible matcher for text that might be split across elements
      const messageElements = screen.getAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Message in Test Project One');
      });
      expect(messageElements.length).toBeGreaterThan(0);
    });
  });

  it('lists collaborators when query starts with @', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '@' } });

    await waitFor(() => {
      const collaboratorElements = screen.getAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Jane Collaborator');
      });
      expect(collaboratorElements.length).toBeGreaterThan(0);
    });
  });

  it('navigates to direct messages when collaborator result is selected', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '@Jane' } });

    await waitFor(() => {
      const collaboratorElements = screen.getAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Jane Collaborator');
      });
      expect(collaboratorElements.length).toBeGreaterThan(0);
    });

    const collaboratorButton = screen.getAllByRole('button').find(button => {
      const textContent = button.textContent || '';
      return textContent.includes('Jane Collaborator');
    }) as HTMLButtonElement | undefined;

    expect(collaboratorButton).toBeDefined();
    fireEvent.click(collaboratorButton!);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/features/messages/jane-collaborator');
    });
  });

  it('shows no results when search returns empty', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
  });

  it('clears search when clear button is clicked', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT) as HTMLInputElement;
    
    fireEvent.change(input, { target: { value: 'test' } });
    
    const clearButton = screen.getByLabelText('Clear search');
    fireEvent.click(clearButton);

    expect(input.value).toBe('');
  });

  it('navigates to project when project result is clicked', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);
    
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      // Use a more flexible matcher for text that might be split across elements
      const testProjectElements = screen.getAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Test Project One');
      });
      expect(testProjectElements.length).toBeGreaterThan(0);
    });

    // Find all buttons and filter to get the project button (not the message button)
    const buttons = screen.getAllByRole('button');
    const testProjectButton = buttons.find(button => {
      const textContent = button.textContent || '';
      return textContent.includes('Test Project One') && !textContent.includes('Message in');
    });
    
    if (testProjectButton) {
      fireEvent.click(testProjectButton);
    }

    // Wait for the async operations to complete
    await waitFor(() => {
      expect(mockUseData.fetchProjectDetails).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  it('preserves the current project view suffix when navigating to another project', async () => {
    renderGlobalSearch(['/dashboard/projects/project-1/Test%20Project/budget']);
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'demo' } });

    await waitFor(() => {
      const demoProjectElements = screen.getAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Demo Application');
      });
      expect(demoProjectElements.length).toBeGreaterThan(0);
    });

    const allButtons = screen.getAllByRole('button');
    const demoProjectButton = allButtons.find(button => {
      const textContent = button.textContent || '';
      return textContent.includes('Demo Application') && !textContent.includes('Message in');
    });

    expect(demoProjectButton).toBeDefined();

    fireEvent.click(demoProjectButton!);

    const expectedPath = getProjectDashboardPath('project-2', 'Demo Application', '/budget');

    await waitFor(() => {
      expect(mockUseData.fetchProjectDetails).toHaveBeenCalledWith('project-2');
      expect(mockNavigate).toHaveBeenCalledWith(expectedPath);
    });
  });

  it('supports keyboard navigation', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);
    
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      // Use a more flexible matcher for text that might be split across elements
      const testProjectElements = screen.getAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Test Project One');
      });
      expect(testProjectElements.length).toBeGreaterThan(0);
    });

    // Test arrow down navigation
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    
    // Test Enter key selection - should select the first highlighted result
    fireEvent.keyDown(input, { key: 'Enter' });

    // The first result should be Demo Application (project-2) due to alphabetical sorting
    expect(mockUseData.fetchProjectDetails).toHaveBeenCalledWith('project-2');
  });

  it('renders project metadata with status and due date', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'test' } });

    const statusPill = await screen.findByText('In Progress');
    expect(statusPill).toBeInTheDocument();

    // Use a more flexible matcher for text that might be split across elements
    const dueLabels = await screen.findAllByText((content, element) => {
      if (!element) return false;
      const textContent = element.textContent || '';
      return textContent.includes('Due') && /Due.*2024/.test(textContent);
    });
    expect(dueLabels.length).toBeGreaterThan(0);
  });

  it('shows plain text excerpts for lexical descriptions', async () => {
    const lexicalDescription = JSON.stringify({
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Lexical summary text' }
            ]
          }
        ]
      }
    });

    mockUseData.projects = [
      {
        projectId: 'project-lexical',
        title: 'Lexical Project',
        description: lexicalDescription,
        status: 'pending',
        finishline: '2024-06-01'
      }
    ];

    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'lexical' } });

    await waitFor(() => {
      expect(screen.getByText('Lexical summary text')).toBeInTheDocument();
    });

    expect(screen.queryByText(lexicalDescription)).not.toBeInTheDocument();
  });

  it('closes search results on Escape key', async () => {
    renderGlobalSearch();
    const input = screen.getByPlaceholderText(PLACEHOLDER_TEXT);
    
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      // Use a more flexible matcher for text that might be split across elements
      const testProjectElements = screen.getAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Test Project One');
      });
      expect(testProjectElements.length).toBeGreaterThan(0);
    });

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      // Check that the results are no longer visible
      const testProjectElements = screen.queryAllByText((content, element) => {
        if (!element) return false;
        const textContent = element.textContent || '';
        return textContent.includes('Test Project One');
      });
      expect(testProjectElements.length).toBe(0);
    });
  });
});








