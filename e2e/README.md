# Browser tests (e2e)

End-to-end smoke tests that drive two real browser windows (Chrome by
default, or Firefox / WebKit) against the real server code. They cover what the Node unit tests cannot: browser code,
canvas pixels, and two users talking through Socket.io.

## Run

```
npm run test:e2e           # installed Chrome
npm run test:e2e:firefox   # Playwright's Firefox
npm run test:e2e:webkit    # Playwright's WebKit (Safari's engine)
```

Firefox and WebKit are Playwright's own builds. Install them once with
`npx playwright-core install firefox webkit`. `E2E_BROWSER=firefox` (or
`webkit`, `chrome`) picks the engine too. The pinch-zoom test needs the
DevTools protocol, so it runs in Chrome only and is skipped in the others.
Firefox has no mobile emulation, so its phone tests use a small touch window.

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
| two users: join, draw, chat and undo stay in sync | Create and join through the landing form, a real mouse stroke appears on the other canvas, a chat message arrives, the other user has nothing to undo, and the drawer's Undo clears the stroke on both. |
| a password room needs the password | "needs a password", "Wrong password", then the right password joins. |
| shapes and fill reach the other user | R shortcut, rectangle drag, F shortcut, red fill inside; the other user sees red inside and nothing outside. |
| fixed canvas: same pixels on a phone and a desktop, resizing keeps them | Both canvases are 1280×800; a rectangle and fill give the same red area on a 390 px phone and a desktop; resizing the window changes no pixel; `toCanvasPos` maps the corner inside the border to 0,0. |
| phone: one finger draws, two fingers pinch-zoom without drawing, ... | Real multi-touch through the DevTools protocol: one finger draws; a two-finger spread zooms over 2x and draws nothing; a stroke while zoomed lands on the canvas pixel under the finger. |
| text and an inserted image reach the other user | T, click, type, Enter: the other user sees the text. A 400×200 blue PNG through the file input appears centered for the other user, with nothing outside it. Escape closes a text box without drawing. |
| per-user undo: each user undoes only their own changes; joiners and reconnects agree | Alice draws, Bob draws, Alice draws again. Bob's Undo removes only his line. Alice undoes twice, both redo. A new joiner sees the same picture and has nothing to undo. Bob reconnects and can still undo his change. |
| over 200 changes, the oldest are flattened into the base and the picture stays right | 205 changes at the rate limit; the server asks the sender to flatten 100, the base is set, the other user's history shrinks to match, and after an Undo everyone's redraw still shows the old strokes (from the base) and hides the undone one. About 40 s. |
| a canvas over 1 MB (Socket.io default limit) still reaches the server | A 3 MB `canvas-state` is stored and the sender stays connected. |
| kick blocks a private window; members reopen a password room and keep their undo | Host kicks Bob through the members list; Bob in a new browser with the right password gets the ban message. Host sets a new password (prompt). Everyone leaves; the host reopens the room with no password, sees the stroke, and can still undo it. |
| changes carry no canvas; the full canvas reaches the server once the user pauses | After a stroke the server has the change but no canvas; within the pause the canvas arrives. |
| eyedropper picks a color from the canvas, then goes back to the brush | K on a red fill selects the red swatch and the brush; K on empty canvas gives white. |
| select and move: the other user sees the move, and Undo puts it back | S, drag a box around a stroke, drag it by half the canvas: the other user sees it moved and the old spot empty; Undo moves it back; Escape hides the box. |
| view-only room: only the host draws until the host unlocks it | Host makes the room view-only: the other user's toolbar is dimmed, their drag draws nothing, a hand-sent `clear` is dropped; the host still draws; a joiner sees the lock; after unlocking, the other user draws again. |
| a chat flood is cut by the rate limit; history survives in the saved room | 50 chat messages at once reach the other user as 8 (the burst). Everyone leaves, the room is saved and leaves memory; a new joiner gets the same chat history back from the saved room. |

Per-IP rate limits are reset before each test (every test user is on
localhost). CI runs all three engines (`.github/workflows/test.yml`).

Each user is a separate browser context (own `localStorage`, so its own
`clientId`). Any page error in a browser fails the test.

## Adding a test

Use the helpers in `smoke.e2e.js`: `openUser()`, `createRoom()`,
`joinRoom()`, `drag()` (fractions of the canvas), `pixel()`,
`waitForPixel()`, and `closeUsers()` at the end (it also checks that the
browser had no errors). Read canvas state with `page.evaluate` on the page's
globals (`ctx`, `canvas`, `currentRoomId`).
