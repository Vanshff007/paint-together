# Zoom

Two-finger pinch to zoom and pan the canvas on touch screens.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `client.js` | Browser (`pinchTransform` also loads in Node) | Touch handling and the CSS transform of `#canvasFrame`. |
| `zoom.test.js` | Node | Automated tests for `pinchTransform` (`npm test`). |

There is no server code. Zoom is local: other users are not affected.

## Behavior

- Two fingers on the canvas start a pinch. Spreading zooms in, pinching
  zooms out, moving both fingers pans. The canvas point under the fingers
  stays under them.
- Zoom is between 1x and 4x (`MAX_ZOOM`). Below 1.05x (`SNAP_ZOOM`) it snaps
  back to no zoom.
- Panning stops at the canvas edges: the zoomed canvas always fills the
  canvas area, with no empty gap.
- One finger still draws (or uses the current tool) at any zoom.
  `toCanvasPos()` (drawing feature) reads the zoomed position, so the stroke
  lands under the finger.
- When the second finger lands, the stroke or shape started by the first
  finger is ended (`stopDrawing()`, `cancelToolGesture()` from the tools
  feature). If the first finger had not moved yet, nothing is drawn. Until
  every finger is lifted, no touch reaches the drawing or tools handlers.
- Each room starts unzoomed (`room-created`, `room-joined`).
- Mouse users are not affected (no wheel zoom).

## How

`#canvasFrame` (canvas plus cursor overlay) gets
`transform: translate(x, y) scale(s)` with `transform-origin: 0 0`. The
canvas area (`.canvas-container`) has `overflow: hidden`, so the zoomed
canvas stays inside it. Touch listeners are on `document` in the capture
phase, so they run before the drawing and tools listeners and can stop them.

`pinchTransform(start, d, mx, my, w, h)` computes the transform from the
pinch start (`scale`, `x`, `y`, finger distance `d` and midpoint `mx, my`),
the fingers now, and the unzoomed frame size.

## Tests

Automated (`npm test`): zoom in around the midpoint, pan keeps the same point
under the fingers, 1x to 4x limits, snap to 1x, no gaps at the edges.

Browser test (`npm run test:e2e`): real multi-touch on a phone-sized page:
one finger draws, a two-finger spread zooms over 2x and draws nothing, a
stroke while zoomed lands under the finger.

Manual test cases (phone):

1. Pinch out on the canvas: it zooms in around your fingers.
2. Move two fingers: the canvas pans and stops at its edges.
3. Draw with one finger while zoomed: the line is under your finger.
4. Pinch in fully: it snaps back to the normal view.
5. Put two fingers down at once: no dot or line is drawn.

## Known issues

- No zoom for mouse users (Ctrl+wheel zooms the whole page instead).
- Remote cursor labels are scaled with the zoom.
