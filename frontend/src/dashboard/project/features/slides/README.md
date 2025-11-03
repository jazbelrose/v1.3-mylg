# Slides Editor Feature

A Google Slides-style multi-slide interface for the Lexical editor.

## Overview

The Slides Editor allows users to create and manage multiple slides within a project, each with its own Lexical editor content. Features include:

- **Multi-slide management**: Create, duplicate, delete, and reorder slides
- **Real-time collaboration**: Each slide has its own Yjs room for collaborative editing
- **Thumbnail generation**: Automatic thumbnail preview of each slide
- **Drag-and-drop reordering**: Intuitive sidebar for slide navigation
- **Auto-save**: Content is automatically saved to the backend
- **Feature flags**: Can be enabled/disabled per project

## Usage

### Accessing Slides Mode

Navigate to `/projects/:projectId/:projectName/slides` or use the "Slides" tab in the project navigation.

### Creating Slides

1. Click the "+ New Slide" button in the sidebar
2. The new slide will be created and automatically selected
3. Start editing content in the Lexical editor

### Editing Slides

1. Click on any slide thumbnail in the sidebar to switch to it
2. Edit content using the full-featured Lexical editor
3. Changes are auto-saved after 2 seconds of inactivity

### Reordering Slides

1. Drag a slide thumbnail in the sidebar
2. Drop it in the desired position
3. Order is automatically saved

### Toolbar Actions

- **Duplicate**: Create a copy of the current slide
- **Delete**: Remove the current slide (requires at least 2 slides)
- **Export**: Export slides (coming soon)
- **Mic**: Voice input (if enabled)
- **Save**: Manually trigger save

## Architecture

### Components

- **SlidesPage**: Main container component
- **SlidesSidebar**: Sidebar with slide thumbnails and navigation
- **SlideEditor**: Wrapper around LexicalEditor for individual slides
- **SlideToolbar**: Action buttons and save status indicator

### Hooks

- **useSlideProvider**: Manages Yjs provider for a specific slide
- **useSlidePersistence**: Handles auto-save and debouncing

### Libraries

- **lib/yjs.ts**: Yjs connection management (one room per slide)
- **lib/thumbnails.ts**: Thumbnail generation using html2canvas
- **lib/featureFlags.ts**: Feature flag utilities

## Data Model

```typescript
interface Slide {
  id: string;
  title?: string;
  thumbnail?: string;
  order?: number;
  content?: string; // Lexical JSON
}

interface Project {
  // ... existing fields
  slides?: Slide[];
}
```

## Backend Integration

Slides are stored in the `slides` field of the Project model. The existing `PATCH /projects/:projectId` endpoint is used to update slides.

## Real-time Collaboration

Each slide uses its own Yjs room with the ID format `slide-{slideId}`. When switching slides:

1. The previous slide's Yjs connection is disconnected
2. A new connection is established for the active slide
3. IndexedDB persistence ensures offline-first editing

## Thumbnail Generation

Thumbnails are generated using html2canvas:

1. After content changes (debounced by 3 seconds)
2. Captures the editor content as PNG
3. Stored as data URL (S3 upload coming soon)
4. Displayed in the sidebar

## Feature Flags

```typescript
// Check if slides mode is enabled
if (isSlidesMode(projectId)) {
  // Show slides UI
}

// Enable slides mode
enableSlidesMode(projectId);

// Disable slides mode
disableSlidesMode(projectId);
```

## Future Enhancements

- [ ] Speaker notes for each slide
- [ ] PDF export with jsPDF
- [ ] Slide templates
- [ ] Presentation mode
- [ ] Slide transitions
- [ ] S3 upload for thumbnails
