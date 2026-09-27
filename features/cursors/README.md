# Cursors

Shows each other user's live mouse position on the canvas, as a colored dot
with their name.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | Relays `cursor-move` and `cursor-leave`. |
| `client.js` | Browser | Creates, moves, and removes cursor elements in `#cursorOverlay`. |
| `cursors.test.js` | Node | Automated tests (`npm test`). |

## Server behavior

- `cursor-move { roomId, nx, ny }`: relayed to others as
  `{ socketId, nx, ny, x, y, color, name }`. `color` and `name` come from the
  server-side `session`, not from the client, so they cannot be spoofed.
- `cursor-leave roomId`: relayed to others as `cursor-hide socketId`.

## Client behavior

- `cursor-move` positions the cursor in percent of the canvas, so it lines
  up with any canvas size.
- `cursor-hide` and `user-left` call `removeCursor()`. It also merges and
  removes that user's in-progress remote stroke layer (drawing feature).
- The emitting side (`cursor-move` / `cursor-leave`) lives in the drawing
  feature's input handlers, throttled to 30 ms.

## Tests

Automated (`npm test`): relay with server-side color/name, latest session
name used, missing `roomId` ignored, `cursor-leave` to `cursor-hide`.

Manual test cases (two browser windows in one room):

1. Move the mouse in A: B shows a dot with A's name and color.
2. Move the mouse out of A's canvas: the dot disappears in B.
3. Close A: the dot disappears in B.
4. Resize B: A's cursor still lines up with A's strokes.
