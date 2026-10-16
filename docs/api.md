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
- Coordinates: `nx`, `ny` are normalized to `0..1` of canvas width/height. The
  canvas is 1280×800 pixels on every client.
  `ns` is brush size divided by canvas width.
- Canvas state: PNG or lossless WebP data URL string (`reportCanvasState()` in
  the drawing client), or `null`. Each browser picks the format (see
  `features/drawing/README.md`), so one room can mix both.
- `clientId`: random per-browser ID from `localStorage` (letters, digits and
  dashes, max 64; anything else counts as none). Used for kick bans, undo
  ownership, and room membership: a browser that got into a room once skips
  its password later. It is kept on `socket.data.clientId` and never sent to
  other clients.
- Some events send a bare `roomId` string as payload, not an object. Keep this
  shape when you change them, or update both sides together.

## Client → server events

| Event | Payload | Server behavior |
|-------|---------|-----------------|
| `create-room` | `{ userName, clientId?, password? }` | Generates a room ID not used by a live or saved room, joins socket, creates `roomData` and a `Room` document. A non-empty `password` (max 64 chars) is stored as a salted scrypt hash and protects the room. Replies `room-created`. |
| `join-room` | `{ roomId, userName, clientId?, password? }` or `roomId` string | Restores room from MongoDB if not in memory. Replies `room-not-found`, `join-banned` (browser was kicked from this room, or a new browser from the IP of someone kicked in the last hour), `join-password` (skipped for browsers that got in before) (room has a password and it is missing, wrong, or this IP must wait), or `room-joined` + broadcasts `user-count-update`, `users-update`, `user-joined`, and sends `existing-users`. |
| `draw` | `{ roomId, nx, ny, color, ns, tool, isStart? }` | Relays `draw` to others in room with `socketId` added. `tool` is `'brush'` or `'eraser'`. |
| `op` | `{ roomId, op, state? }` | A finished change, for the room history (per-user undo). `op` is `{ type: 'stroke', points: [[nx, ny], ...], color, ns, tool }` (max 2000 points; `tool` `'brush'` or `'eraser'`) or `{ type: 'shape', shape, nx1, ny1, nx2?, ny2?, color?, ns?, text?, src? }` with `shape` `'line'`, `'rect'`, `'circle'` (ellipse in the box), `'fill'` (at `nx1, ny1`), `'text'` (top-left at `nx1, ny1`, font size `ns`), `'image'` (`src` a PNG, JPEG or WebP data URL drawn into the box) or `'move'` (the box `nx1, ny1, nx2, ny2` moved by `dx, dy`, each -1 to 1). Current clients send no `state`; the full canvas follows as `canvas-state` once the user pauses. A valid `state` (older clients) still sets `canvasState`. Checked with `isValidOp` (unknown fields dropped), stored with an id and the sender's browser, then broadcast as `op` to the whole room. Ends the sender's redo. |
| `history-sync` | `roomId` | Replies `history-sync` with the room's history. The client sends it after every `room-joined`. |
| `canvas-state` | `{ roomId, state }` | The full canvas, sent 1.5 s after this user's last change (debounced) and after their undo/redo. Sets `canvasState` (for autosave, and as the history base when a saved history was too big). Ignored unless `state` is a PNG or WebP data URL. |
| `compact` | `{ roomId, upTo, state }` | Answer to `compact-request`, only from the socket that was asked: `state` (base + ops up to `upTo`) becomes the new base, those ops are removed, broadcast `history-compacted`. |
| `mouseup` | `roomId` | Relays `mouseup` `{ socketId }` to others. |
| `clear` | `roomId` | Relays `clear` to others, resets `canvasState` and the room history. Broadcasts `history-update`. |
| `undo` | `roomId` | Hides the sender's (browser's) last visible change, if any. Broadcasts `op-undone`, then `history-update` to each member. |
| `redo` | `roomId` | Shows the sender's last undone change again, if any. Broadcasts `op-redone`, then `history-update` to each member. |
| `cursor-move` | `{ roomId, nx, ny }` | Relays `cursor-move` with server-side `socketId`, `color`, `name`. |
| `cursor-leave` | `roomId` | Relays `cursor-hide` (`socketId`) to others. |
| `chat-message` | `{ roomId, text }` | Relays `{ author, text }` to others. `author` is the sender's server-side name. `text` must be a string; it is trimmed and cut to 200 characters, and empty text is ignored. Sender renders its own message locally. |
| `chat-history` | `roomId` | Replies `chat-history` with the room's last 50 messages. Sender must be in the room. The client sends it after every `room-joined`. |
| `kick-user` | `{ roomId, targetSocketId }` | Only if sender is host and target is not sender: unless the target's `clientId` equals the host's, bans that `clientId` from the room for good and the target's IP for new browsers for 1 hour (saved with the room). Emits `kicked` to target, disconnects it after 500 ms. |
| `lock-room` | `{ roomId, locked }` | Host only. `locked: true` makes the room view-only: `draw`, `mouseup`, `op`, `clear`, `undo` and `redo` from anyone but the host are dropped (`features/lock/`). Saved with the room. Broadcasts `room-locked`. |
| `set-password` | `{ roomId, password }` | Host only. A non-empty `password` (max 64 chars) replaces the room password; empty removes it. Replies `password-set`. Browsers already in the room are not affected. |

