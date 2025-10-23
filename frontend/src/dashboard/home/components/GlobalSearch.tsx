import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Search, X, FileText, FolderOpen, MessageSquare, User, Loader2 } from 'lucide-react';
import { useData } from '@/app/contexts/useData';
import { useLocation, useNavigate } from 'react-router-dom';
import { slugify } from '@/shared/utils/slug';
import { getProjectDashboardPath } from '@/shared/utils/projectUrl';
import type { Project, Message, UserLite } from '@/app/contexts/DataProvider';
import { getFileUrl } from '@/shared/utils/api';
import type { AppUser } from '@/dashboard/features/messages/types';
import { getUserDisplayName, getUserThumbnail } from '@/dashboard/features/messages/utils/userHelpers';
import SVGThumbnail from './SvgThumbnail';
import Squircle from '@/shared/ui/Squircle';

interface HighlightPart {
  text: string;
  isMatch: boolean;
}

interface SearchResult {
  id: string;
  type: 'project' | 'message' | 'collaborator';
  title: string;
  subtitle?: string;
  description?: string;
  projectId?: string;
  messageId?: string;
  userId?: string;
  snippet?: string;
  excerpt?: string;
  thumbnailUrl?: string;
  thumbnailInitial?: string;
  status?: string;
  statusLabel?: string;
  statusClassName?: string;
  dueDate?: string;
  dueDateLabel?: string;
  highlightParts?: HighlightPart[];
}

const EXCERPT_MAX_LENGTH = 140;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildHighlightParts = (text: string, rawQuery: string): HighlightPart[] | undefined => {
  const trimmedQuery = rawQuery.trim();
  if (!trimmedQuery) return undefined;

  const regex = new RegExp(`(${escapeRegExp(trimmedQuery)})`, 'ig');
  const parts = text.split(regex);

  if (parts.length <= 1) {
    return undefined;
  }

  const lowerQuery = trimmedQuery.toLowerCase();

  return parts
    .filter(part => part.length > 0)
    .map(part => ({
      text: part,
      isMatch: part.toLowerCase() === lowerQuery,
    }));
};

const toSingleLine = (value: string) => value.replace(/\s+/g, ' ').trim();

const truncate = (value: string, length = EXCERPT_MAX_LENGTH) => {
  if (!value) return value;
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
};

const collectLexicalText = (node: unknown): string => {
  if (!node) return '';

  if (typeof node === 'string') {
    return node;
  }

  if (Array.isArray(node)) {
    return toSingleLine(
      node
        .map(child => collectLexicalText(child))
        .filter(Boolean)
        .join(' ')
    );
  }

  if (typeof node !== 'object') {
    return '';
  }

  const obj = node as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof obj.text === 'string') {
    parts.push(obj.text);
  }

  if (Array.isArray(obj.children)) {
    parts.push(collectLexicalText(obj.children));
  }

  if (Array.isArray(obj.rows)) {
    parts.push(collectLexicalText(obj.rows));
  }

  if (Array.isArray(obj.cells)) {
    parts.push(collectLexicalText(obj.cells));
  }

  if (typeof obj.value === 'string') {
    parts.push(obj.value);
  }

  return toSingleLine(parts.filter(Boolean).join(' '));
};

const extractPlainText = (input: unknown): string => {
  if (!input) return '';

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        const fromLexical = collectLexicalText((parsed as Record<string, unknown>).root ?? parsed);
        if (fromLexical) {
          return fromLexical;
        }
      } catch {
        // fall through to HTML stripping below
      }
    }

    return toSingleLine(trimmed.replace(/<[^>]+>/g, ''));
  }

  if (typeof input === 'object') {
    const fromLexical = collectLexicalText((input as Record<string, unknown>).root ?? input);
    if (fromLexical) {
      return fromLexical;
    }
  }

  return '';
};

const createExcerpt = (description: unknown): string | undefined => {
  const plain = extractPlainText(description);
  if (!plain) return undefined;
  return truncate(toSingleLine(plain));
};

const formatDueDate = (value?: string | null) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getStatusMetadata = (status?: string) => {
  if (!status) return {};

  const normalized = status.toLowerCase();
  const label = toSingleLine(
    normalized
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );

  const className = `global-search-status--${normalized.replace(/[^a-z0-9]+/g, '-')}`;

  return {
    statusLabel: label || status,
    statusClassName: className,
  };
};

