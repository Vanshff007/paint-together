# Deployment

## Current production

- Host: Render (web service).
- URL: https://paint-together-hchq.onrender.com/
- HTTPS: provided by Render.
- Database: external MongoDB (for example MongoDB Atlas) via `MONGO_URI`.

## Render settings

| Setting | Value |
|---------|-------|
| Runtime | Node |
| Build command | `npm install` |
| Start command | `npm start` |
| Environment | `MONGO_URI` (required). Render sets `PORT`. |

WebSockets work on Render web services with no extra settings.

## Deploy checklist

1. The app runs locally with `npm start` and a real `MONGO_URI`.
2. Multiplayer manual test passes (see `docs/development.md`).
3. `npm test` passes.
4. `MONGO_URI` is set in the Render dashboard. Never put it in the repo.
5. If you use MongoDB Atlas, the network access list allows Render
   (for example `0.0.0.0/0` with a strong password, or Render's outbound IPs).
6. Push to the deployed branch (`main`). Render redeploys.
7. After deploy, open the URL, create a room, and join it from a second device.

## Operational notes

- Free Render instances sleep when idle. The first request after sleep is slow.
  Sockets disconnect when the instance sleeps.
- A restart or redeploy clears all in-memory state (users, undo/redo). Canvases
  come back from MongoDB, up to the last autosave (max 30 s old).
- Run only **one** instance. `roomData` is in memory, so several instances do
  not share rooms. Scaling needs a Socket.io adapter (Redis) and shared state.

## Custom domain

1. Add the domain in Render (Settings, Custom Domains).
2. Add the DNS record that Render shows (CNAME, or A/ALIAS for apex).
3. Render issues the TLS certificate automatically.
4. Optional: set the Socket.io `cors.origin` in `server.js` to the new domain.

## Rollback

Use Render's "Rollback" to a previous deploy. Do not rewrite Git history to
roll back.
