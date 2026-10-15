# Chat

Text chat for the users in a room.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | Relays `chat-message` to the other users in the room, keeps the last 50 messages, answers `chat-history`. |
| `client.js` | Browser | Chat button, popup, sending, rendering, unread dot. |
| `chat.test.js` | Node | Automated tests (`npm test`). |

## Server behavior

- `chat-message { roomId, text }`: relayed to others as `{ author, text }`.
  `author` is the sender's server-side name (`session.currentName`), so
  nobody can post as someone else. `text` must be a string; it is trimmed
  and cut to 200 characters (`MAX_MESSAGE_LENGTH`), and empty text is dropped. The sender is not echoed; the client renders its own
  message locally.
- The last 50 messages (`MAX_CHAT_HISTORY`) are kept in memory as
  `roomData[roomId].chat`, with the sender's `clientId`. They are lost on
  restart or when the room empties (not saved to MongoDB).
- `chat-history roomId` (sender must be in the room): replies `chat-history`
  with `[{ author, text, own }]`. `own` is true when the message came from the
  asker's browser (same `clientId`). The `clientId` itself is never sent.

## Client behavior

- Enter or Send posts the message. Empty messages and messages outside a room
  are ignored. The input is limited to 200 characters (`maxlength`).
- Messages are rendered with `textContent`, so HTML in a message is shown as
  text. Keep it that way.
- A dot on the chat button shows unread messages while the popup is closed.
- Clicking outside the popup closes it.
- After every `room-joined` (also after a reconnect) the client sends
  `chat-history` and replaces the message list with the reply, so a rejoin
  does not duplicate messages. History does not show the unread dot.

## Tests

Automated (`npm test`): relay with only `author`/`text`, no echo to sender,
missing `roomId` ignored, sender not in the room ignored, malformed payloads
ignored, client-sent `author` ignored, text trimmed and capped, history
returned in order with `own` flags, capped at 50, no `clientId` leak,
membership and malformed payloads for `chat-history`.

Manual test cases (two browser windows in one room):

1. Send "hi" from A: B shows it with A's name; A shows it as "You".
2. With B's popup closed: the unread dot appears; opening the popup clears it.
3. Send `<b>x</b>`: it shows as plain text, not bold.
4. Send only spaces: nothing is sent.
5. In A's devtools run `socket.emit('chat-message', { roomId: currentRoomId,
   author: 'B', text: 'fake' })`: B sees it under A's name, not "B".
6. B sends two messages, then C joins: C sees both, oldest first, with no
   unread dot. A reloads and rejoins: A's own messages show as "You".

## Known issues

- History is in memory only: lost on restart or when the room empties.