const getProjectThumbnail = (project: Project) => {
  const initial = (project.title || 'Untitled project').trim().charAt(0).toUpperCase() || '#';
  const thumbnails = Array.isArray(project.thumbnails) ? project.thumbnails : [];
  const firstThumb = thumbnails.find((thumb): thumb is string => typeof thumb === 'string' && thumb.trim().length > 0);

  if (!firstThumb) {
    return { initial };
  }

  try {
    return {
      initial,
      thumbnailUrl: getFileUrl(firstThumb),
    };
  } catch (error) {
    console.warn('Failed to resolve thumbnail URL', error);
    return { initial };
  }
};

const normalizeLabel = (value?: string | null) => {
  if (!value) return undefined;
  return toSingleLine(
    String(value)
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  ) || undefined;
};

const buildCollaboratorResults = (
  rawQuery: string,
  allUsers: UserLite[],
  currentUser: UserLite | null | undefined,
  isAdmin: boolean
): SearchResult[] => {
  if (!Array.isArray(allUsers) || allUsers.length === 0) {
    return [];
  }

  const mentionQuery = rawQuery.replace(/^@+/, '').trim();
  const normalizedMention = mentionQuery.toLowerCase();
  const currentUserId = currentUser?.userId;
  const collaboratorIds = new Set(
    Array.isArray(currentUser?.collaborators)
      ? currentUser.collaborators.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : []
  );

  const eligibleMap = new Map<string, UserLite>();

  for (const user of allUsers) {
    if (!user || typeof user.userId !== 'string') continue;
    if (user.userId === currentUserId) continue;

    const normalizedRole = typeof user.role === 'string' ? user.role.toLowerCase() : '';
    const canMessage =
      isAdmin ||
      collaboratorIds.has(user.userId) ||
      normalizedRole === 'admin';

    if (!canMessage) continue;

    if (!eligibleMap.has(user.userId)) {
      eligibleMap.set(user.userId, user);
    }
  }

  const eligibleUsers = Array.from(eligibleMap.values()).filter(user => {
    if (!normalizedMention) return true;

    const displayName = getUserDisplayName(user as AppUser).toLowerCase();
    const email = typeof user.email === 'string' ? user.email.toLowerCase() : '';
    const username = typeof user.username === 'string' ? user.username.toLowerCase() : '';
    const company = typeof user.company === 'string' ? user.company.toLowerCase() : '';
    const occupation = typeof user.occupation === 'string' ? user.occupation.toLowerCase() : '';
    const role = typeof user.role === 'string' ? user.role.toLowerCase() : '';

    return (
      displayName.includes(normalizedMention) ||
      email.includes(normalizedMention) ||
      username.includes(normalizedMention) ||
      company.includes(normalizedMention) ||
      occupation.includes(normalizedMention) ||
      role.includes(normalizedMention)
    );
  });

  eligibleUsers.sort((a, b) =>
    getUserDisplayName(a as AppUser).localeCompare(getUserDisplayName(b as AppUser))
  );

  return eligibleUsers.map(user => {
    const displayName = getUserDisplayName(user as AppUser);
    const roleLabel = normalizeLabel(user.occupation) || normalizeLabel(user.role);
    const company = typeof user.company === 'string' ? user.company.trim() : '';
    const email = typeof user.email === 'string' ? user.email.trim() : '';
    const detailParts = [roleLabel, company, email].filter(
      (part, index, arr) => part && arr.indexOf(part) === index
    ) as string[];

    const thumbnailKey = getUserThumbnail(user as AppUser) || undefined;
    let thumbnailUrl: string | undefined;

    if (thumbnailKey) {
      try {
        thumbnailUrl = getFileUrl(thumbnailKey);
      } catch (error) {
        console.warn('Failed to resolve collaborator thumbnail URL', error);
      }
    }

    const initial = displayName.trim().charAt(0).toUpperCase() || '#';

    return {
      id: `collaborator-${user.userId}`,
      type: 'collaborator' as const,
      title: displayName,
      subtitle: 'Start a direct message',
      snippet: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
      userId: user.userId,
      thumbnailUrl,
      thumbnailInitial: initial,
      highlightParts: mentionQuery ? buildHighlightParts(displayName, mentionQuery) : undefined,
    };
  });
};

