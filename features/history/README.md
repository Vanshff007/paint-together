# History (undo / redo)

Undo and redo. In a room the history is shared and kept on the server, so any
user can undo the last stroke of any user. Outside a room it is local.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | Per-room undo/redo stacks. Exports `MAX_HISTORY` (30). |
| `client.js` | Browser | Undo/Redo buttons, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, local stacks, button state. |
| `history.test.js` | Node | Automated tests (`npm test`). |

## Server behavior

State lives in `roomData[roomId]`: `undoStack`, `redoStack`,
`pendingSnapshot`, `canvasState`. All states are PNG data URLs.

1. `save-undo-snapshot { roomId, state }` at stroke start: stores the canvas
   before the stroke as `pendingSnapshot`, clears `redoStack`.
2. `stroke-complete { roomId, state }` at stroke end: pushes
   `pendingSnapshot` onto `undoStack` (max 30, oldest dropped), sets
   `canvasState`, sends `history-update` to the room.
3. `discard-undo-snapshot roomId`: a tap with no movement drops the snapshot.
4. `undo` / `redo roomId`: moves `canvasState` between the stacks and sends
   `canvas-restore { state, hasUndo, hasRedo }` to the whole room.

History is never saved to MongoDB and is lost when the room empties.

## Client behavior

- In a room, Undo/Redo send `undo` / `redo` and the buttons follow the
  server's `hasUndo` / `hasRedo`.
- Outside a room, `localUndoStack` / `localRedoStack` hold `ImageData`
  snapshots (max 30, `MAX_LOCAL_HISTORY`).

## Tests

Automated (`npm test`): stroke push, undo, redo, redo cleared by new stroke,
discard, 30-step cap, empty-stack no-op, unknown room ignored.

Manual test cases (two browser windows in one room):

1. Draw two strokes in A. Undo in B: A's last stroke disappears in both.
2. Redo in A: the stroke comes back in both.
3. Undo, then draw a new stroke: Redo becomes disabled.
4. Ctrl+Z / Ctrl+Y work like the buttons.
5. Draw 35 strokes: only 30 undos are possible.
6. Tap the canvas without moving: Undo state does not change.
