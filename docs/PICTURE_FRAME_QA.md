# Picture Frame (MVP) QA Checklist

## Insert
- Insert via Slides toolbar → `Insert` → `Picture Frame`.
- New frame appears centered at ~`320x240` with empty placeholder.
- Frame is selectable and resizable (Moveable handles).

## Drag & Drop
- Drag a `PNG/JPG/WebP/GIF` onto the frame → image shows clipped in a rounded rectangle.
- Drag another image onto the same frame → image is replaced (no new free-floating image node created).
- Drop works when the frame is selected and when zoomed in/out.

## Inspector Controls
- With a frame selected, changing `Radius` updates clipping live.
- Changing `Fit` between `Cover` and `Contain` updates `object-fit` live.
- Border toggle/width/color updates live (if enabled).

## Serialization / Persistence
- Save slide, reload, and verify `imageSrc`, `radius`, `fit`, `border`, and rect (`x/y/width/height`) roundtrip.
- If S3 upload fails / no projectId, dropped images may use `blob:` URLs which won't survive reload (expected MVP fallback).

## Thumbnails
- Sidebar thumbnail and backend thumbnail render the picture frame (image clipped, radius/border respected).

