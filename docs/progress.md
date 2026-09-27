# Progress

Last updated: 2026-09-28.

## Completed

- Express server serving `public/` on `PORT` (default 3000).
- Socket.io real-time connection.
- Room system: create room (6-char code), join by code or `?room=` link,
  room-not-found error.
- Landing screen with user name, animated splash, and dark mode toggle.
- Drawing: brush, eraser, color palette plus custom color, brush size 1–50.
- Mouse and touch input. Normalized coordinates for different screen sizes.
- Per-user remote layers, so simultaneous strokes do not merge.
- Shared, server-side undo/redo (max 30 steps per room).
- Clear canvas (synced), download as PNG.
- Live remote cursors with user name and color.
- Live chat with unread indicator.
- Members list, host role, host hand-over, host can kick users.
- Copy room link, exit room.
- MongoDB persistence (**in progress**, commit "Auto save feature started
  building"):
  - `Room` model and `connectDB()`.
  - Autosave every 30 s, save on last user leave.
  - Restore canvas from MongoDB when someone joins a room not in memory.
- Production deploy on Render.
- Feature-folder structure (`features/<name>/`), with a README for each feature.
- Automated tests (`npm test`, Node built-in runner) for all server features.

## In progress / pending

- Finish and test the autosave feature, including a restart test.

## Planned / ideas

- Shapes tool. The server relays `draw-shape`, but the client does not use it.
  An earlier "shapes feature" commit exists in history.
- Add `.env.example` with `MONGO_URI` and `PORT`.

## Known limitations

- Canvas state is a full PNG data URL. Socket.io's default 1 MB message limit
  can disconnect a client with a very large or detailed canvas.
- Undo/redo history is lost on restart or when a room empties.
- Chat history is not stored. New joiners do not see earlier messages.
- The server does not check that a socket is a member of the `roomId` it sends
  events for.
- Chat `author` comes from the client and is not checked.
- Socket.io CORS allows all origins.
- Room IDs are random and are not checked for collisions.
- Single instance only (in-memory state).
- A stray tracked file `et --hard HEAD~1` exists in the repo root.
- A kicked user's socket is not reconnected. They must reload the page
  before they can join a room again.
- Browser code has no automated tests (manual test cases are in each
  feature README).
