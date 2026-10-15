# Persistence

Saves each room's latest canvas to MongoDB, so a room can be reopened after it
empties or the server restarts.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `db.js` | Node | `connectDB()`: connects Mongoose with `MONGO_URI`, exits the process on failure. |
| `Room.js` | Node | Mongoose `Room` model (see `docs/database.md`). |
| `server.js` | Node | `createPersistence(roomData, RoomModel)` and `AUTOSAVE_INTERVAL_MS`. |
| `persistence.test.js` | Node | Automated tests with a fake model (no MongoDB needed). |

There is no client code and there are no socket handlers here. Other features
use the object that `createPersistence()` returns, through `ctx.persistence`.

## API

`createPersistence(roomData, RoomModel = Room)` returns:

| Function | Behavior |
|----------|----------|
| `saveRoomState(roomId)` | Upserts `canvasState`, `hostId`, user names, `updatedAt`, `lastSavedAt`. Clears the room's `dirty` flag, and sets it again if the save fails. No-op if the room is not in memory. |
| `ensureRoomDoc(roomId, hostId, userName)` | Creates the document only if it does not exist. |
| `loadRoom(roomId)` | Returns the stored document, or `null` if missing or on error. |
| `startAutosave()` | Every 30 s, calls `saveRoomState` for each room in `roomData` with `dirty: true`. Returns the interval handle. |

All functions catch and log database errors. A failed save never crashes the
server.

## When data is written

- Room created (rooms feature): `ensureRoomDoc`.
- Every 30 s: `startAutosave` (started in `server.js`), only for rooms whose
  canvas changed (`stroke-complete`, `clear`, `undo`, `redo` set `dirty`).
- Room documents expire 30 days after the last save (TTL index on
  `updatedAt` in `Room.js`).
- Last user leaves (rooms feature): `saveRoomState`, then the room leaves memory.
- Never from `draw`, `cursor-move`, or other high-frequency events.

## Tests

Automated (`npm test`): upsert fields (history never saved), unknown room
no-op, error logged not thrown, create-only-if-missing, `loadRoom` null on
error, autosave only of changed rooms with mocked timers, failed save stays
dirty, TTL index on `updatedAt`, and a restart test (save on last leave, fresh
memory, join restores the canvas).

Manual test cases (needs a real `MONGO_URI`):

1. Create a room, draw, wait 30 s: the document's `canvasState` is set. Wait
   30 s more without drawing: `lastSavedAt` does not change.
2. Close all tabs: the room is saved and removed from memory.
3. Restart the server, join the same code: the drawing comes back and you are host.
4. Stop MongoDB while the app runs: errors are logged, drawing still works.
