# Global Search Feature

## Overview

The Global Search feature provides users with a unified search interface to quickly find projects and messages across their entire workspace. It's seamlessly integrated into the dashboard header and offers powerful search capabilities with an intuitive user experience.

## Features

### 🔍 **Unified Search**
- Search across all projects and project messages from a single interface
- Real-time search results with debounced input (300ms delay)
- Maximum 10 results displayed for optimal performance

### 📁 **Project Search**
Search projects by:
- **Title**: Find projects by name
- **Description**: Search within project descriptions  
- **Status**: Filter by project status (in-progress, completed, etc.)

### 💬 **Message Search**
- Full-text search across all project messages
- Context-aware snippet generation (60 characters with surrounding context)
- Direct navigation to specific messages within projects

### ⌨️ **Keyboard Navigation**
- **Arrow Keys**: Navigate through search results
- **Enter**: Select the highlighted result
- **Escape**: Close search dropdown and clear input
- **Click Outside**: Close search dropdown

### 📱 **Responsive Design**
- Optimized for both desktop and mobile devices
- Adaptive layout that works across different screen sizes
- Touch-friendly interface for mobile users

## Usage

### Basic Search
1. Click on the search input in the dashboard header
2. Type your search query (minimum 1 character)
3. View real-time results organized by type
4. Click on any result to navigate directly to it

### Keyboard Navigation
1. Focus the search input
2. Type your search query
3. Use ↑/↓ arrow keys to highlight results
4. Press Enter to select the highlighted result
5. Press Escape to close and clear the search

### Search Tips
- **Project Search**: Type project names, descriptions, or status values
- **Message Search**: Search for specific words or phrases within project conversations
- **Mixed Results**: Results show projects first, then messages, sorted by relevance
- **Empty State**: Clear guidance when no results are found

## Technical Implementation

### Component Structure
```
src/features/dashboard/components/
├── GlobalSearch.tsx       # Main search component
├── GlobalSearch.css       # Comprehensive styling
└── GlobalSearch.test.tsx  # Test suite
```

### Integration
- Integrated into `WelcomeHeader.tsx` 
- Positioned centrally between navigation and user actions
- Uses existing data providers and navigation patterns

### Dependencies
- **React Hooks**: useState, useEffect, useCallback, useRef
- **Router**: react-router-dom for navigation
- **Icons**: lucide-react for search and result type icons
- **Data**: Existing useData hook and API patterns

### Performance Optimizations
- **Debounced Search**: 300ms delay prevents excessive API calls
- **Result Limiting**: Maximum 10 results for fast rendering
- **Memoized Callbacks**: Optimized re-rendering
- **Click Outside**: Efficient event handling for dropdown closure

## Search Algorithm

### Project Matching
```typescript
const matchesQuery = 
  title.includes(normalizedQuery) || 
  description.includes(normalizedQuery) || 
  status.includes(normalizedQuery);
```

### Message Matching
```typescript
const messageText = (message.text || message.body || message.content || '').toLowerCase();
const matches = messageText.includes(normalizedQuery);
```

### Result Sorting
1. **Type Priority**: Projects appear before messages
2. **Relevance**: Exact matches prioritized over partial matches
3. **Alphabetical**: Secondary sort by title/content

### Snippet Generation
- Extracts 30 characters before and after the match
- Adds ellipsis for truncated content
- Preserves context for better understanding

## Testing

### Test Coverage
- ✅ Renders search input correctly
- ✅ Shows search results when typing
- ✅ Searches projects by title, description, and status
- ✅ Searches message content across projects
- ✅ Handles empty search results
- ✅ Clear button functionality
- ✅ Navigation to projects and messages
- ✅ Keyboard navigation support
- ✅ Escape key closes search

### Running Tests
```bash
npm test -- GlobalSearch.test.tsx
```

### Verification Script
```bash
node verify-global-search.cjs
```

## Browser Support

- **Modern Browsers**: Chrome, Firefox, Safari, Edge (latest versions)
- **Mobile Browsers**: iOS Safari, Chrome Mobile, Samsung Internet
- **Keyboard Navigation**: Full support in all desktop browsers
- **Touch Navigation**: Optimized for mobile touch interfaces

## Accessibility

- **ARIA Labels**: Proper labeling for screen readers
- **Keyboard Support**: Full keyboard navigation
- **Focus Management**: Clear focus indicators
- **Color Contrast**: Meets WCAG guidelines
- **Screen Reader**: Compatible with assistive technologies

## Future Enhancements

### Potential Improvements
- **Advanced Filters**: Filter by date, user, project type
- **Search Operators**: Support for "AND", "OR", quoted phrases
- **Recent Searches**: Remember and suggest recent searches
- **Search Analytics**: Track popular searches and usage patterns
- **Fuzzy Matching**: Support for typos and similar terms
- **Highlight Matches**: Highlight search terms in results

### Performance Improvements
- **Caching**: Cache recent search results
- **Pagination**: Load more results on demand
- **Virtual Scrolling**: Handle large result sets efficiently
- **Background Indexing**: Pre-index content for faster search

## Troubleshooting

### Common Issues

**Search not working:**
- Verify data providers are loaded
- Check network connectivity
- Ensure proper authentication

**No results found:**
- Check search terms for typos
- Verify projects and messages exist
- Try broader search terms

**Slow search performance:**
- Check for large datasets
- Monitor network requests
- Consider result limit adjustments

### Debug Information
- Open browser dev tools
- Check console for error messages
- Verify API responses in Network tab
- Test with simplified search queries

## Contributing

### Development Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Run development server: `npm run dev`
4. Run tests: `npm test`

### Code Style
- Follow existing TypeScript patterns
- Use functional components with hooks
- Maintain responsive design principles
- Include comprehensive tests for new features

### Pull Request Guidelines
- Include tests for new functionality
- Update documentation as needed
- Ensure accessibility compliance
- Test across different devices and browsers