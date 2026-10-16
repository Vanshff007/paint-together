# History

Undo and redo. In a room, undo is **per user**: you undo only your own
changes, even when others drew after you. Offline (no room), undo uses local
snapshots.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | The room history: list of changes, per-user undo/redo, flattening old changes. Exports `MAX_OPS` (200), `COMPACT_COUNT` (100), `isCanvasDataUrl`, `newHistory`, `historyOf`, `authorKey`. |
| `client.js` | Browser | Undo/Redo buttons, the mirrored room history, redrawing the canvas from it, offline stacks. |
| `history.test.js` | Node | Automated tests (`npm test`). |

## The room history

`roomData[roomId].history` (created on first use):

```js
{
  baseState,  // image under all ops (null, the saved canvas of a restored room, or a flattened image)
  ops,        // [{ id, author, undone, op }] in order; author = the browser's clientId
  nextId,
  redo,       // { [author]: [op ids] }, newest last
  compacting  // { upTo, socketId } while one client flattens the oldest ops, else null
}
```

An op is one finished change (see `isValidOp` in `features/tools/client.js`):
a brush or eraser stroke with its points, or a shape, fill, text or image.
The canvas is the base image plus every op that is not undone, drawn in order.

## Server behavior

- `op { roomId, op, state }`: validated (`isValidOp`; only known fields are
  kept, `cleanOp`), stored with a new id and the sender's browser
  (`authorKey`: `clientId`, else the socket id), `canvasState = state`, room
  `dirty`. Broadcast to the whole room as `op { id, undone: false, by, ...op }`
  (`by` is the sender's socket id; the browser id is never sent). The sender's
  redo list is cleared.
- `undo roomId`: the sender's last op that is not undone gets `undone: true`
  and goes on the sender's redo list. Broadcast `op-undone { id, by }`.
- `redo roomId`: the newest id on the sender's redo list that is still undone
  gets `undone: false`. Broadcast `op-redone { id, by }`.
- After every change each member gets its own
  `history-update { hasUndo, hasRedo }`.
- `canvas-state { roomId, state }`: the redrawn canvas from the user who
  undid or redid; sets `canvasState` (autosave and joiners use it).
- `history-sync roomId`: replies `{ baseState, ops, hasUndo, hasRedo }`.
- Flattening: when there are more than 200 ops (`MAX_OPS`), the sender of
  the op that went over gets `compact-request { upTo }` (the id of the 100th
  oldest op). Until it answers, those ops cannot be undone or redone.
  `compact { roomId, upTo, state }` from that socket only: `state` becomes
  the base, those ops are removed (also from redo lists), others get
  `history-compacted { upTo, baseState }`. If the asked socket leaves without
  answering, the next op asks its sender.
- `clear` (drawing feature) deletes the history; it is recreated empty.
- A room restored from MongoDB starts with its saved canvas as the base and
  no ops (history is never saved).

All handlers need room membership and ignore malformed payloads. Every
state must be a PNG or WebP data URL (`isCanvasDataUrl`).

## Client behavior

- `roomHistory = { base, ops }` mirrors the server. `history-sync` (asked
  after every `room-joined`) replaces it and redraws.
- `op`: added to the list. The sender drew it already, and strokes were
  already drawn live from `draw` events. A shape, fill, text or image from
  someone else is drawn now (`drawOnCommitted`, below in-progress remote
  strokes).
- `op-undone` / `op-redone`: marks the op and redraws with `rebuildCanvas()`:
  base + every visible op on an offscreen canvas (`renderHistory`), waiting
  for images to decode; if the history changed meanwhile it draws again. The
  user who undid then sends the result as `canvas-state`.
- `compact-request`: renders base + ops up to `upTo` and sends `compact`.
- `clear`, `room-created`: the history is reset.
- Buttons follow `hasUndo` / `hasRedo` from the server (your own changes).
- Offline: `localUndoStack` / `localRedoStack` hold `ImageData` snapshots
  (max 30, `MAX_LOCAL_HISTORY`), as before.

## Tests

Automated (`npm test`): op stored and broadcast, undo removes only your own
last change even after others drew, redo order, a new change ends only your
redo, undo follows the browser across a reconnect, no-op undo/redo,
`canvas-state`, `history-sync` (no browser ids leak), invalid ops, states and
extra fields, membership and malformed payloads, flattening over `MAX_OPS`
(only the asked socket, locked ops, re-asking after the asked socket left),
mixed WebP/PNG, `isCanvasDataUrl`.

Browser tests (`npm run test:e2e`): per-user undo across three users with a
joiner and a reconnect; 205 real changes flattened, then a correct redraw.

Manual test cases (two browser windows in one room):

1. A draws, B draws, A draws again. B clicks Undo: only B's stroke disappears,
   in both windows.
2. A clicks Undo twice: A's two strokes disappear. A clicks Redo: the older
   one comes back.
3. A user who has drawn nothing has Undo disabled.
4. A third window joins after some undos: it shows the same picture.
5. Reload A's window and rejoin: A can still undo A's last change.
6. Clear: everyone's Undo is disabled.

## Known issues

- "Your" changes are per browser: two tabs in one browser share one undo list.
- Only the last 100 to 200 changes in a room can be undone; older ones are
  flattened into the base.
- Every undo/redo redraws the canvas from up to 200 changes on every client.
  Fills and images make that slower on old phones.
- Undo history is saved with the room, but only up to 8 MB (many inserted
  images can pass that). A bigger history is not saved: after a restart or
  once the room empties, that room's undo starts over from the saved canvas.
- A fill is recomputed when redrawn. Different browsers can anti-alias edges
  slightly differently, so a fill edge can differ by a pixel between browsers.
