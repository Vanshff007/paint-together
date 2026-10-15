# Tools

Line, rectangle and ellipse shapes, and a fill bucket.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `client.js` | Browser (pure functions also load in Node) | Tool buttons, drag preview, flood fill, sending and drawing `draw-shape`. |
| `tools.test.js` | Node | Automated tests for the pure functions (`npm test`). |

There is no server code. The drawing feature's server already relays
`draw-shape` to the other users in the room.

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
- **Undo:** every shape or fill is one undo step. In a room the client sends
  `save-undo-snapshot`, then `draw-shape`, then `stroke-complete` (the same
  order as a brush stroke). Offline it uses the local undo stack.
- **Remote:** a received `draw-shape` is checked with `isValidShape` (known
  shape, coordinates in `0..1`, `#rrggbb` color, size in `(0, 1]`) and drawn
  onto the committed image, below any remote strokes still in progress.

## Pure functions (exported for Node)

| Function | Purpose |
|----------|---------|
| `floodFill(image, x, y, rgba, tolerance)` | Fills `{ data, width, height }` in place. Returns the number of filled pixels. |
| `hexToRgba(hex)` | `'#rrggbb'` to `[r, g, b, 255]`. |
| `isValidShape(data)` | Checks a `draw-shape` payload before drawing it. |
| `drawShape(ctx, shape, x1, y1, x2, y2, color, size)` | Strokes a line, rectangle or ellipse. |

`client.js` ends its Node part with `module.exports` (guarded by
`typeof module`), and wraps all browser code in
`if (typeof document !== 'undefined')`.

## Tests

Automated (`npm test`): `hexToRgba`; fill of a blank canvas, inside a closed
outline (no leak), concave areas, transparent equals white, tolerance for
edge shades but not real colors, same color and out-of-bounds no-ops, a
near-same color that must still terminate, full HD canvas in under 1 s;
`isValidShape` good and bad payloads; `drawShape` calls for each shape.

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

## Known issues

- A remote shape that arrives while you are in the middle of a brush stroke
  redraws the canvas from the committed image, so the part of your stroke
  drawn so far disappears. Remote brush strokes finishing (`mouseup`) already
  behave like this.
- Touch input was not tested on a real phone.
