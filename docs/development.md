# Development

## Requirements

- Node.js 18 or later (Mongoose 9 needs a recent Node.js).
- npm.
- A MongoDB database: local `mongod` or a MongoDB Atlas cluster.

## Setup

```bash
git clone <repo-url>
cd paint-together
npm install
```

Create `.env` in the project root:

```env
MONGO_URI=mongodb://127.0.0.1:27017/paint-together
PORT=3000
```

## Commands

| Command | What it does |
|---------|--------------|
| `npm start` | `node server.js`. Production-style run. |
| `npm run dev` | `nodemon server.js`. Restarts on server file changes. |

Open `http://localhost:3000`.

Frontend files in `public/` are served directly. Refresh the browser after you
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

There is no automated test suite yet. `package.json` has no `test` script.
Per `CLAUDE.md`, new features must include tests. When you add the first
tests:

- Prefer Node's built-in runner (`node --test`) before adding a framework.
- Add `"test": "node --test"` to `package.json`.
- Put tests in the feature folder (see `docs/contributing.md`).
- For socket tests, `socket.io-client` is a dev dependency candidate. Ask
  before adding it.

## Debugging

- The server logs connections, room create/join, kicks, cleanup, and MongoDB
  errors to the console.
- The client logs socket events to the browser console.
- `❌ MongoDB Connection Error` at start means `MONGO_URI` is wrong or the
  database cannot be reached. The process exits.

## Repository housekeeping

- A file named `et --hard HEAD~1` is tracked in Git. It is the output of a
  mistyped `git log` command and is not used by the app. Remove it in a
  separate commit when convenient.