interface GlobalSearchProps {
  className?: string;
  onNavigate?: () => void;
}

const PROJECT_VIEW_SUFFIXES = new Set(['calendar', 'editor', 'moodboard']);

const GlobalSearch: React.FC<GlobalSearchProps> = ({ className = '', onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const currentProjectViewSuffix = useMemo(() => {
    const path = location.pathname.split(/[?#]/)[0];
    if (!path.startsWith('/dashboard/projects/')) {
      return '';
    }

    const segments = path.split('/').filter(Boolean);
    if (segments[0] !== 'dashboard' || segments[1] !== 'projects') {
      return '';
    }

    const maybeSuffixIndex = segments.length >= 5 ? 4 : segments.length >= 4 ? 3 : -1;
    if (maybeSuffixIndex === -1) {
      return '';
    }

    const suffixCandidate = segments[maybeSuffixIndex];
    if (suffixCandidate === 'budget') {
      // Navigating directly into the budget tab from search causes the view to flicker
      // and snap back to the previously active project. Reset to the overview instead
      // to provide a stable navigation target.
      return '';
    }
    return PROJECT_VIEW_SUFFIXES.has(suffixCandidate) ? `/${suffixCandidate}` : '';
  }, [location.pathname]);

  const data = useData();
  const projects = useMemo(() => (Array.isArray(data?.projects) ? data.projects : []) as Project[], [data?.projects]);
  const projectMessages = useMemo(() => (data?.projectMessages && typeof data.projectMessages === 'object'
    ? data.projectMessages
    : {}) as Record<string, Message[]>, [data?.projectMessages]);
  const fetchProjectDetails = data?.fetchProjectDetails as
    | ((projectId: string) => Promise<unknown>)
    | undefined;
  const userData = useMemo(() => (data?.userData ?? null) as UserLite | null, [data?.userData]);
  const allUsers = useMemo(() => (Array.isArray(data?.allUsers) ? data.allUsers : []) as UserLite[], [data?.allUsers]);
  const isAdmin = useMemo(() => Boolean((data as { isAdmin?: boolean })?.isAdmin), [data]);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleResultClick(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        break;
    }
  };

  // Search function
  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setResults([]);
      return;
    }

    setLoading(true);
    const searchResults: SearchResult[] = [];
    const isMentionSearch = trimmedQuery.startsWith('@');

    try {
      if (isMentionSearch) {
        const collaboratorResults = buildCollaboratorResults(
          trimmedQuery,
          allUsers,
          userData,
          isAdmin
        );
        setResults(collaboratorResults.slice(0, 10));
        return;
      }

      const normalizedQuery = trimmedQuery.toLowerCase();

      // Search projects
      if (projects && Array.isArray(projects)) {
        projects.forEach((project: Project) => {
          const title = (project.title || '').toLowerCase();
          const description = (project.description || '').toLowerCase();
          const status = (project.status || '').toLowerCase();

          if (
            title.includes(normalizedQuery) ||
            description.includes(normalizedQuery) ||
            status.includes(normalizedQuery)
          ) {
            const { thumbnailUrl, initial } = getProjectThumbnail(project);
            const excerpt = createExcerpt(project.description);
            const dueDateLabel = formatDueDate(project.finishline);
            const statusMeta = getStatusMetadata(project.status);
            searchResults.push({
              id: `project-${project.projectId}`,
              type: 'project',
              title: project.title || 'Untitled Project',
              projectId: project.projectId,
              excerpt,
              thumbnailUrl,
              thumbnailInitial: initial,
              status: project.status,
              statusLabel: statusMeta.statusLabel,
              statusClassName: statusMeta.statusClassName,
              dueDate: project.finishline,
              dueDateLabel: dueDateLabel,
              highlightParts: buildHighlightParts(project.title || 'Untitled Project', trimmedQuery),
            });
          }
        });
      }

      // Search messages across all projects
      if (projectMessages && typeof projectMessages === 'object') {
        for (const [projectId, messages] of Object.entries(projectMessages)) {
          if (Array.isArray(messages)) {
            messages.forEach((message: Message) => {
              const messageText = (message.text || message.body || message.content || '').toLowerCase();

              if (messageText.includes(normalizedQuery)) {
                const project = projects?.find((p: Project) => p.projectId === projectId);
                const projectTitle = project?.title || 'Unknown Project';

                // Create a snippet of the message
                const fullText = message.text || message.body || message.content || '';
                const index = fullText.toLowerCase().indexOf(normalizedQuery);
                const start = Math.max(0, index - 30);
                const end = Math.min(fullText.length, index + normalizedQuery.length + 30);
                const snippet = toSingleLine(
                  ((start > 0 ? '...' : '') +
                    fullText.slice(start, end) +
                    (end < fullText.length ? '...' : '')).trim()
                );

                searchResults.push({
                  id: `message-${message.messageId || message.optimisticId || Date.now()}`,
                  type: 'message',
                  title: `Message in ${projectTitle}`,
                  subtitle: message.timestamp ? new Date(message.timestamp).toLocaleDateString() : undefined,
                  snippet,
                  projectId,
                  messageId: message.messageId || message.optimisticId,
                  highlightParts: buildHighlightParts(`Message in ${projectTitle}`, trimmedQuery),
                });
              }
            });
          }
        }
      }

      // Sort results: projects first, then messages, then by relevance
      searchResults.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'project' ? -1 : 1;
        }
        // Sort by title relevance (exact matches first)
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const aExact = aTitle === normalizedQuery;
        const bExact = bTitle === normalizedQuery;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return aTitle.localeCompare(bTitle);
      });

      setResults(searchResults.slice(0, 10)); // Limit to 10 results
    } catch (error) {
      console.error('Error performing search:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [projects, projectMessages, allUsers, userData, isAdmin]);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        performSearch(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, performSearch]);

  const handleResultClick = (result: SearchResult) => {
    if (navigatingId) {
      return;
    }

    setNavigatingId(result.id);
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(-1);
    if (onNavigate) {
      onNavigate();
    }

    const finishNavigation = () => {
      setNavigatingId(current => (current === result.id ? null : current));
    };

    void (async () => {
      try {
        if (result.type === 'project' && result.projectId) {
          let fetchPromise: Promise<unknown> | null = null;
          if (fetchProjectDetails) {
            fetchPromise = fetchProjectDetails(result.projectId);
          }
          const project = projects?.find((p: Project) => p.projectId === result.projectId);
          const path = getProjectDashboardPath(
            result.projectId,
            project?.title ?? result.title,
            currentProjectViewSuffix
          );
          navigate(path);
          if (fetchPromise) {
            try {
              await fetchPromise;
            } catch (error) {
              console.error('Error fetching project details before navigation:', error);
            }
          }
        } else if (result.type === 'message' && result.projectId) {
          let fetchPromise: Promise<unknown> | null = null;
          if (fetchProjectDetails) {
            fetchPromise = fetchProjectDetails(result.projectId);
          }
          const project = projects?.find((p: Project) => p.projectId === result.projectId);
          const path = getProjectDashboardPath(result.projectId, project?.title ?? result.title);
          navigate(path, {
            state: { highlightMessage: result.messageId }
          });
          if (fetchPromise) {
            try {
              await fetchPromise;
            } catch (error) {
              console.error('Error fetching project details before navigating to message:', error);
            }
          }
        } else if (result.type === 'collaborator' && result.userId) {
          const collaborator = allUsers.find(user => user.userId === result.userId);
          const slugSource = collaborator
            ? `${collaborator.firstName || ''}-${collaborator.lastName || ''}`.trim()
            : '';
          const fallback = collaborator?.userId || result.userId || 'conversation';
          const slug = slugify(slugSource || fallback);
          navigate(`/dashboard/features/messages/${slug}`);
        }
      } catch (error) {
        console.error('Error navigating from global search:', error);
      } finally {
        finishNavigation();
      }
    })();
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const getResultIcon = (type: 'project' | 'message' | 'collaborator' | string) => {
    switch (type) {
      case 'project':
        return <FolderOpen size={16} />;
      case 'message':
        return <MessageSquare size={16} />;
      case 'collaborator':
        return <User size={16} />;
      default:
        return <FileText size={16} />;
    }
  };

  const isMentionMode = query.trim().startsWith('@');
  const isActive = isOpen || query.trim().length > 0;
  const rootClassName = ['global-search', isActive ? 'global-search--active' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName} ref={searchBoxRef}>
      <div className="global-search-input-container">
        <Search size={16} className="global-search-icon" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder="Find anything..."
          className="global-search-input"
        />
        {query && (
          <button
            onClick={handleClear}
            className="global-search-clear"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && (query || results.length > 0) && (
        <div className="global-search-results">
          {loading && (
            <div className="global-search-result loading">
              <div className="global-search-result-icon">
                <Loader2 size={16} className="global-search-spinner-icon" />
              </div>
              <div className="global-search-result-content">
                <div className="global-search-result-title">Searching...</div>
              </div>
            </div>
          )}
          
          {!loading && results.length === 0 && query && (
            <div className="global-search-result no-results">
              <div className="global-search-result-icon">
                <Search size={16} />
              </div>
              <div className="global-search-result-content">
                <div className="global-search-result-title">
                  {isMentionMode ? 'No collaborators found' : 'No results found'}
                </div>
                <div className="global-search-result-subtitle">
                  {isMentionMode
                    ? 'Invite teammates or check your spelling to start a conversation'
                    : 'Try searching for project names, descriptions, or message content'}
                </div>
              </div>
            </div>
          )}

          {!loading && results.map((result, index) => {
            const isProject = result.type === 'project';
            const isCollaborator = result.type === 'collaborator';
            const titleParts = result.highlightParts && result.highlightParts.length > 0
              ? result.highlightParts
              : [{ text: result.title, isMatch: false }];

            const resultClasses = [
              'global-search-result',
              isProject ? 'project-result' : '',
              isCollaborator ? 'collaborator-result' : '',
              index === selectedIndex ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const isNavigating = navigatingId === result.id;

            return (
              <button
                key={result.id}
                type="button"
                onClick={() => handleResultClick(result)}
                className={resultClasses}
                aria-busy={isNavigating}
              >
                {isProject ? (
                  <Squircle
                    as="div"
                    className="global-search-thumbnail"
                    aria-hidden
                    radius={12}
                  >
                    {result.thumbnailUrl && !imageErrors[result.id] ? (
                      <img
                        src={result.thumbnailUrl}
                        alt=""
                        className="global-search-thumbnail-image"
                        onError={() =>
                          setImageErrors(prev => ({ ...prev, [result.id]: true }))
                        }
                      />
                    ) : (
                      <SVGThumbnail
                        initial={result.thumbnailInitial || '#'}
                        className="global-search-thumbnail-placeholder"
                      />
                    )}
                  </Squircle>
                ) : isCollaborator ? (
                  <div className="global-search-thumbnail collaborator-thumbnail" aria-hidden>
                    {result.thumbnailUrl && !imageErrors[result.id] ? (
                      <img
                        src={result.thumbnailUrl}
                        alt=""
                        className="global-search-thumbnail-image"
                        onError={() =>
                          setImageErrors(prev => ({ ...prev, [result.id]: true }))
                        }
                      />
                    ) : (
                      <div className="global-search-avatar-fallback">
                        {result.thumbnailInitial || '#'}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="global-search-result-icon" aria-hidden>
                    {getResultIcon(result.type)}
                  </div>
                )}
                <div className="global-search-result-content">
                  <div className="global-search-title-row">
                    <div className="global-search-result-title">
                      {titleParts.map((part, partIndex) =>
                        part.isMatch ? (
                          <mark key={`${result.id}-part-${partIndex}`}>{part.text}</mark>
                        ) : (
                          <span key={`${result.id}-part-${partIndex}`}>{part.text}</span>
                        )
                      )}
                    </div>
                    {isProject && result.statusLabel && (
                      <span className={`global-search-status ${result.statusClassName || ''}`}>
                        {result.statusLabel}
                      </span>
                    )}
                  </div>
                  {isProject && result.dueDateLabel && (
                    <div className="global-search-meta">
                      <span className="global-search-meta-label">Due</span>
                      <span className="global-search-meta-value">{result.dueDateLabel}</span>
                    </div>
                  )}
                  {!isProject && result.subtitle && (
                    <div className="global-search-result-subtitle">{result.subtitle}</div>
                  )}
                  {result.snippet && (
                    <div className="global-search-result-snippet">{result.snippet}</div>
                  )}
                  {isProject && result.excerpt && (
                    <div className="global-search-result-excerpt">{result.excerpt}</div>
                  )}
                </div>
                {isNavigating && (
                  <div className="global-search-result-spinner" aria-hidden>
                    <Loader2 size={18} className="global-search-spinner-icon" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;










