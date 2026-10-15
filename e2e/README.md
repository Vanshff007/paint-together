# Browser tests (e2e)

End-to-end smoke tests that drive two real Chrome windows against the real
server code. They cover what the Node unit tests cannot: browser code,
canvas pixels, and two users talking through Socket.io.

## Run

```
npm run test:e2e
```

- Needs Google Chrome installed. `playwright-core` (dev dependency) drives the
  installed Chrome (`channel: 'chrome'`), so no browser is downloaded.
- No MongoDB needed: `createServer()` from `server.js` gets an in-memory
  Room model. The server listens on a random free port.
- Headless: no windows open.
- Not part of `npm test` (the file is `*.e2e.js`, which `node --test` does
  not pick up by default), so `npm test` stays fast and needs no browser.

## Tests

| Test | Checks |
|------|--------|
| two users: join, draw, chat and undo stay in sync | Create and join through the landing form, a real mouse stroke appears on the other canvas, a chat message arrives, Undo from the other user clears the stroke on both. |
| a password room needs the password | "needs a password", "Wrong password", then the right password joins. |
| shapes and fill reach the other user | R shortcut, rectangle drag, F shortcut, red fill inside; the other user sees red inside and nothing outside. |
| fixed canvas: same pixels on a phone and a desktop, resizing keeps them | Both canvases are 1280×800; a rectangle and fill give the same red area on a 390 px phone and a desktop; resizing the window changes no pixel; `toCanvasPos` maps the corner inside the border to 0,0. |
| phone: one finger draws, two fingers pinch-zoom without drawing, ... | Real multi-touch through the DevTools protocol: one finger draws; a two-finger spread zooms over 2x and draws nothing; a stroke while zoomed lands on the canvas pixel under the finger. |
| text and an inserted image reach the other user | T, click, type, Enter: the other user sees the text. A 400×200 blue PNG through the file input appears centered for the other user, with nothing outside it. Escape closes a text box without drawing. |
| a chat flood is cut by the rate limit; history survives in the saved room | 50 chat messages at once reach the other user as 8 (the burst). Everyone leaves, the room is saved and leaves memory; a new joiner gets the same chat history back from the saved room. |

Each user is a separate browser context (own `localStorage`, so its own
`clientId`). Any page error in a browser fails the test.

## Adding a test

Use the helpers in `smoke.e2e.js`: `openUser()`, `createRoom()`,
`joinRoom()`, `drag()` (fractions of the canvas), `pixel()`,
`waitForPixel()`, and `closeUsers()` at the end (it also checks that the
browser had no errors). Read canvas state with `page.evaluate` on the page's
globals (`ctx`, `canvas`, `currentRoomId`).
