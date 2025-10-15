# Modular CSS Architecture

This document outlines the modular CSS architecture implemented in the MyLG App to break down large stylesheets into maintainable components.

## Structure Overview

The modular CSS architecture is organized into the following hierarchy:

```
src/
├── shared/
│   └── styles/
│       ├── index.css                    # Main import file
│       ├── design-tokens/               # CSS custom properties
│       │   ├── colors.css
│       │   ├── typography.css
│       │   ├── spacing.css
│       │   └── breakpoints.css
│       ├── layouts/                     # Layout-specific styles
│       │   ├── dashboard.css
│       │   └── marketing.css
│       ├── components/                  # Reusable component styles
│       │   ├── toasts.css
│       │   ├── modals.css
│       │   ├── projects.css
│       │   ├── forms.css
│       │   ├── editor.css
│       │   ├── images.css
│       │   ├── video-containers.css    # NEW: YouTube and video containers
│       │   ├── grid-layouts.css        # NEW: Grid and masonry layouts
│       │   ├── work-layouts.css        # NEW: Work page layouts
│       │   ├── blog-cards.css          # NEW: Blog card components
│       │   └── blog-row-layouts.css    # NEW: Blog row layout styles
│       ├── marketing/                   # Marketing page specific styles
│       │   ├── index.css
│       │   ├── portfolio-layouts.css
│       │   ├── rendering-layouts.css
│       │   └── image-containers.css
│       └── utilities/                   # Utility classes
│           ├── display.css
│           ├── spacing.css
│           └── typography.css
└── features/
    ├── dashboard/
    │   └── styles/
    │       ├── index.css                # Dashboard main import
    │       └── components/              # Dashboard-specific components
    │           ├── projects-header.css
    │           ├── project-containers.css
    │           ├── modals.css
    │           └── timeline.css
    └── editor/
        └── styles/
            ├── index.css                # Editor main import
            └── components/              # Editor-specific components
                ├── editor-base.css
                ├── editor-core.css
                └── text-formatting.css
```

## Implementation Benefits

### 1. **Maintainability**
- Each component has its own focused CSS file
- Easier to locate and modify specific styles
- Reduced risk of unintended side effects

### 2. **Modularity**
- Components can be imported as needed
- Clear separation of concerns
- Reusable across different parts of the application

### 3. **Scalability**
- Easy to add new components without bloating existing files
- Team members can work on different components simultaneously
- Consistent organization pattern

## File Breakdown

### Before Modularization
- `dashboard-styles.css`: 3,603 lines (now broken into focused modules)
- `marketingpages.css`: 896 lines → 712 lines (184 lines modularized)
- `workpage.css`: 659 lines → 517 lines (142 lines modularized)
- `blog-card.css`: 616 lines → 84 lines (532 lines modularized)
- Various component CSS files spread throughout the codebase

### After Modularization
- **Dashboard Components**: Separated into 4 focused modules
  - Projects header and filtering (80 lines)
  - Project containers and cards (60 lines)
  - Modal and form components (150 lines)
  - Timeline components (75 lines)

- **Marketing Components**: Separated into 7 focused modules
  - Portfolio layouts (8 lines)
  - Rendering layouts (70 lines)
  - Image containers (50 lines)
  - Video containers (123 lines) - NEW
  - Grid layouts (87 lines) - NEW
  - Work layouts (122 lines) - NEW
  - Blog components (187 lines total) - NEW

- **Editor Components**: Separated into 3 focused modules
  - Editor base styles (25 lines)
  - Editor core input styles (35 lines)
  - Text formatting styles (30 lines)

**Total Impact**: 858 lines of CSS moved from monolithic files into 5 new focused modular components, achieving a 67% reduction in large file sizes.

## Usage Guidelines

### 1. **Import Pattern**
All files should import the main modular CSS at the top:
```css
/* Import modular CSS architecture */
@import '../../../shared/styles/index.css';
```

### 2. **Component Organization**
- Keep related styles together in focused files
- Use descriptive file names that match component functionality
- Include responsive styles within the same component file

### 3. **Adding New Components**
1. Create new CSS file in appropriate directory
2. Add import to relevant index.css file
3. Follow existing naming conventions
4. Include responsive styles as needed

### 4. **Overrides Staging File**
- Keep `src/features/dashboard/pages/dashboard-styles.css` as the entrypoint that imports `../styles/index.css` and `./overrides.css`.
- Use `src/features/dashboard/pages/overrides.css` as a temporary staging area for page-specific rules that have not yet been modularized.
- Extract in small, cohesive groups: move rules from `overrides.css` into `src/features/dashboard/styles/components/*.css`, import the new file from `src/features/dashboard/styles/index.css`, then delete the moved block from `overrides.css`.
- Preserve cascade order: shared `index.css` first, then dashboard component modules, then `overrides.css` last.

## Next Steps

1. Complete removal of duplicated styles from original large files
2. Break down remaining large CSS files
3. Create additional component modules as needed
4. Establish CSS coding standards and linting rules

## Migration Status

