# Rooms

Room lifecycle and membership: landing screen, create/join/exit, members list,
host role, host hand-over, and kicking users.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | Socket handlers: `create-room`, `join-room`, `kick-user`, `disconnecting`, `disconnect`. Helpers `generateRoomId`, `getRoomUserCount`, `randomUserColor`. |
| `client.js` | Browser | Landing form, `?room=` link prefill, copy link, exit, members dropdown, kick modal, and room socket events. |
| `rooms.test.js` | Node | Automated tests (`npm test`). |

## Server behavior

- `create-room { userName, password? }`: a non-empty password is hashed and
  stored as `roomData[roomId].passwordHash` (and in MongoDB).
  Generates a 6-char ID that no live room and no
  saved room uses, creates `roomData[roomId]`
  with the creator as host, asks persistence to create the MongoDB document,
  and replies `room-created`.
- `join-room { roomId, userName }` (or a bare `roomId` string):
  - If the room is not in memory, tries `persistence.loadRoom()`, including
    its password hash. A restored room has no host until the first user gets
    in (passes the ban and password checks); that user becomes host, because
    the stored host socket is gone. If two users restore the same room at
    once, the first restore wins.
  - Room with a password: the `password` field is checked
    (`features/passwords/`). Missing, wrong, or too many wrong tries from
    this IP: replies `join-password` and does not join.
  - Unknown room: replies `room-not-found`.
  - Else replies `room-joined`, broadcasts `user-count-update`, `users-update`,
    `user-joined`, and sends `existing-users` to the joiner.
- `kick-user { roomId, targetSocketId }`: only the host, never themselves.
  The target's `clientId` is added to `roomData[roomId].banned` and its IP to
  `bannedIps` for 1 hour, then the target gets `kicked` and is disconnected
  after 500 ms.
- `join-room` from a banned `clientId`, or from a new browser on a banned IP,
  gets `join-banned` and is not added.
- `set-password { roomId, password }`: host only. Sets a new password, or
  removes it when empty. Replies `password-set { locked }`.
- Every browser that gets in is added to `roomData[roomId].members` (max 500).
  Members skip the password and IP bans.
- Malformed payloads (`null`, non-string `roomId` or `userName`) are ignored.
  A non-string or empty name uses the default name.
- `inRoom(socket, roomId)` is exported for every feature: true only when
  `roomId` is a string and the socket has joined it. `kick-user` uses it too.

## Kick ban

The client makes a random ID once (`crypto.randomUUID()`), stores it in
`localStorage` as `clientId`, and sends it with `create-room` and
`join-room`. The server keeps it on `socket.data` only, never in
`users`, so other users never see it.

A kick also bans the target's IP for 1 hour, for browsers that were never in
the room. So a private window or another browser on the same network cannot
rejoin right away, while members already in from that network (same school or
home) can.

Bans are saved with the room (`banned`, `bannedIps` in MongoDB), so they
survive restarts and empty rooms.

Limits (deliberate, no user accounts):

- A new IP (mobile data, VPN) plus a new browser can still rejoin. After an
  hour, a new browser on the same IP can too.
- New people on a kicked user's network are blocked for that hour as well.
- Tabs of the same browser share one ID. If the host kicks a tab from their
  own browser, no ban is added, so the host never locks themselves out.
- Clients that send no `clientId` are banned by IP only.
- `disconnecting`: removes the user, hands host to the first remaining user,
  and when the room becomes empty saves it and deletes it from memory.

User names are trimmed and cut to 20 characters. The per-socket `session`
object (`{ userColor, currentName }`) is shared with the cursors feature.

## Client behavior

- Enter on the name or password field creates a room, or joins if a code is
  filled in.
- The optional "Room Password" field is sent with both create and join. Once
  the room opens, the field is cleared and the password is kept in a variable
  (memory only, never stored) so a reconnect can rejoin.
- `join-password` puts the room code in the code field, focuses the password
  field, and shows "This room needs a password.", "Wrong password. Try
  again." or "Too many wrong passwords. Wait N s.". During a reconnect it
  first returns to the landing screen.
