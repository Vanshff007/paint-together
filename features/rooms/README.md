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

- `create-room { userName }`: generates a 6-char ID, creates `roomData[roomId]`
  with the creator as host, asks persistence to create the MongoDB document,
  and replies `room-created`.
- `join-room { roomId, userName }` (or a bare `roomId` string):
  - If the room is not in memory, tries `persistence.loadRoom()`. A restored
    room makes the joiner host, because the stored host socket is gone.
  - Unknown room: replies `room-not-found`.
  - Else replies `room-joined`, broadcasts `user-count-update`, `users-update`,
    `user-joined`, and sends `existing-users` to the joiner.
- `kick-user { roomId, targetSocketId }`: only the host, never themselves.
  The target gets `kicked` and is disconnected after 500 ms.
- `disconnecting`: removes the user, hands host to the first remaining user,
  and when the room becomes empty saves it and deletes it from memory.

User names are trimmed and cut to 20 characters. The per-socket `session`
object (`{ userColor, currentName }`) is shared with the cursors feature.

## Client behavior

- Enter on the name field creates a room, or joins if a code is filled in.
- `room-created` / `room-joined` switch to the app screen (`showApp()` in
  `public/core.js`) and push `/?room=<ID>` to the URL.
- `existing-users` fills the members list and creates cursors for other users.
- Exit and kick both reset the canvas, history, chat, members and cursors,
  then return to the landing screen.

Uses globals from `public/core.js` (`socket`, `currentRoomId`, `myName`,
`amIHost`, ...) and functions from other features (`removeCursor`,
`ensureCursorExists`, `loadCanvasState`, `updateUndoRedoButtons`,
`animateSplash`).

## Tests

Automated (`npm test`): room ID format, create (host, name trimming, default
name), join (existing, bare string, unknown, restored from DB), kick rules,
host hand-over, save and cleanup on last leave.

Manual test cases (two browser windows):

1. Create a room with an empty name: error "Please enter your name first!".
2. Create a room: app opens, URL has `?room=<ID>`. After B joins, A's name badge shows 👑.
3. Join with a wrong code: "Room ... not found" error.
4. Open a `?room=<ID>` link: the code field is prefilled.
5. Copy Link: button shows "✅ Copied!" and the clipboard has the link.
6. Members dropdown lists both users; only the host sees ✕ buttons.
7. Host kicks B: B returns to landing with a toast; A's count drops to 1.
   B can join a room again without reloading.
8. Host closes the tab: B becomes host (toast "You are now the host!").
9. Exit: returns to landing, canvas and chat are empty.

## Known issues

- Room IDs are not checked for collisions.
