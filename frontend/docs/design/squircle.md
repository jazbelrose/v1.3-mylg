# Squircle Corners

The squircle utilities provide a consistent corner treatment across the app that keeps the original 20px rounded look but smooths the inflection where straight edges meet. The approach is built around a reusable React wrapper and a lightweight CSS helper so teams can pick the right tool depending on whether they need dynamic measurements or static media styling.

## Components

### `<Squircle>` wrapper

- **Location:** `src/shared/ui/Squircle.tsx`
- **Purpose:** Wraps any block element, measures its size, and applies an SVG mask generated with `getSquirclePath`.
- **Props:**
  - `as`: host element/component. Defaults to `div`.
  - `radius`: numeric radius in pixels (default `20`).
  - `smoothing`: 0–1 float that controls how square the corner becomes (default `0.6`).
  - `cornerRadii`: optional overrides for each corner. Use `top`/`bottom` (or explicit `topLeft`, etc.) to introduce subtle asymmetry for cards and pills. Leave undefined for forms, modals, and buttons so they stay symmetric.
  - `className`, `style`, and `children` pass straight through to the host.
- **Fallbacks:** When masks or `ResizeObserver` are unavailable, the wrapper falls back to `border-radius` with `overflow: hidden` so older browsers still render rounded corners.
- **Usage:**

  ```tsx
  import Squircle from '@/shared/ui/Squircle';

  <Squircle as="button" radius={24} smoothing={0.5} className="primary-button">
    Action
  </Squircle>;
  ```

  For card surfaces and pill toggles, pass a slightly larger `top` radius and a slightly smaller `bottom` radius (2–4px difference works well):

  ```tsx
  <Squircle
    as="section"
    radius={24}
    cornerRadii={{ top: 26, bottom: 22 }}
    className="dashboard-card"
  >
    ...
  </Squircle>
  ```

### CSS helper class

- **Location:** `src/shared/ui/squircle/squircle.css`
- **Usage:** Add the `.squircle` class for static media or markup where a wrapper component would be overkill.
- **Customization:** Override the CSS variables `--shape-radius` and `--shape-smoothing` locally. For example:

  ```css
  .avatar.squircle {
    --shape-radius: 16px;
    --shape-smoothing: 0.7;
  }
  ```

- **Fallback:** Uses `border-radius` by default, and switches to a `clip-path` powered squircle when the browser supports it.

## Utility function

`getSquirclePath(width, height, radius, smoothing)` generates a deterministic SVG path and caches repeated lookups. It is exported from `src/shared/ui/squircle/getSquirclePath.ts` and covered by unit tests.

## Storybook

`src/shared/ui/Squircle.stories.tsx` renders a radius/smoothing matrix so designers can compare shapes quickly. It is intended for the upcoming Storybook environment and uses inline styles only.

## Codemod helper

The repository includes `scripts/codemods/rounded20-to-squircle.ts`, a lightweight analyzer that surfaces the most common `border-radius: 20px` patterns. Run it in dry mode to see a report:

```bash
npm run tsx scripts/codemods/rounded20-to-squircle.ts -- --dry
```

Re-run without `--dry` to insert inline `TODO(squircle)` comments beside matches. The comments make it easier to wrap the affected markup with `<Squircle>` or to apply the `.squircle` utility during a follow-up sweep.

## Dos and Don'ts

- ✅ Prefer `<Squircle>` for interactive elements and any layout that changes size dynamically.
- ✅ Use the `.squircle` class for static thumbnails, avatars, and images.
- ✅ Keep `--shape-radius` and `--shape-smoothing` in sync with design tokens when theming.
- ❌ Avoid wrapping elements that already manage their own clipping (videos, canvases) without testing.
- ❌ Do not combine the squircle mask with additional `border-radius`; the component zeroes the native radius for you.
