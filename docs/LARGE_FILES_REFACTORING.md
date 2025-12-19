# Large Monolithic Files - Refactoring Reference

This document provides a quick reference for the large files identified in the codebase that should be broken down for better maintainability. For detailed analysis and recommendations, see [ADR-004](./adrs/ADR-004.md).

## Quick Summary

The following files have been identified as monolithic and difficult to maintain:

### Critical Priority (>1,000 lines)

1. **ProjectMessagesThread.tsx** - 1,272 lines
   - Location: `frontend/src/dashboard/features/messages/`
   - Main Issues: Mixed concerns (UI, WebSocket, file handling)
   - Recommended Split: 7+ files (components, hooks, utils)

2. **QuickCreateTaskModal.tsx** - 1,156 lines
   - Location: `frontend/src/dashboard/home/components/`
   - Main Issues: Large form with utilities, location handling
   - Recommended Split: 8+ files (components, hooks, utils)

3. **CreateLineItemModal.tsx** - 1,139 lines
   - Location: `frontend/src/dashboard/project/features/budget/components/`
   - Main Issues: Massive form with complex validation
   - Recommended Split: 10+ files (components, hooks, constants, utils)

4. **InvoicePreviewContent.tsx** - 1,137 lines
   - Location: `frontend/src/dashboard/project/features/budget/components/`
   - Main Issues: Complex rendering, print logic, formatting
   - Recommended Split: 8+ files (components, hooks, utils)

5. **api.ts** - 1,115 lines
   - Location: `frontend/src/shared/utils/`
   - Main Issues: 69 exports (types, functions, constants), mixed concerns
   - Recommended Split: ~20 files organized by domain (types, clients, utils, config)
   - Based on detailed breakdown: 8 type files + 8 client files + 4 utility files

6. **HeaderStats.tsx** - 1,114 lines
   - Location: `frontend/src/dashboard/project/features/budget/components/`
   - Main Issues: Complex calculations embedded in component
   - Recommended Split: 6+ files (components, hooks, utils)

7. **CalendarSurface.tsx** - 1,104 lines
   - Location: `frontend/src/dashboard/project/features/calendar/components/`
   - Main Issues: Calendar grid, events, drag-and-drop mixed
   - Recommended Split: 8+ files (components, hooks, utils)

8. **Messages.tsx** - 1,026 lines
   - Location: `frontend/src/dashboard/features/messages/`
   - Main Issues: Thread management mixed with UI
   - Recommended Split: 6+ files (components, hooks, utils)

### Medium Priority (800-1,000 lines)

9. **useCalendarController.tsx** - 992 lines
   - Location: `frontend/src/dashboard/project/components/Shared/calendar/`
   - Main Issues: Massive hook with too many responsibilities
   - Recommended Split: 5+ hooks

10. **Collaborators.tsx** - 872 lines
    - Location: `frontend/src/dashboard/home/components/`
    - Main Issues: Search, invites, display all mixed
    - Recommended Split: 7+ files (components, hooks, utils)

## Refactoring Patterns

### For Large Components
```
ComponentName/
├── index.tsx              (main component, <300 lines)
├── components/            (sub-components)
├── hooks/                 (custom hooks)
├── utils/                 (utility functions)
└── constants/             (configuration, options)
```

### For Large Utility Files (like api.ts)
```
utilityName/
├── index.ts               (re-exports for compatibility)
├── types/                 (TypeScript types)
├── clients/               (organized by domain)
├── utils/                 (helper functions)
└── config/                (configuration)
```

## Best Practices

1. **Target Size**: Keep files under 300 lines for components, 200 for hooks
2. **One Responsibility**: Each file should have a single, clear purpose
3. **Extract Early**: Move utilities and types out first (non-breaking)
4. **Maintain Compatibility**: Use index.ts re-exports during transition
5. **Test First**: Add tests before refactoring
6. **Incremental Changes**: Refactor one file at a time

## ESLint Configuration Recommendation

To prevent future large files, add to `.eslintrc`:

```json
{
  "rules": {
    "max-lines": ["warn", {
      "max": 300,
      "skipBlankLines": true,
      "skipComments": true
    }],
    "max-lines-per-function": ["warn", {
      "max": 50,
      "skipBlankLines": true,
      "skipComments": true
    }]
  }
}
```

## Next Steps

1. Review ADR-004 for detailed refactoring plans
2. Prioritize which files to refactor first
3. Create tracking issues for each refactoring task
4. Schedule refactoring work into sprint planning
5. Set up linting rules to prevent future large files

## Estimated Effort

- **api.ts refactoring**: 3-5 days (high complexity, many dependencies)
- **Component refactoring** (each): 2-3 days
- **Hook refactoring**: 1-2 days
- **Total estimated effort**: 25-35 developer days

## Benefits

- **Maintainability**: Easier to find and modify specific functionality
- **Testability**: Smaller units easier to test in isolation
- **Collaboration**: Reduced merge conflicts
- **Onboarding**: Faster for new developers to understand code
- **Reusability**: Extracted components/hooks available elsewhere
- **Performance**: Better tree-shaking, smaller bundles
