# Copilot Instructions for MYLG! App

This document provides repository-specific guidance for GitHub Copilot to assist with development on the MYLG! (Making You Look Good) application.

## Project Overview

MYLG! is a collaborative project management platform for designers, builders, and clients. The application uses a serverless architecture with:

- **Frontend**: React 18 + TypeScript + Vite, with Lexical editor for real-time collaboration
- **Backend**: AWS Serverless (Lambda, API Gateway, DynamoDB, S3, Cognito)
- **Real-time**: WebSocket API for messaging and collaborative editing via Yjs

## Architecture

### Backend Structure

The backend uses domain-based Serverless services for isolation:

- **HTTP API v2** with domain routers:
  - `/auth/*` - Authentication service (Cognito integration)
  - `/projects/*` - Projects and budgets service
  - `/messages/*` - Messaging service
  - `/user/*` - User profiles and invitations service

- **WebSocket API** for real-time features:
  - Connection management (`$connect`, `$disconnect`)
  - Message routing (`$default`)

- **Shared Layer** (`/opt/nodejs/utils/`):
  - CORS helpers with centralized configuration
  - Authentication utilities
  - Response formatting helpers

### Frontend Structure

- `src/` - Application source code
- `src/components/` - Reusable React components
- `src/pages/` - Route-level page components
- `src/shared/` - Shared utilities and styles
- `src/types/` - TypeScript type definitions
- Uses path aliases: `@/*` maps to `src/*`

## Key Technical Decisions (from ADRs)

### ADR-001: CDN File URL Strategy
- Use single CloudFront distribution: `https://cdn.mylg.app`
- Public assets: `https://cdn.mylg.app/public/{tenantId}/{entity}/{objectKey}`
- Secured assets: `https://cdn.mylg.app/secure/{tenantId}/{entity}/{objectKey}` (signed URLs)
- Store canonical CloudFront paths in metadata, NOT raw S3 URLs

### ADR-002: Direct Message Conversation IDs
- Format: `dm#<lowerUserId>___<higherUserId>`
- Always sort user IDs lexicographically before joining
- Use three underscores (`___`) as delimiter
- Ensures deterministic, collision-free conversation identifiers

### ADR-003: CORS Configuration
- Centralized in `serverless.common.yml` via shared layer
- Environment variables: `ALLOWED_ORIGINS`, `CORS_WILDCARD_HOSTS`
- Use shared helper `resolveCorsOrigin(event)` in all services
- Never define service-specific CORS configs

## Development Workflows

### Backend Development

```bash
cd backend

# Deploy all services (dev)
npm run deploy:dev

# Deploy single service
cd backend/projects
serverless deploy --stage dev

# Local development with serverless-offline
cd backend/projects
serverless offline

# Run tests
npm test
```

### Frontend Development

```bash
cd frontend

# Development server
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Build
npm run build

# Tests
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:ui       # UI mode
```

## Coding Standards

### TypeScript
- Strict mode disabled (`"strict": false` in tsconfig.json)
- Use ESNext target and module resolution
- Path aliases: Import from `@/` instead of relative paths
- Skip lib checks enabled

### React
- Use functional components with hooks
- Follow React Hooks rules (enforced by eslint)
- Use React 18 JSX transform (`jsx: "react-jsx"`)
- Component naming: PascalCase for components, camelCase for hooks

### Backend (Node.js/Lambda)
- Use ES modules (`"type": "module"` in package.json)
- File extensions: `.mjs` for ES modules, `.ts` for TypeScript
- Each Lambda should be focused and lightweight
- Use shared layer utilities for cross-cutting concerns

### File Organization
- Keep components focused and single-responsibility
- Co-locate styles with components when component-specific
- Shared styles go in `frontend/src/shared/styles/`
- Backend: One serverless service per domain

## Testing

### Frontend Tests
- Test framework: Vitest + React Testing Library
- Test files: `*.test.ts`, `*.test.tsx`
- Setup file: `vitest.setup.ts`
- Run tests before committing changes

