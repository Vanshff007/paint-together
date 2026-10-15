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
- Mouse and touch input. Fixed 1280×800 canvas, scaled to fit any screen
  (16:10), so every user has the same pixels and resizing never blurs the
  drawing.
- Two-finger pinch-zoom and pan on touch screens (`features/zoom/`).
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
- Canvas state must be a PNG or WebP data URL, on the server and in the client, so a
  member cannot make others load a URL or break the room's canvas.
- Chat author is the sender's server-side name (no spoofing). Chat text is
  capped at 200 characters on the server.
- Socket.io accepts only pages from the same host (`features/origin/`).
- Chat history: joiners get the room's last 50 messages.
- Tools: line, rectangle, ellipse, fill bucket, text and insert image, synced through `draw-shape`
  and part of the shared undo/redo (`features/tools/`).
- Keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z, and B, E, L,
  R, O, F, T, I for the tools; ignored while typing (`features/shortcuts/`).
- Rate limits per socket (draw, chat, cursors, canvas saves) and per IP
  (create-room, join-room); excess events are dropped (`features/ratelimit/`).
- Chat history is saved to MongoDB with the room and restored with it.
- Browser smoke tests in real Chrome: `npm run test:e2e` (`e2e/`).
- Optional room passwords: salted scrypt hash in memory and MongoDB, 5 wrong
  guesses per IP then a 30 s wait, kept in the tab's memory for reconnects
  (`features/passwords/`).
- Canvas state is sent as lossless WebP when the browser supports it (10-70%
  smaller than PNG), else PNG.
- Production deploy on Render.
- SEO and link previews: `robots.txt`, `llms.txt`, `sitemap.xml`, Open Graph
  image, icons, and web app manifest (`features/seo/`).
- Feature-folder structure (`features/<name>/`), with a README for each feature.
- Automated tests (`npm test`, Node built-in runner) for all server features.

## In progress / pending

- Run the persistence manual tests (`features/persistence/README.md`)
  against a real MongoDB, including a real server restart.

## Planned / ideas

- (none right now)

## Known limitations

- A forgotten room password cannot be reset. Once everyone leaves, the room
  cannot be opened until MongoDB deletes it (30 days after the last save).
- Canvas state is a full-canvas data URL. Socket.io's default 1 MB message
  limit can disconnect a client with a very large or detailed canvas. Lossless
  WebP makes this rarer, but a dense canvas is only about 10% smaller than
  PNG, and browsers without lossless WebP still send PNG.
- Undo/redo history is lost on restart or when a room empties.
- Single instance only (in-memory state).
- Kick bans use a `localStorage` ID: a private window or clearing site data
  gets around them, and they are lost when the room empties or the server
  restarts.
- Browser tests cover the main flows only (`e2e/`); the rest of the browser
  code has manual test cases in each feature README. Browser tests run in
  Chrome only.
