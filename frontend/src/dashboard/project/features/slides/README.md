# Slides Feature - Google Slides-Style Multi-Slide Interface

## Overview

This feature converts the single Lexical editor into a Google Slides-style multi-slide interface with real-time collaboration, drag-and-drop reordering, and PDF export capabilities.

## Architecture

### Data Model

Each project can have a `slides` array containing slide objects:

```typescript
interface Slide {
  id: string;
  title?: string;
  thumbnail?: string;
  content?: string; // Lexical JSON
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface Project {
  // ... other fields
  slidesMode?: boolean; // Feature flag
  slides?: Slide[];
}
```

### Real-time Collaboration

- **One Yjs room per slide**: Each slide has its own WebSocket room for collaboration
- **Room ID format**: `{projectId}-slide-{slideId}`
- **Automatic connection management**: Only the active slide is connected; switching slides disconnects the previous room and connects to the new one
- **Offline support**: IndexedDB persistence for each slide

### Components

#### SlidesPage
Main container component that orchestrates the entire slides interface.
- Manages slide state and active slide selection
- Handles slide CRUD operations (Create, Read, Update, Delete)
- Coordinates saves and thumbnail generation

#### SlidesSidebar
Left sidebar showing slide thumbnails with drag-and-drop reordering.
- Displays numbered thumbnails
- Supports drag-and-drop to reorder slides
- Shows active slide with highlighting
- Add new slide button

#### SlideEditor
Wrapper around the Lexical editor for a single slide.
- Mounts Lexical editor with slide-specific content
- Handles content changes and triggers debounced saves
- Isolated from other slides

#### SlideToolbar
Top toolbar with slide management actions.
- New Slide
- Duplicate Slide
- Delete Slide
- Export to PDF
- Voice Input (optional)
- Save status indicator

### Hooks

#### useSlideProvider
Manages the Yjs WebSocket provider for a specific slide.
- Creates and manages WebSocket connection
- Handles IndexedDB persistence
- Automatic cleanup on slide change or unmount

#### useSlidePersistence
Manages debounced saving of slides to the backend.
- 2-second debounce on saves
- Tracks slide content changes
- Updates project via `updateProjectFields`

### Styling

Dark UI theme inspired by Google Slides:
- Dark background (#1a1a1a, #252525)
- Subtle borders and shadows
- Smooth transitions and hover effects
- Responsive design for mobile/tablet

## Usage

### Accessing Slides

Navigate to: `/dashboard/projects/:projectId/:projectName/slides`

Or click the "Slides" tab in project navigation (visible to admin/designer roles).

### Managing Slides

1. **Create**: Click "New" in toolbar or "+" button in sidebar
2. **Edit**: Click on a slide thumbnail to make it active
3. **Duplicate**: Select a slide and click "Duplicate" in toolbar
4. **Delete**: Select a slide and click "Delete" (can't delete last slide)
5. **Reorder**: Drag and drop thumbnails in the sidebar

### Exporting

Click "Export" in the toolbar to generate a PDF of all slides.

## Backend Integration

The backend already supports slides through the `patchProject` endpoint:

```javascript
PATCH /projects/:projectId
{
  "slides": [
    { "id": "...", "title": "...", "content": "...", ... }
  ]
}
```

The `buildUpdate` function in `backend/projects/router.mjs` handles dynamic fields, so slides are automatically saved to DynamoDB.

## Features

- ✅ Multi-slide interface with Google Slides-style UI
- ✅ Real-time collaboration (one Yjs room per slide)
- ✅ Drag-and-drop slide reordering
- ✅ Thumbnail generation with html2canvas
- ✅ PDF export with jspdf
- ✅ Offline support with IndexedDB
- ✅ Debounced auto-save (2s)
- ✅ Dark theme UI
- ✅ Responsive design
- ⏳ Voice input (placeholder)
- ⏳ Speaker notes (optional)

## Dependencies

- `html2canvas@^1.4.1` - Thumbnail generation
- `jspdf@^3.0.2` - PDF export (secured version)
- `yjs@^13.6.27` - CRDT for real-time collaboration
- `y-websocket@^3.0.0` - WebSocket provider for Yjs
- `y-indexeddb@^9.0.12` - Offline persistence
- `lucide-react@^0.540.0` - Icons

## Security

- jsPDF updated to v3.0.2 to address CVE vulnerabilities
- No vulnerable dependencies

## Future Enhancements

- [ ] Speaker notes panel below editor
- [ ] Slide transitions/animations
- [ ] Presentation mode
- [ ] Slide templates
- [ ] Master slides/themes
- [ ] Comments and annotations per slide
- [ ] Version history per slide
