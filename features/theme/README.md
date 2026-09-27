# Theme

Visual extras that need no server: the light/dark theme toggle and the
animated bubble background on the landing screen.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `client.js` | Browser | `applyTheme()`, toggle buttons, splash canvas animation (`animateSplash()`). |

There is no server code, so there is no automated test file. Test with the
manual cases below.

## Behavior

- The app always starts in light mode, and any old `theme` value in
  `localStorage` is removed on load.
- `darkToggleBtn` (landing) and `darkToggleBtnApp` (app header, wired by
  `initAppDarkMode()` from `showApp()`) switch `html[data-theme]` between
  `light` and `dark`. Colors come from CSS variables in `public/style.css`.
- The splash animation draws 14 moving, pulsing radial gradients. It stops
  when the landing screen is hidden. The rooms feature restarts it on exit
  or kick with `animateSplash()`.

## Manual test cases

1. Load the page: light theme, bubbles move on the landing screen.
2. Click 🌙 on the landing screen: dark theme, button shows ☀️.
3. Enter a room and click the header toggle: theme switches.
4. Reload: the page is light again.
5. Exit a room: the landing animation runs again.
6. Resize the window: the bubbles fill the whole screen.
