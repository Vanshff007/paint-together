# API

Paint Together has no REST API. All application communication uses Socket.io
events on the default namespace (`/`).

## HTTP routes

| Method | Path | Response |
|--------|------|----------|
| GET | `/` | `public/index.html` |
| GET | `/<file>` | Static file from `public/` (`express.static`) |
| GET | `/features/<name>/client.js` | Browser script of a feature. Only `client.js` files are served; other files in `features/` return 404. |
| GET | `/socket.io/*` | Socket.io client library and transport (handled by Socket.io) |

Query parameter `?room=<ROOMID>` on `/` fills the room code on the landing
screen. The client reads it. The server ignores it.

## Conventions

- Room IDs: 6 uppercase alphanumeric characters (`generateRoomId()`).
- User names: trimmed and truncated to 20 characters on the server.
- Coordinates: `nx`, `ny` are normalized to `0..1` of canvas width/height.
  `ns` is brush size divided by canvas width.
- Canvas state: PNG data URL string (`canvas.toDataURL('image/png')`) or `null`.
- Some events send a bare `roomId` string as payload, not an object. Keep this
  shape when you change them, or update both sides together.

## Client → server events

| Event | Payload | Server behavior |
|-------|---------|-----------------|
| `create-room` | `{ userName }` | Generates room ID, joins socket, creates `roomData` and a `Room` document. Replies `room-created`. |
| `join-room` | `{ roomId, userName }` or `roomId` string | Restores room from MongoDB if not in memory. Replies `room-not-found`, or `room-joined` + broadcasts `user-count-update`, `users-update`, `user-joined`, and sends `existing-users`. |
| `draw` | `{ roomId, nx, ny, color, ns, tool, isStart? }` | Relays `draw` to others in room with `socketId` added. `tool` is `'brush'` or `'eraser'`. |
| `draw-shape` | `{ roomId, ... }` | Relays `draw-shape` to others. **The current client does not send or handle this event.** |
| `save-undo-snapshot` | `{ roomId, state }` | Stores `pendingSnapshot`, clears `redoStack`. |
| `discard-undo-snapshot` | `roomId` | Clears `pendingSnapshot`. |
| `stroke-complete` | `{ roomId, state }` | Pushes `pendingSnapshot` to `undoStack` (max 30), sets `canvasState`. Broadcasts `history-update`. |
| `mouseup` | `roomId` | Relays `mouseup` `{ socketId }` to others. |
| `clear` | `roomId` | Relays `clear` to others, resets `canvasState` and history. Broadcasts `history-update`. |
| `undo` | `roomId` | Pops `undoStack`. Broadcasts `canvas-restore`. No-op if empty. |
| `redo` | `roomId` | Pops `redoStack`. Broadcasts `canvas-restore`. No-op if empty. |
| `cursor-move` | `{ roomId, nx, ny }` | Relays `cursor-move` with server-side `socketId`, `color`, `name`. |
| `cursor-leave` | `roomId` | Relays `cursor-hide` (`socketId`) to others. |
| `chat-message` | `{ roomId, author, text }` | Relays `{ author, text }` to others. Sender renders its own message locally. |
| `kick-user` | `{ roomId, targetSocketId }` | Only if sender is host and target is not sender: emits `kicked` to target, disconnects it after 500 ms. |

## Server → client events

| Event | Payload | Sent to |
|-------|---------|---------|
| `room-created` | `{ roomId, userCount, userColor, userName, isHost: true }` | Creator |
| `room-joined` | `{ roomId, userCount, userColor, userName, canvasState, hasUndo, hasRedo, isHost, hostId }` | Joiner |
| `room-not-found` | `roomId` | Joiner |
| `existing-users` | `{ [socketId]: { name, color } }` (excludes joiner) | Joiner |
| `user-joined` | `{ socketId, name, color }` | Others in room |
| `user-left` | `socketId` | Others in room |
| `user-count-update` | `number` | Room |
| `users-update` | `{ users, hostId }` | Room |
| `host-changed` | `{ newHostId }` | Room |
| `kicked` | none | Kicked socket |
| `draw` | client `draw` payload + `socketId` | Others in room |
| `draw-shape` | client payload | Others in room |
| `mouseup` | `{ socketId }` | Others in room |
| `clear` | none | Others in room |
| `canvas-restore` | `{ state, hasUndo, hasRedo }` | Room |
| `history-update` | `{ hasUndo, hasRedo }` | Room |
| `cursor-move` | `{ socketId, nx, ny, x, y, color, name }` | Others in room |
| `cursor-hide` | `socketId` | Others in room |
| `chat-message` | `{ author, text }` | Others in room |

## Validation and trust

What the server checks now:

- Room-scoped handlers return early if `roomId` is missing or (for history
  events) the room is not in `roomData`.
- `kick-user` checks that the sender is host.
- User names are truncated to 20 characters.

What the server does **not** check (keep in mind when you change handlers):

- It does not check that the sender is a member of the `roomId` it sends.
- `chat-message` `author` and `text` come from the client unchanged. The
  client limits input to 200 characters (`maxlength`) and renders with
  `textContent`. Keep rendering with `textContent`, never `innerHTML`.
- `state` payloads are not checked for size or format.

## Rules for changing the protocol

- Change the emitter and the listener in the same change (the feature's
  `server.js` and the `client.js` that uses the event).
- Update the feature's tests and `README.md` in the same change.
- Update the tables in this file in the same change.
- Never write to MongoDB from high-frequency events (`draw`, `cursor-move`,
  `mouseup`).
- Prefer adding new optional fields over renaming existing fields.
