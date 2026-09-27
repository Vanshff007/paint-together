# CLAUDE.md

# Paint Together

Paint Together is a real-time collaborative drawing application that allows
multiple users to join a shared room and draw together in real time.

---

## Documentation

The `docs/` directory contains detailed documentation about the project.

All of these files are imported below, so they load automatically at the
start of every session. Use them as full project context before starting
any task.

@docs/architecture.md
@docs/api.md
@docs/database.md
@docs/serving.md
@docs/development.md
@docs/deployment.md
@docs/contributing.md
@docs/progress.md

When making changes, re-read the documentation relevant to the task, in
case it changed during the session:

- `docs/architecture.md` — Read before making architectural, backend,
  frontend, or real-time system changes.

- `docs/api.md` — Read before modifying APIs, WebSocket communication,
  client-server messages, or request/response behavior.

- `docs/database.md` — Read before modifying database logic, models,
  schemas, or database-related functionality.

- `docs/serving.md` — Read before modifying how the application is served,
  ports, static files, or server configuration.

- `docs/development.md` — Read when modifying the development workflow,
  setup, commands, or local environment.

- `docs/deployment.md` — Read before making production, hosting,
  deployment, domain, HTTPS, or infrastructure changes.

- `docs/contributing.md` — Read when making changes related to coding
  conventions or contribution workflow.

- `docs/progress.md` — Read when determining current project status,
  completed work, pending work, or planned features.

Do not assume the contents of these documents. Read the relevant file when
its information is needed.

---

## Core Rules

- Understand the existing code before modifying it.
- Preserve existing functionality.
- Make the smallest reasonable change.
- Do not rewrite working code unnecessarily.
- Do not make unrelated changes.
- Do not add unnecessary dependencies.
- Keep documentation synchronized with the implementation.
- Test changes before considering them complete.

---

## Major Changes

Ask for user approval before making any major architectural, structural,
or potentially destructive change.

Before asking for approval, explain:

1. What will change
2. Why the change is needed
3. Which files/components may be affected
4. The proposed approach
5. Potential risks or side effects

Wait for approval before proceeding.

---

## Feature Rules

Every feature must be organized as a dedicated feature folder.

Each feature should contain:

- Its implementation/code
- `README.md` with detailed documentation
- Test file(s)
- Test cases
- Feature-specific supporting files where required

A feature is not considered complete until its implementation, documentation,
and appropriate tests are present.

---

## Testing Rules

- Add tests when creating a feature.
- Update tests when feature behavior changes.
- Test normal behavior.
- Test important edge cases.
- Test error cases where applicable.
- Actually run the relevant tests.
- Never claim that a test passed unless it was actually executed.

---

## Git Safety

Do not:

- Delete user work
- Overwrite unrelated changes
- Rewrite Git history
- Force push
- Perform destructive Git operations

Ask for approval before any potentially destructive Git operation.

---

## Completion

After completing a task, report:

- What was changed
- Files created or modified
- Tests run and their results
- Documentation updated
- Any remaining issues or untested areas