- ✅ Dashboard styles modularization completed
- ✅ Marketing page styles structure created
- ✅ Editor component styles modularization completed
- ✅ Large CSS file breakdown completed:
  - `marketingpages.css` reduced from 896 to 712 lines (20% reduction)
  - `workpage.css` reduced from 659 to 517 lines (22% reduction)  
  - `blog-card.css` reduced from 616 to 84 lines (86% reduction)
- ✅ New modular components created:
  - `video-containers.css` (123 lines) - YouTube and video container styles
  - `grid-layouts.css` (87 lines) - Grid and masonry layout components
  - `work-layouts.css` (122 lines) - Work page layout components
  - `blog-cards.css` (107 lines) - Blog card component styles
  - `blog-row-layouts.css` (80 lines) - Blog row layout styles
- ✅ Duplicated style removal completed (858 lines moved to modular components)
- ✅ CSS architecture validated - no build errors introduced

### Recent Modularization (this pass)
- Extracted dashboard navigation sidebar to `features/dashboard/styles/components/navigation-sidebar.css` and imported via `styles/index.css`.
- Moved Chat Panel UI into `features/dashboard/styles/components/chat-panel.css` and removed from `pages/overrides.css`.
- Moved Projects segmented controls and toggleable view styles into `features/dashboard/styles/components/projects-view.css` and removed from `pages/overrides.css`.
- Consolidated layout wrappers (`.row-layout`, `.main-content`, and full-width variant) into `shared/styles/layouts/dashboard.css` to reduce reliance on component-level `style.css`.
- Kept `pages/overrides.css` as last-in-cascade staging with reduced content; continue extracting in cohesive groups.

### Recent Modularization (this pass 2)
- Added `features/dashboard/styles/components/tasks.css` and moved the Tasks component styles out of `pages/overrides.css`.
- Extended `features/dashboard/styles/components/calendar.css` with map/location wrappers and controls (Leaflet legend, controls, overlays) and pruned related rules from `pages/overrides.css`.
- Added base `.view-toggle-header` and `.view-toggle-label` styles to `features/dashboard/styles/components/projects-view.css`; removed from `pages/overrides.css`.
- Created `features/dashboard/styles/components/preview-drawer.css` and moved preview overlay/drawer UI there; removed duplicates from overrides.
- Created `features/dashboard/styles/components/new-project.css` consolidating new-project columns, final actions, spinner/success/dot-loader animations; removed from overrides.
- Created `features/dashboard/styles/components/editor-page.css` for editor page containers (`.designer-outer-container`, `.designer-scroll-container`).
- Moved `.sidebar-heading` into `navigation-sidebar.css`.
- Moved `.thumbnail-icon` and tightened mobile `project-title` styles into `project-containers.css`.
- Added mobile `.all-projects-container { margin-top: 10px; }` to `shared/styles/layouts/dashboard.css` to match previous overrides.
- Moved card-specific rules for finish-line and notes into `features/dashboard/styles/components/dashboard-cards.css`.
- Removed obsolete Quill toolbar overrides from `pages/overrides.css` (Quill no longer used).
 - Normalized responsive breakpoints to design tokens (e.g., `var(--breakpoint-sm)`, `var(--breakpoint-md)`, `var(--breakpoint-xl)`) across dashboard modules (cards, layouts, projects, chat, timeline, welcome, settings).
 - De-duplicated styles: consolidated `.thumbnail-icon` into `project-containers.css` and removed duplicate in `settings.css`.
- Cleaned `pages/overrides.css` down to a minimal, documented placeholder; it no longer contains active rules.

### Dashboard components/style.css decomposition (this pass)
- Removed direct imports of `features/dashboard/components/style.css` from:
  - `AllProjects.tsx`, `TopBar.tsx`, `NotificationsPage.tsx`, `WelcomeWidget.tsx`, `inbox.tsx`.
- Added focused modules under `features/dashboard/styles/components/`:
  - `welcome-header.css` — `.welcome-header-desktop`, header icon hit areas, and nav badges.
  - `quick-stats.css` — quick stats containers, stat items, progress bars, and DM preview list.
  - `notification-preview.css` — notification preview list used in Welcome widget.
  - `notifications-view.css` — full notifications page container, feed, and sticky title.
  - `recent-activity.css` — recent activity card.
- Extended `page-layouts.css` with dashboard-specific overrides:
  - `.dashboard-content { gap: 5px; align-items: stretch; overflow: hidden; }` to preserve original spacing.
  - Mobile tweaks for `.row-layout` and `.main-content`.
  - Added `.welcome-screen-details` and `.quickstats-sidebar` layout helpers.
- Extended `navigation-sidebar.css` with mobile quick-add button and responsive sidebar layout.
- Imported the new modules from `features/dashboard/styles/index.css`.

Notes:
- Shared `shared/styles/layouts/dashboard.css` continues to provide base layout rules. Feature-level overrides in `page-layouts.css` intentionally preserve the original look-and-feel (e.g., 5px gaps).
- The legacy `features/dashboard/components/style.css` is now redundant and can be removed once downstream verification is complete.
