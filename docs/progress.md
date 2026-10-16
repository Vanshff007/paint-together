# Progress

Last updated: 2026-10-16.

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
- Per-user undo/redo in rooms: each user undoes only their own changes. The
  server keeps the last 200 changes; older ones are flattened (not undoable).
  The history is saved to MongoDB (up to 8 MB), so undo survives restarts and
  empty rooms.
- Clear canvas (synced), download as PNG.
- Live remote cursors with user name and color.
- Live chat with unread indicator.
- Members list, host role, host hand-over, host can kick users. Kicked
  browsers cannot rejoin the same room, and new browsers from the kicked
  user's IP are blocked for 1 hour (members already in are not). Bans are
  saved with the room.
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
- Tools: line, rectangle, ellipse, fill bucket, text and insert image, synced as history changes (`op`)
  and part of the shared undo/redo (`features/tools/`).
- Keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z, and B, E, L,
  R, O, F, T, I for the tools; ignored while typing (`features/shortcuts/`).
- Rate limits per socket (draw, chat, cursors, canvas saves) and per IP
  (create-room, join-room); excess events are dropped (`features/ratelimit/`).
- Chat history is saved to MongoDB with the room and restored with it.
- Browser smoke tests in real Chrome: `npm run test:e2e` (`e2e/`), and in
  Firefox and WebKit: `npm run test:e2e:firefox`, `npm run test:e2e:webkit`.
- Socket.io messages up to 10 MB (default 1 MB), so a detailed canvas never
  disconnects anyone.
- Optional room passwords: salted scrypt hash in memory and MongoDB, 5 wrong
  guesses per IP then a 30 s wait, kept in the tab's memory for reconnects
  (`features/passwords/`). Browsers that got in once skip the password, and
  the host can set a new one or remove it.
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

- A room whose password is forgotten can be opened only by a browser that got
  in before. If all of them cleared their site data, it stays locked until
  MongoDB deletes it (30 days after the last save).
- Canvas state is a full-canvas data URL, up to about 6 MB for a very noisy
  canvas; messages are capped at 10 MB.
- Undo/redo history over 8 MB (many inserted images) is not saved; such a
  room restarts its history from the saved canvas.
- Single instance only (in-memory state).
- Kick bans use a `localStorage` ID plus a 1-hour IP ban. A new IP and a new
  browser together get around them; new people on the kicked user's network
  are blocked for that hour too.
- Browser tests cover the main flows only (`e2e/`); the rest of the browser
  code has manual test cases in each feature README. The pinch-zoom test runs
  in Chrome only (it needs the DevTools protocol).
