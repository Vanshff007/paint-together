# API

Paint Together has no REST API. All application communication uses Socket.io
events on the default namespace (`/`).

## HTTP routes

| Method | Path | Response |
|--------|------|----------|
| GET | `/` | `public/index.html` |
| GET | `/<file>` | Static file from `public/` (`express.static`) |
| GET | `/robots.txt`, `/llms.txt`, `/sitemap.xml`, `/og-image.png`, `/favicon.svg`, `/apple-touch-icon.png`, `/site.webmanifest` | Static files from `features/seo/static/` |
| GET | `/features/<name>/client.js` | Browser script of a feature. Only `client.js` files are served; other files in `features/` return 404. |
| GET | `/socket.io/*` | Socket.io client library and transport (handled by Socket.io) |

Query parameter `?room=<ROOMID>` on `/` fills the room code on the landing
screen. The client reads it. The server ignores it.

## Conventions

- Room IDs: 6 uppercase alphanumeric characters (`generateRoomId()`), unique
  among live rooms and rooms saved in MongoDB.
- User names: trimmed and truncated to 20 characters on the server.
- Coordinates: `nx`, `ny` are normalized to `0..1` of canvas width/height.
  `ns` is brush size divided by canvas width.
- Canvas state: PNG or lossless WebP data URL string (`canvasState()` in the
  drawing client), or `null`. Each browser picks the format (see
  `features/drawing/README.md`), so one room can mix both.
- `clientId`: random per-browser ID from `localStorage`, used only for kick
  bans. It is kept on `socket.data.clientId` and never sent to other clients.
- Some events send a bare `roomId` string as payload, not an object. Keep this
  shape when you change them, or update both sides together.

## Client → server events

| Event | Payload | Server behavior |
|-------|---------|-----------------|
| `create-room` | `{ userName, clientId?, password? }` | Generates a room ID not used by a live or saved room, joins socket, creates `roomData` and a `Room` document. A non-empty `password` (max 64 chars) is stored as a salted scrypt hash and protects the room. Replies `room-created`. |
| `join-room` | `{ roomId, userName, clientId?, password? }` or `roomId` string | Restores room from MongoDB if not in memory. Replies `room-not-found`, `join-banned` (browser was kicked from this room), `join-password` (room has a password and it is missing, wrong, or this IP must wait), or `room-joined` + broadcasts `user-count-update`, `users-update`, `user-joined`, and sends `existing-users`. |
| `draw` | `{ roomId, nx, ny, color, ns, tool, isStart? }` | Relays `draw` to others in room with `socketId` added. `tool` is `'brush'` or `'eraser'`. |
| `draw-shape` | `{ roomId, shape, nx1, ny1, nx2?, ny2?, color, ns? }` | Relays `draw-shape` to others unchanged. `shape` is `'line'`, `'rect'`, `'circle'` (ellipse in the box) or `'fill'` (flood fill at `nx1, ny1`; no `nx2`, `ny2`, `ns`). Sent by the tools feature, followed by `stroke-complete`. Receivers check every field (`isValidShape`) before drawing. |
| `save-undo-snapshot` | `{ roomId, state }` | Stores `pendingSnapshot`, clears `redoStack`. Ignored unless `state` is a PNG or WebP data URL, or `null`. |
| `discard-undo-snapshot` | `roomId` | Clears `pendingSnapshot`. |
| `stroke-complete` | `{ roomId, state }` | Pushes `pendingSnapshot` to `undoStack` (max 30), sets `canvasState`. Broadcasts `history-update`. Ignored unless `state` is a PNG or WebP data URL. |
| `mouseup` | `roomId` | Relays `mouseup` `{ socketId }` to others. |
| `clear` | `roomId` | Relays `clear` to others, resets `canvasState` and history. Broadcasts `history-update`. |
| `undo` | `roomId` | Pops `undoStack`. Broadcasts `canvas-restore`. No-op if empty. |
| `redo` | `roomId` | Pops `redoStack`. Broadcasts `canvas-restore`. No-op if empty. |
| `cursor-move` | `{ roomId, nx, ny }` | Relays `cursor-move` with server-side `socketId`, `color`, `name`. |
| `cursor-leave` | `roomId` | Relays `cursor-hide` (`socketId`) to others. |
| `chat-message` | `{ roomId, text }` | Relays `{ author, text }` to others. `author` is the sender's server-side name. `text` must be a string; it is trimmed and cut to 200 characters, and empty text is ignored. Sender renders its own message locally. |
| `chat-history` | `roomId` | Replies `chat-history` with the room's last 50 messages. Sender must be in the room. The client sends it after every `room-joined`. |
| `kick-user` | `{ roomId, targetSocketId }` | Only if sender is host and target is not sender: bans the target's `clientId` from the room (unless it equals the host's), emits `kicked` to target, disconnects it after 500 ms. |

