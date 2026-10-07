# CLAUDE.md — KumaGen

AI-assisted Uptime Kuma monitor generator for the Docker containers on one host. Node/Express
API in `src/`, React (Vite) SPA in `web/`, SQLite for settings and created-monitor records.
The unit contract — doors, event codes, test command, scheduling — is `docs/spec.md`; open
work is `BACKLOG.md`.

## Layout

- `src/index.js` — process door; mounts `src/routes/*` under `/api/*` and serves `web/dist`
- `src/log.js` + `src/codes.js` — structured logger and the permanent event-code registry
- `src/{docker,kuma,ai,openapi,db}.js` — the external boundaries (Docker socket, Kuma
  socket.io, AI providers, localhost OpenAPI probes, SQLite)
- `tests/` — offline suite; `tests/helpers.js` fakes every boundary before `src/` is required
- `docs/` — spec, design notes, vendored principles (`decision-docs.md`, do not edit)

## Test

```bash
npm ci   # first — without deps every suite is skipped, which is NOT a pass
node --test --test-reporter=spec tests/*.test.js
```

Green means `fail 0` **and** `skipped 0`. `.test-command` holds the command and is frozen —
do not edit it. After `npm run build`, delete `web/dist` before testing or the SPA-fallback
test skips.

## Rules

- **Never log secrets**: AI API keys, the Kuma password, container DB env values. Log key
  names, never values. `tests/logging.test.js` asserts this.
- **Event codes are permanent.** Add new codes to the end of their series in `src/codes.js`
  and to the table in `docs/spec.md`; never renumber or reuse. Every new success or failure
  path gets a code and a test in `tests/logging.test.js`.
- **Don't change HTTP contracts casually**: `tests/routes.test.js` pins status codes and
  error bodies. Codes go in logs, not in response JSON.
- Note comments at the start of each file, at branch points, before external calls and on
  error paths (core-tenets §3).
- Generated shadcn/ui files in `web/src/components/ui/` keep their provenance header.
- Live state (`*.db`, `-wal`, `-shm`) stays gitignored. No host scheduler (rung 1).

## Binding principles

From `~/Projects/design-principles/principles/`: `core-tenets.md`, `folder-layouts.md`,
`host-schedulers.md`, `testing-floor.md`; `decision-docs.md` is vendored into `docs/`.
