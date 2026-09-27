# Architecture

Paint Together is a single Node.js process. It serves a static frontend and
relays real-time drawing events between clients over Socket.io. MongoDB stores
the latest canvas of each room, so a room can be restored after it empties or
the server restarts.

## High-level diagram

```
 Browser (public/)                     Node.js (server.js)                 MongoDB
 ┌──────────────────────┐   HTTP GET   ┌──────────────────────────┐
 │ index.html           │ ───────────▶ │ express.static(public/)  │
 │ style.css            │              │                          │
 │ script.js            │  Socket.io   │ io.on('connection')      │   Mongoose
 │  - canvas + tools    │ ◀──────────▶ │  - room handlers         │ ◀──────────▶ rooms
 │  - remote layers     │   (WS)       │  - in-memory roomData    │  (db.js,
 │  - chat, cursors     │              │  - 30 s autosave timer   │  models/Room.js)
 └──────────────────────┘              └──────────────────────────┘
```

## Components

| File | Role |
|------|------|
| `server.js` | Express app, HTTP server, Socket.io server, all room/event logic, autosave timer. |
| `db.js` | `connectDB()`: connects Mongoose with `MONGO_URI`. Exits the process on failure. |
| `models/Room.js` | Mongoose `Room` model (persistence only). |
| `public/index.html` | Landing screen (name, create/join) and app screen (toolbar, canvas, chat, modals). |
| `public/script.js` | All client logic: theme, splash animation, drawing, undo/redo, sockets, chat, cursors, kick. |
| `public/style.css` | All styles, light/dark themes via `html[data-theme]`. |

There is no build step, bundler, or frontend framework. The Socket.io client is
loaded from `/socket.io/socket.io.js`, which the Socket.io server serves.

## Server state

All live room state is in memory, in the `roomData` object in `server.js`:

```js
roomData[roomId] = {
  canvasState,      // latest full canvas as a PNG data URL, or null
  undoStack,        // array of PNG data URLs, max MAX_HISTORY (30)
  redoStack,        // array of PNG data URLs
  pendingSnapshot,  // canvas before the stroke in progress
  hostId,           // socket.id of the current host
  users             // { [socketId]: { name, color } }
}
```

Socket.io rooms (`io.sockets.adapter.rooms`) track which sockets are in which
room. `roomData` holds the application data for that room.

Only `canvasState`, `hostId`, and user names are persisted. Undo/redo history
is never persisted and is lost when a room empties or the server restarts.

## Real-time drawing flow

1. On `mousedown` / `touchstart`, the client sends `save-undo-snapshot` with the
   current canvas, then a `draw` event with `isStart: true`.
2. During the stroke, the client sends `draw` events (throttled to one per
   `EMIT_THROTTLE` = 30 ms). Coordinates and brush size are **normalized**
   (0–1, relative to canvas width/height). Each client can have a different
   canvas resolution.
3. The server relays `draw` to the other sockets in the room and adds
   `socketId`.
4. Each receiver draws the remote stroke on a per-user offscreen canvas
   ("remote layer"). This prevents simultaneous strokes from different users
   from joining into one line.
5. On `mouseup`, the client sends `mouseup` and `stroke-complete` (full canvas
   PNG). Receivers merge that user's layer into the committed canvas. The server
   moves `pendingSnapshot` to `undoStack` and stores the new `canvasState`.
6. The server sends `history-update` so all clients enable or disable their
   Undo/Redo buttons.

A tap with no movement sends `discard-undo-snapshot` instead, so no empty
history entry is made.

## Undo / redo

Undo/redo history is **shared per room** and kept on the server. Any user can
undo the last stroke of any user. The server sends `canvas-restore` with the
full canvas image to every client in the room.

## Persistence flow

- `create-room`: creates a `Room` document if none exists.
- Every 30 s (`AUTOSAVE_INTERVAL_MS`): `saveRoomState()` upserts every active
  room in `roomData`.
- Last user leaves (`disconnecting`, count reaches 0): saves the room, then
  deletes it from `roomData`.
- `join-room` for a room not in memory: loads it from MongoDB. The joining user
  becomes host, because the stored `hostId` belongs to a dead socket.

Drawing, cursor, and mousemove events **never** write to MongoDB.

## Host and kick

- The room creator is host. When the host disconnects, the first remaining user
  in `roomData[roomId].users` becomes host (`host-changed`).
- Only the host can send `kick-user`. The server checks `hostId` and then
  disconnects the target socket after 500 ms.

## Design constraints

- Single process. `roomData` is in memory, so horizontal scaling (several
  instances) needs a Socket.io adapter (for example Redis) and shared state.
  Do not add this until it is needed.
- Canvas state is a full PNG data URL. Large canvases give large payloads. See
  "Known limitations" in `docs/progress.md`.
- The server trusts most client input. See `docs/api.md` for which fields it
  validates.
