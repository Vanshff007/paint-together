# Tools

Line, rectangle and ellipse shapes, a fill bucket, text, and inserted images.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `client.js` | Browser (pure functions also load in Node and on the server) | Tool buttons, drag preview, flood fill, text box, image import, sending each change as an `op`; `isValidOp`, `cleanOp` and `drawOp` for the history. |
| `tools.test.js` | Node | Automated tests for the pure functions (`npm test`). |

There is no server code. The drawing feature's server already relays
the changes: each finished shape, fill, text or image is sent as one `op`
(`features/history/server.js` stores and broadcasts it, and requires this
file for `isValidOp` and `cleanOp`).

## How it hooks into drawing

- The buttons `lineBtn`, `rectBtn`, `circleBtn`, `fillBtn` (in
  `public/index.html`) set the shared `currentTool` to `line`, `rect`,
  `circle` or `fill`, and mark themselves active.
- Pointer listeners sit on the canvas container in the **capture** phase.
  When one of these tools is active they call `stopPropagation()`, so the
  brush handlers on the canvas never see the press. With brush or eraser
  active they do nothing. No code in `features/drawing/` changes.
- `mousemove` is not stopped, so remote cursors keep working. Drag preview and
  release are handled on `window`, so a drag that leaves the canvas still
  finishes (the point is clamped to the canvas).

## Behavior

- **Shapes:** press, drag, release. The preview is drawn on top of the
  committed image while dragging. A tap (under 2 px) draws nothing. The
  circle tool draws the ellipse inside the drag box. Color and width come
  from the palette and the Size slider.
- **Fill:** a click fills the connected area under the pointer with the
  current color (scanline flood fill). Pixels are compared as they look on the
  white page: never-drawn (transparent) and erased (white) pixels count as the
  same color. Each RGB channel may differ by up to 32 (`FILL_TOLERANCE`), so
  anti-aliased stroke edges are filled too. Filling an area with its own color
  does nothing and adds no undo step.
- **Text:** a click opens a text box at that point (top-left corner of the
  text). Enter or clicking elsewhere draws it in bold sans-serif with the
  current color; Escape or an empty box draws nothing. Font size is
  `12 + 2 × Size` canvas pixels (Size 5 gives 22 px). Max 100 characters
  (`MAX_TEXT_LENGTH`). On screen the box is at least 16 px tall so it is
  readable on phones and iOS does not zoom the page.
- **Image:** the Image button (not a tool, it does not stay selected) opens
  the file picker. The picture is read in the browser only, shrunk (never
  enlarged) to fit 60% of the canvas width and height (`IMAGE_MAX_SHARE`,
  `fitImage`), and placed in the center. Transparent parts become white. It is
  sent to the room as a JPEG data URL (quality 0.85) inside its `op`, so a
  768×480 photo is about 50 to 150 KB, well under the 1 MB message limit.
- **Undo:** every shape, fill, text or image is one undo step. In a room the client sends
  one `op { type: 'shape', ... }` with the full canvas (like a brush
  stroke), and each user can undo only their own changes. Offline it uses the local undo stack.
- **Remote:** a received `op` is checked with `isValidOp` / `isValidShape` (known
  shape, coordinates in `0..1`, `#rrggbb` color, size in `(0, 1]`; text 1 to
  100 characters; image `src` only an inline `data:image/png|jpeg|webp;base64`
  URL with a box of positive size) and drawn onto the committed image, below
  any remote strokes still in progress. A URL as image `src` is never loaded
  (it would leak viewers' IPs and taint the canvas).

## Pure functions (exported for Node)

| Function | Purpose |
|----------|---------|
| `floodFill(image, x, y, rgba, tolerance)` | Fills `{ data, width, height }` in place. Returns the number of filled pixels. |
| `hexToRgba(hex)` | `'#rrggbb'` to `[r, g, b, 255]`. |
| `isValidShape(data)` | Checks a shape payload before drawing it. |
| `isValidOp(op)` | Checks a history change: a stroke (points, color, size, tool) or a shape. |
| `cleanOp(op)` | Only the known fields of an op. |
| `drawOp(ctx, op, W, H, image)` | Draws one change on a W×H canvas (strokes segment by segment, like live drawing). |
| `drawShape(ctx, shape, x1, y1, x2, y2, color, size)` | Strokes a line, rectangle or ellipse. |
| `drawText(ctx, text, x, y, color, fontPx)` | Bold sans-serif text with its top-left corner at `x, y`. |
| `fitImage(w, h, maxW, maxH)` | Size that keeps the shape, only shrinks, and is never 0. |

`client.js` ends its Node part with `module.exports` (guarded by
`typeof module`), and wraps all browser code in
`if (typeof document !== 'undefined')`.

## Tests

Automated (`npm test`): `hexToRgba`; fill of a blank canvas, inside a closed
outline (no leak), concave areas, transparent equals white, tolerance for
edge shades but not real colors, same color and out-of-bounds no-ops, a
near-same color that must still terminate, full HD canvas in under 1 s;
`isValidShape` good and bad payloads; `drawShape` calls for each shape.

Also `isValidShape` for text and images (only inline PNG, JPEG or WebP
data; URLs, SVG and broken data rejected), `drawText`, `fitImage`.

Manual test cases (two browser windows in one room):

1. Rect, Circle, Line: drag in A. The preview follows the pointer; on release
   the shape appears in A and B.
2. Draw a closed shape, pick red, Fill inside it: only the inside turns red,
   in A and B.
3. Fill on an empty canvas: the whole canvas fills. Fill again with the same
   color: nothing changes and Undo is unchanged.
4. Undo in B after a fill: the fill disappears in both windows.
5. Drag a shape out of the canvas and release outside: the shape ends at the
   canvas edge.
6. Pick Brush after a shape tool: brush strokes work, only Brush is
   highlighted.
7. On a phone: drag a shape with one finger; tap with Fill.
8. Text: press T, click, type "Hi", Enter: "Hi" appears in A and B. Escape
   instead: nothing is drawn.
9. Image: click Image and pick a photo: it appears centered in A and B, at
   most 60% of the canvas. Undo removes it. Pick a text file: "That file is
   not an image".

## Known issues

- A remote shape that arrives while you are in the middle of a brush stroke
  redraws the canvas from the committed image, so the part of your stroke
  drawn so far disappears. Remote brush strokes finishing (`mouseup`) already
  behave like this.
- Touch input was not tested on a real phone.
- An inserted image is always centered and cannot be moved or resized
  afterwards.
- Text uses the system's sans-serif font, so it can look slightly different
  on another operating system.
- A remote image is drawn when it has loaded (a few ms), so a stroke that
  arrives in that moment can end up under it.
