# Drawing

The canvas and everything that puts pixels on it: brush, eraser, colors,
brush size, clear, download, mouse and touch input, and live strokes from
other users.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | Relays `draw`, `draw-shape`, `mouseup`, and handles `clear`. |
| `client.js` | Browser | Canvas input, tools, color palette, remote stroke layers, canvas resize, download. |
| `drawing.test.js` | Node | Automated tests (`npm test`). |

## Server behavior

- `draw`: relayed to others in the room with `socketId` added.
- `draw-shape`: relayed unchanged. The current client does not use it.
- `mouseup`: relayed as `{ socketId }` so receivers finish the right stroke.
- `clear`: relayed to others, resets `canvasState`, `undoStack`, `redoStack`,
  and sends `history-update { hasUndo: false, hasRedo: false }` to the room.

## Client behavior

- Coordinates and brush size are sent normalized (`nx`, `ny`, `ns` in
  `0..1`), so users with different canvas sizes see strokes in the same place.
- Point events are sent on every move. Cursor updates (`cursor-move`) are
  sent from the same input handlers, throttled to 30 ms (`EMIT_THROTTLE`).
- Each remote user draws on their own offscreen canvas ("remote layer").
  On `mouseup` the layer is merged into the committed image (`canvasImage`).
  This stops two users' simultaneous strokes from joining into one line.
- The eraser paints white and shows a dashed circle preview.
- `loadCanvasState(dataUrl)` draws a saved PNG onto the canvas. History and
  rooms use it.
- A `ResizeObserver` keeps the canvas resolution equal to its display size
  and scales the current image.

Uses `socket`, `currentRoomId`, `canvas`, `ctx` from `public/core.js`, and
`saveToUndoStack`, `localUndoStack`, `updateUndoRedoButtons` from history.

## Tests

Automated (`npm test`): draw relay with `socketId`, missing `roomId`,
`draw-shape` relay, `mouseup` relay, clear resets state, clear on unknown room.

Manual test cases (two browser windows in one room):

1. Draw in A: the stroke appears in B while drawing, not only at the end.
2. Draw in A and B at the same time: two separate lines, no joining line.
3. Eraser in A: erases in both windows; dashed circle follows the mouse.
4. Pick a palette color and a custom color: strokes use that color in B.
5. Change size to 50: B's stroke width matches.
6. Resize window B: existing drawing scales, new strokes line up.
7. Clear in B: both canvases are empty, Undo/Redo disabled.
8. Save: downloads `paint-together-<timestamp>.png`.
9. On a phone: single-finger drawing works and the page does not scroll.
