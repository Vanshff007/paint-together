# Shortcuts

Keyboard shortcuts for undo/redo and the drawing tools.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `client.js` | Browser (`shortcutFor` also loads in Node) | Maps a key press to a toolbar button and clicks it. |
| `shortcuts.test.js` | Node | Automated tests for `shortcutFor` (`npm test`). |

There is no server code.

## Keys

| Keys | Action |
|------|--------|
| Ctrl+Z (Cmd+Z on macOS) | Undo |
| Ctrl+Y, Ctrl+Shift+Z (Cmd+Y, Cmd+Shift+Z) | Redo |
| B | Brush |
| E | Eraser |
| L | Line |
| R | Rectangle |
| O | Ellipse (circle tool) |
| F | Fill |

Letters work in upper or lower case. Any key with Alt, and letter keys with
Ctrl or Cmd (Ctrl+F, Cmd+R, ...), are left to the browser.

## Behavior

- A shortcut clicks the matching toolbar button, so it does exactly what the
  button does, and a disabled Undo/Redo button does nothing.
- Shortcuts only work on the app screen, not on the landing screen.
- While typing in an input, textarea, select, or editable element (chat, name
  field), keys go to that element. Ctrl+Z there undoes the typed text, not
  the canvas.
- These shortcuts used to live in the history feature, which handled
  Ctrl+Z / Ctrl+Y even while typing in the chat.

## Tests

Automated (`npm test`): Ctrl and Cmd variants of undo and redo, every tool
letter in both cases, browser shortcuts and other keys return `null`.

Manual test cases (in a room):

1. Draw a stroke, press Ctrl+Z: it is undone. Ctrl+Y: it comes back.
2. Press R, drag on the canvas: a rectangle is drawn and Rect is
   highlighted. Press B: Brush is highlighted.
3. Open the chat, type "brb": the text appears and the tool does not change.
   Ctrl+Z there removes the text, the canvas stays.
4. On the landing screen, press E: nothing happens.
5. Ctrl+F still opens the browser's find bar.

## Known issues

- There is no on-screen list of shortcuts. The tool buttons show their key in
  the tooltip (`title`).
