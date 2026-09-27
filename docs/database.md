# Database

Paint Together uses MongoDB through Mongoose. The database is only used for
persistence of room canvases. Live state is in memory (see
`docs/architecture.md`).

## Connection

`db.js` exports `connectDB()`:

- Connects with `mongoose.connect(process.env.MONGO_URI)`.
- On failure, it logs the error and calls `process.exit(1)`.
- `server.js` starts listening only after `connectDB()` resolves.

So the server **does not start without a working `MONGO_URI`**.

## Model: `Room` (`models/Room.js`)

Collection: `rooms` (Mongoose default for model `Room`).

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `roomId` | String | — | Required, unique index. 6-char uppercase ID. |
| `canvasState` | Mixed | `null` | PNG data URL string of the full canvas, or `null`. |
| `hostId` | String | `null` | Socket ID of the host at last save. Not valid after restart. |
| `users` | [String] | `[]` | Display names at last save. Snapshot only. |
| `createdAt` | Date | `Date.now` | Set on insert. |
| `updatedAt` | Date | `Date.now` | Set on every save. |
| `lastSavedAt` | Date | `Date.now` | Set on every save. |

Socket objects and undo/redo stacks are never stored.

## Reads and writes

| Where (`server.js`) | Operation |
|---------------------|-----------|
| `create-room` | `Room.findOne({ roomId })`, then `Room.create(...)` if missing. |
| `join-room` (room not in memory) | `Room.findOne({ roomId })` to restore `canvasState`. |
| `saveRoomState(roomId)` | `Room.findOneAndUpdate({ roomId }, { $set, $setOnInsert }, { upsert: true })`. |
| Autosave (`setInterval`, 30 s) | `saveRoomState` for every room in `roomData`. |
| Last user leaves | `await saveRoomState(roomId)`, then remove from memory. |

All database calls are in `try/catch` and log errors. A failed save does not
crash the server or affect connected users.

## Rules

- Keep all persistence in `saveRoomState()` or the existing `create-room` /
  `join-room` paths. Do not add writes to `draw`, `cursor-move`, or other
  high-frequency events.
- Keep the schema flat. Add new fields with a `default` so that old documents
  still load.
- Do not store secrets or socket objects in documents.

## Limitations

- MongoDB documents are limited to 16 MB. `canvasState` is a base64 PNG, so a
  very large or very detailed canvas can come near that limit.
- There is no TTL or cleanup. Room documents stay forever. If storage becomes a
  problem, add a TTL index on `updatedAt`.
- Autosave writes every active room every 30 s, also rooms that did not change.
