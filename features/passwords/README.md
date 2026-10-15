# Passwords

Optional room passwords: hashing, checking, and a limit on wrong guesses.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | Helpers used by the rooms feature. No socket handlers of its own. |
| `passwords.test.js` | Node | Automated tests (`npm test`). |

The landing field, the `join-password` prompt and the join checks live in
the rooms feature (`features/rooms/`), which calls these helpers.

## API

| Function | Behavior |
|----------|----------|
| `parsePassword(data)` | `data.password` if it is a non-empty string, cut to 64 chars (`MAX_PASSWORD_LENGTH`); else `null`. Not trimmed: spaces count. |
| `hashPassword(password)` | Async. Random 16-byte salt, `crypto.scrypt` (Node's built-in, default cost), 32-byte key. Returns `"salt:hash"` in hex. |
| `checkPassword(password, stored)` | Async. `true` if `stored` is empty (open room) or the password matches. Compares with `crypto.timingSafeEqual`. A corrupt `stored` never matches. |
| `clientIp(socket)` | The last `X-Forwarded-For` entry (added by Render's proxy; earlier entries can be faked by the client), else the socket address. |
| `createLimiter(now)` | `{ waitFor(ip), fail(ip), reset(ip) }`. After 5 wrong tries (`MAX_FAILED_TRIES`) an IP waits 30 s (`LOCKOUT_MS`). A right password resets the count. |

Hashing is async (`util.promisify(crypto.scrypt)`), so it runs on Node's
thread pool and does not block other rooms. No new dependency.

## Where the hash lives

- `roomData[roomId].passwordHash` in memory.
- The `passwordHash` field of the `Room` document in MongoDB (set on create,
  written on every save), so the password survives restarts.
- Never in any message to a client. Only the browser that typed the password
  keeps it, in a variable, for reconnects.

## Tests

Automated (`npm test`): `parsePassword` (exact string, cut, bad input),
hash format, different salts, right and wrong passwords (case, trailing
space, missing), open rooms, corrupt hashes, `clientIp`, limiter lockout and
expiry per IP, reset after a right password.

Room-level behavior (join flow, restore, lockout across sockets) is tested in
`features/rooms/rooms.test.js`. Manual test cases are in
`features/rooms/README.md` (14 to 17).

## Known issues

- No reset for a forgotten password. Once everyone leaves, the room cannot be
  opened until MongoDB deletes it (30 days after the last save).
- The limiter is in memory: a restart clears it. With several server
  instances each would have its own (the app runs one).
- Several people behind one IP (school, office) share the wrong-guess limit.
- On plain-HTTP localhost the password is sent unencrypted. Production uses
  HTTPS.
