# Fabric Canvas Architecture

The Fabric canvas system replaces the legacy Lexical/Yjs editor with a lightweight Fabric.js runtime backed by a fully serverless data path.

## Overview

- **Client Rendering** — The dashboard mounts `<CollaborativeFabricCanvas>` which instantiates a `fabric.Canvas`, exposes basic shape/text tooling, and streams JSON snapshots.
- **Realtime Transport** — Each canvas connects to `VITE_FABRIC_WS_URL` (API Gateway WebSocket). Messages are JSON payloads (`sync`, `presence`, `ping`) handled by Lambda.
- **Persistence** — Canvas snapshots are persisted via `PUT /projects/{projectId}/pages/{pageId}` to DynamoDB using a Lambda resolver.
- **Export** — A dedicated Lambda renders PDF/static-site exports using the stored snapshot and returns either a signed URL or inline Data URI.

## Data Model

| Table | Key | Purpose |
|-------|-----|---------|
| `FabricDocuments` | `documentId` | Stores the latest snapshot + metadata |
| `FabricConnections` | `connectionId` (GSI: `documentId`) | Tracks active WebSocket clients for broadcast |

Each documentId is namespaced as `projectId#pageId` ensuring deck pages and moodboards can share the same infrastructure.

## Message Flow

1. Client opens WebSocket `?projectId=...&pageId=...&actorId=...`.
2. `$connect` Lambda records the connection and queries Dynamo for the latest revision.
3. Client emits `sync` with the current Fabric snapshot.
4. Lambda upserts the snapshot in `FabricDocuments`, increments revision, and fans out `update` messages to all other listeners via `ApiGatewayManagementApi`.

## Export Workflow

1. Client requests `POST /export` with desired format (`pdf` or `static-site`).
2. Lambda fetches the snapshot, renders a PDF via `pdfkit` or builds a static HTML bundle, and returns a temporary download payload.
3. The UI downloads the Data URI or opens the static site URL.

## Operational Considerations

- **Idempotency** — Snapshot writes are revision-gated to avoid stomping concurrent updates.
- **Scaling** — The functions are stateless and rely on DynamoDB pay-per-request. Horizontal scale is handled by API Gateway fan-out.
- **Security** — All requests require Cognito-backed IAM authorisation (to be wired via custom authorizers in production).
