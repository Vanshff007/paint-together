# Contributing

Read `CLAUDE.md` first. This file adds the coding conventions and workflow.

## Workflow

1. Pull the latest `main`.
2. Create a branch: `feature/<name>`, `fix/<name>`, or `docs/<name>`.
3. Make the smallest change that solves the task.
4. Run the tests and the manual multiplayer check (`docs/development.md`).
5. Update the related `docs/` files in the same change.
6. Commit and open a pull request to `main`.

Ask the project owner before architectural, structural, or destructive changes.
Explain what changes, why, affected files, approach, and risks.

## Commits

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`.
- One logical change per commit.
- Never force push, rewrite shared history, or commit `.env` or
  `node_modules/`.

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

Per `CLAUDE.md`, each new feature gets its own folder with code, a detailed
`README.md`, and tests. The current code is not split this way yet, and
existing code must not be moved without approval. For new features, use:

```
features/<feature-name>/
├── README.md          # what it does, events, data, how to test
├── <feature-name>.js  # implementation (server or shared logic)
└── <feature-name>.test.js
```

Client-only code for a feature can go in `public/` and be referenced from the
feature `README.md`. Agree on the exact layout with the owner before the first
feature uses it.

## Definition of done

- Code works and is tested (automated tests run and pass, plus a manual check).
- Feature `README.md` exists.
- Related `docs/` files are updated (`api.md`, `database.md`, `progress.md`, ...).
- No unrelated changes in the diff.
