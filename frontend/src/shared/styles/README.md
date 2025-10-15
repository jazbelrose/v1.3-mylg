# Modular CSS Architecture

This project implements a modular CSS architecture to improve maintainability and organization.

## Migration Summary

The previous monolithic `src/shared/css/index.css` (321 lines) has been broken down into this modular structure. The main entry point (`src/shared/styles/index.css`) is now only 29 lines and imports all necessary modules.

## Structure

### Design Tokens (`design-tokens/`)
- `fonts.css` - Font face declarations for custom fonts  
- `colors.css` - Color palette and theme variables
- `typography.css` - Font families, sizes, weights, and line heights
- `spacing.css` - Spacing scale, container widths, and layout spacing
- `breakpoints.css` - Responsive breakpoint definitions

### Base Styles (`base/`)
- `reset.css` - Global resets, base element styles, and normalization

### Layout Styles (`layouts/`)
- `dashboard.css` - Dashboard-specific layout styles
- `marketing.css` - Marketing page layout styles

### Component Styles (`components/`)
- `ui.css` - General UI components (logos, cards, overlays, cursors)
- `date-pickers.css` - Date picker and calendar styling (Ant Design + React Calendar)
- `toasts.css` - Toast notification styles
- `modals.css` - Modal component styles
- `projects.css` - Project-related component styles
- `forms.css` - Form component styles
- `editor.css` - Editor component styles
- `images.css` - Image component styles

### Utility Styles (`utilities/`)
- `display.css` - Display, flex, grid, position, and utility classes
- `spacing.css` - Margin and padding utilities
- `typography.css` - Text styling utilities

## Benefits

1. **Maintainability**: Each module has a single responsibility
2. **Reusability**: Design tokens can be used across components
3. **Performance**: Only load required styles
4. **Scalability**: Easy to add new components and utilities
5. **Organization**: Clear separation of concerns

## Usage

Import the main CSS file in your application:

```typescript
import './shared/styles/index.css';
```

All design tokens, components, and utilities will be available throughout your application.








