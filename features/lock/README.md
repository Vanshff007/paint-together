# Lock

View-only mode: the host can stop everyone else from drawing, for teaching or
presenting. Viewers still see every change live, chat, and move their cursor.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | Socket.io middleware that drops drawing events, and the `lock-room` handler. |
| `client.js` | Browser | The host's toggle in the members list, the dimmed toolbar, and `room-locked`. |
| `lock.test.js` | Node | Automated tests (`npm test`). |

## Server behavior

- `lock-room { roomId, locked }`: host only. `roomData[roomId].locked` becomes
  `locked === true`, the room is marked `dirty` (saved with it), and the room
  gets `room-locked { locked }`.
- While a room is locked, a `socket.use()` middleware drops `draw`, `mouseup`,
  `op`, `clear`, `undo` and `redo` (`DRAWING_EVENTS`) from every socket but
  the host's, before any handler runs. Chat, cursors, `history-sync` and
  `canvas-state` still pass.
- `room-joined` carries `locked`, so joiners know (rooms feature). A restored
  room keeps its lock.
- When the host leaves, the next host can draw (the check uses the current
  `hostId`).

## Client behavior

- `canDraw()` (`public/core.js`) is false only in a locked room for anyone but
  the host. Brush, eraser, the tools, image insert and Clear check it.
- The host sees "👁 Make view-only" / "✏️ Let everyone draw" in the members
  list.
- Viewers get a toast, and their toolbar is dimmed and inactive, except Save
  (download). Undo/Redo are disabled.
- A stroke in progress when the lock arrives is dropped and the canvas is
  redrawn from the history, since the server would refuse it.

## Tests

Automated (`npm test`): only the host can lock and unlock, everyone is told,
the lock is saved; locked rooms drop each drawing event (object or bare
`roomId` payload) from others but not from the host; chat, cursors and
history sync still pass; outsiders and malformed payloads are ignored.

Browser test: `e2e/smoke.e2e.js` ("view-only room ...").

Manual test cases (two browser windows):

1. A (host) opens Members and clicks "👁 Make view-only": B gets a toast, B's
   toolbar is dimmed, B's strokes draw nothing. A's strokes still reach B.
2. B clicks Save: the PNG downloads.
3. A clicks "✏️ Let everyone draw": B can draw again.
4. Lock, then A leaves: B becomes host and can draw; B sees the toggle.

## Known issues

- A viewer's offline canvas (no room) is not affected; the lock is per room.
- The host cannot let some people draw and not others (all or nothing).
