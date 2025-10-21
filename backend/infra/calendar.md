# Calendar Feed Infrastructure Notes

- **Service**: Deploy via new `backend/cal/serverless.yml` service using the shared environment variables from `serverless.common.yml`.
- **Runtime**: Node.js 20.x with `serverless-esbuild` bundling `src/cal/icsHandler.ts`.
- **Route**: HTTP API `GET /cal/{projectId}/{token}.ics` (no authorizer; security handled by opaque token).
- **Tables Required**:
  - `CALENDAR_TOKENS_TABLE` (hash key: `tokenHash`) for per-user/project access control.
  - `PROJECTS_TABLE`, `EVENTS_TABLE`, `TASKS_TABLE` for metadata, events, and tasks.
- **Caching**: API Gateway responses leverage `ETag`/`Last-Modified`; CloudFront/fronting CDN should respect 5 minute max-age.
- **IAM**: Function requires read access to the four tables above (including GSIs for events/tasks if configured).
