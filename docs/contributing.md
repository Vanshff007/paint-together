# Contributing

This file describes the coding conventions and workflow.

## Workflow

1. Pull the latest `main`.
2. Create a branch: `feature/<name>`, `fix/<name>`, or `docs/<name>`.
3. Make the smallest change that solves the task.
4. Run the tests and the manual multiplayer check (`docs/development.md`).
5. Update the related `docs/` files in the same change.
6. Bump the version (see "Versioning" below).
7. Commit and open a pull request to `main`.

Ask the project owner before architectural, structural, or destructive changes.
Explain what changes, why, affected files, approach, and risks.

## Commits

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`.
- One logical change per commit.
- Never force push, rewrite shared history, or commit `.env` or
  `node_modules/`.

## Versioning

The version shown on the front page (landing card title bar) must be
updated with every change that is committed.

- Use `MAJOR.MINOR.PATCH`:
  - `feat:` changes bump MINOR (1.1.0 → 1.2.0).
  - `fix:`, `docs:`, `refactor:`, `test:`, `chore:` changes bump PATCH
    (1.1.0 → 1.1.1).
  - Breaking changes bump MAJOR, only with the owner's approval.
- Bump `package.json` and `package-lock.json` with
  `npm version <patch|minor|major> --no-git-tag-version`.
- Update the same version in `public/style.css` (`.landing-card::before`
  `content`).
- Include the bump in the same commit or pull request as the change.
- `features/theme/theme.test.js` fails if the two versions do not match.

## Code style

Match the existing code:

- Plain JavaScript. CommonJS (`require`) on the server. Browser globals and
  plain `<script>` tags on the client. No frameworks, no bundler.
- 4-space indentation, semicolons, single quotes in JS.
- `const` by default, `let` when reassigned, never `var`.
- `camelCase` for variables and functions. `UPPER_SNAKE_CASE` for constants
  (`MAX_HISTORY`, `AUTOSAVE_INTERVAL_MS`, `EMIT_THROTTLE`).
- Socket event names use `kebab-case` (`join-room`, `stroke-complete`).
- Short section comments like `// UNDO/REDO STATE` split large files.
- Wrap every `await` on the database in `try/catch` and log with context.

## Rules

- Do not add dependencies when the standard library, the browser, or an
  installed package can do the job.
- Render user text with `textContent`, never `innerHTML`.
- Send normalized coordinates (`nx`, `ny`, `ns`) for anything drawn on the
  canvas.
- Do not write to MongoDB from high-frequency events.
- Keep server and client event contracts in sync, and update `docs/api.md`.

## Feature folders

Every feature has its own folder with code, a detailed
`README.md`, and tests. Layout:

```
features/<name>/
├── server.js        # exports register(socket, ctx, session)  (if it has server code)
├── client.js        # plain browser script, served at /features/<name>/client.js
├── README.md        # purpose, events, behavior, manual test cases, known issues
└── <name>.test.js   # node:test tests (use ../fake-socket.js)
```

Folder names use lowercase letters only (the serving route matches
`[a-z]+`).

To add a feature:

1. Create the folder with the files above (skip `server.js` or `client.js`
   if the feature has no code on that side).
2. Server: add the feature to the `features` array in `server.js`.
3. Client: add a `<script src="/features/<name>/client.js">` tag in
   `public/index.html`. Place it after every file whose globals it uses at
   load time. Do not reuse a top-level name from another client file.
4. Update `docs/architecture.md` (features table) and `docs/api.md`
   (new events).

Shared client state goes in `public/core.js` only when several features need
it.

## Definition of done

- Code works and is tested (automated tests run and pass, plus a manual check).
- Feature `README.md` exists.
- Related `docs/` files are updated (`api.md`, `database.md`, `progress.md`, ...).
- No unrelated changes in the diff.