- Landing errors disappear after 3 s; a newer error restarts that timer.
- `room-created` / `room-joined` switch to the app screen (`showApp()` in
  `public/core.js`) and push `/?room=<ID>` to the URL.
- `existing-users` fills the members list and creates cursors for other users.
- Exit and kick both reset the canvas, history, chat, members and cursors,
  then return to the landing screen (kick uses `returnToLanding()`).
- Reconnect: a Socket.io reconnect gives a new socket that is not in the room.
  On `connect`, if `currentRoomId` is set, the client sends `join-room` again
  (`rejoining = true`). On `room-joined` it stays on the app screen, replaces
  the canvas with the server copy (anything drawn while offline is dropped),
  and shows "🔄 Reconnected". If the room is gone (`room-not-found`, for
  example after a server restart with no saved copy) or the browser is banned
  (`join-banned`), it returns to the landing screen with the error.

Uses globals from `public/core.js` (`socket`, `currentRoomId`, `myName`,
`amIHost`, ...) and functions from other features (`removeCursor`,
`ensureCursorExists`, `loadCanvasState`, `updateUndoRedoButtons`,
`animateSplash`).

## Tests

Automated (`npm test`): room ID format, create (host, name trimming, default
name), join (existing, bare string, unknown, restored from DB), kick rules,
kick ban (same browser blocked, others allowed, no ban without `clientId`,
no self-ban for the host's browser, `clientId` validation),
host hand-over, save and cleanup on last leave, `inRoom`, malformed
payloads (create, join, kick), kick needs membership, no room ID reuse
(live or saved), two joins restoring the same room at once, passwords
(required, wrong, right, bare-string join, never sent to clients, ignored by
open rooms, 5 wrong tries lock the IP for 30 s, a missing password is not a
wrong try, restored rooms keep their password and only a user who gets in
becomes host, room leaving memory during the check).

Manual test cases (two browser windows):

1. Create a room with an empty name: error "Please enter your name first!".
2. Create a room: app opens, URL has `?room=<ID>`. After B joins, A's name badge shows 👑.
3. Join with a wrong code: "Room ... not found" error.
4. Open a `?room=<ID>` link: the code field is prefilled.
5. Copy Link: button shows "✅ Copied!" and the clipboard has the link.
6. Members dropdown lists both users; only the host sees ✕ buttons.
7. Host kicks B: B returns to landing with a toast; A's count drops to 1.
   B can join other rooms without reloading.
8. B tries the same room code again: error "You were removed from room ...
   and can't rejoin.". In a private window B can join (known limit).
9. Host closes the tab: B becomes host (toast "You are now the host!").
10. Exit: returns to landing, canvas and chat are empty.
11. Reconnect: A and B in a room. In A's devtools run `socket.io.engine.close()`.
    A shows "🔄 Reconnected", stays in the room, and chat and drawing still
    work both ways.
12. Offline changes: run `socket.disconnect()` in A, draw in B, then
    `socket.connect()` in A: A's canvas shows B's drawing.
13. Server restart with no saved room: both windows return to landing with
    "Room ... not found".
14. A creates a room with a password: toast mentions the password, the field
    is cleared. B joins with no password: "This room needs a password.". With
    a wrong one: "Wrong password.". With the right one: B is in.
15. With a password room open, run `socket.io.engine.close()` in B: B
    reconnects without being asked again.
16. Everyone leaves a password room, then someone joins the code again: the
    password is still required, and the first user in becomes host.
17. Six wrong passwords in a row: the sixth shows "Wait 30 s", and even the
    right password is refused until then.
18. Host kicks B, B opens a private window and joins: "You can't join room
    ...: the host removed you or someone on your network.".
19. Host opens Members, clicks "🔒 Set password", enters a new one: toast "New
    password set". A new browser needs the new password; B's earlier
    browser and the host's get in with no password, even after everyone left.
20. "🔒 Set password" with an empty value: toast "Password removed", anyone can
    join.

## Known issues

- Strokes drawn while disconnected are lost on reconnect.
