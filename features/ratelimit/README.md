# Rate limit

Drops client events that arrive faster than any normal use would send them,
so one client cannot flood a room or fill MongoDB with rooms.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | `register(socket, ctx)` adds a Socket.io middleware; `createBucket`, `LIMITS`. |
| `ratelimit.test.js` | Node | Automated tests (`npm test`). |

`server.js` at the project root registers this feature **first**, so its
`socket.use()` middleware sees every event before any handler.

## Behavior

Each event type has a token bucket: `burst` events at once, then
`perSecond` more per second. An event with no token left is dropped: its
handler never runs and the client gets no reply. The first drop per socket
is logged with `console.warn`.

| Event | Burst | Per second | Scope |
|-------|-------|------------|-------|
| `create-room` | 10 | 1 per 30 s | per IP |
| `join-room` | 20 | 1 | per IP |
| `draw` | 400 | 250 | per socket |
| `cursor-move` | 100 | 60 | per socket |
| `chat-message` | 8 | 1 | per socket |
| `op` | 20 | 10 | per socket |
| `canvas-state` | 10 | 4 | per socket |
| `compact` | 5 | 1 | per socket |
| `set-password` | 5 | 1 per 5 s | per socket (each runs scrypt) |
| anything else | 60 | 30 | per socket |

Per-IP limits use `clientIp()` from `features/passwords/` (last
`X-Forwarded-For` entry behind Render's proxy) and are shared by every socket
from that IP, so reconnecting does not reset them. The per-IP buckets live in
`ctx.rateLimitIps`.

The brush sends about one `draw` per mouse move (60 to 120 per second), far
below 250. Reserved events (`disconnecting`, `disconnect`) never pass through
middleware.

## Tests

Automated (`npm test`): bucket burst and refill (never above burst), 5 s of
120 draws per second never limited, chat flood cut to the burst,
`create-room` limited per IP across new sockets and not across IPs, one log
line per socket.

Manual test cases:

1. Draw quickly for a while: nothing is dropped (strokes stay smooth for the
   other user).
2. In devtools run `for (let i = 0; i < 50; i++) socket.emit('chat-message',
   { roomId: currentRoomId, text: 'x' + i })`: the other user gets 8
   messages, and the server log shows one rate-limit line.

## Known issues

- Users behind one IP (school, office) share the `create-room` and
  `join-room` limits.
- The per-IP map is never pruned. It holds one small entry per IP and event,
  fine for one instance; prune it if the server ever sees very many IPs.
