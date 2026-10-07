# KumaGen

Uptime Kuma monitor generator for the Docker containers on one host.

KumaGen lists the running containers on the local Docker socket, builds monitor suggestions
for the ones you select — deterministic rules first, an AI provider only for the judgment
calls — lets you review and edit them, then creates them in your Uptime Kuma instance. One
Node/Express process serves the JSON API and the built React UI; settings and the record of
created monitors live in SQLite.

---

## Doors

| Door | What it is |
|------|------------|
| `node src/index.js` (`npm start`, Docker `CMD`) | The process. Listens on `PORT` (default `3003`); runs on demand, no scheduler |
| `GET /api/containers` | Running containers, each flagged with the monitors KumaGen already created for it |
| `POST /api/suggestions` | Monitor suggestions for the selected containers |
| `POST /api/monitors` | Create the reviewed monitors in Uptime Kuma and record the successes |
| `GET` / `PUT /api/settings` | Read (secrets masked) / write the settings table |
| `GET /api/settings/ai-status` | Whether the enabled monitor types need AI, and whether AI is configured |
| `POST /api/settings/test-connection` | Log in to Uptime Kuma with the saved credentials |
| `/*` (non-API) | The React SPA from `web/dist` (404 if the client is not built) |
| stdout | One JSON log line per event — see [Logging](#logging) |

The full contract (event codes, external boundaries) is [`docs/spec.md`](docs/spec.md).

---

## How suggestions are built

1. **Programmatic rules** (`src/programmatic.js`) always run, no AI involved:
   - **Docker** container-status check
   - **Ping** to `localhost` (or the container name)
   - **TCP port** check per unique exposed TCP port
   - **DNS** check per hostname found in Traefik `Host(...)` router labels
   - **HTTP** checks for images in the known-health-endpoint table (`src/health-endpoints.js`)
   - **Database** checks (PostgreSQL, MySQL/MariaDB, Redis, MongoDB) by image name, with a
     connection string pre-filled from allow-listed container env vars where possible
     (`src/db-connection.js`), otherwise an editable template
2. **AI** (`src/ai.js`) is called only when HTTP or DNS suggestions are enabled. It receives
   container metadata (image, ports, labels, env var *names*, Traefik routers, and any OpenAPI
   spec found by probing host-mapped ports on localhost — `src/openapi.js`) and proposes
   further HTTP/DNS monitors. While HTTP or DNS is enabled, a missing or failing AI provider
   fails the whole request (500); turn both off to run with no AI at all
   (`GET /api/settings/ai-status` reports which case applies).

Each monitor type can be toggled in Settings (`suggestHttp`, `suggestPort`, `suggestPing`,
`suggestDns` (off by default), `suggestDocker`, `suggestDatabase`), along with hostname
options (`useContainerNames`, `useTraefikLabels`, `preferPublicUrl`) and `groupByContainer`
(create monitors under a per-container group in Kuma).

---

## Run

### Docker Compose

```yaml
services:
  kumagen:
    image: ghcr.io/donaldrich80/kumagen:latest
    ports:
      - "3003:3003"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - kumagen-data:/app/data
    environment:
      - DB_PATH=/app/data/kumagen.db   # without this the DB is outside the volume
    restart: unless-stopped

volumes:
  kumagen-data:
```

Open **http://localhost:3003** and fill in Settings. The image is published by
`.github/workflows/docker-publish.yml` (see [`docs/publishing-images.md`](docs/publishing-images.md)).

To build from source instead: `docker compose up --build -d` (the repo's `docker-compose.yml`
already sets `DB_PATH` and passes through the env vars below).

### Locally

```bash
npm run install:all   # server deps + web/ deps
npm run build         # build web/dist
npm start             # http://localhost:3003
```

For development, `npm run dev` runs the server under nodemon and the Vite dev server on
`:5173`. Vite proxies `/api` to `http://localhost:3001`, so set `PORT=3001` for the server
(`cp .env.example .env` does this; `.env` is loaded via dotenv).

The server needs read access to `/var/run/docker.sock`.

---

## Configuration

Everything is set from the Settings panel and stored in SQLite (`DB_PATH`, default
`./kumagen.db`).

| Setting | Notes |
|---------|-------|
| Kuma URL / Username / Password | Uptime Kuma login, used over its socket.io API |
| AI Provider | `anthropic` (default), `openai`, `google`, `ollama`, `openai-compatible` |
| API Key | Not needed for Ollama |
| Model | Blank = provider default (table below); required for `openai-compatible` |
| Base URL | Required for `openai-compatible`; used for `ollama` |

Environment variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen port (default `3003`) |
| `DB_PATH` | SQLite file (default `./kumagen.db`) |
| `KUMA_URL`, `KUMA_USERNAME`, `KUMA_PASSWORD` | Fallbacks when the Kuma settings are empty |
| `ANTHROPIC_API_KEY` | Fallback key for the Anthropic provider only |
| `KUMAGEN_SLOW_RUN_MS` | Threshold for the slow-success run summary (default `10000`) |

| Provider | Default model |
|----------|---------------|
| Anthropic | `claude-opus-5-5` |
| OpenAI | `gpt-4o` |
| Google Gemini | `gemini-2.0-flash` |
| Ollama | `llama3.2` |
| OpenAI-compatible | _(none — set one)_ |

---

## Layout

```
src/                  server (Express API)
  index.js            process door; mounts routes, serves web/dist
  log.js, codes.js    JSON-line logger and the permanent event-code registry
  routes/             containers, suggestions, monitors, settings
  docker.js           Docker socket (read-only)
  kuma.js             Uptime Kuma socket.io client
  ai.js               suggestion engine + AI providers (Vercel AI SDK)
  programmatic.js     rule-based suggestions
  traefik.js          Traefik label parsing
  health-endpoints.js known HTTP health paths by image
  db-connection.js    DB connection strings from container env
  openapi.js          localhost OpenAPI probes
  db.js               SQLite settings + created-monitor records
web/                  React SPA (Vite, shadcn/ui in src/components/ui/)
tests/                offline suite (node --test)
docs/                 spec, design notes, vendored principles
```

---

## Logging

The server writes one JSON line per event to stdout: `{ ts, level, code, event, data }`.
Every success and failure path has a permanent code (`src/codes.js`; table in
[`docs/spec.md`](docs/spec.md)), e.g. `docker logs kumagen | grep '"code":"E07"'` finds every
failed Kuma batch. Suggestion and monitor runs time each stage (`S20`/`E20`) and emit a run
summary (`E90`) on failure or partial failure, or (`S90`) when a success takes longer than
`KUMAGEN_SLOW_RUN_MS`. Logs are append-only; rotation is left to Docker's log driver. Secrets
(AI key, Kuma password, container DB env values) are never logged.

---

## Testing

```bash
npm ci   # once — the suite needs the server's npm dependencies
node --test --test-reporter=spec tests/*.test.js
```

That command (recorded in `.test-command`) runs the whole suite with Node's built-in runner.
It is offline and needs no credentials: Docker, Uptime Kuma (socket.io) and the AI SDK are
faked in `tests/helpers.js`, and SQLite goes to a temp file.

Green means `fail 0` **and** `skipped 0`. Without `npm ci` every suite is skipped with
"dependency … not installed" and the runner still exits 0 — that is not a pass. If `web/dist`
is built, the SPA-fallback 404 test skips; delete `web/dist` before running the suite.

- `tests/server.test.js` — boots `src/index.js` as a subprocess (port, logging, CORS, SPA fallback)
- `tests/routes.test.js` — every `/api/*` endpoint: status codes and response shapes
- `tests/logging.test.js` — every event code is emitted on its path; secrets never logged
- `tests/provenance.test.js` — vendored docs and generated UI components carry provenance headers
- `tests/modules.test.js` — the functions server modules export to each other

The `web/` React app is not tested.

---

## License

MIT
