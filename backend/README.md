# MYLG Backend v1.2

Serverless backend using AWS Lambda, API Gateway (HTTP API v2), and WebSocket API. Each domain is its own Serverless service for clean isolation and fast iteration.

## Architecture Overview

### HTTP API (v2) with Domain-Based Services
- Router Lambdas per domain with proxy prefixes:
  - `ANY /auth/{proxy+}` → auth service
  - `ANY /projects/{proxy+}` → projects service
  - `ANY /messages/{proxy+}` → messages service
  - `ANY /user{,/...}` → users service

### WebSocket API
- Single `websocket` service handling:
  - `$connect` - Connection establishment
  - `$disconnect` - Connection cleanup
  - `$default` - Default message handler for all WebSocket messages

### Shared Layer
- Lambda Layer (exported) mounted at `/opt/nodejs/utils/` with:
  - CORS helpers for dynamic origin handling
  - Authentication utilities
  - Response formatting helpers

## Deployed Endpoints (Dev Stage)

### HTTP REST APIs
- **Auth Service**: `https://ictxcba2wf.execute-api.us-west-2.amazonaws.com`
  - `/auth/{proxy+}` - Authentication endpoints (login, refresh, logout, etc.)
  - Cognito triggers: preTokenGeneration, cognitoAuthorizer

### HTTP REST APIs
- **Auth Service**: `https://kbsvyidz7f.execute-api.us-west-2.amazonaws.com`
  - `/auth/refresh-token` - Token refresh
  - `/auth/update-roles` - Update user roles

- **Projects Service**: `https://bevnkraeqa.execute-api.us-west-2.amazonaws.com`
  - `/projects` - Projects endpoints
  - `/projects/{proxy+}` - Projects proxy routes
  - `/projects/health` - Health check
  - `/projects/{projectId}/files/delete` - Delete one or more project files
  - `/budgets/{proxy+}` - Budget endpoints

- **User Service**: `https://gy8dq7w0a3.execute-api.us-west-2.amazonaws.com`
  - `/userProfiles` - User profiles endpoints
  - `/userProfiles/{proxy+}` - User profiles proxy routes
  - `/userProfilesPending/{proxy+}` - Pending user profiles
  - `/invites/{proxy+}` - Invitation endpoints
  - `/sendProjectInvitation` - Send project invitations
  - `/postProjectToUserId` - Post project to user
  - `/user/health` - Health check

- **Messages Service**: `https://uzcx04lrr9.execute-api.us-west-2.amazonaws.com`
  - `/messages` - Messages endpoints
  - `/messages/{proxy+}` - Messages proxy routes
  - `/messages/health` - Health check

### WebSocket API
- **WebSocket Service**: `wss://hhgvsv3ey7.execute-api.us-west-2.amazonaws.com/dev`
  - Single endpoint for all WebSocket operations
  - Routes: `$connect`, `$disconnect`, `$default`
  - Functions: `onConnect`, `onDisconnect`, `onDefault`

### Cognito User Pool
- **User Pool ID**: `us-west-2_HnSYpFGkd`
- **User Pool Name**: `mylg-dev-users-west2`
- **Client ID**: `3327sdro74vci7hbqsn5g74fvh`

## Key Benefits

- **Blast radius containment** - Each domain (auth/projects/messages/users) is isolated
- **WebSocket isolation** - WS logic separated from HTTP APIs
- **Shared CORS handling** - Consistent CORS across all endpoints
- **Fast cold starts** - Minimal dependencies per function

## Project Structure

```
backend/
├── package.json                 # Dev dependencies and convenience scripts
├── serverless.common.yml        # Shared env/config across services
├── shared-layer/                # Lambda Layer (exported ARN)
│   └── serverless.yml
├── auth/                        # Auth service (Cognito triggers, authorizer, routes)
│   └── serverless.yml
├── projects/                    # Projects domain router + handlers
│   └── serverless.yml
├── messages/                    # Messages domain router + handlers
│   └── serverless.yml
├── user/                        # Users domain router + handlers
│   └── serverless.yml
└── websocket/                   # WebSocket service (connect/disconnect/default handlers)
    ├── onConnect.mjs            # WebSocket connection handler
    ├── onDisconnect.mjs         # WebSocket disconnection handler
    ├── default.mjs              # Default WebSocket message handler
    └── serverless.yml
```

## Prerequisites

- Node.js 18+
- Serverless Framework v3 (`npm i -g serverless`)
- AWS credentials configured for your target account

## Environment Variables

- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS
- Others are centrally defined in `backend/serverless.common.yml` and imported per service.

## Deployment

Recommended: orchestrated deploy from `backend/` (deploys in the correct order).

```bash
cd backend
# dev
npm run deploy:dev
# prod
npm run deploy:prod

# remove dev stacks
npm run remove:dev
```

Alternative: manual per‑service deploy when iterating on a single domain.

```bash
cd backend/shared-layer && sls deploy --stage dev
cd ../projects && sls deploy --stage dev
```

## Local Development

Run `serverless-offline` from the specific service you’re working on.

```bash
cd backend/projects
npm install
serverless offline
```

## API Routes

### Authentication (`/auth/*`)
- `POST /auth/login` - User login
- `POST /auth/refresh` - Token refresh
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user

### Projects (`/projects/*`)
- `GET /projects/list` - List projects
- `POST /projects` - Create project
- `GET /projects/{id}` - Get project
- `PATCH /projects/{id}` - Update project
- `DELETE /projects/{id}` - Delete project
- `GET /projects/{id}/budget` - Get project budget
- `PATCH /projects/{id}/budget` - Update project budget

### Messages (`/messages/*`)
- `GET /messages/conversations` - List conversations
- `POST /messages/conversations` - Create conversation
- `GET /messages/conversations/{id}` - Get conversation
- `GET /messages/conversations/{id}/messages` - Get messages
- `POST /messages/conversations/{id}/messages` - Send message
- `PATCH /messages/{id}` - Update message
- `DELETE /messages/{id}` - Delete message

### WebSocket
- Connection with auth token via query string
- Real-time message delivery
- Connection management

## Templates & DBS (White‑Label)

- Minimal by design: this repo intentionally avoids checking in large CloudFormation templates to keep the core codebase uncluttered.
- Serverless Framework synthesizes CloudFormation under the hood, so an explicit `AWSTemplateFormatVersion` is not required for current services.
- Optional DBS (Database Stack) will be introduced later, primarily for white‑label deployments. It will live in its own service or template to preserve separation of concerns.

Suggested layout when DBS is needed (example only, not yet included):

```
backend/
└── dbs/
    ├── template.yml   # CloudFormation/SAM template for DB resources
    └── README.md      # Usage and rollout notes per tenant/brand
```

Template header example for DBS (when added):

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: MYLG Database Stack (optional, white‑label)
# Resources:
#   ... DynamoDB tables, indexes, streams, etc.
```

This keeps DBS fully optional: only teams enabling white‑label flows pull in the DBS stack; everyone else avoids extra resources and config noise.
