# Development

## Requirements

- Node.js 20 or later (`engines` in `package.json`; the tests use `node:test` mock timers).
- npm.
- A MongoDB database: local `mongod` or a MongoDB Atlas cluster.

## Setup

```bash
git clone <repo-url>
cd paint-together
npm install
```

Copy `.env.example` to `.env` and set `MONGO_URI`:

```bash
cp .env.example .env
```

## Commands

| Command | What it does |
|---------|--------------|
| `npm start` | `node server.js`. Production-style run. |
| `npm run dev` | `nodemon server.js`. Restarts on server file changes. |
| `npm test` | `node --test`. Runs every `features/**/*.test.js`. No MongoDB needed. |

Open `http://localhost:3000`.

Frontend files (`public/` and `features/*/client.js`) are served directly. Refresh the browser after you
change them. There is no build step.

## Testing multiplayer locally

1. Open two browser windows (or one normal and one private window).
2. Create a room in the first window. Copy the link or room code.
3. Join from the second window.
4. Check: drawing sync, eraser, clear, undo/redo, chat, cursors, member list,
   kick (host only), exit room.
5. Stop and start the server, then join the same room code. The canvas should
   come back from MongoDB (autosave runs every 30 s, and on last user leave).

For phones on the same network, open `http://<your-LAN-IP>:3000`.

## Tests

Tests use Node's built-in runner (`node:test`, `node:assert`). There are
no test dependencies.

- Each feature has `features/<name>/<name>.test.js`.
- Server handlers are tested with `features/fake-socket.js`: fake `io` and
  `socket` objects that record every emit. Call a handler with
  `socket.trigger('event', payload)`.
- Persistence is tested with a fake Mongoose model, so tests never touch a
  database.
- Timers (`setTimeout`, `setInterval`) are tested with `t.mock.timers`.
- Browser code has no automated tests. Each feature `README.md` has manual
  test cases. Run them with the multiplayer steps above.

## Debugging

- The server logs connections, room create/join, kicks, cleanup, and MongoDB
  errors to the console.
- `❌ MongoDB Connection Error` at start means `MONGO_URI` is wrong or the
  database cannot be reached. The process exits.
