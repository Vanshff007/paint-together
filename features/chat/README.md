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
- The last 50 messages (`MAX_CHAT_HISTORY`) are kept as
  `roomData[roomId].chat`. A message marks the room `dirty`, so autosave
  writes the history to MongoDB (`chat` field) with the canvas, and a
  restored room brings it back.
- `chat-history roomId` (sender must be in the room): replies `chat-history`
  with `[{ author, text }]`, oldest first.

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
- History shows every message with its author's name, also your own (not
  "You"): two tabs in one browser, or two users with the same name, cannot be
  told apart reliably, so the client does not guess.

## Tests

Automated (`npm test`): relay with only `author`/`text`, no echo to sender,
missing `roomId` ignored, sender not in the room ignored, malformed payloads
ignored, client-sent `author` ignored, text trimmed and capped, history
returned in order, capped at 50, empty history, membership and malformed
payloads for `chat-history`.

Manual test cases (two browser windows in one room):

1. Send "hi" from A: B shows it with A's name; A shows it as "You".
2. With B's popup closed: the unread dot appears; opening the popup clears it.
3. Send `<b>x</b>`: it shows as plain text, not bold.
4. Send only spaces: nothing is sent.
5. In A's devtools run `socket.emit('chat-message', { roomId: currentRoomId,
   author: 'B', text: 'fake' })`: B sees it under A's name, not "B".
6. B sends two messages, then C joins: C sees both under B's name, oldest
   first, with no unread dot.

## Known issues

- Messages from the last autosave interval (up to 30 s) are lost if the
  server crashes. A normal last-user-leaves save keeps them.
