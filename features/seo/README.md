# SEO

Files that search engines, AI tools, browsers, and link previews look for at
the site root: `robots.txt`, `llms.txt`, `sitemap.xml`, the Open Graph image,
icons, and the web app manifest. All of them live in this folder.

## Files

| File | Served at | Purpose |
|------|-----------|---------|
| `static/robots.txt` | `/robots.txt` | Tells crawlers they may index the site, but not room links (`/*?room=`) or `/socket.io/`. Points to the sitemap. |
| `static/sitemap.xml` | `/sitemap.xml` | Lists the only public page, `/`. |
| `static/llms.txt` | `/llms.txt` | Plain-language summary of the app for AI assistants and LLM crawlers ([llmstxt.org](https://llmstxt.org)). |
| `static/og-image.png` | `/og-image.png` | 1200×630 link preview image (WhatsApp, Slack, Discord, X, LinkedIn, ...). |
| `static/favicon.svg` | `/favicon.svg` | Browser tab icon. |
| `static/apple-touch-icon.png` | `/apple-touch-icon.png` | 180×180 icon for "Add to Home Screen" on iOS. |
| `static/site.webmanifest` | `/site.webmanifest` | Name, colors, and icons when the site is installed on a phone. |
| `og-image.html` | not served | Source of `og-image.png`. |
| `seo.test.js` | not served | Automated tests (see below). |

## How it is served

`server.js` mounts `static/` at the site root, after `public/`:

```js
app.use(express.static(path.join(__dirname, 'features', 'seo', 'static')));
```

Only `static/` is public. `og-image.html`, the tests, and this README return
404. Never put secrets or server code in `static/`.

`public/index.html` links the icons and manifest and has the `description`,
`canonical`, `theme-color`, Open Graph (`og:*`), and Twitter card tags.

## Site URL

The full URL `https://paint-together-hchq.onrender.com` appears in
`robots.txt`, `sitemap.xml`, `llms.txt`, and the `canonical`, `og:url`,
`og:image`, and `twitter:image` tags in `public/index.html`. Link previews
need absolute URLs. If the domain changes, update all of them (search for
`paint-together-hchq`). `seo.test.js` uses the same URL.

## Regenerate the images

`og-image.png` and `apple-touch-icon.png` are screenshots made with headless
Chrome. Run from this folder (Git Bash on Windows, adjust the Chrome path on
other systems):

```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CHROME" --headless=new --hide-scrollbars --window-size=1200,630 \
  --virtual-time-budget=4000 --screenshot="$PWD/static/og-image.png" \
  "file:///$PWD/og-image.html"
```

For `apple-touch-icon.png`, open an HTML page with
`<img src="static/favicon.svg" width=180 height=180>` and screenshot it at
`--window-size=180,180`.

After changing `og-image.png`, social sites may keep the old preview for a
while. Use their preview debuggers to refresh it (for example the Facebook
Sharing Debugger or LinkedIn Post Inspector).

## Tests

`seo.test.js` (runs with `npm test`, no server needed) checks that:

1. `robots.txt` allows `/`, blocks `/*?room=`, and points to the sitemap.
2. `sitemap.xml` lists the home page URL.
3. `llms.txt` has a `#` title, a `>` summary, and a link to the live app.
4. `site.webmanifest` is valid JSON and all its icons exist.
5. `og-image.png` is 1200×630 and `apple-touch-icon.png` is 180×180.
6. Every root file that `index.html` links to exists in `static/`.
7. `index.html` has the description, Open Graph, and Twitter card tags.

## Manual test cases

1. Run the app and open `/robots.txt`, `/llms.txt`, `/sitemap.xml`,
   `/og-image.png`, `/favicon.svg`, `/apple-touch-icon.png`, and
   `/site.webmanifest`: each returns 200.
2. Open `/features/seo/README.md` and `/features/seo/static/robots.txt`:
   both return 404.
3. The browser tab shows the palette icon.
4. After deploy, paste the site link in a chat app (WhatsApp, Discord,
   Slack): the preview shows the title, description, and image.
5. On a phone, "Add to Home Screen" uses the icon and the name
   "Paint Together".

## Known issues

- `og-image.png` shows the light theme only.
- There is no `/favicon.ico`. Modern browsers use `favicon.svg`; very old
  browsers request `/favicon.ico` and get 404.
- No `.well-known/security.txt`: it needs a public contact address.
