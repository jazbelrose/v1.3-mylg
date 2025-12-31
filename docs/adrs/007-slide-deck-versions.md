# ADR-007: Slide Deck Versions

## Status
Proposed

## Context
Users need the ability to maintain multiple versions of a slide deck within a single project. Use cases include:
- Client-facing versions vs internal working drafts
- Versioning for approval workflows (v1, v2, client-approved, etc.)
- Isolated editing environments for different stakeholders

## Decision

### Data Model
Store deck versions as separate entities under the same project, using full snapshots (not diff-based patches). Each version contains its own complete copy of slides.

```typescript
interface DeckVersion {
  versionId: string;        // UUID
  projectId: string;        // Parent project
  name: string;             // User-defined name (e.g., "Client v3", "Internal Draft")
  status: 'draft' | 'approved' | 'archived';
  isDefault: boolean;       // Default version to load
  isClientDefault: boolean; // Default for client role users
  allowedRoles: Role[];     // Which roles can view/edit this version
  createdBy: string;        // userId
  createdAt: string;        // ISO timestamp
  updatedAt: string;        // ISO timestamp
  notes?: string;           // Optional description
  slides: Slide[];          // Full snapshot of slides
}
```

### Storage
- New DynamoDB table: `DeckVersions`
  - PK: `projectId`
  - SK: `versionId`
  - GSI: `projectId-isDefault-index` for quick default lookup

### API Endpoints
```
GET    /projects/:projectId/deck-versions
POST   /projects/:projectId/deck-versions
PATCH  /projects/:projectId/deck-versions/:versionId
DELETE /projects/:projectId/deck-versions/:versionId
POST   /projects/:projectId/deck-versions/:versionId/set-default
POST   /projects/:projectId/deck-versions/:versionId/duplicate
```

### Yjs Room Naming
Rooms include version context: `slide-{projectId}-{versionId}-{slideId}`

### UI Location
- Version dropdown appears near the "Saved" indicator in SlideToolbar
- "Manage Versions..." link opens modal for full CRUD operations

### Permission Rules
1. Admins/designers see all versions
2. Clients only see versions where `allowedRoles` includes 'client'
3. Clients default to the version marked `isClientDefault: true`
4. Delete protection: Cannot delete the last version or default version

### Migration Strategy
- Existing projects with slides will auto-create a "Main" version on first access
- Slides array on Project remains for backward compatibility during migration

## Consequences

### Positive
- Clean separation of version data
- No breaking changes to existing slide functionality
- Role-based access built-in from the start
- Full snapshots simplify sync and avoid patch complexity

### Negative
- Storage duplication (acceptable trade-off for simplicity)
- Need to manage version-specific Yjs rooms
- Migration script needed for existing projects

## Implementation Notes
- Start with backend API + data model
- Frontend version selector comes next
- Client visibility filters handled in both backend (list) and frontend (dropdown)
