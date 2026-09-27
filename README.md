# 🎨 Paint Together

A real-time collaborative drawing app. Create a room, share the link, and draw,
chat, and see each other's cursors live on a shared canvas.

**Live demo:** https://paint-together-hchq.onrender.com/

---

## 🚀 Features

- 🧑‍🤝‍🧑 **Real-time collaboration**: several users draw at the same time, with no crossed strokes
- 🏠 **Rooms**: create a room or join one with a 6-character code or a shared link
- 🎨 **Drawing tools**: brush, eraser, color palette, custom colors, brush size 1–50
- ↩️ **Shared undo / redo**: history is kept per room (30 steps)
- 🖱️ **Live cursors**: see where everyone is pointing
- 💬 **Live chat** with unread indicator
- 👑 **Host controls**: the host can remove users, and removed users cannot rejoin
- 💾 **Autosave**: canvases are saved to MongoDB and come back after a restart
- 📥 **Download** the canvas as PNG
- 🌙 **Dark mode**, mouse and touch support

## 🛠️ Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, vanilla JavaScript (no build step) |
| Backend | Node.js, Express |
| Real-time | Socket.io |
| Database | MongoDB with Mongoose |
| Tests | Node.js built-in test runner (`node:test`) |
| Hosting | Render |

## 📁 Project structure

```
paint-together/
├── server.js              # entry point: Express, Socket.io, registers features
├── features/              # one folder per feature: code, README, tests
│   ├── rooms/             # create/join/exit, members, host, kick
│   ├── drawing/           # canvas, tools, colors, live strokes
│   ├── history/           # shared undo/redo
│   ├── cursors/           # live remote cursors
│   ├── chat/              # room chat
│   ├── persistence/       # MongoDB connection, Room model, autosave
│   ├── theme/             # dark mode, landing animation
│   └── fake-socket.js     # test helper
├── public/                # static files: index.html, style.css, core.js
├── docs/                  # project documentation
├── .env.example           # environment variables template
└── package.json
```

Each feature folder has a `server.js` (Socket.io handlers) and/or a `client.js`
(browser code), a `README.md`, and a `<name>.test.js`.

## ⚡ Getting started

Requirements: Node.js 20+ and a MongoDB database (local or MongoDB Atlas).

```bash
git clone <repo-url>
cd paint-together
npm install
cp .env.example .env      # then set MONGO_URI
npm run dev
```

Open http://localhost:3000. To try multiplayer, open a second browser window
and join with the room code.

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-restart (nodemon) |
| `npm test` | Run all tests (no database needed) |

## 📚 Documentation

| Doc | Contents |
|-----|----------|
| [Architecture](docs/architecture.md) | How the pieces fit together |
| [API](docs/api.md) | Every Socket.io event and payload |
| [Database](docs/database.md) | MongoDB model and when data is saved |
| [Serving](docs/serving.md) | Ports, static files, environment variables |
| [Development](docs/development.md) | Local setup, testing, debugging |
| [Deployment](docs/deployment.md) | Render setup and deploy checklist |
| [Contributing](docs/contributing.md) | Code style and adding a feature |
| [Progress](docs/progress.md) | Done, planned, and known limitations |

## 📄 License

[MIT](LICENSE) © Vansh Minhas
