# Fabric Canvas Summary

- **What changed** — The dashboard now uses Fabric.js for every deck page, brief, and moodboard surface. Lexical, Yjs, and the EC2-based WebSocket server have been removed.
- **Realtime stack** — API Gateway WebSocket + Lambda for connection/origin routing, DynamoDB for persistence, and ApiGatewayManagementApi for fan-out.
- **Persistence** — HTTP API endpoints expose CRUD operations for project/page snapshots with revision-aware upserts.
- **Exports** — Lambda renders PDFs via `pdfkit` and produces zipped static sites for handoff. Clients receive either base64 data URIs or temporary URLs.
- **Client experience** — `<CollaborativeFabricCanvas>` wraps Fabric.js, exposes essential drawing/text tools, and debounces local mutations before broadcasting and persisting.
- **Migration note** — Legacy Lexical JSON is still parsed by Global Search for backwards compatibility, but new edits are saved as Fabric snapshots.
