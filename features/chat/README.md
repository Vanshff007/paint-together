# Chat

Text chat for the users in a room.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `server.js` | Node | Relays `chat-message` to the other users in the room. |
| `client.js` | Browser | Chat button, popup, sending, rendering, unread dot. |
| `chat.test.js` | Node | Automated tests (`npm test`). |

## Server behavior

- `chat-message { roomId, text }`: relayed to others as `{ author, text }`.
  `author` is the sender's server-side name (`session.currentName`), so
  nobody can post as someone else. `text` must be a string; it is trimmed
  and cut to 200 characters (`MAX_MESSAGE_LENGTH`), and empty text is dropped. The sender is not echoed; the client renders its own
  message locally.
- Messages are not stored. New users do not see earlier messages.

## Client behavior

- Enter or Send posts the message. Empty messages and messages outside a room
  are ignored. The input is limited to 200 characters (`maxlength`).
- Messages are rendered with `textContent`, so HTML in a message is shown as
  text. Keep it that way.
- A dot on the chat button shows unread messages while the popup is closed.
- Clicking outside the popup closes it.

## Tests

Automated (`npm test`): relay with only `author`/`text`, no echo to sender,
missing `roomId` ignored, sender not in the room ignored, malformed payloads
ignored, client-sent `author` ignored, text trimmed and capped.

Manual test cases (two browser windows in one room):

1. Send "hi" from A: B shows it with A's name; A shows it as "You".
2. With B's popup closed: the unread dot appears; opening the popup clears it.
3. Send `<b>x</b>`: it shows as plain text, not bold.
4. Send only spaces: nothing is sent.
5. In A's devtools run `socket.emit('chat-message', { roomId: currentRoomId,
   author: 'B', text: 'fake' })`: B sees it under A's name, not "B".

## Known issues

- Messages are not stored. New users do not see earlier messages.
