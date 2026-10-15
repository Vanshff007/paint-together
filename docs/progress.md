# Progress

Last updated: 2026-10-15.

## Completed

- Express server serving `public/` on `PORT` (default 3000).
- Socket.io real-time connection.
- Room system: create room (6-char code), join by code or `?room=` link,
  room-not-found error.
- Landing screen with user name, animated splash, and dark mode toggle.
  The theme follows the system setting until the user picks one.
- Responsive layout for phones (portrait and landscape) and tablets.
- Drawing: brush, eraser, color palette plus custom color, brush size 1–50.
- Mouse and touch input. Normalized coordinates for different screen sizes.
- Per-user remote layers, so simultaneous strokes do not merge.
- Shared, server-side undo/redo (max 30 steps per room).
- Clear canvas (synced), download as PNG.
- Live remote cursors with user name and color.
- Live chat with unread indicator.
- Members list, host role, host hand-over, host can kick users. Kicked
  browsers cannot rejoin the same room (per-browser ID, in memory).
- Copy room link, exit room.
- MongoDB persistence:
  - `Room` model and `connectDB()`.
  - Autosave every 30 s of rooms that changed, save on last user leave.
  - Restore canvas from MongoDB when someone joins a room not in memory.
  - Rooms expire 30 days after their last save (TTL index).
  - Automated restart test (fake model). Not yet run against a real MongoDB.
- Server hardening: malformed payloads are ignored, a handler error is logged
  and never crashes the server, room events need room membership, room IDs
  never collide.
- Reconnect: after a Socket.io reconnect the client joins its room again and
  loads the server's canvas.
- Canvas state must be a PNG data URL, on the server and in the client, so a
  member cannot make others load a URL or break the room's canvas.
- Chat author is the sender's server-side name (no spoofing). Chat text is
  capped at 200 characters on the server.
- Socket.io accepts only pages from the same host (`features/origin/`).
- Production deploy on Render.
- SEO and link previews: `robots.txt`, `llms.txt`, `sitemap.xml`, Open Graph
  image, icons, and web app manifest (`features/seo/`).
- Feature-folder structure (`features/<name>/`), with a README for each feature.
- Automated tests (`npm test`, Node built-in runner) for all server features.

## In progress / pending

- Run the persistence manual tests (`features/persistence/README.md`)
  against a real MongoDB, including a real server restart.

## Planned / ideas

- Chat history: keep the last 50 messages per room in memory and send them on
  join.
- Shapes tool (line, rectangle, circle). The server relays `draw-shape`, but
  the client does not use it. An earlier "shapes feature" commit exists in
  history.
- Fill bucket: flood fill on the canvas pixels.
- Room passwords or private rooms. Today anyone with the 6-char code can join.
- Smaller canvas payloads: WebP instead of PNG (about 3x smaller), to stay
  under the 1 MB Socket.io limit.
- Keyboard shortcuts: Ctrl+Z / Ctrl+Y, B for brush, E for eraser.

## Known limitations

- Canvas state is a full PNG data URL. Socket.io's default 1 MB message limit
  can disconnect a client with a very large or detailed canvas.
- Undo/redo history is lost on restart or when a room empties.
- Chat history is not stored. New joiners do not see earlier messages.
- Single instance only (in-memory state).
- Kick bans use a `localStorage` ID: a private window or clearing site data
  gets around them, and they are lost when the room empties or the server
  restarts.
- Browser code has no automated tests (manual test cases are in each
  feature README).