## Server → client events

| Event | Payload | Sent to |
|-------|---------|---------|
| `room-created` | `{ roomId, userCount, userColor, userName, isHost: true }` | Creator |
| `room-joined` | `{ roomId, userCount, userColor, userName, isHost, hostId, locked }` (no canvas: the joiner redraws from `history-sync`) | Joiner |
| `room-locked` | `{ locked }` | Room |
| `room-not-found` | `roomId` | Joiner |
| `join-banned` | `roomId` | Joiner whose browser was kicked from the room, or a new browser from a kicked user's IP (1 hour) |
| `password-set` | `{ locked }` (`false` when the password was removed) | Host who sent `set-password` |
| `join-password` | `{ roomId, reason, retryIn? }`. `reason` is `'required'` (no password sent), `'wrong'`, or `'wait'` (5 wrong tries from this IP; `retryIn` is seconds) | Joiner of a password-protected room |
| `existing-users` | `{ [socketId]: { name, color } }` (excludes joiner) | Joiner |
| `user-joined` | `{ socketId, name, color }` | Others in room |
| `user-left` | `socketId` | Others in room |
| `user-count-update` | `number` | Room |
| `users-update` | `{ users, hostId }` | Room |
| `host-changed` | `{ newHostId }` | Room |
| `kicked` | none | Kicked socket |
| `draw` | client `draw` payload + `socketId` | Others in room |
| `op` | `{ id, undone: false, by, ...op }` (`by` is the sender's socket id; the browser id is never sent) | Room |
| `op-undone` | `{ id, by }` | Room |
| `op-redone` | `{ id, by }` | Room |
| `history-sync` | `{ baseState, ops: [{ id, undone, ...op }], hasUndo, hasRedo }` | Asker |
| `compact-request` | `{ upTo }`: render base + visible ops with id up to `upTo` and send `compact` | The sender of the op that passed 200 |
| `history-compacted` | `{ upTo, baseState }` | Others in room |
| `mouseup` | `{ socketId }` | Others in room |
| `clear` | none | Others in room |
| `history-update` | `{ hasUndo, hasRedo }` for that member's own changes | Each member separately |
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
- Every client event passes a rate limit first (`features/ratelimit/`).
  Events over the limit are dropped silently. Per socket: `draw` 250/s,
  `cursor-move` 60/s, `chat-message` 1/s, `op` 10/s, `canvas-state` 4/s,
  `compact` 1/s, others 30/s, each with a burst.
  Per IP (shared by all sockets of that IP): `create-room` 1 per 30 s after a
  burst of 10, `join-room` 1/s after 20.
- `kick-user` checks that the sender is host.
- `clientId` must be a string. It is cut to 64 characters, otherwise treated as missing.
- Ops are validated with `isValidOp` (`features/tools/client.js`, shared with
  the browser) and only known fields are stored. Image ops accept only inline
  PNG, JPEG or WebP data.
- Canvas `state` must start with `data:image/png;base64,` or
  `data:image/webp;base64,` (`isCanvasDataUrl` in
  `features/history/server.js`). Browsers load it with `img.src`, so a URL would
  make every member fetch it (IP leak), and a cross-origin image would taint
  the canvas so `toDataURL()` throws for the whole room. The history client's
  `loadImage()` refuses anything but a `data:image/` URL too, which covers bad
  states saved before this check.
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
- `state` payloads are not checked for size beyond the 10 MB message limit
  (`MAX_MESSAGE_BYTES` in `server.js`, raised from Socket.io's 1 MB default so a
  detailed canvas never disconnects anyone), or that the base64 is a valid image.

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
