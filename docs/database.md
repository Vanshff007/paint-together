# Database

Paint Together uses MongoDB through Mongoose. The database is only used for
persistence of room canvases. Live state is in memory (see
`docs/architecture.md`).

## Connection

`features/persistence/db.js` exports `connectDB()`:

- Connects with `mongoose.connect(process.env.MONGO_URI)`.
- On failure, it logs the error and calls `process.exit(1)`.
- `server.js` starts listening only after `connectDB()` resolves.

So the server **does not start without a working `MONGO_URI`**.

## Model: `Room` (`features/persistence/Room.js`)

Collection: `rooms` (Mongoose default for model `Room`).

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `roomId` | String | — | Required, unique index. 6-char uppercase ID. |
| `canvasState` | Mixed | `null` | PNG or WebP data URL string of the full canvas, or `null`. |
| `hostId` | String | `null` | Socket ID of the host at last save. Not valid after restart. |
| `chat` | [{ author, text }] | `[]` | Last 50 chat messages. Saved on every save, restored with the room. |
| `passwordHash` | String | `null` | `salt:hash` (hex, scrypt) for a password-protected room, or `null`. Set on create, saved on every save. |
| `users` | [String] | `[]` | Display names at last save. Snapshot only. |
| `history` | Mixed | `null` | Undo/redo history `{ baseState, ops, nextId, redo }` (`features/history`). `null` when empty or over 8 MB (`MAX_HISTORY_BYTES`), so the document stays under MongoDB's 16 MB limit; the room then restarts its history from `canvasState`. |
| `members` | [String] | `[]` | Browser IDs (`clientId`) that got in, max 500. They skip the password and IP bans. |
| `banned` | [String] | `[]` | Kicked browser IDs. |
| `locked` | Boolean | `false` | View-only mode (`features/lock`): only the host can draw. |
| `bannedIps` | [{ ip, until }] | `[]` | IPs of kicked users; `until` is a ms timestamp (1 hour). Expired ones are dropped on save. |
| `createdAt` | Date | `Date.now` | Set on insert. |
| `updatedAt` | Date | `Date.now` | Set on every save. TTL index: the document is deleted 30 days after the last save. |
| `lastSavedAt` | Date | `Date.now` | Set on every save. |

Socket objects are never stored.

## Reads and writes

| Where | Operation |
|---------------------|-----------|
| `create-room` (rooms) via `loadRoom` | `Room.findOne({ roomId })` to skip an ID that is already saved. |
| `create-room` (rooms) via `ensureRoomDoc` | `Room.findOne({ roomId })`, then `Room.create(...)` if missing. |
| `join-room` (rooms, room not in memory) via `loadRoom` | `Room.findOne({ roomId })` to restore `canvasState`. |
| `saveRoomState(roomId)` | `Room.findOneAndUpdate({ roomId }, { $set, $setOnInsert }, { upsert: true })`. |
| Autosave (`startAutosave`, 30 s) | `saveRoomState` for every room in `roomData` that changed since its last save (`dirty`). |
| Last user leaves (rooms) | `await saveRoomState(roomId)`, then remove from memory unless someone joined during the save. |

All of these live in `features/persistence/server.js`. Other features call
them through `ctx.persistence`. See `features/persistence/README.md`.

All database calls are in `try/catch` and log errors. A failed save does not
crash the server or affect connected users.

## Rules

- Keep all database access in `features/persistence/`. Do not add writes to `draw`, `cursor-move`, or other
  high-frequency events.
- Keep the schema flat. Add new fields with a `default` so that old documents
  still load.
- Do not store secrets or socket objects in documents.

## Limitations

- MongoDB documents are limited to 16 MB. `canvasState` is a base64 image, so a
  very large or very detailed canvas can come near that limit.
- Rooms not saved for 30 days are deleted by MongoDB (TTL index on
  `updatedAt`, `expires: '30d'` in `Room.js`). MongoDB removes expired
  documents in a background task about every 60 s, so deletion is not exact.
  Mongoose creates the index when the app starts.
- Autosave only writes rooms with `dirty: true`. Drawing, clear, undo, and
  redo set it. Member and host changes do not, so the stored `users` and
  `hostId` can lag until the next canvas change or the last user leaving.
