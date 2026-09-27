# Serving

One Node.js process serves both the frontend and the real-time server on the
same port.

## Entry point

`server.js` (`"main"` in `package.json`).

Startup order:

1. `require('dotenv').config()` loads `.env`.
2. Express app and `http.createServer(app)` are created.
3. Socket.io is attached to the same HTTP server.
4. `connectDB()` connects to MongoDB (exits on failure).
5. `server.listen(PORT)`.

## Port

```js
const PORT = process.env.PORT || 3000;
```

Hosting platforms (for example Render) set `PORT`. Locally it is `3000`.

## Static files

```js
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/features/:name([a-z]+)/client.js', ...); // only client.js, from features/
```

- Everything in `public/` is public. Never put secrets or server code there.
- `features/` is **not** static. Only `features/<name>/client.js` is served,
  through the route above. Server code, tests, and READMEs return 404.
- Paths in HTML are relative (`style.css`, `core.js`) or root-absolute
  (`/socket.io/socket.io.js`, `/features/<name>/client.js`).
- No caching headers, compression, or build step are configured.

## Socket.io

```js
const io = socketIo(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
```

- Same origin and port as the page. The client connects with `io()` and no URL.
- CORS allows every origin. The app does not need this because the page and
  socket are same-origin. You can restrict it to the production domain.
- Default `maxHttpBufferSize` (1 MB) applies to every message. Canvas events
  (`save-undo-snapshot`, `stroke-complete`) send full PNG data URLs. A message
  larger than 1 MB closes the connection.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `MONGO_URI` | Yes | MongoDB connection string. |
| `PORT` | No | HTTP port. Default `3000`. |

`.env` is in `.gitignore`. Never commit it.