## Server → client events

| Event | Payload | Sent to |
|-------|---------|---------|
| `room-created` | `{ roomId, userCount, userColor, userName, isHost: true }` | Creator |
| `room-joined` | `{ roomId, userCount, userColor, userName, canvasState, hasUndo, hasRedo, isHost, hostId }` | Joiner |
| `room-not-found` | `roomId` | Joiner |
| `join-banned` | `roomId` | Joiner whose browser was kicked from the room |
| `join-password` | `{ roomId, reason, retryIn? }`. `reason` is `'required'` (no password sent), `'wrong'`, or `'wait'` (5 wrong tries from this IP; `retryIn` is seconds) | Joiner of a password-protected room |
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
| `chat-history` | `[{ author, text }]`, oldest first | Asker |

## Validation and trust

What the server checks now:

- Every handler ignores a malformed payload (`null`, wrong type, missing
  fields) instead of throwing.
- Room-scoped handlers return early unless the sender has joined `roomId`
  (`inRoom(socket, roomId)` from `features/rooms/server.js`). History events
  also need the room in `roomData`.
- `server.js` wraps every handler: an error that still gets through is logged
  with the event name and never stops the server.
- `kick-user` checks that the sender is host.
- `clientId` must be a string. It is cut to 64 characters, otherwise treated as missing.
- Canvas `state` must start with `data:image/png;base64,` or
  `data:image/webp;base64,` (`isCanvasDataUrl` in
  `features/history/server.js`). Browsers load it with `img.src`, so a URL would
  make every member fetch it (IP leak), and a cross-origin image would taint
  the canvas so `toDataURL()` throws for the whole room. The client's
  `loadCanvasState()` refuses anything else too, which covers bad states saved
  before this check.
- `chat-message` `author` is always the sender's server-side name. A
  client-sent `author` is ignored.
- Socket.io accepts connections only from pages served by the same host
  (`allowRequest` in `features/origin/server.js`). Requests with no `Origin`
  header (non-browser clients) are allowed.
- Room passwords: only a salted scrypt hash is kept (`features/passwords/`),
  and neither the password nor the hash is ever sent to a client. Wrong
  guesses are limited per IP: 5, then 30 s wait. A missing password does not
  count. Passwords travel in the socket message, so production needs HTTPS
  (Render provides it).
- User names must be strings. They are trimmed and truncated to 20
  characters. A missing, empty, or non-string name uses the default name.

What the server does **not** check (keep in mind when you change handlers):

- `chat-message` `text` content is not filtered. Clients render it with
  `textContent`. Keep rendering with `textContent`, never `innerHTML`.
- `state` payloads are not checked for size beyond Socket.io's 1 MB message
  limit, or that the base64 is a valid image.

## Rules for changing the protocol

- Start every room-scoped handler with an `inRoom(socket, roomId)` check, and
  never read a field of a payload before checking that the payload exists.

- Change the emitter and the listener in the same change (the feature's
  `server.js` and the `client.js` that uses the event).
- Update the feature's tests and `README.md` in the same change.
- Update the tables in this file in the same change.
- Never write to MongoDB from high-frequency events (`draw`, `cursor-move`,
  `mouseup`).
- Prefer adding new optional fields over renaming existing fields.
