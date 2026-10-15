# Origin

Lets only pages served by this site open a Socket.io connection.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | `allowRequest(req, callback)` for the Socket.io server options. |
| `origin.test.js` | Node | Automated tests (`npm test`). |

There is no client code and no socket handler. `server.js` at the project
root passes `allowRequest` to `socketIo(server, { allowRequest })`.

## Behavior

Socket.io calls `allowRequest` for every new connection, on both transports
(HTTP long-polling and WebSocket).

- No `Origin` header: allowed. Browsers always send `Origin` on these
  requests, so this is a non-browser client. The check protects visitors'
  browsers from other websites; it is not authentication.
- `Origin` host (host and port) equal to the request's `Host` header:
  allowed. The scheme is not compared, so it works behind Render's HTTPS
  proxy.
- Anything else, including `null` (sandboxed frames) and malformed values:
  rejected. Polling gets HTTP 403, WebSocket gets HTTP 400.

No CORS headers are sent. CORS only covers HTTP requests, never WebSocket,
so a CORS allow-list alone would not stop another site from connecting.

It needs no configuration: localhost, the Render URL and a custom domain all
work because the page and the socket always share a host.

## Tests

Automated (`npm test`): same host allowed (with ports), other sites
rejected (including look-alike hosts and other ports), missing `Origin`
allowed, `null` and malformed origins rejected.

Manual test cases:

1. Open the app and join a room: it works.
2. From another site's devtools console (for example `https://example.com`),
   run `new WebSocket('wss://<your-host>/socket.io/?EIO=4&transport=websocket')`:
   the connection fails.

## Known issues

- A non-browser client can still connect (it can send any `Origin`). Do not
  treat this check as authentication.