### Backend Tests
- Run: `npm test` from backend directory
- Uses tsx for running TypeScript tests
- Currently focuses on specific modules (e.g., cal/ics)

## Dependencies

### Adding New Dependencies

**Frontend:**
```bash
cd frontend
npm install <package-name>      # Production
npm install -D <package-name>   # Development
```

**Backend:**
```bash
cd backend
npm install <package-name>      # Shared across services
# OR install in specific service directory
cd backend/projects
npm install <package-name>
```

### Key Libraries

**Frontend:**
- UI: React 18, Ant Design, Framer Motion
- Routing: React Router DOM v7
- State: React hooks (no Redux)
- Editor: Lexical with Yjs for collaboration
- Auth: AWS Amplify Auth
- Storage: AWS Amplify Storage

**Backend:**
- Framework: Serverless Framework v3
- AWS SDK: v3 (modular)
- Build: serverless-esbuild
- Local dev: serverless-offline

## Common Patterns

### Lambda Handler Pattern
```javascript
export const handler = async (event) => {
  try {
    // Use shared CORS helper
    const origin = resolveCorsOrigin(event);
    
    // Business logic
    const result = await processRequest(event);
    
    // Use shared response formatter
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

### React Component Pattern
```typescript
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import styles from './Component.module.css';

interface ComponentProps {
  title: string;
  onAction?: () => void;
}

export const Component: React.FC<ComponentProps> = ({ title, onAction }) => {
  const { user } = useAuth();
  
  return (
    <div className={styles.container}>
      <h1>{title}</h1>
      {/* Component implementation */}
    </div>
  );
};
```

## Security Considerations

1. **Authentication**: All protected routes use AWS Cognito JWT tokens
2. **CORS**: Use centralized CORS configuration from shared layer
3. **File Access**: Use signed CloudFront URLs for private assets
4. **Environment Variables**: Never commit secrets; use AWS Systems Manager or .env files (gitignored)
5. **Input Validation**: Validate all user inputs on both frontend and backend

## Deployment

### Environments
- **dev**: Development environment for testing
- **prod**: Production environment

### Deployment Order
When deploying multiple services, follow this order:
1. Shared layer
2. Auth service
3. Other HTTP services (projects, messages, user)
4. WebSocket service

Use orchestration script: `npm run deploy:dev` from backend directory

## Documentation

- Main READMEs: `/backend/README.md`, `/frontend/README.md`
- ADRs: `/docs/adrs/` - Architectural Decision Records
- Editor docs: See frontend README for Lexical editor architecture links

## Common Issues & Solutions

1. **CORS errors**: Check `ALLOWED_ORIGINS` in `serverless.common.yml`
2. **WebSocket disconnects**: Verify auth token in query string
3. **Type errors**: Run `npm run typecheck` to find TypeScript issues
4. **Build failures**: Clear node_modules and reinstall dependencies

## Best Practices

1. **Make minimal changes**: Only modify what's necessary
2. **Test early**: Run linters, type checker, and tests before committing
3. **Follow patterns**: Use existing code patterns from the repository
4. **Document decisions**: Update ADRs for architectural changes
5. **Keep services isolated**: Backend services should be independent
6. **Use shared utilities**: Leverage shared layer for common functionality
7. **Type safety**: Add TypeScript types for new APIs and components
8. **Error handling**: Always include proper error handling and logging

## Contribution Workflow

1. Create a feature branch from `main`
2. Make focused, incremental changes
3. Run linters and tests: `npm run lint && npm test`
4. Commit with clear, descriptive messages
5. Push and create a pull request
6. Ensure CI checks pass

## Helpful Commands

```bash
# Check git status
git status

# View recent commits
git log --oneline -10

# Run frontend linter
cd frontend && npm run lint

# Run frontend tests
cd frontend && npm test

# Run backend tests  
cd backend && npm test

# Type check frontend
cd frontend && npm run typecheck

# Build frontend
cd frontend && npm run build

# Deploy backend to dev
cd backend && npm run deploy:dev
```
