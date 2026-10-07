# KumaGen — unit spec

Last verified: 2026-10-07.

## Purpose

Scan the running Docker containers on one host, suggest Uptime Kuma monitors for each
(programmatic rules first, an AI provider only for HTTP-path and DNS judgment), let a
human review them, and create the accepted ones in Uptime Kuma.

## Doors

| Door | Contract | Characterization test |
|---|---|---|
| Process: `node src/index.js` | binds `PORT` (default 3003), logs `S01`, serves `/api/*` and the SPA from `web/dist` | `tests/server.test.js` |
| `GET /api/settings`, `PUT /api/settings` | settings map with Kuma password and AI keys masked; allow-listed keys only, stored as text | `tests/routes.test.js` |
| `GET /api/settings/ai-status` | `{ required, ready }` | `tests/routes.test.js` |
| `POST /api/settings/test-connection` | 200 `{ ok: true }` / 400 `{ ok: false, error }` | `tests/routes.test.js` |
| `GET /api/containers` | 200 list / 503 Docker unavailable / 500 | `tests/routes.test.js` |
| `POST /api/suggestions` | 200 `{ suggestions }` keyed by container id / 400 / 404 / 500 | `tests/routes.test.js` |
| `POST /api/monitors` | 200 `{ results, summary }` / 400 / 500 | `tests/routes.test.js` |
| Module exports (`src/*.js`) | functions the modules call on each other | `tests/modules.test.js` |

## Tests

```bash
npm ci                                               # once; the suite skips (visibly) without deps
node --test --test-reporter=spec tests/*.test.js     # also in .test-command and README
```

Offline: Docker, Uptime Kuma (socket.io) and the AI SDK are faked in `tests/helpers.js`; the
SQLite DB is a temp file; env credentials are scrubbed. A run with any `skipped` count above 0
is not green.

## Scheduling

Rung 1 of `host-schedulers.md`: **no scheduler**. KumaGen runs on demand — a human opens the UI
and drives each step. The Docker `restart: unless-stopped` policy keeps the service up; it is
not a schedule. Adding a periodic re-scan would need this section updated with the rung chosen.

## Live state

SQLite at `DB_PATH` (default `./kumagen.db`, gitignored with its `-wal`/`-shm`/`-journal`
siblings; `/app/data/kumagen.db` on a named volume in Docker). A fresh clone is inert.

## Observability

JSON lines on stdout: `{ ts, level, code, event, data }` (`src/log.js`). Append-only; this
process never rotates logs — Docker's log driver does. Secrets are never logged (AI key, Kuma
password, container DB env values); `tests/logging.test.js` asserts it.

Event codes are **permanent** (`src/codes.js` is the source; keep this table in step). Never
renumber or reuse a code.

| Code | Event | Meaning |
|---|---|---|
| S01 | `server.listening` | process bound its port |
| S02 | `containers.listed` | container list answered |
| S03 | `suggestions.generated` | suggestions answered (`ai` says whether the provider was used) |
| S04 | `monitors.added` | monitor batch finished (`succeeded`, `failed`) |
| S05 | `settings.updated` | settings stored — key names only |
| S06 | `kuma.connection_ok` | Kuma connection test passed |
| S10 | `http.request` | one per HTTP request: method, path, status, `duration_ms` |
| S20 | `stage.completed` | timed stage done: `docker.list`, `enrich`, `suggest`, `kuma.add` |
| S90 | `run.summary` | success slower than `KUMAGEN_SLOW_RUN_MS` (default 10 s) |
| E01 | `containers.docker_unavailable` | Docker socket did not answer → 503 |
| E02 | `containers.list_failed` | Docker list or DB read threw → 500 |
| E03 | `suggestions.bad_request` | `containerIds` missing/empty → 400 |
| E04 | `suggestions.not_found` | no requested container is running → 404 |
| E05 | `suggestions.failed` | Docker/OpenAPI/AI pipeline threw (no AI key, bad AI JSON, provider error) → 500 |
| E06 | `monitors.bad_request` | `monitors` missing/empty → 400 |
| E07 | `monitors.add_failed` | Kuma not configured / unreachable / login refused / group create failed → 500 |
| E08 | `monitors.rejected` | Kuma rejected one monitor; the batch continued |
| E09 | `kuma.connection_failed` | Kuma connection test failed → 400 |
| E20 | `stage.failed` | a timed stage threw (`stage`, `duration_ms`, `error`) |
| E90 | `run.summary` | run ended `failed` or `partial`: codes seen, duration, final state |

## Layout

`src/` server, `web/` React SPA, `tests/`, `docs/` — the `app-*` layout from
`folder-layouts.md` §1 (adapted for Node: no `pyproject.toml`; `package.json` instead).
