# Theme

Visual extras that need no server: the light/dark theme toggle and the
animated bubble background on the landing screen.

## Files

| File | Runs in | Purpose |
|------|---------|---------|
| `client.js` | Browser | `applyTheme()`, toggle buttons, splash canvas animation (`animateSplash()`). |
| `theme.test.js` | Node | Checks that the version in the landing title bar (`public/style.css`) matches `package.json`. |

There is no server code. Test the browser behavior with the manual cases
below.

## Behavior

- On load, the theme comes from `localStorage` `theme` if the user has used
  the toggle before. Otherwise it follows the system/browser setting
  (`prefers-color-scheme`).
- Until the user uses the toggle, the page also follows live system changes
  (for example a phone that switches to dark at night).
- The toggle (`toggleTheme()`) saves the choice to `localStorage`, so it wins
  over the system setting on later visits.
- `darkToggleBtn` (landing) and `darkToggleBtnApp` (app header, wired by
  `initAppDarkMode()` from `showApp()`) switch `html[data-theme]` between
  `light` and `dark`. Colors come from CSS variables in `public/style.css`.
- The splash animation draws 14 moving, pulsing radial gradients. It stops
  when the landing screen is hidden. The rooms feature restarts it on exit
  or kick with `animateSplash()`.

## Manual test cases

1. Clear site data. Load the page with the system/browser in light mode: light
   theme, bubbles move on the landing screen. With the system in dark mode:
   dark theme.
2. Click 🌙 on the landing screen: dark theme, button shows ☀️.
3. Enter a room and click the header toggle: theme switches.
4. Reload: the theme you picked with the toggle stays.
5. Clear site data, load the page, then switch the system theme: the page
   follows. Click the toggle, then switch the system theme again: the page
   no longer follows.
6. Exit a room: the landing animation runs again.
7. Join a room again and click the header toggle once: the theme switches
   once (the listener is not added twice).
8. Resize the window: the bubbles fill the whole screen.
